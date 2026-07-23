using System;
using System.Threading.Tasks;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/machines/{machineId}/health")]
    public class MachineHealthController : ControllerBase
    {
        private readonly DatabaseService _dbService;

        public MachineHealthController(DatabaseService dbService)
        {
            _dbService = dbService;
        }

        [HttpGet]
        [AllowAnonymous]
        public async Task<IActionResult> GetHealth(Guid machineId)
        {
            if (machineId == Guid.Empty)
                return BadRequest(new { error = "machineId is required." });

            using var conn = _dbService.CreateConnection();
            await conn.OpenAsync();
            using var cmd = new NpgsqlCommand(@"
                SELECT m.status, m.plc_connected, m.cpu_percent, m.ram_percent,
                       (SELECT COUNT(*) FROM alarms a WHERE a.machine_id = m.id AND a.status = 'ACTIVE') AS active_alarms,
                       (SELECT COUNT(*) FROM event_log e WHERE e.asset_id = m.id
                           AND e.timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours') AS recent_events
                FROM machines m
                WHERE m.id = @machineId
                LIMIT 1", conn);
            cmd.Parameters.AddWithValue("machineId", machineId);

            using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
                return NotFound(new { error = "Machine not found." });

            var status = reader.IsDBNull(0) ? "offline" : reader.GetString(0);
            var plcConnected = !reader.IsDBNull(1) && reader.GetBoolean(1);
            var cpu = reader.IsDBNull(2) ? 0 : reader.GetDouble(2);
            var ram = reader.IsDBNull(3) ? 0 : reader.GetDouble(3);
            var activeAlarms = reader.GetInt64(4);
            var recentEvents = reader.GetInt64(5);

            var (score, band, availability, alarmScore, performance) =
                CalculateScore(status, plcConnected, cpu, ram, activeAlarms, recentEvents);

            return Ok(new
            {
                machineId,
                score,
                band,
                calculatedAt = DateTimeOffset.UtcNow,
                factors = new { availability, alarmScore, performance, activeAlarms, recentEvents, cpu, ram }
            });
        }

        public static (double Score, string Band, double Availability, double AlarmScore, double Performance)
            CalculateScore(string status, bool plcConnected, double cpu, double ram, long activeAlarms, long recentEvents)
        {
            var availability = status.Equals("running", StringComparison.OrdinalIgnoreCase) && plcConnected ? 100 :
                status.Equals("idle", StringComparison.OrdinalIgnoreCase) ? 75 : 25;
            var alarmScore = Math.Max(0, 100 - activeAlarms * 20 - recentEvents * 5);
            var performance = Math.Max(0, 100 - Math.Max(0, cpu - 70) - Math.Max(0, ram - 80));
            var score = Math.Round(availability * 0.4 + alarmScore * 0.3 + performance * 0.3, 1);
            var band = score >= 80 ? "healthy" : score >= 60 ? "warning" : "critical";
            return (score, band, availability, alarmScore, performance);
        }
    }
}
