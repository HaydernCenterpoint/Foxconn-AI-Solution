using Microsoft.Extensions.Options;
using Npgsql;
using NpgsqlTypes;

namespace backend.Services;

public sealed class TimescaleOptions
{
    public const string SectionName = "Timescale";
    public bool Enabled { get; set; }
    public int BackfillBatchSize { get; set; } = 1000;
    public int RawRetentionDays { get; set; } = 30;
    public int AggregateRetentionDays { get; set; } = 365;
    public int ColumnstoreAfterDays { get; set; } = 7;
    public int AggregateRefreshWindowDays { get; set; } = 29;
}

public sealed record TimescaleTelemetryPoint(
    long SourceId,
    Guid MachineId,
    long Sequence,
    DateTimeOffset OccurredAt,
    string RawJson);

public sealed record TimescaleTelemetryRollup(
    DateTimeOffset Bucket,
    Guid MachineId,
    long PointCount,
    long FirstSequence,
    long LastSequence);

public sealed class TimescaleTelemetryService
{
    private readonly string? _connectionString;
    private readonly IOptions<TimescaleOptions> _options;
    private readonly ILogger<TimescaleTelemetryService> _logger;
    private readonly SemaphoreSlim _initializationLock = new(1, 1);
    private bool _initialized;

    public TimescaleTelemetryService(
        IConfiguration configuration,
        IOptions<TimescaleOptions> options,
        ILogger<TimescaleTelemetryService> logger)
    {
        _connectionString = configuration.GetConnectionString("Timescale");
        _options = options;
        _logger = logger;
    }

    public bool IsEnabled => _options.Value.Enabled;

    public async Task<bool> TryWriteAsync(TimescaleTelemetryPoint point, CancellationToken cancellationToken = default)
    {
        if (!IsEnabled) return false;

        try
        {
            await EnsureSchemaAsync(cancellationToken);
            await WriteBatchAsync([point], cancellationToken);
            await using var connection = CreateConnection();
            await connection.OpenAsync(cancellationToken);
            const string acknowledgementSql = """
                SELECT EXISTS (
                    SELECT 1
                    FROM telemetry_points
                    WHERE occurred_at = @occurredAt
                      AND source_id = @sourceId
                      AND machine_id = @machineId
                      AND sequence = @sequence
                      AND raw_json = CAST(@rawJson AS jsonb))
                """;
            await using var acknowledgement = new NpgsqlCommand(acknowledgementSql, connection);
            acknowledgement.Parameters.Add("occurredAt", NpgsqlDbType.TimestampTz).Value = point.OccurredAt;
            acknowledgement.Parameters.Add("sourceId", NpgsqlDbType.Bigint).Value = point.SourceId;
            acknowledgement.Parameters.Add("machineId", NpgsqlDbType.Uuid).Value = point.MachineId;
            acknowledgement.Parameters.Add("sequence", NpgsqlDbType.Bigint).Value = point.Sequence;
            acknowledgement.Parameters.Add("rawJson", NpgsqlDbType.Jsonb).Value = point.RawJson;
            return await acknowledgement.ExecuteScalarAsync(cancellationToken) is true;
        }
        catch (Exception exception)
        {
            _logger.LogError(exception, "Timescale dual-write failed for source telemetry {SourceId}", point.SourceId);
            return false;
        }
    }

