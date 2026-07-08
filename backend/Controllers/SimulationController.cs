using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/simulation")]
    public class SimulationController : ControllerBase
    {
        private readonly Services.DatabaseService _dbService;
        private readonly Services.IAuditService _auditService;

        public SimulationController(Services.DatabaseService dbService, Services.IAuditService auditService)
        {
            _dbService = dbService;
            _auditService = auditService;
        }

        [HttpGet("machines")]
        [Authorize]
        public async Task<IActionResult> GetAllSimulationConfigs()
        {
            try
            {
                var configs = new List<object>();
                using var conn = _dbService.CreateConnection();
                await conn.OpenAsync();

                string sql = @"
                    SELECT sc.machine_id, sc.enabled, sc.temperature_min, sc.temperature_max,
                           sc.pressure_min, sc.pressure_max, sc.speed_min, sc.speed_max,
                           sc.production_rate, sc.error_probability, sc.updated_at,
                           m.name, m.ip, m.status, m.cpu_percent, m.ram_percent
                    FROM simulation_configs sc
                    JOIN machines m ON m.id = sc.machine_id
                    ORDER BY m.name ASC";

                using var cmd = new NpgsqlCommand(sql, conn);
                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    var machineId = reader.GetGuid(0);
                    bool hasLiveData = Services.SimulationService.TryGetState(machineId, out var state);

                    configs.Add(new
                    {
                        machineId,
                        enabled = reader.GetBoolean(1),
                        temperatureMin = reader.GetDecimal(2),
                        temperatureMax = reader.GetDecimal(3),
                        pressureMin = reader.GetDecimal(4),
                        pressureMax = reader.GetDecimal(5),
                        speedMin = reader.GetDecimal(6),
                        speedMax = reader.GetDecimal(7),
                        productionRate = reader.GetDecimal(8),
                        errorProbability = reader.GetDecimal(9),
                        updatedAt = reader.GetDateTime(10),
                        machineName = reader.GetString(11),
                        machineIp = reader.IsDBNull(12) ? "" : reader.GetString(12),
                        machineStatus = reader.IsDBNull(13) ? "offline" : reader.GetString(13),
                        cpuPercent = reader.IsDBNull(14) ? 0.0 : reader.GetDouble(14),
                        ramPercent = reader.IsDBNull(15) ? 0.0 : reader.GetDouble(15),
                        liveData = hasLiveData ? new
                        {
                            state!.Temperature,
                            state.Pressure,
                            state.Speed,
                            state.ProductionCount,
                            state.Status,
                            state.CpuPercent,
                            state.RamPercent,
                            state.UptimeSeconds,
                            state.LastUpdated
                        } : null
                    });
                }

                return Ok(configs);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = $"Lỗi lấy cấu hình simulation: {ex.Message}" });
            }
        }

        [HttpGet("machines/{id}")]
        [Authorize]
        public async Task<IActionResult> GetSimulationConfig(Guid id)
        {
            try
            {
                using var conn = _dbService.CreateConnection();
                await conn.OpenAsync();

                string sql = @"
                    SELECT sc.machine_id, sc.enabled, sc.temperature_min, sc.temperature_max,
                           sc.pressure_min, sc.pressure_max, sc.speed_min, sc.speed_max,
                           sc.production_rate, sc.error_probability, sc.created_at, sc.updated_at,
                           m.name, m.ip, m.status, m.uptime_seconds, m.cpu_percent, m.ram_percent
                    FROM simulation_configs sc
                    JOIN machines m ON m.id = sc.machine_id
                    WHERE sc.machine_id = @machine_id";

                using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("machine_id", id);
                using var reader = await cmd.ExecuteReaderAsync();
                if (!await reader.ReadAsync())
                {
                    return NotFound(new { error = "Không tìm thấy cấu hình simulation cho máy này" });
                }

                bool hasLiveData = Services.SimulationService.TryGetState(id, out var state);

                return Ok(new
                {
                    machineId = reader.GetGuid(0),
                    enabled = reader.GetBoolean(1),
                    temperatureMin = reader.GetDecimal(2),
                    temperatureMax = reader.GetDecimal(3),
                    pressureMin = reader.GetDecimal(4),
                    pressureMax = reader.GetDecimal(5),
                    speedMin = reader.GetDecimal(6),
                    speedMax = reader.GetDecimal(7),
                    productionRate = reader.GetDecimal(8),
                    errorProbability = reader.GetDecimal(9),
                    createdAt = reader.GetDateTime(10),
                    updatedAt = reader.GetDateTime(11),
                    machineName = reader.GetString(12),
                    machineIp = reader.IsDBNull(13) ? "" : reader.GetString(13),
                    machineStatus = reader.IsDBNull(14) ? "offline" : reader.GetString(14),
                    uptimeSeconds = reader.IsDBNull(15) ? 0L : reader.GetInt64(15),
                    cpuPercent = reader.IsDBNull(16) ? 0.0 : reader.GetDouble(16),
                    ramPercent = reader.IsDBNull(17) ? 0.0 : reader.GetDouble(17),
                    liveData = hasLiveData ? new
                    {
                        state!.Temperature,
                        state.Pressure,
                        state.Speed,
                        state.ProductionCount,
                        state.Status,
                        state.CpuPercent,
                        state.RamPercent,
                        state.UptimeSeconds,
                        state.LastUpdated
                    } : null
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = $"Lỗi lấy cấu hình simulation: {ex.Message}" });
            }
        }

        [HttpPut("machines/{id}")]
        [Authorize(Roles = "ADMIN,ENGINEER")]
        public async Task<IActionResult> UpdateSimulationConfig(Guid id, [FromBody] UpdateSimulationConfigRequest req)
        {
            try
            {
                using var conn = _dbService.CreateConnection();
                await conn.OpenAsync();

                string checkSql = "SELECT 1 FROM simulation_configs WHERE machine_id = @machine_id";
                using var checkCmd = new NpgsqlCommand(checkSql, conn);
                checkCmd.Parameters.AddWithValue("machine_id", id);
                var exists = await checkCmd.ExecuteScalarAsync();
                if (exists == null)
                {
                    return NotFound(new { error = "Không tìm thấy cấu hình simulation cho máy này" });
                }

                string sql = @"
                    UPDATE simulation_configs
                    SET enabled = @enabled,
                        temperature_min = @tempMin,
                        temperature_max = @tempMax,
                        pressure_min = @pressMin,
                        pressure_max = @pressMax,
                        speed_min = @speedMin,
                        speed_max = @speedMax,
                        production_rate = @prodRate,
                        error_probability = @errProb,
                        updated_at = NOW()
                    WHERE machine_id = @machine_id";

                using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("machine_id", id);
                cmd.Parameters.AddWithValue("enabled", req.Enabled);
                cmd.Parameters.AddWithValue("tempMin", req.TemperatureMin);
                cmd.Parameters.AddWithValue("tempMax", req.TemperatureMax);
                cmd.Parameters.AddWithValue("pressMin", req.PressureMin);
                cmd.Parameters.AddWithValue("pressMax", req.PressureMax);
                cmd.Parameters.AddWithValue("speedMin", req.SpeedMin);
                cmd.Parameters.AddWithValue("speedMax", req.SpeedMax);
                cmd.Parameters.AddWithValue("prodRate", req.ProductionRate);
                cmd.Parameters.AddWithValue("errProb", req.ErrorProbability);
                await cmd.ExecuteNonQueryAsync();

                var currentUser = User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown";
                await _auditService.LogAuditAsync(currentUser, "UPDATE_SIMULATION_CONFIG", $"Cập nhật simulation cho máy: {id}");

                return Ok(new { success = true, message = "Đã cập nhật cấu hình simulation" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = $"Lỗi cập nhật simulation: {ex.Message}" });
            }
        }

        [HttpPost("machines/{id}/toggle")]
        [Authorize(Roles = "ADMIN,ENGINEER")]
        public async Task<IActionResult> ToggleSimulation(Guid id)
        {
            try
            {
                using var conn = _dbService.CreateConnection();
                await conn.OpenAsync();

                string checkSql = "SELECT enabled FROM simulation_configs WHERE machine_id = @machine_id";
                using var checkCmd = new NpgsqlCommand(checkSql, conn);
                checkCmd.Parameters.AddWithValue("machine_id", id);
                var result = await checkCmd.ExecuteScalarAsync();
                if (result == null || result == DBNull.Value)
                {
                    return NotFound(new { error = "Không tìm thấy cấu hình simulation cho máy này" });
                }

                bool currentEnabled = (bool)result;
                bool newEnabled = !currentEnabled;

                string updateSql = @"
                    UPDATE simulation_configs
                    SET enabled = @enabled, updated_at = NOW()
                    WHERE machine_id = @machine_id";

                using var updateCmd = new NpgsqlCommand(updateSql, conn);
                updateCmd.Parameters.AddWithValue("machine_id", id);
                updateCmd.Parameters.AddWithValue("enabled", newEnabled);
                await updateCmd.ExecuteNonQueryAsync();

                if (!newEnabled)
                {
                    Services.SimulationService.ResetState(id);
                }

                var currentUser = User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown";
                await _auditService.LogAuditAsync(currentUser, "TOGGLE_SIMULATION", $"{(newEnabled ? "Bật" : "Tắt")} simulation cho máy: {id}");

                return Ok(new { success = true, enabled = newEnabled, message = newEnabled ? "Đã bật simulation" : "Đã tắt simulation" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = $"Lỗi toggle simulation: {ex.Message}" });
            }
        }

        [HttpGet("machines/{id}/data")]
        [Authorize]
        public IActionResult GetMachineSimData(Guid id)
        {
            if (Services.SimulationService.TryGetState(id, out var state) && state != null)
            {
                return Ok(state);
            }

            return Ok(new
            {
                machineId = id,
                message = "Không có dữ liệu simulation cho máy này (simulation có thể chưa được bật)"
            });
        }

        [HttpGet("all")]
        [Authorize]
        public IActionResult GetAllSimData()
        {
            var allStates = Services.SimulationService.GetCurrentStates();
            var result = new Dictionary<Guid, object>();

            foreach (var (machineId, state) in allStates)
            {
                result[machineId] = new
                {
                    machineId,
                    temperature = state.Temperature,
                    pressure = state.Pressure,
                    speed = state.Speed,
                    productionCount = state.ProductionCount,
                    status = state.Status,
                    cpuPercent = state.CpuPercent,
                    ramPercent = state.RamPercent,
                    uptimeSeconds = state.UptimeSeconds,
                    timestamp = state.LastUpdated
                };
            }

            return Ok(result);
        }

        [HttpPost("reset/{id}")]
        [Authorize(Roles = "ADMIN,ENGINEER")]
        public async Task<IActionResult> ResetSimulation(Guid id)
        {
            Services.SimulationService.ResetState(id);

            var currentUser = User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown";
            await _auditService.LogAuditAsync(currentUser, "RESET_SIMULATION", $"Reset simulation cho máy: {id}");

            return Ok(new { success = true, message = "Đã reset trạng thái simulation" });
        }

    }

    public class UpdateSimulationConfigRequest
    {
        public bool Enabled { get; set; }
        public decimal TemperatureMin { get; set; } = 20.0m;
        public decimal TemperatureMax { get; set; } = 80.0m;
        public decimal PressureMin { get; set; } = 1.0m;
        public decimal PressureMax { get; set; } = 10.0m;
        public decimal SpeedMin { get; set; } = 0.0m;
        public decimal SpeedMax { get; set; } = 100.0m;
        public decimal ProductionRate { get; set; } = 10.0m;
        public decimal ErrorProbability { get; set; } = 0.02m;
    }
}
