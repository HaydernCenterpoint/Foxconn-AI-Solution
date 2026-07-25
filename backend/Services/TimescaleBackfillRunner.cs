using Microsoft.Extensions.Options;
using Npgsql;
using NpgsqlTypes;

namespace backend.Services;

public sealed class TimescaleBackfillRunner
{
    private const string StreamName = "machine_telemetry";
    private readonly string _sourceConnectionString;
    private readonly TimescaleTelemetryService _timescale;
    private readonly TimescaleOptions _options;
    private readonly ILogger<TimescaleBackfillRunner> _logger;

    public TimescaleBackfillRunner(
        IConfiguration configuration,
        TimescaleTelemetryService timescale,
        IOptions<TimescaleOptions> options,
        ILogger<TimescaleBackfillRunner> logger)
    {
        _sourceConnectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("ConnectionStrings:DefaultConnection is required.");
        _timescale = timescale;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<long> RunAsync(CancellationToken cancellationToken = default)
    {
        if (!_timescale.IsEnabled)
        {
            throw new InvalidOperationException("Set Timescale:Enabled=true before running --timescale-backfill.");
        }

        await _timescale.EnsureSchemaAsync(cancellationToken);
        var lastSourceId = await _timescale.GetBackfillProgressAsync(StreamName, cancellationToken);
        var total = 0L;
        var batchSize = Math.Clamp(_options.BackfillBatchSize, 1, 5000);

        await using var source = new NpgsqlConnection(_sourceConnectionString);
        await source.OpenAsync(cancellationToken);
        while (true)
        {
            var points = await ReadBatchAsync(source, lastSourceId, batchSize, cancellationToken);
            if (points.Count == 0) break;

            await _timescale.WriteBatchAsync(points, cancellationToken);
            lastSourceId = points[^1].SourceId;
            await _timescale.SetBackfillProgressAsync(StreamName, lastSourceId, cancellationToken);
            total += points.Count;
            _logger.LogInformation("Timescale backfill copied {Count} rows; watermark={Watermark}", total, lastSourceId);
        }

        return total;
    }

    private static async Task<List<TimescaleTelemetryPoint>> ReadBatchAsync(
        NpgsqlConnection connection,
        long lastSourceId,
        int batchSize,
        CancellationToken cancellationToken)
    {
        const string sql = """
            SELECT id, machine_id, sequence, created_at, raw_json::text
            FROM machine_telemetry
            WHERE id > @lastSourceId
            ORDER BY id
            LIMIT @batchSize
            """;
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.Add("lastSourceId", NpgsqlDbType.Bigint).Value = lastSourceId;
        command.Parameters.Add("batchSize", NpgsqlDbType.Integer).Value = batchSize;
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var points = new List<TimescaleTelemetryPoint>();
        while (await reader.ReadAsync(cancellationToken))
        {
            var occurredAt = DateTime.SpecifyKind(reader.GetDateTime(3), DateTimeKind.Utc);
            points.Add(new TimescaleTelemetryPoint(
                reader.GetInt64(0),
                reader.GetGuid(1),
                reader.GetInt64(2),
                new DateTimeOffset(occurredAt),
                reader.GetString(4)));
        }

        return points;
    }
}
