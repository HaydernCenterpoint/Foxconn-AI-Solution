using backend.Services;
using System.Net;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Npgsql;

namespace backend.Tests.Services;

public sealed class TelemetryProjectionPostgresTests
{
    [Fact]
    public async Task ExplicitIntegrationEnvironmentRequiresReachablePostgres()
    {
        var rootConnection = Environment.GetEnvironmentVariable("FII_OPERATIONAL_TEST_CONNECTION");
        var required = string.Equals(
            Environment.GetEnvironmentVariable("FII_OPERATIONAL_INTEGRATION_REQUIRED"),
            "1",
            StringComparison.Ordinal);

        if (!required)
        {
            return;
        }

        Assert.False(
            string.IsNullOrWhiteSpace(rootConnection),
            "FII_OPERATIONAL_TEST_CONNECTION is required when FII_OPERATIONAL_INTEGRATION_REQUIRED=1.");
        await using var connection = new NpgsqlConnection(rootConnection);
        await connection.OpenAsync();
        Assert.Equal(System.Data.ConnectionState.Open, connection.State);
    }

    [Fact]
    public async Task CleanDatabaseMigratesPreflightsAndPersistsWithSeparateSecondaryTargets()
    {
        await using var database = await DisposableOperationalDatabase.CreateAsync();
        if (database is null) return;

        var migration = CreateMigrationService(database.ConnectionString);
        var migrated = await migration.MigrateAsync();
        var preflight = await migration.PreflightAsync();

        Assert.Equal("0005", migrated.HeadVersion);
        Assert.Equal("0005", preflight.HeadVersion);
        Assert.Equal(0, (await migration.MigrateAsync()).AppliedCount);

        var service = CreateDatabaseService(database.ConnectionString);
        var machineId = await InsertMachineAsync(database.ConnectionString, "APPROVED");
        var item = ParseItem(machineId, "clean-secondary", 41, "RUNNING", "2026-08-02T00:00:00Z");

        var committed = await service.PersistTelemetryAndFusionOutboxAsync(item);

        Assert.Equal(TelemetryDeliveryState.Committed, committed.State);
        await using var connection = new NpgsqlConnection(database.ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand("""
            SELECT target, status, idempotency_key
            FROM telemetry_secondary_deliveries
            ORDER BY target
            """, connection);
        await using var reader = await command.ExecuteReaderAsync();
        var targets = new List<(string Target, string Status, string Key)>();
        while (await reader.ReadAsync())
        {
            targets.Add((reader.GetString(0), reader.GetString(1), reader.GetString(2)));
        }

        Assert.Equal(new[] { "CEP", "TIMESCALE" }, targets.Select(target => target.Target));
        Assert.All(targets, target => Assert.Equal("PENDING", target.Status));
        Assert.Equal(2, targets.Select(target => target.Key).Distinct(StringComparer.Ordinal).Count());
    }

    [Fact]
    public async Task CepHttpSuccessWithoutDurableAcknowledgementRemainsUnconfirmed()
    {
        var handler = new RecordingHttpHandler(HttpStatusCode.Accepted);
        var publisher = new CepStagingPublisher(
            new SingleHttpClientFactory(new HttpClient(handler)
            {
                BaseAddress = new Uri("http://cep.test/"),
            }),
            Options.Create(new CepStagingOptions { Enabled = true }),
            NullLogger<CepStagingPublisher>.Instance);
        var machineId = Guid.NewGuid();
        var input = ParseItem(machineId, "cep-message", 71, "RUNNING", "2026-08-02T00:00:00Z").Input;

        var completed = await publisher.PublishAsync(10, "telemetry:10:cep", input);

        Assert.False(completed);
        Assert.Equal("telemetry:10:cep", handler.IdempotencyKey);
        Assert.Contains("\"event_id\":\"telemetry:10:cep\"", handler.Body, StringComparison.Ordinal);

        var failure = new CepStagingPublisher(
            new SingleHttpClientFactory(new HttpClient(new RecordingHttpHandler(HttpStatusCode.ServiceUnavailable))
            {
                BaseAddress = new Uri("http://cep.test/"),
            }),
            Options.Create(new CepStagingOptions { Enabled = true }),
            NullLogger<CepStagingPublisher>.Instance);
        Assert.False(await failure.PublishAsync(10, "telemetry:10:cep", input));
    }

    [Fact]
    public async Task CepHttpSuccessCannotCompleteDurableSecondaryRow()
    {
        await using var database = await DisposableOperationalDatabase.CreateMigratedAsync();
        if (database is null) return;

        var service = CreateDatabaseService(
            database.ConnectionString,
            cepEnabled: true,
            new RecordingHttpHandler(HttpStatusCode.Accepted));
        var machineId = await InsertMachineAsync(database.ConnectionString, "APPROVED");
        var item = ParseItem(machineId, "cep-unconfirmed", 72, "RUNNING", "2026-08-02T00:00:00Z");
        Assert.True((await service.PersistTelemetryAndFusionOutboxAsync(item)).IsSuccess);

        await service.RetryPendingSecondaryDeliveriesAsync();

        await using var connection = new NpgsqlConnection(database.ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand("""
            SELECT target, status, completed_at
            FROM telemetry_secondary_deliveries
            ORDER BY target
            """, connection);
        await using var reader = await command.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.Equal("CEP", reader.GetString(0));
        Assert.Equal("PENDING", reader.GetString(1));
        Assert.True(reader.IsDBNull(2));
        Assert.True(await reader.ReadAsync());
        Assert.Equal("TIMESCALE", reader.GetString(0));
        Assert.Equal("DISABLED", reader.GetString(1));
        Assert.True(reader.IsDBNull(2));
    }

    [Fact]
    public async Task UpgradeFrom0003AppliesForwardMigrationsAndPreservesLegacyNullSourceHistory()
    {
        await using var database = await DisposableOperationalDatabase.CreateAsync();
        if (database is null) return;

        var migrationsDirectory = RepositoryPath("backend", "db", "migrations");
        var through0003 = Path.Combine(Path.GetTempPath(), $"fii-migrations-0003-{Guid.NewGuid():N}");
        Directory.CreateDirectory(through0003);
        try
        {
            foreach (var source in Directory.EnumerateFiles(migrationsDirectory, "000*.sql")
                         .Where(path => string.CompareOrdinal(Path.GetFileName(path), "0004") < 0))
            {
                File.Copy(source, Path.Combine(through0003, Path.GetFileName(source)));
            }

            // The source-controlled runner intentionally knows only the current head. Apply 0001-0003
            // directly for the historical upgrade fixture, then seed matching ledger provenance.
            await database.RecreateAsync();
            await ApplySqlFilesAsync(database.ConnectionString, through0003);
            await SeedHistoricalLedgerAsync(database.ConnectionString, through0003);

            var machineId = await InsertMachineAsync(database.ConnectionString, "APPROVED");
            await using (var connection = new NpgsqlConnection(database.ConnectionString))
            {
                await connection.OpenAsync();
                await using var legacy = new NpgsqlCommand("""
                    INSERT INTO machine_telemetry_history
                        (machine_id, source_telemetry_id, status, plc_connected, production_count, tags)
                    VALUES (@machineId, NULL, 'LEGACY', false, 0, '{}'::jsonb)
                    """, connection);
                legacy.Parameters.AddWithValue("machineId", machineId);
                await legacy.ExecuteNonQueryAsync();
            }

            var migration = CreateMigrationService(database.ConnectionString);
            var result = await migration.MigrateAsync();
            Assert.Equal("0005", result.HeadVersion);
            Assert.Equal(2, result.AppliedCount);
            Assert.Equal("0005", (await migration.PreflightAsync()).HeadVersion);

            await using var verifyConnection = new NpgsqlConnection(database.ConnectionString);
            await verifyConnection.OpenAsync();
            await using var verify = new NpgsqlCommand("""
                SELECT COUNT(*)
                FROM machine_telemetry_history
                WHERE machine_id = @machineId AND source_telemetry_id IS NULL
                """, verifyConnection);
            verify.Parameters.AddWithValue("machineId", machineId);
            Assert.Equal(1L, Convert.ToInt64(await verify.ExecuteScalarAsync()));
        }
        finally
        {
            Directory.Delete(through0003, recursive: true);
        }
    }

    [Fact]
    public async Task ConcurrentSecondaryWorkersClaimEachTargetOnceAndNeverReplayOperationalState()
    {
        await using var database = await DisposableOperationalDatabase.CreateMigratedAsync();
        if (database is null) return;

        var service = CreateDatabaseService(database.ConnectionString);
        var machineId = await InsertMachineAsync(database.ConnectionString, "APPROVED");
        var item = ParseItem(machineId, "concurrent-lease", 51, "RUNNING", "2026-08-02T01:00:00Z");
        Assert.Equal(
            TelemetryDeliveryState.Committed,
            (await service.PersistTelemetryAndFusionOutboxAsync(item)).State);

        await using (var connection = new NpgsqlConnection(database.ConnectionString))
        {
            await connection.OpenAsync();
            await using var mutate = new NpgsqlCommand(
                "UPDATE machines SET status = 'NEWER' WHERE id = @machineId", connection);
            mutate.Parameters.AddWithValue("machineId", machineId);
            await mutate.ExecuteNonQueryAsync();
        }

        await Task.WhenAll(
            service.RetryPendingSecondaryDeliveriesAsync(32),
            service.RetryPendingSecondaryDeliveriesAsync(32));

        await using var verifyConnection = new NpgsqlConnection(database.ConnectionString);
        await verifyConnection.OpenAsync();
        await using var verify = new NpgsqlCommand("""
            SELECT
                (SELECT status FROM machines WHERE id = @machineId),
                (SELECT COUNT(*) FROM telemetry_secondary_deliveries WHERE attempts = 1),
                (SELECT COUNT(*) FROM telemetry_secondary_deliveries WHERE status = 'COMPLETED')
            """, verifyConnection);
        verify.Parameters.AddWithValue("machineId", machineId);
        await using var reader = await verify.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.Equal("NEWER", reader.GetString(0));
        Assert.Equal(2, reader.GetInt64(1));
        Assert.Equal(0, reader.GetInt64(2));
        await reader.DisposeAsync();

        await using var disabled = new NpgsqlCommand(
            "SELECT COUNT(*) FROM telemetry_secondary_deliveries WHERE status = 'DISABLED'",
            verifyConnection);
        Assert.Equal(2L, Convert.ToInt64(await disabled.ExecuteScalarAsync()));
    }

    [Fact]
    public async Task ExpiredSecondaryLeaseIsDurablyReclaimed()
    {
        await using var database = await DisposableOperationalDatabase.CreateMigratedAsync();
        if (database is null) return;

        var service = CreateDatabaseService(database.ConnectionString);
        var machineId = await InsertMachineAsync(database.ConnectionString, "APPROVED");
        var item = ParseItem(machineId, "expired-lease", 61, "RUNNING", "2026-08-02T01:00:00Z");
        Assert.True((await service.PersistTelemetryAndFusionOutboxAsync(item)).IsSuccess);

        await using (var connection = new NpgsqlConnection(database.ConnectionString))
        {
            await connection.OpenAsync();
            await using var expire = new NpgsqlCommand("""
                UPDATE telemetry_secondary_deliveries
                SET status = 'LEASED', lease_id = gen_random_uuid(),
                    lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
                WHERE target = 'CEP'
                """, connection);
            await expire.ExecuteNonQueryAsync();
        }

        await service.RetryPendingSecondaryDeliveriesAsync(32);

        await using var verifyConnection = new NpgsqlConnection(database.ConnectionString);
        await verifyConnection.OpenAsync();
        await using var verify = new NpgsqlCommand("""
            SELECT status, attempts, lease_id
            FROM telemetry_secondary_deliveries
            WHERE target = 'CEP'
            """, verifyConnection);
        await using var reader = await verify.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.Equal("DISABLED", reader.GetString(0));
        Assert.Equal(1, reader.GetInt32(1));
        Assert.True(reader.IsDBNull(2));
    }

    [Fact]
    public async Task OutOfOrderPrimaryTelemetryCannotRegressCurrentMachineState()
    {
        await using var database = await DisposableOperationalDatabase.CreateMigratedAsync();
        if (database is null) return;

        var service = CreateDatabaseService(database.ConnectionString);
        var machineId = await InsertMachineAsync(database.ConnectionString, "APPROVED");
        var newer = ParseItem(machineId, "newer", 2, "RUNNING", "2026-08-02T02:00:00Z");
        var older = ParseItem(machineId, "older", 1, "OFFLINE", "2026-08-02T01:00:00Z");

        Assert.True((await service.PersistTelemetryAndFusionOutboxAsync(newer)).IsSuccess);
        Assert.True((await service.PersistTelemetryAndFusionOutboxAsync(older)).IsSuccess);

        await using var connection = new NpgsqlConnection(database.ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(
            "SELECT status FROM machines WHERE id = @machineId", connection);
        command.Parameters.AddWithValue("machineId", machineId);
        Assert.Equal("RUNNING", await command.ExecuteScalarAsync());
    }

    [Fact]
    public async Task ApprovalIsRevalidatedInsideTransactionAndDatabaseFailureRemainsRetryable()
    {
        await using var database = await DisposableOperationalDatabase.CreateMigratedAsync();
        if (database is null) return;

        var service = CreateDatabaseService(database.ConnectionString);
        var machineId = await InsertMachineAsync(database.ConnectionString, "PENDING");
        var item = ParseItem(machineId, "unapproved", 1, "RUNNING", "2026-08-02T00:00:00Z");

        var rejected = await service.PersistTelemetryAndFusionOutboxAsync(item);

        Assert.Equal(TelemetryDeliveryState.PermanentFailure, rejected.State);
        Assert.Equal(TelemetryApproval.Unapproved, rejected.Approval);
        Assert.False(rejected.Approved!.Value);
        await using var connection = new NpgsqlConnection(database.ConnectionString);
        await connection.OpenAsync();
        await using var count = new NpgsqlCommand("SELECT COUNT(*) FROM machine_telemetry", connection);
        Assert.Equal(0L, Convert.ToInt64(await count.ExecuteScalarAsync()));

        var unavailable = CreateDatabaseService(
            "Host=127.0.0.1;Port=1;Database=missing;Username=missing;Timeout=1;Command Timeout=1");
        var unavailableResult = await unavailable.PersistTelemetryAndFusionOutboxAsync(item);
        Assert.Equal(TelemetryDeliveryState.RetryableFailure, unavailableResult.State);
        Assert.Equal(TelemetryApproval.Unavailable, unavailableResult.Approval);
        Assert.Null(unavailableResult.Approved);
    }

    [Fact]
    public async Task DeviceSequenceIdentityRejectsHashConflictAndAllowsExactDuplicate()
    {
        await using var database = await DisposableOperationalDatabase.CreateMigratedAsync();
        if (database is null) return;

        var service = CreateDatabaseService(database.ConnectionString);
        var machineId = await InsertMachineAsync(database.ConnectionString, "APPROVED");
        var original = ParseItem(machineId, "sequence-original", 81, "RUNNING", "2026-08-02T01:00:00Z");
        var conflicting = ParseItem(machineId, "sequence-conflict", 81, "OFFLINE", "2026-08-02T02:00:00Z");

        Assert.Equal(TelemetryDeliveryState.Committed, (await service.PersistTelemetryAndFusionOutboxAsync(original)).State);
        var duplicate = await service.PersistTelemetryAndFusionOutboxAsync(original);
        Assert.Equal(TelemetryDeliveryState.Duplicate, duplicate.State);
        Assert.Equal(TelemetryApproval.Approved, duplicate.Approval);

        var conflict = await service.PersistTelemetryAndFusionOutboxAsync(conflicting);
        Assert.Equal(TelemetryDeliveryState.Conflict, conflict.State);
        Assert.Equal(TelemetryApproval.Approved, conflict.Approval);
    }

    [Fact]
    public async Task PendingClientLivenessDoesNotMutateMachineStateOrHistory()
    {
        await using var database = await DisposableOperationalDatabase.CreateMigratedAsync();
        if (database is null) return;

        var service = CreateDatabaseService(database.ConnectionString);
        var machineId = Guid.NewGuid();
        var approval = await service.UpdateClientLivenessAsync(
            machineId.ToString("D"),
            "Pending machine",
            "PENDING-1",
            "127.0.0.1",
            "RUNNING",
            true,
            ClientLivenessEvent.Heartbeat);

        Assert.Equal(TelemetryApproval.Unapproved, approval);
        await using var connection = new NpgsqlConnection(database.ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand("""
            SELECT m.approval_status, m.status, m.last_heartbeat,
                   p.status, p.last_heartbeat,
                   (SELECT COUNT(*) FROM machine_telemetry_history h WHERE h.machine_id = m.id)
            FROM machines m
            JOIN plc_clients p ON p.machine_id = m.id
            WHERE m.id = @machineId
            """, connection);
        command.Parameters.AddWithValue("machineId", machineId);
        await using var reader = await command.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.Equal("PENDING", reader.GetString(0));
        Assert.Equal("offline", reader.GetString(1));
        Assert.True(reader.IsDBNull(2));
        Assert.Equal("ONLINE", reader.GetString(3));
        Assert.False(reader.IsDBNull(4));
        Assert.Equal(0L, reader.GetInt64(5));
    }

    [Fact]
    public async Task PreflightRejectsMigrationLedgerTampering()
    {
        await using var database = await DisposableOperationalDatabase.CreateMigratedAsync();
        if (database is null) return;

        await using (var connection = new NpgsqlConnection(database.ConnectionString))
        {
            await connection.OpenAsync();
            await using var tamper = new NpgsqlCommand(
                "UPDATE schema_migrations SET checksum = repeat('f', 64) WHERE version = '0003'",
                connection);
            await tamper.ExecuteNonQueryAsync();
        }

        var error = await Assert.ThrowsAsync<InvalidOperationException>(
            () => CreateMigrationService(database.ConnectionString).PreflightAsync());
        Assert.Contains("checksum mismatch for version 0003", error.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task MachineDeletionIsRestrictedByRawAndLegacyHistoryRows()
    {
        await using var database = await DisposableOperationalDatabase.CreateMigratedAsync();
        if (database is null) return;

        var machineId = await InsertMachineAsync(database.ConnectionString, "APPROVED");
        await using var connection = new NpgsqlConnection(database.ConnectionString);
        await connection.OpenAsync();
        await using (var seed = new NpgsqlCommand("""
            INSERT INTO machine_telemetry (machine_id, raw_json, sequence)
            VALUES (@machineId, '{}'::jsonb, 1);
            INSERT INTO machine_telemetry_history
                (machine_id, source_telemetry_id, status, plc_connected, production_count, tags)
            VALUES (@machineId, NULL, 'LEGACY', false, 0, '{}'::jsonb);
            """, connection))
        {
            seed.Parameters.AddWithValue("machineId", machineId);
            await seed.ExecuteNonQueryAsync();
        }

        await using var delete = new NpgsqlCommand(
            "DELETE FROM machines WHERE id = @machineId", connection);
        delete.Parameters.AddWithValue("machineId", machineId);
        var error = await Assert.ThrowsAsync<PostgresException>(() => delete.ExecuteNonQueryAsync());
        Assert.Contains(error.SqlState, new[]
        {
            PostgresErrorCodes.ForeignKeyViolation,
            "23001", // restrict_violation
        });
    }

    private static OperationalDatabaseMigrationService CreateMigrationService(string connectionString) =>
        new(connectionString, RepositoryPath("backend", "db", "migrations"), "integration");

    private static DatabaseService CreateDatabaseService(
        string connectionString,
        bool cepEnabled = false,
        HttpMessageHandler? cepHandler = null)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:DefaultConnection"] = connectionString,
            })
            .Build();
        var timescale = new TimescaleTelemetryService(
            configuration,
            Options.Create(new TimescaleOptions { Enabled = false }),
            NullLogger<TimescaleTelemetryService>.Instance);
        var cep = new CepStagingPublisher(
            cepEnabled
                ? new SingleHttpClientFactory(new HttpClient(
                    cepHandler ?? throw new ArgumentNullException(nameof(cepHandler)))
                {
                    BaseAddress = new Uri("http://cep.test/"),
                })
                : new UnusedHttpClientFactory(),
            Options.Create(new CepStagingOptions { Enabled = cepEnabled }),
            NullLogger<CepStagingPublisher>.Instance);
        return new DatabaseService(
            configuration,
            timescale,
            cep,
            NullLogger<DatabaseService>.Instance);
    }

    private static async Task<Guid> InsertMachineAsync(
        string connectionString,
        string approvalStatus)
    {
        var machineId = Guid.NewGuid();
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand("""
            INSERT INTO machines (id, name, client_id, approval_status)
            VALUES (@id, 'Integration machine', @clientId, @approvalStatus)
            """, connection);
        command.Parameters.AddWithValue("id", machineId);
        command.Parameters.AddWithValue("clientId", machineId.ToString("D"));
        command.Parameters.AddWithValue("approvalStatus", approvalStatus);
        await command.ExecuteNonQueryAsync();
        return machineId;
    }

    private static TelemetryDeliveryItem ParseItem(
        Guid machineId,
        string messageId,
        long sequence,
        string status,
        string sentAt)
    {
        var rawJson = $$"""
            {
              "messageId": "{{messageId}}",
              "sentAt": "{{sentAt}}",
              "payload": {
                "machineId": "{{machineId}}",
                "sequence": {{sequence}},
                "status": "{{status}}",
                "plcConnected": true,
                "production": { "qty": {{sequence}}, "time": 1.5, "uph": 24, "oee": 92 }
              }
            }
            """;
        Assert.True(TelemetryIngestionService.TryParseDeliveryItem(
            machineId.ToString("D"), rawJson, out var item, out var parseError), parseError?.Detail);
        return item!;
    }

    private static async Task ApplySqlFilesAsync(string connectionString, string directory)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        foreach (var path in Directory.EnumerateFiles(directory, "*.sql").OrderBy(path => path, StringComparer.Ordinal))
        {
            await using var command = new NpgsqlCommand(await File.ReadAllTextAsync(path), connection)
            {
                CommandTimeout = 600,
            };
            await command.ExecuteNonQueryAsync();
        }
    }

    private static async Task SeedHistoricalLedgerAsync(string connectionString, string directory)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        await using (var create = new NpgsqlCommand("""
            CREATE TABLE public.schema_migrations (
                version VARCHAR(32) PRIMARY KEY,
                checksum CHAR(64) NOT NULL,
                app_version VARCHAR(128) NOT NULL,
                catalog_checksum CHAR(64),
                applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """, connection))
        {
            await create.ExecuteNonQueryAsync();
        }

        var migrations = OperationalDatabaseMigrationService.LoadMigrations(directory);
        foreach (var migration in migrations)
        {
            await using var insert = new NpgsqlCommand("""
                INSERT INTO schema_migrations (version, checksum, app_version, catalog_checksum)
                VALUES (@version, @checksum, 'historical-fixture', @catalogChecksum)
                """, connection);
            insert.Parameters.AddWithValue("version", migration.Version);
            insert.Parameters.AddWithValue("checksum", migration.Checksum);
            insert.Parameters.AddWithValue("catalogChecksum", new string('0', 64));
            await insert.ExecuteNonQueryAsync();
        }
    }

    private static string RepositoryPath(params string[] segments)
    {
        var root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", ".."));
        return Path.Combine(new[] { root }.Concat(segments).ToArray());
    }

    private sealed class UnusedHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) =>
            throw new InvalidOperationException("CEP is disabled for this integration test.");
    }

    private sealed class SingleHttpClientFactory(HttpClient client) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => client;
    }

    private sealed class RecordingHttpHandler(HttpStatusCode statusCode) : HttpMessageHandler
    {
        public string? IdempotencyKey { get; private set; }
        public string Body { get; private set; } = string.Empty;

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            IdempotencyKey = request.Headers.TryGetValues("Idempotency-Key", out var values)
                ? values.Single()
                : null;
            Body = request.Content is null
                ? string.Empty
                : await request.Content.ReadAsStringAsync(cancellationToken);
            return new HttpResponseMessage(statusCode);
        }
    }

    private sealed class DisposableOperationalDatabase : IAsyncDisposable
    {
        private readonly string _rootConnectionString;
        private readonly string _databaseName;

        private DisposableOperationalDatabase(string rootConnectionString, string databaseName)
        {
            _rootConnectionString = rootConnectionString;
            _databaseName = databaseName;
            var builder = new NpgsqlConnectionStringBuilder(rootConnectionString)
            {
                Database = databaseName,
                Pooling = false,
            };
            ConnectionString = builder.ConnectionString;
        }

        public string ConnectionString { get; }

        public static async Task<DisposableOperationalDatabase?> CreateAsync()
        {
            var root = Environment.GetEnvironmentVariable("FII_OPERATIONAL_TEST_CONNECTION");
            var required = string.Equals(
                Environment.GetEnvironmentVariable("FII_OPERATIONAL_INTEGRATION_REQUIRED"),
                "1",
                StringComparison.Ordinal);
            if (string.IsNullOrWhiteSpace(root))
            {
                if (required)
                {
                    throw new InvalidOperationException(
                        "FII_OPERATIONAL_TEST_CONNECTION is required when FII_OPERATIONAL_INTEGRATION_REQUIRED=1.");
                }
                return null;
            }

            var database = new DisposableOperationalDatabase(
                root,
                $"fii_backend_test_{Guid.NewGuid():N}");
            await database.CreateDatabaseAsync();
            return database;
        }

        public static async Task<DisposableOperationalDatabase?> CreateMigratedAsync()
        {
            var database = await CreateAsync();
            if (database is null) return null;
            await CreateMigrationService(database.ConnectionString).MigrateAsync();
            return database;
        }

        public async Task RecreateAsync()
        {
            await DropDatabaseAsync();
            await CreateDatabaseAsync();
        }

        public async ValueTask DisposeAsync()
        {
            NpgsqlConnection.ClearAllPools();
            await DropDatabaseAsync();
        }

        private async Task CreateDatabaseAsync()
        {
            await using var connection = new NpgsqlConnection(_rootConnectionString);
            await connection.OpenAsync();
            await using var command = new NpgsqlCommand(
                $"CREATE DATABASE {QuoteIdentifier(_databaseName)}", connection);
            await command.ExecuteNonQueryAsync();
        }

        private async Task DropDatabaseAsync()
        {
            await using var connection = new NpgsqlConnection(_rootConnectionString);
            await connection.OpenAsync();
            await using var command = new NpgsqlCommand(
                $"DROP DATABASE IF EXISTS {QuoteIdentifier(_databaseName)} WITH (FORCE)", connection);
            await command.ExecuteNonQueryAsync();
        }

        private static string QuoteIdentifier(string value) =>
            $"\"{value.Replace("\"", "\"\"", StringComparison.Ordinal)}\"";
    }
}
