using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using backend.Services;
using Npgsql;
using Microsoft.Extensions.Configuration;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/v1/alerts")]
    public class AlertController : ControllerBase
    {
        private readonly AlertService _alertService;
        private readonly string _timescaleConnectionString;
        private readonly ILogger<AlertController> _logger;

        public AlertController(
            AlertService alertService,
            IConfiguration configuration,
            ILogger<AlertController> logger)
        {
            _alertService = alertService;
            _timescaleConnectionString = configuration.GetConnectionString("Timescale")
                ?? throw new ArgumentNullException("ConnectionStrings:Timescale is missing");
            _logger = logger;
        }

        [HttpGet]
        public async Task<IActionResult> GetAlerts(
            [FromQuery] Guid? assetId,
            [FromQuery] string status,
            [FromQuery] string severity,
            [FromQuery] DateTime? from,
            [FromQuery] DateTime? to,
            [FromQuery] int limit = 100)
        {
            try
            {
                await using var conn = new NpgsqlConnection(_timescaleConnectionString);
                await conn.OpenAsync();

                var sql = @"
                    SELECT alert_id, event_id, asset_id, rule_id, opened_at, closed_at,
                           status, severity, title, description, evidence,
                           acknowledged_by, acknowledged_at, resolved_by, resolved_at
                    FROM alerts
                    WHERE 1=1";

                if (assetId.HasValue)
                    sql += " AND asset_id = @asset_id";
                if (!string.IsNullOrEmpty(status))
                    sql += " AND status = @status";
                if (!string.IsNullOrEmpty(severity))
                    sql += " AND severity = @severity";
                if (from.HasValue)
                    sql += " AND opened_at >= @from";
                if (to.HasValue)
                    sql += " AND opened_at <= @to";

                sql += " ORDER BY opened_at DESC LIMIT @limit";

                await using var cmd = new NpgsqlCommand(sql, conn);
                if (assetId.HasValue) cmd.Parameters.AddWithValue("asset_id", assetId.Value);
                if (!string.IsNullOrEmpty(status)) cmd.Parameters.AddWithValue("status", status);
                if (!string.IsNullOrEmpty(severity)) cmd.Parameters.AddWithValue("severity", severity);
                if (from.HasValue) cmd.Parameters.AddWithValue("from", from.Value);
                if (to.HasValue) cmd.Parameters.AddWithValue("to", to.Value);
                cmd.Parameters.AddWithValue("limit", limit);

                var alerts = new List<object>();
                await using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    alerts.Add(new
                    {
                        alertId = reader.GetGuid(0),
                        eventId = reader.GetGuid(1),
                        assetId = reader.GetGuid(2),
                        ruleId = reader.GetString(3),
                        openedAt = reader.GetDateTime(4),
                        closedAt = reader.IsDBNull(5) ? (DateTime?)null : reader.GetDateTime(5),
                        status = reader.GetString(6),
                        severity = reader.GetString(7),
                        title = reader.GetString(8),
                        description = reader.IsDBNull(9) ? null : reader.GetString(9),
                        evidence = reader.IsDBNull(10) ? null : reader.GetString(10),
                        acknowledgedBy = reader.IsDBNull(11) ? null : reader.GetString(11),
                        acknowledgedAt = reader.IsDBNull(12) ? (DateTime?)null : reader.GetDateTime(12),
                        resolvedBy = reader.IsDBNull(13) ? null : reader.GetString(13),
                        resolvedAt = reader.IsDBNull(14) ? (DateTime?)null : reader.GetDateTime(14)
                    });
                }

                return Ok(new { count = alerts.Count, alerts });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to get alerts");
                return StatusCode(500, new { error = "Failed to retrieve alerts" });
            }
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetAlert(Guid id)
        {
            try
            {
                await using var conn = new NpgsqlConnection(_timescaleConnectionString);
                await conn.OpenAsync();

                var sql = @"
                    SELECT alert_id, event_id, asset_id, rule_id, opened_at, closed_at,
                           status, severity, title, description, evidence,
                           acknowledged_by, acknowledged_at, resolved_by, resolved_at,
                           resolution_notes, suppression_reason
                    FROM alerts
                    WHERE alert_id = @alert_id";

                await using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("alert_id", id);

                await using var reader = await cmd.ExecuteReaderAsync();
                if (!await reader.ReadAsync())
                    return NotFound(new { error = "Alert not found" });

                var alert = new
                {
                    alertId = reader.GetGuid(0),
                    eventId = reader.GetGuid(1),
                    assetId = reader.GetGuid(2),
                    ruleId = reader.GetString(3),
                    openedAt = reader.GetDateTime(4),
                    closedAt = reader.IsDBNull(5) ? (DateTime?)null : reader.GetDateTime(5),
                    status = reader.GetString(6),
                    severity = reader.GetString(7),
                    title = reader.GetString(8),
                    description = reader.IsDBNull(9) ? null : reader.GetString(9),
                    evidence = reader.IsDBNull(10) ? null : reader.GetString(10),
                    acknowledgedBy = reader.IsDBNull(11) ? null : reader.GetString(11),
                    acknowledgedAt = reader.IsDBNull(12) ? (DateTime?)null : reader.GetDateTime(12),
                    resolvedBy = reader.IsDBNull(13) ? null : reader.GetString(13),
                    resolvedAt = reader.IsDBNull(14) ? (DateTime?)null : reader.GetDateTime(14),
                    resolutionNotes = reader.IsDBNull(15) ? null : reader.GetString(15),
                    suppressionReason = reader.IsDBNull(16) ? null : reader.GetString(16)
                };

                return Ok(alert);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to get alert {AlertId}", id);
                return StatusCode(500, new { error = "Failed to retrieve alert" });
            }
        }

        [HttpPost("{id}/acknowledge")]
        public async Task<IActionResult> AcknowledgeAlert(Guid id, [FromBody] AcknowledgeRequest request)
        {
            try
            {
                var username = User?.Identity?.Name ?? "system";
                var success = await _alertService.AcknowledgeAlertAsync(id, username);

                if (success)
                    return Ok(new { message = "Alert acknowledged", alertId = id });
                else
                    return BadRequest(new { error = "Alert not found or already acknowledged/resolved" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to acknowledge alert {AlertId}", id);
                return StatusCode(500, new { error = "Failed to acknowledge alert" });
            }
        }

        [HttpPost("{id}/resolve")]
        public async Task<IActionResult> ResolveAlert(Guid id, [FromBody] ResolveRequest request)
        {
            try
            {
                var username = User?.Identity?.Name ?? "system";
                var success = await _alertService.ResolveAlertAsync(id, username, request?.Notes);

                if (success)
                    return Ok(new { message = "Alert resolved", alertId = id });
                else
                    return BadRequest(new { error = "Alert not found or already resolved" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to resolve alert {AlertId}", id);
                return StatusCode(500, new { error = "Failed to resolve alert" });
            }
        }

        [HttpGet("stats")]
        public async Task<IActionResult> GetAlertStats()
        {
            try
            {
                await using var conn = new NpgsqlConnection(_timescaleConnectionString);
                await conn.OpenAsync();

                var sql = @"
                    SELECT
                        status,
                        severity,
                        COUNT(*) as count
                    FROM alerts
                    WHERE opened_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
                    GROUP BY status, severity
                    ORDER BY severity DESC, status";

                var stats = new List<object>();
                await using var cmd = new NpgsqlCommand(sql, conn);
                await using var reader = await cmd.ExecuteReaderAsync();

                while (await reader.ReadAsync())
                {
                    stats.Add(new
                    {
                        status = reader.GetString(0),
                        severity = reader.GetString(1),
                        count = reader.GetInt64(2)
                    });
                }

                // Get open count by severity
                var openSql = @"
                    SELECT severity, COUNT(*) as count
                    FROM alerts
                    WHERE status = 'open'
                    GROUP BY severity";

                var openCounts = new Dictionary<string, long>();
                await using var openCmd = new NpgsqlCommand(openSql, conn);
                await using var openReader = await openCmd.ExecuteReaderAsync();

                while (await openReader.ReadAsync())
                {
                    openCounts[openReader.GetString(0)] = openReader.GetInt64(1);
                }

                return Ok(new
                {
                    openCounts,
                    detailedStats = stats
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to get alert stats");
                return StatusCode(500, new { error = "Failed to retrieve alert statistics" });
            }
        }
    }

    public class AcknowledgeRequest
    {
        // Future: could include notes or other metadata
    }

    public class ResolveRequest
    {
        public string Notes { get; set; }
    }
}
