using Npgsql;

namespace backend.Services;

public interface IRcaAlertContextReader
{
    Task<RcaAlertContext?> FindAsync(Guid alertId, CancellationToken cancellationToken);
}

public sealed record RcaAlertContext(
    Guid AlertId,
    Guid EventId,
    Guid AssetId,
    DateTimeOffset OccurredAt,
    string EventType,
    string RuleId,
    string Severity,
    string? Evidence);

public sealed class RcaAlertContextReader : IRcaAlertContextReader
{
    private readonly string _connectionString;

    public RcaAlertContextReader(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("Timescale")
            ?? throw new ArgumentNullException("ConnectionStrings:Timescale is missing");
    }

    public async Task<RcaAlertContext?> FindAsync(
        Guid alertId,
        CancellationToken cancellationToken)
    {
        const string sql = """
            SELECT a.alert_id,
                   a.event_id,
                   e.asset_id,
                   e.occurred_at,
                   e.event_type,
                   a.rule_id,
                   a.severity,
                   a.evidence::text
            FROM alerts AS a
            INNER JOIN events AS e ON e.event_id = a.event_id
            WHERE a.alert_id = @alert_id
            ORDER BY a.opened_at DESC
            LIMIT 1
            """;

        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("alert_id", alertId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new RcaAlertContext(
            reader.GetGuid(0),
            reader.GetGuid(1),
            reader.GetGuid(2),
            reader.GetFieldValue<DateTimeOffset>(3),
            reader.GetString(4),
            reader.GetString(5),
            reader.GetString(6),
            reader.IsDBNull(7) ? null : reader.GetString(7));
    }
}
