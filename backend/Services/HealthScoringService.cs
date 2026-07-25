using System;
using System.Threading.Tasks;
using Npgsql;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System.Collections.Generic;
using System.Text.Json;

namespace backend.Services
{
    public class HealthScoringService
    {
        private readonly string _timescaleConnectionString;
        private readonly ILogger<HealthScoringService> _logger;

        public HealthScoringService(IConfiguration configuration, ILogger<HealthScoringService> logger)
        {
            _timescaleConnectionString = configuration.GetConnectionString("Timescale")
                ?? throw new ArgumentNullException("ConnectionStrings:Timescale is missing");
            _logger = logger;
        }

        public async Task<double> ComputeAndStoreHealthScoreAsync(Guid assetId)
        {
            try
            {
                await using var conn = new NpgsqlConnection(_timescaleConnectionString);
                await conn.OpenAsync();

                // Call the SQL function to compute health score
                var sql = "SELECT compute_asset_health_score(@asset_id)";
                await using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("asset_id", assetId);

                var healthScore = await cmd.ExecuteScalarAsync();
                var score = healthScore != null && healthScore != DBNull.Value
                    ? Convert.ToDouble(healthScore)
                    : 0.0;

                // Store the score in asset_metrics
                await StoreMetricAsync(assetId, "health_score", score);

                _logger.LogDebug("Computed health score {Score} for asset {AssetId}", score, assetId);
                return score;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to compute health score for asset {AssetId}", assetId);
                return 0.0;
            }
        }

        public async Task<bool> StoreMetricAsync(Guid assetId, string metricType, double value, object metadata = null)
        {
            try
            {
                await using var conn = new NpgsqlConnection(_timescaleConnectionString);
                await conn.OpenAsync();

                var metadataJson = metadata != null
                    ? JsonSerializer.Serialize(metadata, new JsonSerializerOptions(JsonSerializerDefaults.Web))
                    : "{}";

                var sql = @"
                    INSERT INTO asset_metrics (asset_id, metric_type, value, metadata)
                    VALUES (@asset_id, @metric_type, @value, @metadata::jsonb)";

                await using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("asset_id", assetId);
                cmd.Parameters.AddWithValue("metric_type", metricType);
                cmd.Parameters.AddWithValue("value", value);
                cmd.Parameters.AddWithValue("metadata", metadataJson);

                await cmd.ExecuteNonQueryAsync();
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to store metric {MetricType} for asset {AssetId}", metricType, assetId);
                return false;
            }
        }

