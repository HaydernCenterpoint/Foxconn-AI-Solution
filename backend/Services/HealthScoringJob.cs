using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Configuration;
using Npgsql;

namespace backend.Services
{
    /// <summary>
    /// Background service that periodically computes health scores for all active assets.
    /// Runs every 15 minutes by default.
    /// </summary>
    public class HealthScoringJob : BackgroundService
    {
        private readonly HealthScoringService _healthService;
        private readonly ILogger<HealthScoringJob> _logger;
        private readonly string _pgConnectionString;
        private readonly int _intervalMinutes;

        public HealthScoringJob(
            HealthScoringService healthService,
            IConfiguration configuration,
            ILogger<HealthScoringJob> logger)
        {
            _healthService = healthService;
            _logger = logger;
            _pgConnectionString = configuration.GetConnectionString("DefaultConnection")
                ?? throw new ArgumentNullException("ConnectionStrings:DefaultConnection is missing");
            _intervalMinutes = configuration.GetValue<int>("HealthScoring:IntervalMinutes", 15);
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("Health Scoring Job started. Interval: {Interval} minutes", _intervalMinutes);

            // Wait a bit before first run to let other services initialize
            await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    var startTime = DateTime.UtcNow;
                    _logger.LogInformation("Starting health score computation run...");

                    // Get all active assets
                    var assetIds = await GetActiveAssetsAsync();
                    _logger.LogInformation("Found {Count} active assets to score", assetIds.Count);

                    var successCount = 0;
                    var errorCount = 0;

                    foreach (var assetId in assetIds)
                    {
                        try
                        {
                            await _healthService.ComputeAndStoreHealthScoreAsync(assetId);
                            successCount++;
                        }
                        catch (Exception ex)
                        {
                            _logger.LogWarning(ex, "Failed to compute health score for asset {AssetId}", assetId);
                            errorCount++;
                        }
                    }

                    var duration = DateTime.UtcNow - startTime;
                    _logger.LogInformation(
                        "Health scoring run completed. Success: {Success}, Errors: {Errors}, Duration: {Duration}s",
                        successCount, errorCount, duration.TotalSeconds);

                    // Check if we're within time budget (should complete in < 15 min)
                    if (duration.TotalMinutes > _intervalMinutes * 0.8)
                    {
                        _logger.LogWarning(
                            "Health scoring run took {Duration} minutes, approaching interval limit of {Interval} minutes",
                            duration.TotalMinutes, _intervalMinutes);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Health scoring run failed");
                }

                // Wait for next interval
                await Task.Delay(TimeSpan.FromMinutes(_intervalMinutes), stoppingToken);
            }

            _logger.LogInformation("Health Scoring Job stopped");
        }

        private async Task<List<Guid>> GetActiveAssetsAsync()
        {
            var assetIds = new List<Guid>();

            try
            {
                await using var conn = new NpgsqlConnection(_pgConnectionString);
                await conn.OpenAsync();

                // Get all assets (machines, sensors) that should have health scores
                var sql = @"
                    SELECT id
                    FROM assets
                    WHERE type IN ('machine', 'sensor')
                    ORDER BY created_at DESC
                    LIMIT 1000";

                await using var cmd = new NpgsqlCommand(sql, conn);
                await using var reader = await cmd.ExecuteReaderAsync();

                while (await reader.ReadAsync())
                {
                    assetIds.Add(reader.GetGuid(0));
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to retrieve active assets for health scoring");
            }

            return assetIds;
        }
    }
}
