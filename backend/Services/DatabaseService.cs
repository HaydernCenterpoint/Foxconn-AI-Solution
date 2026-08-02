using System;
using System.Data;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Mkz.Fusion.Contracts;
using Npgsql;
using NpgsqlTypes;

namespace backend.Services
{
    public enum ClientLivenessEvent
    {
        Registration,
        Heartbeat,
        Disconnect,
    }

    public class DatabaseService
    {
        private readonly string _connectionString;
        private readonly TimescaleTelemetryService _timescaleTelemetry;
        private readonly CepStagingPublisher _cepStagingPublisher;
        private readonly ILogger<DatabaseService> _logger;
        private static readonly JsonSerializerOptions FusionJsonSerializerOptions = new(JsonSerializerDefaults.Web);

        public DatabaseService(
            IConfiguration configuration,
            TimescaleTelemetryService timescaleTelemetry,
            CepStagingPublisher cepStagingPublisher,
            ILogger<DatabaseService> logger)
        {
            _connectionString = configuration.GetConnectionString("DefaultConnection")
                ?? throw new ArgumentNullException("ConnectionStrings:DefaultConnection is missing in configuration.");
            _timescaleTelemetry = timescaleTelemetry;
            _cepStagingPublisher = cepStagingPublisher;
            _logger = logger;
        }

        public NpgsqlConnection CreateConnection()
        {
            return new NpgsqlConnection(_connectionString);
        }

        public async Task ExecuteNonQueryAsync(string sql, Action<NpgsqlParameterCollection>? parameterBinder = null)
        {
            using var conn = CreateConnection();
            await conn.OpenAsync();
            using var cmd = new NpgsqlCommand(sql, conn);
            parameterBinder?.Invoke(cmd.Parameters);
            await cmd.ExecuteNonQueryAsync();
        }

        public async Task<T?> ExecuteScalarAsync<T>(string sql, Action<NpgsqlParameterCollection>? parameterBinder = null)
        {
            using var conn = CreateConnection();
            await conn.OpenAsync();
            using var cmd = new NpgsqlCommand(sql, conn);
            parameterBinder?.Invoke(cmd.Parameters);
            var result = await cmd.ExecuteScalarAsync();
            if (result == null || result == DBNull.Value) return default;
            return (T)result;
        }