        public async Task<HealthScoreBreakdown> GetHealthScoreBreakdownAsync(Guid assetId)
        {
            try
            {
                await using var conn = new NpgsqlConnection(_timescaleConnectionString);
                await conn.OpenAsync();

                var breakdown = new HealthScoreBreakdown { AssetId = assetId };

                // Get current health score
                var healthSql = @"
                    SELECT value
                    FROM asset_metrics
                    WHERE asset_id = @asset_id AND metric_type = 'health_score'
                    ORDER BY measured_at DESC
                    LIMIT 1";

                await using var healthCmd = new NpgsqlCommand(healthSql, conn);
                healthCmd.Parameters.AddWithValue("asset_id", assetId);
                var healthResult = await healthCmd.ExecuteScalarAsync();
                breakdown.OverallScore = healthResult != null && healthResult != DBNull.Value
                    ? Convert.ToDouble(healthResult)
                    : 0.0;

                // Get uptime percentage (last 24h)
                var uptimeSql = @"
                    SELECT COALESCE(AVG(value), 0)
                    FROM asset_metrics
                    WHERE asset_id = @asset_id
                      AND metric_type = 'uptime_pct'
                      AND measured_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'";

                await using var uptimeCmd = new NpgsqlCommand(uptimeSql, conn);
                uptimeCmd.Parameters.AddWithValue("asset_id", assetId);
                var uptimeResult = await uptimeCmd.ExecuteScalarAsync();
                breakdown.UptimePercent = uptimeResult != null && uptimeResult != DBNull.Value
                    ? Convert.ToDouble(uptimeResult)
                    : 0.0;

                // Get alarm count (last 7d)
                var alarmSql = @"
                    SELECT COUNT(*)
                    FROM alerts
                    WHERE asset_id = @asset_id
                      AND severity IN ('critical', 'high')
                      AND opened_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'";

                await using var alarmCmd = new NpgsqlCommand(alarmSql, conn);
                alarmCmd.Parameters.AddWithValue("asset_id", assetId);
                var alarmResult = await alarmCmd.ExecuteScalarAsync();
                breakdown.AlarmCount = alarmResult != null ? Convert.ToInt32(alarmResult) : 0;

                // Get performance ratio
                var perfSql = @"
                    SELECT COALESCE(AVG(value), 80)
                    FROM asset_metrics
                    WHERE asset_id = @asset_id
                      AND metric_type = 'performance_ratio'
                      AND measured_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'";

                await using var perfCmd = new NpgsqlCommand(perfSql, conn);
                perfCmd.Parameters.AddWithValue("asset_id", assetId);
                var perfResult = await perfCmd.ExecuteScalarAsync();
                breakdown.PerformanceRatio = perfResult != null && perfResult != DBNull.Value
                    ? Convert.ToDouble(perfResult)
                    : 80.0;

                // Get maintenance overdue days
                var maintSql = @"
                    SELECT COALESCE(AVG(value), 0)
                    FROM asset_metrics
                    WHERE asset_id = @asset_id
                      AND metric_type = 'maintenance_overdue_days'
                      AND measured_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'";

                await using var maintCmd = new NpgsqlCommand(maintSql, conn);
                maintCmd.Parameters.AddWithValue("asset_id", assetId);
                var maintResult = await maintCmd.ExecuteScalarAsync();
                breakdown.MaintenanceOverdueDays = maintResult != null && maintResult != DBNull.Value
                    ? Convert.ToDouble(maintResult)
                    : 0.0;

                // Calculate color code
                breakdown.ColorCode = breakdown.OverallScore >= 71 ? "green"
                    : breakdown.OverallScore >= 41 ? "yellow"
                    : "red";

                return breakdown;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to get health score breakdown for asset {AssetId}", assetId);
                return new HealthScoreBreakdown { AssetId = assetId, OverallScore = 0, ColorCode = "gray" };
            }
        }

        public async Task<List<HealthScoreHistory>> GetHealthScoreHistoryAsync(Guid assetId, DateTime from, DateTime to)
        {
            var history = new List<HealthScoreHistory>();

            try
            {
                await using var conn = new NpgsqlConnection(_timescaleConnectionString);
                await conn.OpenAsync();

                var sql = @"
                    SELECT measured_at, value, metadata
                    FROM asset_metrics
                    WHERE asset_id = @asset_id
                      AND metric_type = 'health_score'
                      AND measured_at >= @from
                      AND measured_at <= @to
                    ORDER BY measured_at DESC
                    LIMIT 1000";

                await using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("asset_id", assetId);
                cmd.Parameters.AddWithValue("from", from);
                cmd.Parameters.AddWithValue("to", to);

                await using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    history.Add(new HealthScoreHistory
                    {
                        Timestamp = reader.GetDateTime(0),
                        Score = reader.GetDouble(1),
                        Metadata = reader.IsDBNull(2) ? null : reader.GetString(2)
                    });
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to get health score history for asset {AssetId}", assetId);
            }

            return history;
        }
    }

    public class HealthScoreBreakdown
    {
        public Guid AssetId { get; set; }
        public double OverallScore { get; set; }
        public double UptimePercent { get; set; }
        public int AlarmCount { get; set; }
        public double PerformanceRatio { get; set; }
        public double MaintenanceOverdueDays { get; set; }
        public string ColorCode { get; set; }
    }

    public class HealthScoreHistory
    {
        public DateTime Timestamp { get; set; }
        public double Score { get; set; }
        public string Metadata { get; set; }
    }
}
