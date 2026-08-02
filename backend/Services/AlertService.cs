using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using Npgsql;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace backend.Services
{
    public class AlertService
    {
        private readonly string _timescaleConnectionString;
        private readonly ILogger<AlertService> _logger;
        private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

        public AlertService(IConfiguration configuration, ILogger<AlertService> logger)
        {
            _timescaleConnectionString = configuration.GetConnectionString("Timescale")
                ?? throw new ArgumentNullException("ConnectionStrings:Timescale is missing");
            _logger = logger;
        }

        public static string NormalizeSeverity(string severity) =>
            severity?.Trim().ToUpperInvariant() switch
            {
                "EMERGENCY" or "CRITICAL" => "critical",
                "HIGH" => "high",
                "WARNING" or "MEDIUM" => "medium",
                "LOW" => "low",
                "INFO" => "info",
                _ => throw new ArgumentException("Unsupported alert severity.", nameof(severity))
            };

        public async Task<Guid> CreateAlertAsync(
            Guid eventId,
            Guid assetId,
            string ruleId,
            string severity,
            string title,
            string? description = null,
            object? evidence = null,
            string? eventType = null,
            string? source = null,
            DateTimeOffset? occurredAt = null)
        {
            try
            {
                // Check for deduplication
                var existingAlertId = await CheckDeduplicationAsync(assetId, ruleId);
                if (existingAlertId.HasValue)
                {
                    _logger.LogInformation("Alert deduplicated for asset {AssetId}, rule {RuleId}, existing alert {AlertId}",
                        assetId, ruleId, existingAlertId.Value);
                    return existingAlertId.Value;
                }

                // Check suppression
                var isSuppressed = await CheckSuppressionAsync(assetId, ruleId);
                var status = isSuppressed ? "suppressed" : "open";

                await using var conn = new NpgsqlConnection(_timescaleConnectionString);
                await conn.OpenAsync();

                var alertId = Guid.NewGuid();
                var evidenceJson = evidence != null ? JsonSerializer.Serialize(evidence, JsonOptions) : "{}";
                var normalizedSeverity = NormalizeSeverity(severity);

                var eventSql = @"
                    INSERT INTO events
                        (event_id, occurred_at, asset_id, event_type, severity, source, payload)
                    VALUES
                        (@event_id, @occurred_at, @asset_id, @event_type, @severity, @source, @payload::jsonb)
                    ON CONFLICT (event_id) DO NOTHING";

                await using (var eventCommand = new NpgsqlCommand(eventSql, conn))
                {
                    eventCommand.Parameters.AddWithValue("event_id", eventId);
                    eventCommand.Parameters.AddWithValue("occurred_at", occurredAt ?? DateTimeOffset.UtcNow);
                    eventCommand.Parameters.AddWithValue("asset_id", assetId);
                    eventCommand.Parameters.AddWithValue("event_type", eventType ?? "alert");
                    eventCommand.Parameters.AddWithValue("severity", normalizedSeverity);
                    eventCommand.Parameters.AddWithValue("source", source ?? "alert-service");
                    eventCommand.Parameters.AddWithValue("payload", evidenceJson);
                    await eventCommand.ExecuteNonQueryAsync();
                }

                var sql = @"
                    INSERT INTO alerts (alert_id, event_id, asset_id, rule_id, status, severity, title, description, evidence)
                    VALUES (@alert_id, @event_id, @asset_id, @rule_id, @status, @severity, @title, @description, @evidence::jsonb)
                    RETURNING alert_id";

                await using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("alert_id", alertId);
                cmd.Parameters.AddWithValue("event_id", eventId);
                cmd.Parameters.AddWithValue("asset_id", assetId);
                cmd.Parameters.AddWithValue("rule_id", ruleId);
                cmd.Parameters.AddWithValue("status", status);
                cmd.Parameters.AddWithValue("severity", normalizedSeverity);
                cmd.Parameters.AddWithValue("title", title);
                cmd.Parameters.AddWithValue("description", description ?? (object)DBNull.Value);
                cmd.Parameters.AddWithValue("evidence", evidenceJson);

                var result = await cmd.ExecuteScalarAsync();

                // Record deduplication window
                await RecordDeduplicationAsync(assetId, ruleId, alertId);

                _logger.LogInformation("Created alert {AlertId} for asset {AssetId}, status {Status}", alertId, assetId, status);
                return alertId;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to create alert for asset {AssetId}, rule {RuleId}", assetId, ruleId);
                throw;
            }
        }

        public async Task<bool> AcknowledgeAlertAsync(Guid alertId, string acknowledgedBy)
        {
            try
            {
                await using var conn = new NpgsqlConnection(_timescaleConnectionString);
                await conn.OpenAsync();

                var sql = @"
                    UPDATE alerts
                    SET status = 'acknowledged',
                        acknowledged_by = @acknowledged_by,
                        acknowledged_at = CURRENT_TIMESTAMP
                    WHERE alert_id = @alert_id AND status = 'open'";

                await using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("alert_id", alertId);
                cmd.Parameters.AddWithValue("acknowledged_by", acknowledgedBy);

                var rows = await cmd.ExecuteNonQueryAsync();

                if (rows > 0)
                {
                    await RecordHistoryAsync(conn, alertId, "open", "acknowledged", acknowledgedBy, "Alert acknowledged");
                    _logger.LogInformation("Alert {AlertId} acknowledged by {User}", alertId, acknowledgedBy);
                    return true;
                }

                return false;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to acknowledge alert {AlertId}", alertId);
                return false;
            }
        }

        public async Task<bool> ResolveAlertAsync(Guid alertId, string resolvedBy, string? resolutionNotes)
        {
            try
            {
                await using var conn = new NpgsqlConnection(_timescaleConnectionString);
                await conn.OpenAsync();

                var sql = @"
                    UPDATE alerts
                    SET status = 'resolved',
                        resolved_by = @resolved_by,
                        resolved_at = CURRENT_TIMESTAMP,
                        closed_at = CURRENT_TIMESTAMP,
                        resolution_notes = @resolution_notes
                    WHERE alert_id = @alert_id AND status IN ('open', 'acknowledged')";

                await using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("alert_id", alertId);
                cmd.Parameters.AddWithValue("resolved_by", resolvedBy);
                cmd.Parameters.AddWithValue("resolution_notes", resolutionNotes ?? (object)DBNull.Value);

                var rows = await cmd.ExecuteNonQueryAsync();

                if (rows > 0)
                {
                    await RecordHistoryAsync(conn, alertId, null, "resolved", resolvedBy, resolutionNotes);
                    _logger.LogInformation("Alert {AlertId} resolved by {User}", alertId, resolvedBy);
                    return true;
                }

                return false;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to resolve alert {AlertId}", alertId);
                return false;
            }
        }

        private async Task<Guid?> CheckDeduplicationAsync(Guid assetId, string ruleId, int windowMinutes = 5)
        {
            try
            {
                await using var conn = new NpgsqlConnection(_timescaleConnectionString);
                await conn.OpenAsync();

                var sql = @"
                    SELECT last_alert_id
                    FROM alert_deduplication
                    WHERE asset_id = @asset_id
                      AND rule_id = @rule_id
                      AND window_end >= CURRENT_TIMESTAMP - INTERVAL '@window_minutes minutes'
                    ORDER BY window_end DESC
                    LIMIT 1";

                await using var cmd = new NpgsqlCommand(sql.Replace("@window_minutes", windowMinutes.ToString()), conn);
                cmd.Parameters.AddWithValue("asset_id", assetId);
                cmd.Parameters.AddWithValue("rule_id", ruleId);

                var result = await cmd.ExecuteScalarAsync();
                return result != null ? (Guid?)result : null;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Deduplication check failed, proceeding without dedup");
                return null;
            }
        }

        private async Task RecordDeduplicationAsync(Guid assetId, string ruleId, Guid alertId, int windowMinutes = 5)
        {
            try
            {
                await using var conn = new NpgsqlConnection(_timescaleConnectionString);
                await conn.OpenAsync();

                var sql = @"
                    INSERT INTO alert_deduplication (asset_id, rule_id, window_start, window_end, alert_count, last_alert_id)
                    VALUES (@asset_id, @rule_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '@window_minutes minutes', 1, @alert_id)
                    ON CONFLICT (asset_id, rule_id, window_start)
                    DO UPDATE SET alert_count = alert_deduplication.alert_count + 1,
                                  last_alert_id = @alert_id,
                                  window_end = CURRENT_TIMESTAMP + INTERVAL '@window_minutes minutes'";

                await using var cmd = new NpgsqlCommand(sql.Replace("@window_minutes", windowMinutes.ToString()), conn);
                cmd.Parameters.AddWithValue("asset_id", assetId);
                cmd.Parameters.AddWithValue("rule_id", ruleId);
                cmd.Parameters.AddWithValue("alert_id", alertId);

                await cmd.ExecuteNonQueryAsync();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to record deduplication window, continuing");
            }
        }

        private async Task<bool> CheckSuppressionAsync(Guid assetId, string ruleId)
        {
            try
            {
                await using var conn = new NpgsqlConnection(_timescaleConnectionString);
                await conn.OpenAsync();

                var sql = @"SELECT check_alert_suppression(@asset_id, @rule_id)";

                await using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("asset_id", assetId);
                cmd.Parameters.AddWithValue("rule_id", ruleId);

                var result = await cmd.ExecuteScalarAsync();
                return result != null && (bool)result;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Suppression check failed, assuming not suppressed");
                return false;
            }
        }

        private async Task RecordHistoryAsync(NpgsqlConnection conn, Guid alertId, string? oldStatus, string newStatus, string changedBy, string? notes)
        {
            try
            {
                var sql = @"
                    INSERT INTO alert_history (alert_id, old_status, new_status, changed_by, notes)
                    VALUES (@alert_id, @old_status, @new_status, @changed_by, @notes)";

                await using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("alert_id", alertId);
                cmd.Parameters.AddWithValue("old_status", oldStatus ?? (object)DBNull.Value);
                cmd.Parameters.AddWithValue("new_status", newStatus);
                cmd.Parameters.AddWithValue("changed_by", changedBy ?? (object)DBNull.Value);
                cmd.Parameters.AddWithValue("notes", notes ?? (object)DBNull.Value);

                await cmd.ExecuteNonQueryAsync();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to record alert history");
            }
        }
    }
}
