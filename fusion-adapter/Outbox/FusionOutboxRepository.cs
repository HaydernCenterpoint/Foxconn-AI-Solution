using System.Text.Json;
using Mkz.Fusion.Contracts;
using Npgsql;

namespace Fusion.Adapter.Outbox;

public sealed class FusionOutboxRepository : IFusionOutboxRepository
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly string _connectionString;

    public FusionOutboxRepository(string connectionString)
    {
        _connectionString = connectionString;
    }

    public async Task<FusionOutboxBacklog> GetBacklogAsync(CancellationToken cancellationToken)
    {
        EnsureConfigured();
        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(@"
            SELECT COUNT(*), COALESCE(EXTRACT(EPOCH FROM (NOW() - MIN(created_at))), 0)::double precision
            FROM fusion_outbox
            WHERE status IN ('PENDING', 'PROCESSING')", connection);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        await reader.ReadAsync(cancellationToken);
        return new FusionOutboxBacklog(
            reader.GetInt64(0),
            TimeSpan.FromSeconds(Math.Max(0, reader.GetDouble(1))));
    }

    public async Task<IReadOnlyList<FusionOutboxRecord>> ClaimAsync(
        int batchSize,
        TimeSpan lease,
        CancellationToken cancellationToken)
    {
        EnsureConfigured();

        var lockId = Guid.NewGuid();
        var leaseSeconds = Math.Max(1, (int)Math.Ceiling(lease.TotalSeconds));
        var safeBatchSize = Math.Clamp(batchSize, 1, 1000);

        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        const string releaseExpiredLeasesSql = @"
            UPDATE fusion_outbox
            SET status = 'PENDING', lock_id = NULL, locked_at = NULL, available_at = NOW()
            WHERE status = 'PROCESSING'
              AND locked_at < NOW() - (@leaseSeconds * INTERVAL '1 second')";
        await using (var releaseCommand = new NpgsqlCommand(releaseExpiredLeasesSql, connection, transaction))
        {
            releaseCommand.Parameters.AddWithValue("leaseSeconds", leaseSeconds);
            await releaseCommand.ExecuteNonQueryAsync(cancellationToken);
        }

        const string claimSql = @"
            WITH candidates AS (
                SELECT id
                FROM fusion_outbox
                WHERE status = 'PENDING' AND available_at <= NOW()
                ORDER BY created_at
                FOR UPDATE SKIP LOCKED
                LIMIT @batchSize
            )
            UPDATE fusion_outbox AS outbox
            SET status = 'PROCESSING', lock_id = @lockId, locked_at = NOW()
            FROM candidates
            WHERE outbox.id = candidates.id
            RETURNING outbox.id, outbox.payload, outbox.attempts, outbox.lock_id";

        var records = new List<FusionOutboxRecord>();
        await using (var claimCommand = new NpgsqlCommand(claimSql, connection, transaction))
        {
            claimCommand.Parameters.AddWithValue("batchSize", safeBatchSize);
            claimCommand.Parameters.AddWithValue("lockId", lockId);
            await using var reader = await claimCommand.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var telemetryEvent = JsonSerializer.Deserialize<TelemetryFusionEvent>(reader.GetString(1), JsonOptions)
                    ?? throw new InvalidDataException("Fusion outbox payload could not be deserialized.");
                records.Add(new FusionOutboxRecord(
                    reader.GetGuid(0),
                    reader.GetGuid(3),
                    reader.GetInt32(2),
                    telemetryEvent));
            }
        }

        await transaction.CommitAsync(cancellationToken);
        return records;
    }

    public Task MarkDeliveredAsync(Guid id, Guid lockId, CancellationToken cancellationToken) =>
        ExecuteMutationAsync(@"
            UPDATE fusion_outbox
            SET status = 'DELIVERED', delivered_at = NOW(), locked_at = NULL, lock_id = NULL, last_error = NULL
            WHERE id = @id AND lock_id = @lockId AND status = 'PROCESSING'", command =>
        {
            command.Parameters.AddWithValue("id", id);
            command.Parameters.AddWithValue("lockId", lockId);
        }, cancellationToken);

    public Task ScheduleRetryAsync(
        Guid id,
        Guid lockId,
        TimeSpan delay,
        string? error,
        CancellationToken cancellationToken) =>
        ExecuteMutationAsync(@"
            UPDATE fusion_outbox
            SET status = 'PENDING', attempts = attempts + 1,
                available_at = NOW() + (@delaySeconds * INTERVAL '1 second'),
                locked_at = NULL, lock_id = NULL, last_error = @error
            WHERE id = @id AND lock_id = @lockId AND status = 'PROCESSING'", command =>
        {
            command.Parameters.AddWithValue("id", id);
            command.Parameters.AddWithValue("lockId", lockId);
            command.Parameters.AddWithValue("delaySeconds", Math.Max(1, (int)Math.Ceiling(delay.TotalSeconds)));
            command.Parameters.AddWithValue("error", (object?)Truncate(error) ?? DBNull.Value);
        }, cancellationToken);

    public Task MarkDeadAsync(
        Guid id,
        Guid lockId,
        string? error,
        CancellationToken cancellationToken) =>
        ExecuteMutationAsync(@"
            UPDATE fusion_outbox
            SET status = 'DEAD', attempts = attempts + 1,
                locked_at = NULL, lock_id = NULL, last_error = @error
            WHERE id = @id AND lock_id = @lockId AND status = 'PROCESSING'", command =>
        {
            command.Parameters.AddWithValue("id", id);
            command.Parameters.AddWithValue("lockId", lockId);
            command.Parameters.AddWithValue("error", (object?)Truncate(error) ?? DBNull.Value);
        }, cancellationToken);

    private async Task ExecuteMutationAsync(
        string sql,
        Action<NpgsqlCommand> bind,
        CancellationToken cancellationToken)
    {
        EnsureConfigured();

        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(sql, connection);
        bind(command);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static string? Truncate(string? error) =>
        string.IsNullOrWhiteSpace(error) ? null : error[..Math.Min(error.Length, 4096)];

    private void EnsureConfigured()
    {
        if (string.IsNullOrWhiteSpace(_connectionString))
            throw new InvalidOperationException("ConnectionStrings:MkzOperations is required when Fusion Adapter dispatch is enabled.");
    }
}
