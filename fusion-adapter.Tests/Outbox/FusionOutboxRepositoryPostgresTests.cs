using System.Text.Json;
using Fusion.Adapter.Outbox;
using Mkz.Fusion.Contracts;
using Npgsql;

namespace Fusion.Adapter.Tests.Outbox;

public sealed class FusionOutboxRepositoryPostgresTests
{
    [PostgresFact]
    public async Task ClaimAsync_UsesSkipLockedAcrossWorkersAndRecoversExpiredLease()
    {
        var fixtureConnectionString = Environment.GetEnvironmentVariable("FUSION_ADAPTER_TEST_POSTGRES")!;

        var schema = $"fusion_adapter_test_{Guid.NewGuid():N}";
        var fixtureBuilder = new NpgsqlConnectionStringBuilder(fixtureConnectionString);
        await using var admin = new NpgsqlConnection(fixtureBuilder.ConnectionString);
        await admin.OpenAsync();

        try
        {
            await ExecuteAsync(admin, $"CREATE SCHEMA {schema}");
            await ExecuteAsync(admin, $"""
                CREATE TABLE {schema}.fusion_outbox (
                    id uuid PRIMARY KEY,
                    payload jsonb NOT NULL,
                    status text NOT NULL,
                    attempts integer NOT NULL DEFAULT 0,
                    available_at timestamptz NOT NULL DEFAULT NOW(),
                    created_at timestamptz NOT NULL DEFAULT NOW(),
                    locked_at timestamptz NULL,
                    lock_id uuid NULL,
                    delivered_at timestamptz NULL,
                    last_error text NULL
                )
                """);

            var ids = Enumerable.Range(0, 3).Select(_ => Guid.NewGuid()).ToArray();
            foreach (var id in ids)
            {
                await using var insert = new NpgsqlCommand($"""
                    INSERT INTO {schema}.fusion_outbox (id, payload, status)
                    VALUES (@id, @payload::jsonb, 'PENDING')
                    """, admin);
                insert.Parameters.AddWithValue("id", id);
                insert.Parameters.AddWithValue("payload", JsonSerializer.Serialize(TestEvent));
                await insert.ExecuteNonQueryAsync();
            }

            fixtureBuilder.SearchPath = schema;
            var firstRepository = new FusionOutboxRepository(fixtureBuilder.ConnectionString);
            var secondRepository = new FusionOutboxRepository(fixtureBuilder.ConnectionString);
            var claims = await Task.WhenAll(
                firstRepository.ClaimAsync(2, TimeSpan.FromSeconds(30), CancellationToken.None),
                secondRepository.ClaimAsync(2, TimeSpan.FromSeconds(30), CancellationToken.None));
            var claimedIds = claims.SelectMany(records => records).Select(record => record.Id).ToArray();

            Assert.Equal(3, claimedIds.Length);
            Assert.Equal(3, claimedIds.Distinct().Count());

            var expiredId = claimedIds[0];
            await ExecuteAsync(admin, $"""
                UPDATE {schema}.fusion_outbox
                SET locked_at = NOW() - INTERVAL '60 seconds'
                WHERE id = '{expiredId}'
                """);

            var recovered = await firstRepository.ClaimAsync(1, TimeSpan.FromSeconds(1), CancellationToken.None);

            Assert.Single(recovered);
            Assert.Equal(expiredId, recovered[0].Id);
        }
        finally
        {
            await ExecuteAsync(admin, $"DROP SCHEMA IF EXISTS {schema} CASCADE");
        }
    }

    private static Task<int> ExecuteAsync(NpgsqlConnection connection, string sql) =>
        new NpgsqlCommand(sql, connection).ExecuteNonQueryAsync();

    private static TelemetryFusionEvent TestEvent => new(
        1,
        Guid.Parse("77777777-7777-7777-7777-777777777777"),
        "telemetry:66666666-6666-6666-6666-666666666666:message-1",
        DateTimeOffset.Parse("2026-07-13T10:00:00Z"),
        new MachineSnapshot(Guid.Parse("66666666-6666-6666-6666-666666666666"), "client-a", "PRESS-A", "Press A"),
        null,
        new TelemetryValues("message-1", "RUNNING", true, 42, null, null, null, null, false),
        "{}");
}

public sealed class PostgresFactAttribute : FactAttribute
{
    public PostgresFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("FUSION_ADAPTER_TEST_POSTGRES")))
            Skip = "Set FUSION_ADAPTER_TEST_POSTGRES to run PostgreSQL concurrency integration tests.";
    }
}