    public async Task EnsureSchemaAsync(CancellationToken cancellationToken = default)
    {
        if (_initialized) return;
        await _initializationLock.WaitAsync(cancellationToken);
        try
        {
            if (_initialized) return;

            await using var connection = CreateConnection();
            await connection.OpenAsync(cancellationToken);
            var rawRetentionDays = Math.Max(_options.Value.RawRetentionDays, 2);
            var aggregateRetentionDays = Math.Max(_options.Value.AggregateRetentionDays, rawRetentionDays + 1);
            var columnstoreAfterDays = Math.Clamp(_options.Value.ColumnstoreAfterDays, 1, rawRetentionDays - 1);
            var aggregateRefreshWindowDays = Math.Clamp(_options.Value.AggregateRefreshWindowDays, 1, rawRetentionDays - 1);
            const string setupSql = """
                CREATE EXTENSION IF NOT EXISTS timescaledb;
                CREATE TABLE IF NOT EXISTS telemetry_points (
                    occurred_at TIMESTAMPTZ NOT NULL,
                    source_id BIGINT NOT NULL,
                    machine_id UUID NOT NULL,
                    sequence BIGINT NOT NULL,
                    raw_json JSONB NOT NULL,
                    ingested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (occurred_at, source_id)
                );
                SELECT create_hypertable('telemetry_points', by_range('occurred_at', INTERVAL '1 day'), if_not_exists => TRUE);
                CREATE INDEX IF NOT EXISTS idx_telemetry_points_machine_time
                    ON telemetry_points (machine_id, occurred_at DESC);
                CREATE TABLE IF NOT EXISTS telemetry_backfill_progress (
                    stream VARCHAR(100) PRIMARY KEY,
                    last_source_id BIGINT NOT NULL DEFAULT 0,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                CREATE MATERIALIZED VIEW IF NOT EXISTS telemetry_points_hourly
                WITH (timescaledb.continuous) AS
                SELECT
                    time_bucket(INTERVAL '1 hour', occurred_at) AS bucket,
                    machine_id,
                    count(*) AS point_count,
                    min(sequence) AS first_sequence,
                    max(sequence) AS last_sequence
                FROM telemetry_points
                GROUP BY bucket, machine_id
                WITH NO DATA;
                CREATE MATERIALIZED VIEW IF NOT EXISTS telemetry_points_daily
                WITH (timescaledb.continuous) AS
                SELECT
                    time_bucket(INTERVAL '1 day', occurred_at) AS bucket,
                    machine_id,
                    count(*) AS point_count,
                    min(sequence) AS first_sequence,
                    max(sequence) AS last_sequence
                FROM telemetry_points
                GROUP BY bucket, machine_id
                WITH NO DATA;
                ALTER MATERIALIZED VIEW telemetry_points_hourly
                    SET (timescaledb.materialized_only = false);
                ALTER MATERIALIZED VIEW telemetry_points_daily
                    SET (timescaledb.materialized_only = false);
                SELECT add_continuous_aggregate_policy(
                    'telemetry_points_hourly',
                    start_offset => make_interval(days => @aggregateRefreshWindowDays),
                    end_offset => INTERVAL '1 hour',
                    schedule_interval => INTERVAL '15 minutes',
                    if_not_exists => TRUE);
                SELECT add_continuous_aggregate_policy(
                    'telemetry_points_daily',
                    start_offset => make_interval(days => @aggregateRefreshWindowDays),
                    end_offset => INTERVAL '1 day',
                    schedule_interval => INTERVAL '1 hour',
                    if_not_exists => TRUE);
                ALTER TABLE telemetry_points SET (
                    timescaledb.enable_columnstore,
                    timescaledb.orderby = 'occurred_at DESC',
                    timescaledb.segmentby = 'machine_id');
                CALL add_columnstore_policy(
                    'telemetry_points',
                    after => make_interval(days => @columnstoreAfterDays),
                    if_not_exists => TRUE);
                SELECT add_retention_policy(
                    'telemetry_points',
                    drop_after => make_interval(days => @rawRetentionDays),
                    if_not_exists => TRUE);
                SELECT add_retention_policy(
                    'telemetry_points_hourly',
                    drop_after => make_interval(days => @aggregateRetentionDays),
                    if_not_exists => TRUE);
                SELECT add_retention_policy(
                    'telemetry_points_daily',
                    drop_after => make_interval(days => @aggregateRetentionDays),
                    if_not_exists => TRUE);
                """;
            await using var command = new NpgsqlCommand(setupSql, connection);
            command.Parameters.Add("rawRetentionDays", NpgsqlDbType.Integer).Value = rawRetentionDays;
            command.Parameters.Add("aggregateRetentionDays", NpgsqlDbType.Integer).Value = aggregateRetentionDays;
            command.Parameters.Add("columnstoreAfterDays", NpgsqlDbType.Integer).Value = columnstoreAfterDays;
            command.Parameters.Add("aggregateRefreshWindowDays", NpgsqlDbType.Integer).Value = aggregateRefreshWindowDays;
            await command.ExecuteNonQueryAsync(cancellationToken);
            _initialized = true;
        }
        finally
        {
            _initializationLock.Release();
        }
    }