        public async Task<TelemetryApproval> UpdateClientLivenessAsync(
            string clientId,
            string? name,
            string? machineCode,
            string? ipAddress,
            string? machineStatus,
            bool? plcConnected,
            ClientLivenessEvent livenessEvent,
            CancellationToken cancellationToken = default)
        {
            if (!Guid.TryParse(clientId, out var machineId))
            {
                return TelemetryApproval.Unavailable;
            }

            await using var connection = CreateConnection();
            await connection.OpenAsync(cancellationToken);
            await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
            try
            {
                var stableName = name ?? (clientId.Length >= 8 ? $"Machine {clientId[..8]}" : "Machine");
                const string catalogSql = """
                    INSERT INTO machines (id, client_id, name, machine_code, ip, approval_status)
                    VALUES (@machineId, @clientId, @name, @machineCode, @ip, 'PENDING')
                    ON CONFLICT (client_id) DO UPDATE SET
                        name = CASE
                            WHEN machines.name IS NULL OR machines.name = '' OR machines.name = machines.client_id
                                THEN EXCLUDED.name
                            ELSE machines.name
                        END,
                        machine_code = COALESCE(machines.machine_code, EXCLUDED.machine_code),
                        ip = EXCLUDED.ip
                    """;
                await using (var catalog = new NpgsqlCommand(catalogSql, connection, transaction))
                {
                    catalog.Parameters.AddWithValue("machineId", machineId);
                    catalog.Parameters.AddWithValue("clientId", clientId);
                    catalog.Parameters.AddWithValue("name", stableName);
                    catalog.Parameters.AddWithValue("machineCode", (object?)machineCode ?? DBNull.Value);
                    catalog.Parameters.AddWithValue("ip", (object?)ipAddress ?? DBNull.Value);
                    await catalog.ExecuteNonQueryAsync(cancellationToken);
                }

                const string livenessSql = """
                    INSERT INTO plc_clients
                        (client_id, name, ip_address, status, approval_status, machine_id, last_heartbeat)
                    VALUES
                        (@clientId, @name, @ip, @status, 'PENDING', @machineId, CURRENT_TIMESTAMP)
                    ON CONFLICT (client_id) DO UPDATE SET
                        name = COALESCE(EXCLUDED.name, plc_clients.name),
                        ip_address = EXCLUDED.ip_address,
                        status = EXCLUDED.status,
                        machine_id = EXCLUDED.machine_id,
                        last_heartbeat = CURRENT_TIMESTAMP
                    """;
                await using (var liveness = new NpgsqlCommand(livenessSql, connection, transaction))
                {
                    liveness.Parameters.AddWithValue("clientId", clientId);
                    liveness.Parameters.AddWithValue("name", (object?)name ?? DBNull.Value);
                    liveness.Parameters.AddWithValue("ip", (object?)ipAddress ?? DBNull.Value);
                    liveness.Parameters.AddWithValue(
                        "status",
                        livenessEvent == ClientLivenessEvent.Disconnect ? "OFFLINE" : "ONLINE");
                    liveness.Parameters.AddWithValue("machineId", machineId);
                    await liveness.ExecuteNonQueryAsync(cancellationToken);
                }

                var approval = await ReadMachineContextForUpdateAsync(
                    connection,
                    transaction,
                    machineId,
                    cancellationToken);
                if (approval.State != MachineApprovalState.Approved)
                {
                    await transaction.CommitAsync(cancellationToken);
                    return approval.State == MachineApprovalState.Unapproved
                        ? TelemetryApproval.Unapproved
                        : TelemetryApproval.Unavailable;
                }

                const string stateSql = """
                    UPDATE machines SET
                        status = CASE
                            WHEN @event = 'Registration' AND status = 'OFFLINE' THEN 'STOPPED'
                            WHEN @event = 'Disconnect' THEN 'OFFLINE'
                            WHEN @event = 'Heartbeat' AND @status IS NOT NULL THEN @status
                            ELSE status
                        END,
                        plc_connected = CASE
                            WHEN @event = 'Disconnect' THEN false
                            ELSE COALESCE(@plcConnected, plc_connected)
                        END,
                        last_heartbeat = CURRENT_TIMESTAMP
                    WHERE id = @machineId
                    """;
                await using (var state = new NpgsqlCommand(stateSql, connection, transaction))
                {
                    state.Parameters.AddWithValue("event", livenessEvent.ToString());
                    state.Parameters.AddWithValue("status", (object?)machineStatus ?? DBNull.Value);
                    state.Parameters.AddWithValue("plcConnected", (object?)plcConnected ?? DBNull.Value);
                    state.Parameters.AddWithValue("machineId", machineId);
                    await state.ExecuteNonQueryAsync(cancellationToken);
                }

                if (livenessEvent == ClientLivenessEvent.Disconnect)
                {
                    const string historySql = """
                        INSERT INTO machine_telemetry_history
                            (machine_id, status, plc_connected, production_count, cycle_time,
                             cpu_percent, ram_percent, uptime_seconds, tags, created_at)
                        VALUES (@machineId, 'OFFLINE', false, 0, 0, 0, 0, 0, '{}'::jsonb, CURRENT_TIMESTAMP)
                        """;
                    await using var history = new NpgsqlCommand(historySql, connection, transaction);
                    history.Parameters.AddWithValue("machineId", machineId);
                    await history.ExecuteNonQueryAsync(cancellationToken);
                }

                await transaction.CommitAsync(cancellationToken);
                return TelemetryApproval.Approved;
            }
            catch
            {
                await transaction.RollbackAsync(CancellationToken.None);
                throw;
            }
        }
        /// <summary>
        /// Kiểm tra xem PLC Client (Máy) có được Admin duyệt hay không.
        /// </summary>
        public async Task<bool> IsClientApprovedAsync(string clientId)
        {
            if (string.IsNullOrEmpty(clientId)) return false;
            try
            {
                var result = await ExecuteScalarAsync<string>(
                    "SELECT approval_status FROM machines WHERE client_id = @cid",
                    p => p.AddWithValue("cid", clientId));
                return result == "APPROVED";
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Saves telemetry details to the historical table in an optimized way.
        /// </summary>
        public async Task SaveTelemetryHistoryAsync(
            Guid machineId, string status, bool plcConnected, int productionCount, double cycleTime,
            double cpu, double ram, long uptime, string tagsJson)
        {
            try
            {
                // We optimize storage by not writing duplicate consecutive heartbeats with identical status and count.
                // We only write if status/count changes, or if the last record is older than 5 minutes.
                const string checkLastSql = @"
                    SELECT status, production_count, created_at 
                    FROM machine_telemetry_history 
                    WHERE machine_id = @mid 
                    ORDER BY created_at DESC LIMIT 1";

                bool shouldInsert = true;
                using (var conn = CreateConnection())
                {
                    await conn.OpenAsync();
                    using var cmd = new NpgsqlCommand(checkLastSql, conn);
                    cmd.Parameters.AddWithValue("mid", machineId);
                    using var reader = await cmd.ExecuteReaderAsync();
                    if (await reader.ReadAsync())
                    {
                        string lastStatus = reader.GetString(0);
                        int lastCount = reader.GetInt32(1);
                        DateTime lastTime = reader.GetDateTime(2);

                        if (lastStatus == status && lastCount == productionCount && (DateTime.UtcNow - lastTime).TotalMinutes < 5.0)
                        {
                            shouldInsert = false; // Skip redundant write
                        }
                    }
                }

                if (!shouldInsert) return;

                const string insertSql = @"
                    INSERT INTO machine_telemetry_history 
                    (machine_id, status, plc_connected, production_count, cycle_time, cpu_percent, ram_percent, uptime_seconds, tags)
                    VALUES 
                    (@mid, @status, @plcConn, @prodCount, @cycleTime, @cpu, @ram, @uptime, CAST(@tags AS jsonb))";

                await ExecuteNonQueryAsync(insertSql, p =>
                {
                    p.AddWithValue("mid", machineId);
                    p.AddWithValue("status", status);
                    p.AddWithValue("plcConn", plcConnected);
                    p.AddWithValue("prodCount", productionCount);
                    p.AddWithValue("cycleTime", cycleTime);
                    p.AddWithValue("cpu", cpu);
                    p.AddWithValue("ram", ram);
                    p.AddWithValue("uptime", uptime);
                    p.AddWithValue("tags", tagsJson);
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DB] SaveTelemetryHistoryAsync failed: {ex.Message}");
            }
        }

        public Task<TelemetryDeliveryResult> PersistTelemetryAndFusionOutboxAsync(
            TelemetryDeliveryItem item,
            CancellationToken cancellationToken = default) =>
            PersistTelemetryBatchAndFusionOutboxAsync([item], cancellationToken);

        public async Task<TelemetryDeliveryResult> PersistTelemetryBatchAndFusionOutboxAsync(
            IReadOnlyList<TelemetryDeliveryItem> items,
            CancellationToken cancellationToken = default)
        {
            if (items.Count == 0)
            {
                return new(TelemetryDeliveryState.Malformed, "Telemetry batch is empty.");
            }

            var committed = new List<(long SourceId, DateTimeOffset OccurredAt, TelemetryCaptureInput Input)>();
            try
            {
                await using var connection = CreateConnection();
                await connection.OpenAsync(cancellationToken);
                await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

                try
                {
                    foreach (var item in items)
                    {
                        var approval = await ReadMachineContextForUpdateAsync(
                            connection,
                            transaction,
                            item.Input.MachineId,
                            cancellationToken);
                        if (approval.State == MachineApprovalState.Missing)
                        {
                            await transaction.RollbackAsync(cancellationToken);
                            _logger.LogWarning(
                                "Telemetry delivery rejected because machine {MachineId} was not found",
                                item.Input.MachineId);
                            return new TelemetryDeliveryResult(
                                TelemetryDeliveryState.PermanentFailure,
                                "The device is not registered.")
                            {
                                Approval = TelemetryApproval.Unavailable,
                            };
                        }
                        if (approval.State == MachineApprovalState.Unapproved)
                        {
                            await transaction.RollbackAsync(cancellationToken);
                            _logger.LogWarning(
                                "Telemetry delivery rejected because machine {MachineId} is not approved",
                                item.Input.MachineId);
                            return new TelemetryDeliveryResult(
                                TelemetryDeliveryState.PermanentFailure,
                                "Device is not approved.")
                            {
                                Approval = TelemetryApproval.Unapproved,
                            };
                        }

                        var receipt = await TryInsertReceiptAsync(
                            connection,
                            transaction,
                            item,
                            cancellationToken);
                        if (receipt.State == ReceiptInsertState.Duplicate)
                        {
                            continue;
                        }
                        if (receipt.State == ReceiptInsertState.Conflict)
                        {
                            await transaction.RollbackAsync(cancellationToken);
                            _logger.LogWarning(
                                "Telemetry receipt conflict for device {DeviceId} and message {MessageId}",
                                item.DeviceId,
                                item.MessageId);
                            return new(
                                TelemetryDeliveryState.Conflict,
                                "The device/sequence or device/message receipt already exists with a different payload.")
                            {
                                Approval = TelemetryApproval.Approved,
                            };
                        }

                        var (sourceId, persistedOccurredAt) = await InsertRawTelemetryAsync(
                            connection,
                            transaction,
                            item.Input,
                            cancellationToken);
                        await AttachReceiptToTelemetryAsync(
                            connection,
                            transaction,
                            receipt.ReceiptId,
                            sourceId,
                            cancellationToken);

                        await ProjectOperationalTelemetryAsync(
                            connection,
                            transaction,
                            sourceId,
                            persistedOccurredAt,
                            item.Input,
                            cancellationToken);

                        var fusionEvent = TelemetryFusionEventFactory.Create(
                            item.Input,
                            approval.Context!.Machine,
                            approval.Context.Line);
                        await InsertFusionOutboxAsync(
                            connection,
                            transaction,
                            fusionEvent,
                            cancellationToken);
                        await InsertSecondaryDeliveriesAsync(
                            connection,
                            transaction,
                            receipt.ReceiptId!.Value,
                            cancellationToken);
                        committed.Add((sourceId, persistedOccurredAt, item.Input));
                    }

                    await transaction.CommitAsync(cancellationToken);
                }
                catch
                {
                    await transaction.RollbackAsync(CancellationToken.None);
                    throw;
                }
            }
            catch (Exception ex)
            {
                var result = ClassifyDatabaseFailure(ex);
                _logger.LogError(
                    ex,
                    "Operations telemetry transaction failed with delivery state {DeliveryState} for {ItemCount} item(s)",
                    result.State,
                    items.Count);
                return result;
            }

            _logger.LogInformation(
                "Operations telemetry transaction committed {CommittedCount} new item(s) and observed {DuplicateCount} duplicate(s)",
                committed.Count,
                items.Count - committed.Count);
            return committed.Count == 0
                ? TelemetryDeliveryResult.Duplicate(TelemetryApproval.Approved)
                : TelemetryDeliveryResult.Committed(TelemetryApproval.Approved);
        }

        private static async Task<MachineApprovalResult> ReadMachineContextForUpdateAsync(
            NpgsqlConnection connection,
            NpgsqlTransaction transaction,
            Guid machineId,
            CancellationToken cancellationToken = default)
        {
            const string sql = @"
                SELECT m.id, m.client_id, m.machine_code, m.name, m.approval_status
                FROM machines m
                WHERE m.id = @machineId
                FOR UPDATE";

            await using var command = new NpgsqlCommand(sql, connection, transaction);
            command.Parameters.AddWithValue("machineId", machineId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return new(MachineApprovalState.Missing, null);
            }

            var machine = new MachineSnapshot(
                reader.GetGuid(0),
                reader.IsDBNull(1) ? null : reader.GetString(1),
                reader.IsDBNull(2) ? null : reader.GetString(2),
                reader.IsDBNull(3) ? machineId.ToString() : reader.GetString(3));

            var isApproved = string.Equals(reader.GetString(4), "APPROVED", StringComparison.Ordinal);
            await reader.DisposeAsync();
            if (!isApproved)
            {
                return new(MachineApprovalState.Unapproved, null);
            }

            const string lineSql = """
                SELECT l.id, l.name
                FROM line_machines lm
                JOIN production_lines l ON l.id = lm.line_id
                WHERE lm.machine_id = @machineId
                ORDER BY lm.sequence_order NULLS LAST
                LIMIT 1
                """;
            await using var lineCommand = new NpgsqlCommand(lineSql, connection, transaction);
            lineCommand.Parameters.AddWithValue("machineId", machineId);
            await using var lineReader = await lineCommand.ExecuteReaderAsync(cancellationToken);
            LineSnapshot? line = null;
            if (await lineReader.ReadAsync(cancellationToken))
            {
                var lineId = lineReader.GetGuid(0);
                line = new LineSnapshot(lineId, lineReader.IsDBNull(1) ? lineId.ToString() : lineReader.GetString(1));
            }

            return new(MachineApprovalState.Approved, new MachineContext(machine, line));
        }

        private static async Task InsertSecondaryDeliveriesAsync(
            NpgsqlConnection connection,
            NpgsqlTransaction transaction,
            long receiptId,
            CancellationToken cancellationToken)
        {
            const string sql = """
                INSERT INTO telemetry_secondary_deliveries
                    (receipt_id, target, idempotency_key)
                VALUES
                    (@receiptId, 'CEP', 'telemetry:' || @receiptId::text || ':cep'),
                    (@receiptId, 'TIMESCALE', 'telemetry:' || @receiptId::text || ':timescale')
                ON CONFLICT (receipt_id, target) DO NOTHING
                """;
            await using var command = new NpgsqlCommand(sql, connection, transaction);
            command.Parameters.AddWithValue("receiptId", receiptId);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        private static async Task InsertFusionOutboxAsync(
            NpgsqlConnection connection,
            NpgsqlTransaction transaction,
            TelemetryFusionEvent fusionEvent,
            CancellationToken cancellationToken = default)
        {
            const string sql = @"
                INSERT INTO fusion_outbox
                    (id, schema_version, event_type, event_key, payload, occurred_at, status, available_at)
                VALUES
                    (@id, @schemaVersion, @eventType, @eventKey, @payload, @occurredAt, 'PENDING', @availableAt)
                ON CONFLICT (event_key) DO NOTHING";

            await using var command = new NpgsqlCommand(sql, connection, transaction);
            command.Parameters.AddWithValue("id", fusionEvent.EventId);
            command.Parameters.AddWithValue("schemaVersion", fusionEvent.SchemaVersion);
            command.Parameters.AddWithValue("eventType", "telemetry");
            command.Parameters.AddWithValue("eventKey", fusionEvent.EventKey);
            command.Parameters.AddWithValue(
                "payload",
                NpgsqlDbType.Jsonb,
                JsonSerializer.Serialize(fusionEvent, FusionJsonSerializerOptions));
            command.Parameters.AddWithValue("occurredAt", fusionEvent.OccurredAt.UtcDateTime);
            command.Parameters.AddWithValue("availableAt", DateTime.UtcNow);
            var rows = await command.ExecuteNonQueryAsync(cancellationToken);
            if (rows != 1)
            {
                throw new InvalidOperationException(
                    $"Fusion outbox event key conflict for {fusionEvent.EventKey}.");
            }
        }

        private static async Task<ReceiptInsertResult> TryInsertReceiptAsync(
            NpgsqlConnection connection,
            NpgsqlTransaction transaction,
            TelemetryDeliveryItem item,
            CancellationToken cancellationToken)
        {
            const string insertSql = """
                INSERT INTO telemetry_receipts (device_id, message_id, delivery_sequence, payload_hash)
                VALUES (@deviceId, @messageId, @deliverySequence, @payloadHash)
                ON CONFLICT DO NOTHING
                RETURNING id
                """;
            await using (var insert = new NpgsqlCommand(insertSql, connection, transaction))
            {
                insert.Parameters.AddWithValue("deviceId", item.DeviceId);
                insert.Parameters.AddWithValue("messageId", item.MessageId);
                insert.Parameters.AddWithValue("deliverySequence", item.Input.Sequence);
                insert.Parameters.AddWithValue("payloadHash", item.PayloadHash);
                var receiptId = await insert.ExecuteScalarAsync(cancellationToken);
                if (receiptId is not null && receiptId != DBNull.Value)
                {
                    return new(ReceiptInsertState.Inserted, Convert.ToInt64(receiptId));
                }
            }

            const string existingSql = """
                SELECT receipt.id, receipt.payload_hash
                FROM telemetry_receipts receipt
                WHERE receipt.device_id = @deviceId
                  AND (receipt.delivery_sequence = @deliverySequence OR receipt.message_id = @messageId)
                ORDER BY (receipt.delivery_sequence = @deliverySequence) DESC
                LIMIT 1
                FOR UPDATE
                """;
            await using var existing = new NpgsqlCommand(existingSql, connection, transaction);
            existing.Parameters.AddWithValue("deviceId", item.DeviceId);
            existing.Parameters.AddWithValue("messageId", item.MessageId);
            existing.Parameters.AddWithValue("deliverySequence", item.Input.Sequence);
            await using var reader = await existing.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                throw new InvalidOperationException("Conflicting telemetry receipt disappeared during the transaction.");
            }

            var payloadHash = reader.GetString(1).Trim();
            return string.Equals(payloadHash, item.PayloadHash, StringComparison.Ordinal)
                ? new(ReceiptInsertState.Duplicate, reader.GetInt64(0))
                : new(ReceiptInsertState.Conflict, null);
        }

        private static async Task ProjectOperationalTelemetryAsync(
            NpgsqlConnection connection,
            NpgsqlTransaction transaction,
            long sourceId,
            DateTimeOffset occurredAt,
            TelemetryCaptureInput input,
            CancellationToken cancellationToken)
        {
            const string machineSql = """
                UPDATE machines SET
                    status = @status,
                    plc_connected = @plcConnected,
                    last_plc_data = @raw
                WHERE id = @machineId
                  AND NOT EXISTS (
                      SELECT 1
                      FROM machine_telemetry newer
                      WHERE newer.machine_id = @machineId
                        AND newer.sequence > @sequence)
                """;
            await using (var machine = new NpgsqlCommand(machineSql, connection, transaction))
            {
                machine.Parameters.AddWithValue("status", input.Status);
                machine.Parameters.AddWithValue("plcConnected", input.PlcConnected);
                machine.Parameters.AddWithValue("raw", input.RawTelemetryJson);
                machine.Parameters.AddWithValue("machineId", input.MachineId);
                machine.Parameters.AddWithValue("sequence", input.Sequence);
                await machine.ExecuteNonQueryAsync(cancellationToken);
            }

            const string historySql = """
                INSERT INTO machine_telemetry_history
                    (machine_id, source_telemetry_id, status, plc_connected, production_count,
                     cycle_time, cpu_percent, ram_percent, uptime_seconds, tags, created_at)
                VALUES
                    (@machineId, @sourceId, @status, @plcConnected, @productionCount,
                     @cycleTime, 0, 0, 0, CAST(@tags AS jsonb), @occurredAt)
                ON CONFLICT (source_telemetry_id) WHERE source_telemetry_id IS NOT NULL DO NOTHING
                """;
            await using (var history = new NpgsqlCommand(historySql, connection, transaction))
            {
                history.Parameters.AddWithValue("machineId", input.MachineId);
                history.Parameters.AddWithValue("sourceId", sourceId);
                history.Parameters.AddWithValue("status", input.Status);
                history.Parameters.AddWithValue("plcConnected", input.PlcConnected);
                history.Parameters.AddWithValue("productionCount", checked((int)(input.ProductionQuantity ?? 0)));
                history.Parameters.AddWithValue("cycleTime", input.ProductionTime ?? 0);
                history.Parameters.AddWithValue("tags", ExtractPayloadJson(input.RawTelemetryJson));
                history.Parameters.AddWithValue("occurredAt", occurredAt.UtcDateTime);
                await history.ExecuteNonQueryAsync(cancellationToken);
            }

            const string hourlySql = """
                INSERT INTO machine_hourly_production
                    (machine_id, prod_date, prod_hour, produced_qty_start, produced_qty_end,
                     hourly_qty, plc_run_time_start, plc_run_time_end, avg_cpu, avg_ram)
                VALUES
                    (@machineId, @prodDate, @prodHour, @quantity, @quantity, 0, 0, 0, 0, 0)
                ON CONFLICT (machine_id, prod_date, prod_hour) DO UPDATE SET
                    produced_qty_end = EXCLUDED.produced_qty_end,
                    hourly_qty = GREATEST(0, EXCLUDED.produced_qty_end - machine_hourly_production.produced_qty_start),
                    plc_run_time_end = EXCLUDED.plc_run_time_end,
                    avg_cpu = EXCLUDED.avg_cpu,
                    avg_ram = EXCLUDED.avg_ram
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM machine_telemetry newer
                    WHERE newer.machine_id = @machineId
                      AND date_trunc('hour', newer.created_at) = date_trunc('hour', @occurredAt::timestamptz)
                      AND newer.sequence > @sequence)
                """;
            await using (var hourly = new NpgsqlCommand(hourlySql, connection, transaction))
            {
                hourly.Parameters.AddWithValue("machineId", input.MachineId);
                hourly.Parameters.AddWithValue("prodDate", occurredAt.UtcDateTime.Date);
                hourly.Parameters.AddWithValue("prodHour", occurredAt.UtcDateTime.Hour);
                hourly.Parameters.AddWithValue("quantity", checked((int)(input.ProductionQuantity ?? 0)));
                hourly.Parameters.AddWithValue("occurredAt", occurredAt.UtcDateTime);
                hourly.Parameters.AddWithValue("sequence", input.Sequence);
                await hourly.ExecuteNonQueryAsync(cancellationToken);
            }

            const string normalizedSql = """
                INSERT INTO telemetry_data (time, asset_id, metric, value, unit, source)
                VALUES (@time, @assetId, @metric, @value, @unit, @source)
                ON CONFLICT (time, asset_id, metric) DO UPDATE SET
                    value = EXCLUDED.value,
                    unit = EXCLUDED.unit,
                    source = EXCLUDED.source
                """;
            foreach (var point in TelemetrySchemaContract.Normalize(input))
            {
                await using var normalized = new NpgsqlCommand(normalizedSql, connection, transaction);
                normalized.Parameters.AddWithValue("time", point.Time.UtcDateTime);
                normalized.Parameters.AddWithValue("assetId", point.AssetId);
                normalized.Parameters.AddWithValue("metric", point.Metric);
                normalized.Parameters.AddWithValue("value", point.Value);
                normalized.Parameters.AddWithValue("unit", (object?)point.Unit ?? DBNull.Value);
                normalized.Parameters.AddWithValue("source", (object?)point.Source ?? DBNull.Value);
                await normalized.ExecuteNonQueryAsync(cancellationToken);
            }
        }

        private static async Task<(long SourceId, DateTimeOffset OccurredAt)> InsertRawTelemetryAsync(
            NpgsqlConnection connection,
            NpgsqlTransaction transaction,
            TelemetryCaptureInput input,
            CancellationToken cancellationToken)
        {
            const string sql = """
                INSERT INTO machine_telemetry (machine_id, raw_json, sequence, created_at)
                VALUES (@machineId, CAST(@rawJson AS jsonb), @sequence, @occurredAt)
                RETURNING id, created_at
                """;
            await using var command = new NpgsqlCommand(sql, connection, transaction);
            command.Parameters.AddWithValue("machineId", input.MachineId);
            command.Parameters.AddWithValue("rawJson", input.RawTelemetryJson);
            command.Parameters.AddWithValue("sequence", input.Sequence);
            command.Parameters.AddWithValue("occurredAt", input.OccurredAt.UtcDateTime);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                throw new InvalidOperationException("Primary telemetry insert did not return a row.");
            }

            return (reader.GetInt64(0), reader.GetFieldValue<DateTimeOffset>(1));
        }

        private static async Task AttachReceiptToTelemetryAsync(
            NpgsqlConnection connection,
            NpgsqlTransaction transaction,
            long? receiptId,
            long sourceId,
            CancellationToken cancellationToken)
        {
            const string sql = """
                UPDATE telemetry_receipts
                SET machine_telemetry_id = @sourceId, committed_at = CURRENT_TIMESTAMP
                WHERE id = @receiptId AND machine_telemetry_id IS NULL
                """;
            await using var command = new NpgsqlCommand(sql, connection, transaction);
            command.Parameters.AddWithValue("sourceId", sourceId);
            command.Parameters.AddWithValue("receiptId", receiptId ?? throw new InvalidOperationException("Receipt id is missing."));
            if (await command.ExecuteNonQueryAsync(cancellationToken) != 1)
            {
                throw new InvalidOperationException("Telemetry receipt could not be attached to its raw row.");
            }
        }

        public async Task RetryPendingSecondaryDeliveriesAsync(
            int limit = 32,
            CancellationToken cancellationToken = default)
        {
            var leaseId = Guid.NewGuid();
            var claimed = new List<SecondaryDeliveryClaim>();
            await using (var connection = CreateConnection())
            {
                await connection.OpenAsync(cancellationToken);
                await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
                const string sql = """
                    WITH candidates AS (
                        SELECT delivery.receipt_id, delivery.target
                        FROM telemetry_secondary_deliveries delivery
                        WHERE (delivery.status = 'PENDING' AND delivery.available_at <= CURRENT_TIMESTAMP)
                           OR (delivery.status = 'LEASED' AND delivery.lease_expires_at <= CURRENT_TIMESTAMP)
                        ORDER BY delivery.available_at, delivery.receipt_id, delivery.target
                        FOR UPDATE SKIP LOCKED
                        LIMIT @limit
                    ), claimed AS (
                        UPDATE telemetry_secondary_deliveries delivery
                        SET status = 'LEASED',
                            lease_id = @leaseId,
                            lease_expires_at = CURRENT_TIMESTAMP + INTERVAL '2 minutes',
                            attempts = delivery.attempts + 1,
                            updated_at = CURRENT_TIMESTAMP
                        FROM candidates
                        WHERE delivery.receipt_id = candidates.receipt_id
                          AND delivery.target = candidates.target
                        RETURNING delivery.receipt_id, delivery.target,
                                  delivery.idempotency_key, delivery.attempts
                    )
                    SELECT claimed.receipt_id, claimed.target, claimed.idempotency_key,
                           claimed.attempts, telemetry.id, telemetry.created_at,
                           receipt.device_id, telemetry.raw_json::text
                    FROM claimed
                    JOIN telemetry_receipts receipt ON receipt.id = claimed.receipt_id
                    JOIN machine_telemetry telemetry ON telemetry.id = receipt.machine_telemetry_id
                    ORDER BY claimed.receipt_id, claimed.target
                    """;
                await using var command = new NpgsqlCommand(sql, connection, transaction);
                command.Parameters.AddWithValue("limit", Math.Clamp(limit, 1, 256));
                command.Parameters.AddWithValue("leaseId", leaseId);
                await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                while (await reader.ReadAsync(cancellationToken))
                {
                    claimed.Add(new SecondaryDeliveryClaim(
                        reader.GetInt64(0),
                        reader.GetString(1),
                        reader.GetString(2),
                        reader.GetInt32(3),
                        reader.GetInt64(4),
                        reader.GetFieldValue<DateTimeOffset>(5),
                        reader.GetString(6),
                        reader.GetString(7)));
                }
                await reader.DisposeAsync();
                await transaction.CommitAsync(cancellationToken);
            }

            foreach (var entry in claimed)
            {
                var targetEnabled = entry.Target switch
                {
                    "CEP" => _cepStagingPublisher.IsEnabled,
                    "TIMESCALE" => _timescaleTelemetry.IsEnabled,
                    _ => false,
                };
                if (!targetEnabled)
                {
                    await DisableSecondaryDeliveryAsync(entry, leaseId, cancellationToken);
                    continue;
                }

                if (!TelemetryIngestionService.TryParseDeliveryItem(
                    entry.DeviceId,
                    entry.RawJson,
                    out var item,
                    out var parseError))
                {
                    await ReleaseSecondaryDeliveryAsync(
                        entry,
                        leaseId,
                        parseError?.Detail ?? "Stored telemetry could not be parsed.",
                        cancellationToken);
                    continue;
                }

                try
                {
                    var completed = entry.Target switch
                    {
                        "CEP" => await _cepStagingPublisher.PublishAsync(
                            entry.SourceId,
                            entry.IdempotencyKey,
                            item!.Input,
                            cancellationToken),
                        "TIMESCALE" => await _timescaleTelemetry.TryWriteAsync(
                            new TimescaleTelemetryPoint(
                                entry.SourceId,
                                item!.Input.MachineId,
                                item.Input.Sequence,
                                entry.OccurredAt,
                                item.Input.RawTelemetryJson),
                            cancellationToken),
                        _ => false,
                    };
                    if (completed)
                    {
                        await CompleteSecondaryDeliveryAsync(entry, leaseId, cancellationToken);
                    }
                    else
                    {
                        await ReleaseSecondaryDeliveryAsync(
                            entry,
                            leaseId,
                            $"{entry.Target} delivery was not confirmed.",
                            cancellationToken);
                    }
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    _logger.LogError(
                        ex,
                        "Secondary telemetry delivery failed for receipt {ReceiptId} target {Target}",
                        entry.ReceiptId,
                        entry.Target);
                    await ReleaseSecondaryDeliveryAsync(entry, leaseId, ex.Message, cancellationToken);
                }
            }
        }

        private async Task CompleteSecondaryDeliveryAsync(
            SecondaryDeliveryClaim claim,
            Guid leaseId,
            CancellationToken cancellationToken)
        {
            await using var connection = CreateConnection();
            await connection.OpenAsync(cancellationToken);
            const string sql = """
                UPDATE telemetry_secondary_deliveries
                SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP,
                    lease_id = NULL, lease_expires_at = NULL,
                    last_error = NULL, updated_at = CURRENT_TIMESTAMP
                WHERE receipt_id = @receiptId AND target = @target
                  AND status = 'LEASED' AND lease_id = @leaseId
                """;
            await using var command = new NpgsqlCommand(sql, connection);
            command.Parameters.AddWithValue("receiptId", claim.ReceiptId);
            command.Parameters.AddWithValue("target", claim.Target);
            command.Parameters.AddWithValue("leaseId", leaseId);
            if (await command.ExecuteNonQueryAsync(cancellationToken) != 1)
            {
                _logger.LogWarning(
                    "Secondary telemetry completion lost lease for receipt {ReceiptId} target {Target}",
                    claim.ReceiptId,
                    claim.Target);
            }
        }

        private async Task ReleaseSecondaryDeliveryAsync(
            SecondaryDeliveryClaim claim,
            Guid leaseId,
            string error,
            CancellationToken cancellationToken)
        {
            await using var connection = CreateConnection();
            await connection.OpenAsync(cancellationToken);
            const string sql = """
                UPDATE telemetry_secondary_deliveries
                SET status = 'PENDING',
                    available_at = CURRENT_TIMESTAMP +
                        make_interval(secs => LEAST(300, (1 << LEAST(attempts, 8)))),
                    lease_id = NULL, lease_expires_at = NULL,
                    last_error = left(@error, 2000), updated_at = CURRENT_TIMESTAMP
                WHERE receipt_id = @receiptId AND target = @target
                  AND status = 'LEASED' AND lease_id = @leaseId
                """;
            await using var command = new NpgsqlCommand(sql, connection);
            command.Parameters.AddWithValue("receiptId", claim.ReceiptId);
            command.Parameters.AddWithValue("target", claim.Target);
            command.Parameters.AddWithValue("leaseId", leaseId);
            command.Parameters.AddWithValue("error", error);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        private async Task DisableSecondaryDeliveryAsync(
            SecondaryDeliveryClaim claim,
            Guid leaseId,
            CancellationToken cancellationToken)
        {
            await using var connection = CreateConnection();
            await connection.OpenAsync(cancellationToken);
            const string sql = """
                UPDATE telemetry_secondary_deliveries
                SET status = 'DISABLED', completed_at = NULL,
                    lease_id = NULL, lease_expires_at = NULL,
                    last_error = 'Target is disabled; no durable delivery acknowledgement exists.',
                    updated_at = CURRENT_TIMESTAMP
                WHERE receipt_id = @receiptId AND target = @target
                  AND status = 'LEASED' AND lease_id = @leaseId
                """;
            await using var command = new NpgsqlCommand(sql, connection);
            command.Parameters.AddWithValue("receiptId", claim.ReceiptId);
            command.Parameters.AddWithValue("target", claim.Target);
            command.Parameters.AddWithValue("leaseId", leaseId);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        private static string ExtractPayloadJson(string rawJson)
        {
            using var document = JsonDocument.Parse(rawJson);
            return document.RootElement.GetProperty("payload").GetRawText();
        }

        public static TelemetryDeliveryResult ClassifyDatabaseFailure(Exception exception)
        {
            if (exception is TimeoutException)
            {
                return new(TelemetryDeliveryState.Busy, "Operations database timed out.");
            }
            if (exception is OperationCanceledException)
            {
                return new(TelemetryDeliveryState.RetryableFailure, "Operations commit was interrupted.");
            }
            if (exception is PostgresException postgres)
            {
                if (postgres.SqlState is "53300" or "57P03" or "55P03")
                    return new(TelemetryDeliveryState.Busy, "Operations database is busy.");
                if (postgres.SqlState.StartsWith("08", StringComparison.Ordinal) ||
                    postgres.SqlState is "40001" or "40P01" or "57014" or "57P01" or "57P02")
                    return new(TelemetryDeliveryState.RetryableFailure, "Operations transaction can be retried.");
                if (postgres.SqlState == PostgresErrorCodes.UniqueViolation)
                    return new(TelemetryDeliveryState.Conflict, "A stable receipt key conflicts with existing data.");
                if (postgres.SqlState.StartsWith("22", StringComparison.Ordinal))
                    return new(TelemetryDeliveryState.Malformed, "Telemetry data is not valid for storage.");

                return new(TelemetryDeliveryState.PermanentFailure, "Operations transaction was rejected.");
            }
            if (exception is NpgsqlException)
            {
                return new(TelemetryDeliveryState.RetryableFailure, "Operations database is unavailable.");
            }

            return new(TelemetryDeliveryState.PermanentFailure, "Operations transaction failed.");
        }

        private enum ReceiptInsertState
        {
            Inserted,
            Duplicate,
            Conflict,
        }

        private sealed record ReceiptInsertResult(
            ReceiptInsertState State,
            long? ReceiptId);

        private enum MachineApprovalState
        {
            Approved,
            Unapproved,
            Missing,
        }

        private sealed record MachineApprovalResult(
            MachineApprovalState State,
            MachineContext? Context);

        private sealed record SecondaryDeliveryClaim(
            long ReceiptId,
            string Target,
            string IdempotencyKey,
            int Attempts,
            long SourceId,
            DateTimeOffset OccurredAt,
            string DeviceId,
            string RawJson);

        public async Task InsertTelemetryDataPointsAsync(IEnumerable<TelemetryDataPoint> dataPoints)
        {
            await using var connection = CreateConnection();
            await connection.OpenAsync();
            await using var transaction = await connection.BeginTransactionAsync();

            const string sql = @"
                INSERT INTO telemetry_data (time, asset_id, metric, value, unit, source)
                VALUES (@time, @assetId, @metric, @value, @unit, @source)
                ON CONFLICT (time, asset_id, metric) DO UPDATE SET
                    value = EXCLUDED.value,
                    unit = EXCLUDED.unit,
                    source = EXCLUDED.source";

            foreach (var point in dataPoints)
            {
                await using var command = new NpgsqlCommand(sql, connection, transaction);
                command.Parameters.AddWithValue("time", point.Time.UtcDateTime);
                command.Parameters.AddWithValue("assetId", point.AssetId);
                command.Parameters.AddWithValue("metric", point.Metric);
                command.Parameters.AddWithValue("value", point.Value);
                command.Parameters.AddWithValue("unit", (object?)point.Unit ?? DBNull.Value);
                command.Parameters.AddWithValue("source", (object?)point.Source ?? DBNull.Value);
                await command.ExecuteNonQueryAsync();
            }

            await transaction.CommitAsync();
        }

        public async Task InsertEventLogAsync(FusionEvent fusionEvent)
        {
            const string sql = @"
                INSERT INTO event_log
                    (event_id, schema_version, timestamp, asset_id, event_type, severity, source, payload, correlation_id)
                VALUES
                    (@eventId, @schemaVersion, @timestamp, @assetId, @eventType, @severity, @source, @payload, @correlationId)
                ON CONFLICT (event_id) DO NOTHING";

            await ExecuteNonQueryAsync(sql, parameters =>
            {
                parameters.AddWithValue("eventId", fusionEvent.EventId);
                parameters.AddWithValue("schemaVersion", fusionEvent.SchemaVersion);
                parameters.AddWithValue("timestamp", fusionEvent.Timestamp.UtcDateTime);
                parameters.AddWithValue("assetId", fusionEvent.AssetId);
                parameters.AddWithValue("eventType", fusionEvent.EventType);
                parameters.AddWithValue("severity", fusionEvent.Severity);
                parameters.AddWithValue("source", (object?)fusionEvent.Source ?? DBNull.Value);
                parameters.AddWithValue(
                    "payload",
                    NpgsqlDbType.Jsonb,
                    fusionEvent.Payload is null
                        ? (object)DBNull.Value
                        : JsonSerializer.Serialize(fusionEvent.Payload, FusionJsonSerializerOptions));
                parameters.AddWithValue("correlationId", (object?)fusionEvent.CorrelationId ?? DBNull.Value);
            });
        }

        public async Task<IReadOnlyList<object>> QueryTelemetryDataAsync(
            Guid assetId,
            string metric,
            DateTime from,
            DateTime to,
            int limit)
        {
            const string sql = @"
                SELECT time, asset_id, metric, value, unit, source
                FROM telemetry_data
                WHERE asset_id = @assetId
                  AND metric = @metric
                  AND time >= @from
                  AND time <= @to
                ORDER BY time DESC
                LIMIT @limit";

            var rows = new List<object>();
            await using var connection = CreateConnection();
            await connection.OpenAsync();
            await using var command = new NpgsqlCommand(sql, connection);
            command.Parameters.AddWithValue("assetId", assetId);
            command.Parameters.AddWithValue("metric", metric);
            command.Parameters.AddWithValue("from", from.ToUniversalTime());
            command.Parameters.AddWithValue("to", to.ToUniversalTime());
            command.Parameters.AddWithValue("limit", limit);
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                rows.Add(new
                {
                    time = reader.GetFieldValue<DateTimeOffset>(0),
                    assetId = reader.GetGuid(1),
                    metric = reader.GetString(2),
                    value = reader.GetDouble(3),
                    unit = reader.IsDBNull(4) ? null : reader.GetString(4),
                    source = reader.IsDBNull(5) ? null : reader.GetString(5),
                });
            }

            return rows;
        }

        public async Task<IReadOnlyList<object>> QueryEventLogAsync(
            Guid? assetId,
            string? eventType,
            string? severity,
            DateTime? from,
            DateTime? to,
            int limit)
        {
            const string sql = @"
                SELECT event_id, schema_version, timestamp, asset_id, event_type, severity, source, payload, correlation_id
                FROM event_log
                WHERE (@assetId IS NULL OR asset_id = @assetId)
                  AND (@eventType IS NULL OR event_type = @eventType)
                  AND (@severity IS NULL OR severity = @severity)
                  AND (@from IS NULL OR timestamp >= @from)
                  AND (@to IS NULL OR timestamp <= @to)
                ORDER BY timestamp DESC
                LIMIT @limit";

            var rows = new List<object>();
            await using var connection = CreateConnection();
            await connection.OpenAsync();
            await using var command = new NpgsqlCommand(sql, connection);
            command.Parameters.AddWithValue("assetId", NpgsqlDbType.Uuid, (object?)assetId ?? DBNull.Value);
            command.Parameters.AddWithValue("eventType", NpgsqlDbType.Varchar, (object?)eventType ?? DBNull.Value);
            command.Parameters.AddWithValue("severity", NpgsqlDbType.Varchar, (object?)severity ?? DBNull.Value);
            command.Parameters.AddWithValue("from", NpgsqlDbType.TimestampTz, from.HasValue ? from.Value.ToUniversalTime() : DBNull.Value);
            command.Parameters.AddWithValue("to", NpgsqlDbType.TimestampTz, to.HasValue ? to.Value.ToUniversalTime() : DBNull.Value);
            command.Parameters.AddWithValue("limit", limit);
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                rows.Add(new
                {
                    eventId = reader.GetGuid(0),
                    schemaVersion = reader.GetInt32(1),
                    timestamp = reader.GetFieldValue<DateTimeOffset>(2),
                    assetId = reader.GetGuid(3),
                    eventType = reader.GetString(4),
                    severity = reader.GetString(5),
                    source = reader.IsDBNull(6) ? null : reader.GetString(6),
                    payload = reader.IsDBNull(7) ? null : JsonSerializer.Deserialize<object>(reader.GetString(7)),
                    correlationId = reader.IsDBNull(8) ? null : reader.GetString(8),
                });
            }

            return rows;
        }

        public async Task InsertRawTelemetryAsync(string machineId, string rawJson, long sequence, DateTime? createdAt = null)
        {
            if (sequence <= 0)
            {
                throw new ArgumentOutOfRangeException(nameof(sequence), "Telemetry delivery sequence must be positive.");
            }

            if (!Guid.TryParse(machineId, out var machineGuid)) return;
            try
            {
                var occurredAt = createdAt ?? DateTime.UtcNow;
                long sourceId;
                DateTimeOffset persistedOccurredAt;
                await using var connection = CreateConnection();
                await connection.OpenAsync();
                await using var transaction = await connection.BeginTransactionAsync();
                const string sql = @"
                    INSERT INTO machine_telemetry (machine_id, raw_json, sequence, created_at)
                    VALUES (@mid, CAST(@raw AS jsonb), @seq, @created)
                    RETURNING id, created_at";

                await using (var command = new NpgsqlCommand(sql, connection, transaction))
                {
                    command.Parameters.AddWithValue("mid", machineGuid);
                    command.Parameters.AddWithValue("raw", rawJson);
                    command.Parameters.AddWithValue("seq", sequence);
                    command.Parameters.AddWithValue("created", occurredAt);
                    await using var reader = await command.ExecuteReaderAsync();
                    if (!await reader.ReadAsync())
                    {
                        throw new InvalidOperationException("Primary telemetry insert did not return a row.");
                    }

                    sourceId = reader.GetInt64(0);
                    persistedOccurredAt = reader.GetFieldValue<DateTimeOffset>(1);
                }

                await transaction.CommitAsync();
                await _timescaleTelemetry.TryWriteAsync(new TimescaleTelemetryPoint(
                    sourceId,
                    machineGuid,
                    sequence,
                    persistedOccurredAt,
                    rawJson));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DB] InsertRawTelemetryAsync failed: {ex.Message}");
            }
        }

        public async Task<long> GetMaxSequenceAsync(string machineId)
        {
            if (!Guid.TryParse(machineId, out var machineGuid)) return 0;
            try
            {
                const string sql = "SELECT COALESCE(MAX(sequence), 0) FROM machine_telemetry WHERE machine_id = @mid";
                using var conn = CreateConnection();
                await conn.OpenAsync();
                using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("mid", machineGuid);
                var val = await cmd.ExecuteScalarAsync();
                return val != null && val != DBNull.Value ? Convert.ToInt64(val) : 0L;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DB] GetMaxSequenceAsync failed: {ex.Message}");
                return 0;
            }
        }

