using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace backend.Services;

/// <summary>
/// Periodically refreshes baseline anomaly and failure-risk predictions for active assets.
/// </summary>
public sealed class BatchPredictionJob : BackgroundService
{
    private readonly PredictiveService _predictiveService;
    private readonly ILogger<BatchPredictionJob> _logger;
    private readonly string _connectionString;
    private readonly TimeSpan _interval;
    private readonly TimeSpan _initialDelay;
    private readonly int _maxAssets;
    private readonly string _failureRiskWindow;

    public BatchPredictionJob(
        PredictiveService predictiveService,
        IConfiguration configuration,
        ILogger<BatchPredictionJob> logger)
    {
        _predictiveService = predictiveService;
        _logger = logger;
        _connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new ArgumentNullException("ConnectionStrings:DefaultConnection is missing");
        _interval = TimeSpan.FromMinutes(
            Math.Max(1, configuration.GetValue("BatchPrediction:IntervalMinutes", 15)));
        _initialDelay = TimeSpan.FromSeconds(
            Math.Max(0, configuration.GetValue("BatchPrediction:InitialDelaySeconds", 45)));
        _maxAssets = Math.Clamp(configuration.GetValue("BatchPrediction:MaxAssets", 1000), 1, 10000);
        _failureRiskWindow = configuration.GetValue("BatchPrediction:FailureRiskWindow", "1h")!;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Batch prediction job started. Interval: {Interval}", _interval);
        await Task.Delay(_initialDelay, stoppingToken);

        using var timer = new PeriodicTimer(_interval);
        do
        {
            try
            {
                await RunBatchAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Batch prediction run failed");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    internal async Task RunBatchAsync(CancellationToken stoppingToken)
    {
        var assetIds = await GetActiveAssetsAsync(stoppingToken);
        var successCount = 0;

        foreach (var assetId in assetIds)
        {
            stoppingToken.ThrowIfCancellationRequested();
            try
            {
                await _predictiveService.DetectAnomalyAsync(assetId);
                await _predictiveService.PredictFailureRiskAsync(assetId, _failureRiskWindow);
                successCount++;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Batch prediction failed for asset {AssetId}", assetId);
            }
        }

        _logger.LogInformation(
            "Batch prediction run completed. Success: {Success}, Errors: {Errors}",
            successCount,
            assetIds.Count - successCount);
    }

    private async Task<List<Guid>> GetActiveAssetsAsync(CancellationToken stoppingToken)
    {
        var assetIds = new List<Guid>();
        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(stoppingToken);

        const string sql = """
            SELECT id
            FROM assets
            WHERE type IN ('machine', 'sensor')
            ORDER BY created_at DESC
            LIMIT @max_assets
            """;

        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("max_assets", _maxAssets);
        await using var reader = await command.ExecuteReaderAsync(stoppingToken);
        while (await reader.ReadAsync(stoppingToken))
        {
            assetIds.Add(reader.GetGuid(0));
        }

        return assetIds;
    }
}