    public async Task WriteBatchAsync(IReadOnlyCollection<TimescaleTelemetryPoint> points, CancellationToken cancellationToken = default)
    {
        if (points.Count == 0) return;

        await using var connection = CreateConnection();
        await connection.OpenAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        const string sql = """
            INSERT INTO telemetry_points (occurred_at, source_id, machine_id, sequence, raw_json)
            VALUES (@occurredAt, @sourceId, @machineId, @sequence, @rawJson)
            ON CONFLICT (occurred_at, source_id) DO NOTHING
            """;
        await using var command = new NpgsqlCommand(sql, connection, transaction);
        var occurredAt = command.Parameters.Add("occurredAt", NpgsqlDbType.TimestampTz);
        var sourceId = command.Parameters.Add("sourceId", NpgsqlDbType.Bigint);
        var machineId = command.Parameters.Add("machineId", NpgsqlDbType.Uuid);
        var sequence = command.Parameters.Add("sequence", NpgsqlDbType.Bigint);
        var rawJson = command.Parameters.Add("rawJson", NpgsqlDbType.Jsonb);

        foreach (var point in points)
        {
            occurredAt.Value = point.OccurredAt;
            sourceId.Value = point.SourceId;
            machineId.Value = point.MachineId;
            sequence.Value = point.Sequence;
            rawJson.Value = point.RawJson;
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);
    }

    public async Task<long> GetBackfillProgressAsync(string stream, CancellationToken cancellationToken = default)
    {
        await EnsureSchemaAsync(cancellationToken);
        await using var connection = CreateConnection();
        await connection.OpenAsync(cancellationToken);
        const string sql = "SELECT COALESCE((SELECT last_source_id FROM telemetry_backfill_progress WHERE stream = @stream), 0)";
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("stream", stream);
        return Convert.ToInt64(await command.ExecuteScalarAsync(cancellationToken) ?? 0L);
    }

    public async Task<IReadOnlyList<TimescaleTelemetryPoint>> GetRecentAsync(
        Guid machineId,
        int limit,
        CancellationToken cancellationToken = default)
    {
        await EnsureSchemaAsync(cancellationToken);
        await using var connection = CreateConnection();
        await connection.OpenAsync(cancellationToken);
        const string sql = """
            SELECT source_id, machine_id, sequence, occurred_at, raw_json::text
            FROM telemetry_points
            WHERE machine_id = @machineId
            ORDER BY occurred_at DESC, source_id DESC
            LIMIT @limit
            """;
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.Add("machineId", NpgsqlDbType.Uuid).Value = machineId;
        command.Parameters.Add("limit", NpgsqlDbType.Integer).Value = Math.Clamp(limit, 1, 1000);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var points = new List<TimescaleTelemetryPoint>();
        while (await reader.ReadAsync(cancellationToken))
        {
            points.Add(new TimescaleTelemetryPoint(
                reader.GetInt64(0),
                reader.GetGuid(1),
                reader.GetInt64(2),
                reader.GetFieldValue<DateTimeOffset>(3),
                reader.GetString(4)));
        }

        return points;
    }

    public async Task<IReadOnlyList<TimescaleTelemetryRollup>> GetHourlyRollupsAsync(
        Guid machineId,
        int limit,
        CancellationToken cancellationToken = default)
    {
        await EnsureSchemaAsync(cancellationToken);
        await using var connection = CreateConnection();
        await connection.OpenAsync(cancellationToken);
        const string sql = """
            SELECT bucket, machine_id, point_count, first_sequence, last_sequence
            FROM telemetry_points_hourly
            WHERE machine_id = @machineId
            ORDER BY bucket DESC
            LIMIT @limit
            """;
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.Add("machineId", NpgsqlDbType.Uuid).Value = machineId;
        command.Parameters.Add("limit", NpgsqlDbType.Integer).Value = Math.Clamp(limit, 1, 1000);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var rollups = new List<TimescaleTelemetryRollup>();
        while (await reader.ReadAsync(cancellationToken))
        {
            rollups.Add(new TimescaleTelemetryRollup(
                reader.GetFieldValue<DateTimeOffset>(0),
                reader.GetGuid(1),
                reader.GetInt64(2),
                reader.GetInt64(3),
                reader.GetInt64(4)));
        }

        return rollups;
    }

    public async Task SetBackfillProgressAsync(string stream, long sourceId, CancellationToken cancellationToken = default)
    {
        await using var connection = CreateConnection();
        await connection.OpenAsync(cancellationToken);
        const string sql = """
            INSERT INTO telemetry_backfill_progress (stream, last_source_id)
            VALUES (@stream, @sourceId)
            ON CONFLICT (stream) DO UPDATE
            SET last_source_id = EXCLUDED.last_source_id, updated_at = CURRENT_TIMESTAMP
            """;
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("stream", stream);
        command.Parameters.AddWithValue("sourceId", sourceId);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private NpgsqlConnection CreateConnection() => new(_connectionString
        ?? throw new InvalidOperationException("ConnectionStrings:Timescale is required when Timescale is enabled."));
}