        /// <summary>
        /// Cleans up old telemetry records from the database.
        /// </summary>
        public async Task PruneTelemetryHistoryAsync(int retentionDays = 30)
        {
            try
            {
                string sql = "DELETE FROM machine_telemetry_history WHERE created_at < NOW() - INTERVAL '1 day' * @days";
                await ExecuteNonQueryAsync(sql, p => p.AddWithValue("days", retentionDays));
                Console.WriteLine($"[DB] Telemetry history pruned (records older than {retentionDays} days deleted).");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DB] PruneTelemetryHistoryAsync failed: {ex.Message}");
            }
        }

        public async Task UpdateHourlyProductionAsync(Guid machineId, int productionCount, double cpuPercent, double ramPercent, long uptimeSeconds)
        {
            try
            {
                DateTime now = DateTime.UtcNow;
                DateTime prodDate = now.Date;
                int prodHour = now.Hour;

                using var conn = CreateConnection();
                await conn.OpenAsync();

                string checkSql = @"
                    SELECT id, produced_qty_start, produced_qty_end, avg_cpu, avg_ram
                    FROM machine_hourly_production
                    WHERE machine_id = @machine_id AND prod_date = @prod_date AND prod_hour = @prod_hour";

                long existingId = -1;
                int startQty = 0;

                using (var cmd = new NpgsqlCommand(checkSql, conn))
                {
                    cmd.Parameters.AddWithValue("machine_id", machineId);
                    cmd.Parameters.AddWithValue("prod_date", prodDate);
                    cmd.Parameters.AddWithValue("prod_hour", prodHour);
                    using var reader = await cmd.ExecuteReaderAsync();
                    if (await reader.ReadAsync())
                    {
                        existingId = reader.GetInt64(0);
                        startQty = reader.GetInt32(1);
                    }
                }

                if (existingId == -1)
                {
                    try
                    {
                        string insertSql = @"
                            INSERT INTO machine_hourly_production
                            (machine_id, prod_date, prod_hour, produced_qty_start, produced_qty_end, hourly_qty, plc_run_time_start, plc_run_time_end, avg_cpu, avg_ram)
                            VALUES (@machine_id, @prod_date, @prod_hour, @produced_qty_start, @produced_qty_end, 0, 0, 0, @avg_cpu, @avg_ram)";

                        using var cmdInsert = new NpgsqlCommand(insertSql, conn);
                        cmdInsert.Parameters.AddWithValue("machine_id", machineId);
                        cmdInsert.Parameters.AddWithValue("prod_date", prodDate);
                        cmdInsert.Parameters.AddWithValue("prod_hour", prodHour);
                        cmdInsert.Parameters.AddWithValue("produced_qty_start", productionCount);
                        cmdInsert.Parameters.AddWithValue("produced_qty_end", productionCount);
                        cmdInsert.Parameters.AddWithValue("avg_cpu", cpuPercent);
                        cmdInsert.Parameters.AddWithValue("avg_ram", ramPercent);
                        await cmdInsert.ExecuteNonQueryAsync();
                    }
                    catch (PostgresException pgex) when (pgex.SqlState == "23505")
                    {
                        // Fallback if another thread inserted it between the check and insert
                        string getSql = @"
                            SELECT id, produced_qty_start
                            FROM machine_hourly_production
                            WHERE machine_id = @machine_id AND prod_date = @prod_date AND prod_hour = @prod_hour";
                        using var cmdGet = new NpgsqlCommand(getSql, conn);
                        cmdGet.Parameters.AddWithValue("machine_id", machineId);
                        cmdGet.Parameters.AddWithValue("prod_date", prodDate);
                        cmdGet.Parameters.AddWithValue("prod_hour", prodHour);
                        using var reader = await cmdGet.ExecuteReaderAsync();
                        if (await reader.ReadAsync())
                        {
                            existingId = reader.GetInt64(0);
                            startQty = reader.GetInt32(1);
                        }
                    }
                }

                if (existingId != -1)
                {
                    string updateSql = @"
                        UPDATE machine_hourly_production
                        SET produced_qty_end = @produced_qty_end,
                            hourly_qty = @hourly_qty,
                            plc_run_time_end = @plc_run_time_end,
                            avg_cpu = @avg_cpu,
                            avg_ram = @avg_ram
                        WHERE id = @id";

                    using var cmdUpdate = new NpgsqlCommand(updateSql, conn);
                    cmdUpdate.Parameters.AddWithValue("produced_qty_end", productionCount);
                    cmdUpdate.Parameters.AddWithValue("hourly_qty", Math.Max(0, productionCount - startQty));
                    cmdUpdate.Parameters.AddWithValue("plc_run_time_end", (int)uptimeSeconds);
                    cmdUpdate.Parameters.AddWithValue("avg_cpu", cpuPercent);
                    cmdUpdate.Parameters.AddWithValue("avg_ram", ramPercent);
                    cmdUpdate.Parameters.AddWithValue("id", existingId);
                    await cmdUpdate.ExecuteNonQueryAsync();
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DB] UpdateHourlyProductionAsync failed: {ex.Message}");
            }
        }
    }
}
