using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using backend.Services;
using Npgsql;
using NpgsqlTypes;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/alarms")]
    public class AlarmsController : ControllerBase
    {
        private readonly DatabaseService _dbService;
        private readonly IAuditService _auditService;

        public AlarmsController(DatabaseService dbService, IAuditService auditService)
        {
            _dbService = dbService;
            _auditService = auditService;
        }

        [HttpGet]
        public async Task<IActionResult> GetAlarms(
            [FromQuery] string? status = null,
            [FromQuery] string? severity = null,
            [FromQuery] int limit = 100)
        {
            try
            {
                var alarms = new List<object>();
                using var conn = _dbService.CreateConnection();
                await conn.OpenAsync();

                string sql = @"
                    SELECT a.id, a.machine_id, m.name as machine_name, a.severity, a.message,
                           a.status, a.acknowledged_by, a.acknowledged_at, a.notes, a.created_at, a.resolved_at
                    FROM alarms a
                    JOIN machines m ON a.machine_id = m.id
                    WHERE (@status IS NULL OR a.status = @status)
                      AND (@severity IS NULL OR a.severity = @severity)
                    ORDER BY a.created_at DESC
                    LIMIT @limit";

                using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.Add("status", NpgsqlDbType.Varchar).Value = (object?)status ?? DBNull.Value;
                cmd.Parameters.Add("severity", NpgsqlDbType.Varchar).Value = (object?)severity ?? DBNull.Value;
                cmd.Parameters.AddWithValue("limit", limit);

                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    alarms.Add(new
                    {
                        id = reader.GetInt64(0),
                        machineId = reader.GetGuid(1),
                        machineName = reader.GetString(2),
                        severity = reader.GetString(3),
                        message = reader.GetString(4),
                        status = reader.GetString(5),
                        acknowledgedBy = reader.IsDBNull(6) ? null : reader.GetString(6),
                        acknowledgedAt = reader.IsDBNull(7) ? (DateTime?)null : reader.GetDateTime(7),
                        notes = reader.IsDBNull(8) ? null : reader.GetString(8),
                        createdAt = reader.GetDateTime(9),
                        resolvedAt = reader.IsDBNull(10) ? (DateTime?)null : reader.GetDateTime(10)
                    });
                }

                return Ok(alarms);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        public class AcknowledgeRequest
        {
            public string? Notes { get; set; }
        }

        [HttpPost("{id}/acknowledge")]
        [Authorize(Roles = "ADMIN,ENGINEER")]
        public async Task<IActionResult> AcknowledgeAlarm(long id, [FromBody] AcknowledgeRequest? request)
        {
            try
            {
                var currentUser = User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown";

                string sql = @"
                    UPDATE alarms
                    SET status = 'ACKNOWLEDGED', acknowledged_by = @user, acknowledged_at = NOW(), notes = @notes
                    WHERE id = @id AND status = 'ACTIVE'
                    RETURNING id";

                using var conn = _dbService.CreateConnection();
                await conn.OpenAsync();
                using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("id", id);
                cmd.Parameters.AddWithValue("user", currentUser);
                cmd.Parameters.AddWithValue("notes", (object?)(request?.Notes) ?? DBNull.Value);

                var result = await cmd.ExecuteScalarAsync();
                if (result == null)
                    return NotFound(new { error = "Alarm not found or already acknowledged" });

                return Ok(new { success = true, message = "Alarm acknowledged" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("{id}/resolve")]
        [Authorize(Roles = "ADMIN,ENGINEER")]
        public async Task<IActionResult> ResolveAlarm(long id, [FromBody] AcknowledgeRequest? request)
        {
            try
            {
                var currentUser = User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown";

                string sql = @"
                    UPDATE alarms
                    SET status = 'RESOLVED', resolved_at = NOW(), notes = COALESCE(@notes, notes)
                    WHERE id = @id
                    RETURNING id";

                using var conn = _dbService.CreateConnection();
                await conn.OpenAsync();
                using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("id", id);
                cmd.Parameters.AddWithValue("notes", (object?)(request?.Notes) ?? DBNull.Value);

                var result = await cmd.ExecuteScalarAsync();
                if (result == null)
                    return NotFound(new { error = "Alarm not found" });

                await _auditService.LogAuditAsync(currentUser, "RESOLVE_ALARM", $"Resolved alarm ID: {id}");
                return Ok(new { success = true, message = "Alarm resolved" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

    }
}
