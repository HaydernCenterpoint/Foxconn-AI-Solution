using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using backend.Services;
using Npgsql;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/dashboard")]
    public class DashboardController : ControllerBase
    {
        private readonly DatabaseService _dbService;

        public DashboardController(DatabaseService dbService)
        {
            _dbService = dbService;
        }

        [HttpGet("summary")]
        public async Task<IActionResult> GetSummary()
        {
            try
            {
                using var conn = _dbService.CreateConnection();
                await conn.OpenAsync();

                // Total machines
                int totalMachines = 0;
                int running = 0;
                int idle = 0;
                int error = 0;
                int offline = 0;
                long totalProduction = 0;

                string machineSql = @"
                    SELECT status, last_plc_data FROM machines";
                using (var cmd = new NpgsqlCommand(machineSql, conn))
                using (var reader = await cmd.ExecuteReaderAsync())
                {
                    while (await reader.ReadAsync())
                    {
                        totalMachines++;
                        string status = reader.IsDBNull(0) ? "" : reader.GetString(0).ToLower().Trim();

                        if (status == "running" || status == "đang chạy")
                            running++;
                        else if (status == "error" || status == "lỗi")
                            error++;
                        else if (status == "idle" || status == "rảnh")
                            idle++;
                        else
                            offline++;
                    }
                }

                // Total production today
                string prodSql = @"
                    SELECT COALESCE(SUM(daily_qty), 0) FROM (
                        SELECT COALESCE(MAX(production_count) - MIN(production_count), 0) as daily_qty
                        FROM machine_telemetry_history
                        WHERE created_at >= CURRENT_DATE
                        GROUP BY machine_id
                    ) t";
                using (var cmd = new NpgsqlCommand(prodSql, conn))
                {
                    var result = await cmd.ExecuteScalarAsync();
                    totalProduction = result == DBNull.Value || result == null ? 0 : Convert.ToInt64(result);
                }

                // Total production lines
                int totalLines = 0;
                string linesSql = "SELECT COUNT(*) FROM production_lines";
                using (var cmd = new NpgsqlCommand(linesSql, conn))
                {
                    var result = await cmd.ExecuteScalarAsync();
                    totalLines = result == DBNull.Value || result == null ? 0 : Convert.ToInt32(result);
                }

                // Active alarms
                int activeAlarms = 0;
                try
                {
                    string alarmSql = "SELECT COUNT(*) FROM alarms WHERE status = 'ACTIVE'";
                    using var cmd = new NpgsqlCommand(alarmSql, conn);
                    var result = await cmd.ExecuteScalarAsync();
                    activeAlarms = result == DBNull.Value || result == null ? 0 : Convert.ToInt32(result);
                }
                catch
                {
                    // alarms table may not exist yet
                }

                // Recent alarms
                var recentAlarms = new List<object>();
                try
                {
                    string recentAlarmSql = @"
                        SELECT a.id, a.machine_id, m.name, a.severity, a.message, a.status, a.created_at
                        FROM alarms a
                        JOIN machines m ON a.machine_id = m.id
                        WHERE a.status = 'ACTIVE'
                        ORDER BY a.created_at DESC
                        LIMIT 5";
                    using var cmd = new NpgsqlCommand(recentAlarmSql, conn);
                    using var reader = await cmd.ExecuteReaderAsync();
                    while (await reader.ReadAsync())
                    {
                        recentAlarms.Add(new
                        {
                            id = reader.GetInt64(0),
                            machineId = reader.GetGuid(1),
                            machineName = reader.GetString(2),
                            severity = reader.GetString(3),
                            message = reader.GetString(4),
                            status = reader.GetString(5),
                            createdAt = reader.GetDateTime(6)
                        });
                    }
                }
                catch { }

                // Hourly production totals for chart (last 48 hours, all machines)
                var hourlyData = new List<object>();
                try
                {
                    string hourlySql = @"
                        SELECT 
                            created_at::date as prod_date, 
                            EXTRACT(HOUR FROM created_at)::int as prod_hour, 
                            COALESCE(SUM(CASE WHEN hourly_qty >= 0 THEN hourly_qty ELSE 0 END), 0)
                        FROM (
                            SELECT 
                                machine_id,
                                created_at,
                                COALESCE(production_count - LAG(production_count) OVER (PARTITION BY machine_id ORDER BY created_at), 0) as hourly_qty
                            FROM machine_telemetry_history
                            WHERE created_at >= NOW() - INTERVAL '7 days'
                        ) sub
                        GROUP BY prod_date, prod_hour
                        ORDER BY prod_date ASC, prod_hour ASC";
                    using var cmd = new NpgsqlCommand(hourlySql, conn);
                    using var reader = await cmd.ExecuteReaderAsync();
                    while (await reader.ReadAsync())
                    {
                        hourlyData.Add(new
                        {
                            prodDate = reader.GetDateTime(0).ToString("yyyy-MM-dd"),
                            prodHour = reader.GetInt32(1),
                            totalQty = Convert.ToInt64(reader.GetValue(2))
                        });
                    }
                }
                catch { }

                // PLC clients online count
                int plcClientsOnline = 0;
                try
                {
                    string clientSql = "SELECT COUNT(*) FROM machines WHERE status != 'offline' AND status != 'OFFLINE'";
                    using var cmd = new NpgsqlCommand(clientSql, conn);
                    var result = await cmd.ExecuteScalarAsync();
                    plcClientsOnline = result == DBNull.Value || result == null ? 0 : Convert.ToInt32(result);
                }
                catch { }

                return Ok(new
                {
                    totalMachines,
                    running,
                    idle,
                    error,
                    offline,
                    totalLines,
                    totalProduction,
                    activeAlarms,
                    plcClientsOnline,
                    recentAlarms,
                    hourlyData
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }
    }
}
