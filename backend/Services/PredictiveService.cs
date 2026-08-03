using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using Npgsql;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace backend.Services
{
    /// <summary>
    /// Baseline predictive service using simple statistical anomaly detection.
    /// Phase 2: Implements threshold-based z-score anomaly detection.
    /// Phase 3: Will integrate trained ML models (Isolation Forest, LSTM, etc.)
    /// </summary>
    public class PredictiveService
    {
        private readonly string _timescaleConnectionString;
        private readonly ILogger<PredictiveService> _logger;
        private const double ANOMALY_THRESHOLD = 3.0; // Z-score threshold

        public PredictiveService(IConfiguration configuration, ILogger<PredictiveService> logger)
        {
            _timescaleConnectionString = configuration.GetConnectionString("Timescale")
                ?? throw new ArgumentNullException("ConnectionStrings:Timescale is missing");
            _logger = logger;
        }

        public async Task<AnomalyPrediction> DetectAnomalyAsync(Guid assetId, string metricType = "temperature")
        {
            try
            {
                await using var conn = new NpgsqlConnection(_timescaleConnectionString);
                await conn.OpenAsync();

                // Get recent stats from telemetry (last 24h baseline)
                var statsSql = @"
                    SELECT
                        AVG((raw_json->>'Temperature')::double precision) as mean,
                        STDDEV((raw_json->>'Temperature')::double precision) as stddev,
                        MAX((raw_json->>'Temperature')::double precision) as max_val,
                        MIN((raw_json->>'Temperature')::double precision) as min_val,
                        COUNT(*) as sample_count
                    FROM telemetry_points
                    WHERE machine_id = @asset_id
                      AND occurred_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
                      AND raw_json->>'Temperature' IS NOT NULL";

                await using var statsCmd = new NpgsqlCommand(statsSql, conn);
                statsCmd.Parameters.AddWithValue("asset_id", assetId);

                double mean = 0, stddev = 0, maxVal = 0, minVal = 0;
                int sampleCount = 0;

                await using var statsReader = await statsCmd.ExecuteReaderAsync();
                if (await statsReader.ReadAsync())
                {
                    mean = statsReader.IsDBNull(0) ? 0 : statsReader.GetDouble(0);
                    stddev = statsReader.IsDBNull(1) ? 0 : statsReader.GetDouble(1);
                    maxVal = statsReader.IsDBNull(2) ? 0 : statsReader.GetDouble(2);
                    minVal = statsReader.IsDBNull(3) ? 0 : statsReader.GetDouble(3);
                    sampleCount = statsReader.IsDBNull(4) ? 0 : statsReader.GetInt32(4);
                }
                await statsReader.CloseAsync();

                if (sampleCount < 10 || stddev == 0)
                {
                    // Not enough data or no variance
                    return new AnomalyPrediction
                    {
                        AssetId = assetId,
                        IsAnomaly = false,
                        Score = 0,
                        Confidence = 0,
                        Reason = "Insufficient data or no variance in baseline",
                        ContributingFactors = new Dictionary<string, object>
                        {
                            ["sample_count"] = sampleCount,
                            ["baseline_mean"] = mean,
                            ["baseline_stddev"] = stddev
                        }
                    };
                }

                // Get latest value
                var latestSql = @"
                    SELECT
                        (raw_json->>'Temperature')::double precision as temperature,
                        occurred_at
                    FROM telemetry_points
                    WHERE machine_id = @asset_id
                      AND raw_json->>'Temperature' IS NOT NULL
                    ORDER BY occurred_at DESC
                    LIMIT 1";

                await using var latestCmd = new NpgsqlCommand(latestSql, conn);
                latestCmd.Parameters.AddWithValue("asset_id", assetId);

                double latestValue = 0;
                DateTime latestTime = DateTime.UtcNow;

                await using var latestReader = await latestCmd.ExecuteReaderAsync();
                if (await latestReader.ReadAsync())
                {
                    latestValue = latestReader.GetDouble(0);
                    latestTime = latestReader.GetDateTime(1);
                }
                await latestReader.CloseAsync();

                // Calculate z-score
                var zScore = Math.Abs((latestValue - mean) / stddev);
                var isAnomaly = zScore > ANOMALY_THRESHOLD;
                var score = Math.Min(1.0, zScore / (ANOMALY_THRESHOLD * 2)); // Normalize to 0-1

                var prediction = new AnomalyPrediction
                {
                    AssetId = assetId,
                    IsAnomaly = isAnomaly,
                    Score = score,
                    Confidence = Math.Min(1.0, sampleCount / 100.0), // Higher confidence with more samples
                    Reason = isAnomaly ? $"Z-score {zScore:F2} exceeds threshold {ANOMALY_THRESHOLD}" : "Within normal range",
                    ContributingFactors = new Dictionary<string, object>
                    {
                        ["z_score"] = Math.Round(zScore, 2),
                        ["current_value"] = Math.Round(latestValue, 2),
                        ["baseline_mean"] = Math.Round(mean, 2),
                        ["baseline_stddev"] = Math.Round(stddev, 2),
                        ["baseline_samples"] = sampleCount,
                        ["latest_timestamp"] = latestTime
                    }
                };

                // Store prediction
                await StorePredictionAsync(assetId, "anomaly", score, prediction.Confidence, prediction.ContributingFactors);

                _logger.LogInformation("Anomaly detection for {AssetId}: score={Score}, isAnomaly={IsAnomaly}",
                    assetId, score, isAnomaly);

                return prediction;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to detect anomaly for asset {AssetId}", assetId);
                throw;
            }
        }

        public async Task<FailureRiskPrediction> PredictFailureRiskAsync(Guid assetId, string timeWindow = "1h")
        {
            try
            {
                // Phase 2: Simple heuristic based on recent anomalies and alert count
                // Phase 3: Will use trained ML model

                await using var conn = new NpgsqlConnection(_timescaleConnectionString);
                await conn.OpenAsync();

                // Count recent critical alerts
                var alertSql = @"
                    SELECT COUNT(*)
                    FROM alerts
                    WHERE asset_id = @asset_id
                      AND severity IN ('critical', 'high')
                      AND opened_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour'";

                await using var alertCmd = new NpgsqlCommand(alertSql, conn);
                alertCmd.Parameters.AddWithValue("asset_id", assetId);
                var alertCount = Convert.ToInt32(await alertCmd.ExecuteScalarAsync() ?? 0);

                // Get recent anomaly predictions
                var anomalySql = @"
                    SELECT score, confidence
                    FROM asset_predictions
                    WHERE asset_id = @asset_id
                      AND prediction_type = 'anomaly'
                      AND predicted_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
                    ORDER BY predicted_at DESC
                    LIMIT 1";

                await using var anomalyCmd = new NpgsqlCommand(anomalySql, conn);
                anomalyCmd.Parameters.AddWithValue("asset_id", assetId);

                double anomalyScore = 0;
                await using var anomalyReader = await anomalyCmd.ExecuteReaderAsync();
                if (await anomalyReader.ReadAsync())
                {
                    anomalyScore = anomalyReader.GetDouble(0);
                }
                await anomalyReader.CloseAsync();

                // Simple risk calculation: weighted combination
                var riskScore = (alertCount * 0.2) + (anomalyScore * 0.8);
                riskScore = Math.Min(1.0, riskScore); // Cap at 1.0

                var confidence = anomalyScore > 0 ? 0.6 : 0.3; // Lower confidence for heuristic

                var prediction = new FailureRiskPrediction
                {
                    AssetId = assetId,
                    RiskScore = riskScore,
                    Confidence = confidence,
                    TimeWindow = timeWindow,
                    RiskLevel = riskScore > 0.7 ? "high" : riskScore > 0.4 ? "medium" : "low",
                    ContributingFactors = new Dictionary<string, object>
                    {
                        ["recent_alerts"] = alertCount,
                        ["anomaly_score"] = Math.Round(anomalyScore, 2),
                        ["model_version"] = "baseline-heuristic-v1",
                        ["note"] = "Phase 2 baseline; ML model pending"
                    }
                };

                // Store prediction
                await StorePredictionAsync(assetId, "failure_risk", riskScore, confidence, prediction.ContributingFactors, timeWindow);

                return prediction;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to predict failure risk for asset {AssetId}", assetId);
                throw;
            }
        }

        private async Task StorePredictionAsync(
            Guid assetId,
            string predictionType,
            double score,
            double confidence,
            Dictionary<string, object> factors,
            string? window = null)
        {
            try
            {
                await using var conn = new NpgsqlConnection(_timescaleConnectionString);
                await conn.OpenAsync();

                var factorsJson = JsonSerializer.Serialize(factors, new JsonSerializerOptions(JsonSerializerDefaults.Web));

                var sql = @"
                    INSERT INTO asset_predictions
                        (asset_id, model_id, prediction_type, score, confidence, contributing_factors, prediction_window)
                    VALUES
                        (@asset_id, @model_id, @prediction_type, @score, @confidence, @factors::jsonb, @window::interval)";

                await using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("asset_id", assetId);
                cmd.Parameters.AddWithValue("model_id", $"baseline-{predictionType}-v1");
                cmd.Parameters.AddWithValue("prediction_type", predictionType);
                cmd.Parameters.AddWithValue("score", score);
                cmd.Parameters.AddWithValue("confidence", confidence);
                cmd.Parameters.AddWithValue("factors", factorsJson);
                cmd.Parameters.AddWithValue("window", window ?? (object)DBNull.Value);

                await cmd.ExecuteNonQueryAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to store prediction for asset {AssetId}", assetId);
                throw;
            }
        }
    }

    public class AnomalyPrediction
    {
        public Guid AssetId { get; set; }
        public bool IsAnomaly { get; set; }
        public double Score { get; set; }
        public double Confidence { get; set; }
        public string Reason { get; set; } = string.Empty;
        public Dictionary<string, object> ContributingFactors { get; set; } = new();
    }

    public class FailureRiskPrediction
    {
        public Guid AssetId { get; set; }
        public double RiskScore { get; set; }
        public double Confidence { get; set; }
        public string RiskLevel { get; set; } = string.Empty;
        public string TimeWindow { get; set; } = string.Empty;
        public Dictionary<string, object> ContributingFactors { get; set; } = new();
    }
}
