using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace backend.Services
{
    public class SimulationService : BackgroundService
    {
        private readonly DatabaseService _dbService;
        private readonly ILogger<SimulationService> _logger;
        private static readonly TimeSpan TickInterval = TimeSpan.FromSeconds(5);

        private static readonly ConcurrentDictionary<Guid, SimulatedMachineState> _machineStates = new();

        public SimulationService(DatabaseService dbService, ILogger<SimulationService> logger)
        {
            _dbService = dbService;
            _logger = logger;
        }

        public static IReadOnlyDictionary<Guid, SimulatedMachineState> GetCurrentStates() => _machineStates;

        public static bool TryGetState(Guid machineId, out SimulatedMachineState? state)
        {
            return _machineStates.TryGetValue(machineId, out state);
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("[Simulation] Service started");

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await TickAsync(stoppingToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "[Simulation] Error during simulation tick");
                }

                await Task.Delay(TickInterval, stoppingToken);
            }

            _logger.LogInformation("[Simulation] Service stopped");
        }

        private async Task TickAsync(CancellationToken ct)
        {
            var enabledMachines = await GetEnabledSimulationsAsync(ct);
            if (enabledMachines.Count == 0) return;

            var tasks = new List<Task>();
            foreach (var config in enabledMachines)
            {
                if (ct.IsCancellationRequested) break;
                tasks.Add(Task.Run(() => SimulateMachineAsync(config), ct));
            }

            await Task.WhenAll(tasks);
        }

        private async Task<List<SimulationConfig>> GetEnabledSimulationsAsync(CancellationToken ct)
        {
            var configs = new List<SimulationConfig>();
            try
            {
                using var conn = _dbService.CreateConnection();
                await conn.OpenAsync(ct);

                string sql = @"
                    SELECT sc.machine_id, sc.temperature_min, sc.temperature_max,
                           sc.pressure_min, sc.pressure_max, sc.speed_min, sc.speed_max,
                           sc.production_rate, sc.error_probability,
                           m.status, m.uptime_seconds, m.cpu_percent, m.ram_percent
                    FROM simulation_configs sc
                    JOIN machines m ON m.id = sc.machine_id
                    WHERE sc.enabled = true";

                using var cmd = new NpgsqlCommand(sql, conn);
                using var reader = await cmd.ExecuteReaderAsync(ct);
                while (await reader.ReadAsync(ct))
                {
                    configs.Add(new SimulationConfig
                    {
                        MachineId = reader.GetGuid(0),
                        TemperatureMin = reader.GetDecimal(1),
                        TemperatureMax = reader.GetDecimal(2),
                        PressureMin = reader.GetDecimal(3),
                        PressureMax = reader.GetDecimal(4),
                        SpeedMin = reader.GetDecimal(5),
                        SpeedMax = reader.GetDecimal(6),
                        ProductionRate = reader.GetDecimal(7),
                        ErrorProbability = reader.GetDecimal(8),
                        CurrentStatus = reader.IsDBNull(9) ? "offline" : reader.GetString(9),
                        UptimeSeconds = reader.IsDBNull(10) ? 0L : reader.GetInt64(10),
                        CpuPercent = reader.IsDBNull(11) ? 0.0 : reader.GetDouble(11),
                        RamPercent = reader.IsDBNull(12) ? 0.0 : reader.GetDouble(12)
                    });
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[Simulation] Failed to fetch enabled simulations");
            }

            return configs;
        }

        private async Task SimulateMachineAsync(SimulationConfig config)
        {
            try
            {
                _machineStates.TryGetValue(config.MachineId, out var existing);
                double temperature = GenerateDriftedValue(
                    existing?.Temperature ?? (double)((config.TemperatureMin + config.TemperatureMax) / 2),
                    (double)config.TemperatureMin, (double)config.TemperatureMax);

                double pressure = GenerateValue((double)config.PressureMin, (double)config.PressureMax);
                double speed = GenerateValue((double)config.SpeedMin, (double)config.SpeedMax);
                int productionIncrement = GenerateProductionIncrement((double)config.ProductionRate);
                int currentProductionCount = (existing?.ProductionCount ?? 0) + productionIncrement;

                string newStatus = GenerateStatus((string)config.CurrentStatus, (double)config.ErrorProbability);
                double cpu = GenerateResourceValue(5, 30);
                double ram = GenerateResourceValue(20, 60);
                long newUptime = config.UptimeSeconds + 5;

                var state = new SimulatedMachineState
                {
                    Temperature = temperature,
                    Pressure = pressure,
                    Speed = speed,
                    ProductionCount = currentProductionCount,
                    Status = newStatus,
                    CpuPercent = cpu,
                    RamPercent = ram,
                    UptimeSeconds = newUptime,
                    LastUpdated = DateTime.UtcNow
                };

                _machineStates[config.MachineId] = state;

                await UpdateMachineInDbAsync(config.MachineId, state);
                await UpdateHourlyProductionAsync(config.MachineId, state);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[Simulation] Error simulating machine {MachineId}", config.MachineId);
            }
        }

        private static double GenerateDriftedValue(double previous, double min, double max)
        {
            double drift = (Random.Shared.NextDouble() - 0.5) * (max - min) * 0.15;
            double newVal = previous + drift;
            return Math.Round(Math.Clamp(newVal, min, max), 2);
        }

        private static double GenerateValue(double min, double max)
        {
            return Math.Round(min + Random.Shared.NextDouble() * (max - min), 2);
        }

        private static int GenerateProductionIncrement(double rate)
        {
            if (rate <= 0) return 0;
            return Random.Shared.Next(0, Math.Max(1, (int)Math.Ceiling(rate)));
        }

        private static string GenerateStatus(string currentStatus, double errorProbability)
        {
            double roll = Random.Shared.NextDouble();
            if (roll < errorProbability)
                return "error";

            if (roll < errorProbability * 2)
                return "stopped";

            if (currentStatus == "error" || currentStatus == "stopped" || currentStatus.ToLower() == "offline")
            {
                return roll < 0.6 ? "running" : "idle";
            }

            return currentStatus;
        }

        private static double GenerateResourceValue(double min, double max)
        {
            return Math.Round(min + Random.Shared.NextDouble() * (max - min), 1);
        }

        private async Task UpdateMachineInDbAsync(Guid machineId, SimulatedMachineState state)
        {
            try
            {
                // Calculate OEE and UPH on the fly for the machine based on its speed/status
                double uphVal = state.Status == "running" ? Math.Round(state.Speed * 0.9, 0) : 0;
                double yieldRateVal = state.Status == "running" ? Math.Round(98.0 + (Random.Shared.NextDouble() * 1.8), 2) : 100.0;
                double oeeVal = state.Status == "running" ? Math.Round(75.0 + (Random.Shared.NextDouble() * 18.0), 2) : 0.0;

                var productionObj = new Dictionary<string, object>
                {
                    { "uph", uphVal },
                    { "oee", oeeVal },
                    { "yieldRate", yieldRateVal },
                    { "qty", state.ProductionCount },
                    { "time", 4.5 },
                    { "runtime", state.UptimeSeconds }
                };

                var plcDataObj = new Dictionary<string, object>
                {
                    { "temperature", state.Temperature },
                    { "Temperature", state.Temperature },
                    { "pressure", state.Pressure },
                    { "Pressure", state.Pressure },
                    { "speed", state.Speed },
                    { "Speed", state.Speed },
                    { "productionCount", state.ProductionCount },
                    { "ProductionCount", state.ProductionCount },
                    { "status", state.Status },
                    { "Status", state.Status },
                    { "production", productionObj },
                    { "Production", productionObj }
                };
                string plcDataJson = JsonSerializer.Serialize(plcDataObj);

                string sql = @"
                    UPDATE machines
                    SET status = @status,
                        production_count = @prodCount,
                        cpu_percent = @cpu,
                        ram_percent = @ram,
                        uptime_seconds = @uptime,
                        plc_connected = true,
                        last_plc_data = @lastPlcData,
                        last_heartbeat = NOW()
                    WHERE id = @id";

                using var conn = _dbService.CreateConnection();
                await conn.OpenAsync();
                using (var cmd = new NpgsqlCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("id", machineId);
                    cmd.Parameters.AddWithValue("status", state.Status);
                    cmd.Parameters.AddWithValue("prodCount", state.ProductionCount);
                    cmd.Parameters.AddWithValue("cpu", state.CpuPercent);
                    cmd.Parameters.AddWithValue("ram", state.RamPercent);
                    cmd.Parameters.AddWithValue("uptime", state.UptimeSeconds);
                    cmd.Parameters.AddWithValue("lastPlcData", plcDataJson);
                    await cmd.ExecuteNonQueryAsync();
                }

                string historySql = @"
                    INSERT INTO machine_telemetry_history
                    (machine_id, status, plc_connected, production_count, cycle_time, cpu_percent, ram_percent, uptime_seconds, tags, created_at)
                    VALUES
                    (@mid, @status, true, @prodCount, 5.0, @cpu, @ram, @uptime, '{}'::jsonb, NOW())";
                using (var cmdHist = new NpgsqlCommand(historySql, conn))
                {
                    cmdHist.Parameters.AddWithValue("mid", machineId);
                    cmdHist.Parameters.AddWithValue("status", state.Status);
                    cmdHist.Parameters.AddWithValue("prodCount", state.ProductionCount);
                    cmdHist.Parameters.AddWithValue("cpu", state.CpuPercent);
                    cmdHist.Parameters.AddWithValue("ram", state.RamPercent);
                    cmdHist.Parameters.AddWithValue("uptime", state.UptimeSeconds);
                    await cmdHist.ExecuteNonQueryAsync();
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[Simulation] Failed to update machine {MachineId} in DB", machineId);
            }
        }

        private async Task UpdateHourlyProductionAsync(Guid machineId, SimulatedMachineState state)
        {
            try
            {
                DateTime now = DateTime.UtcNow;
                using var conn = _dbService.CreateConnection();
                await conn.OpenAsync();

                string sql = @"
                    INSERT INTO machine_hourly_production
                    (machine_id, prod_date, prod_hour, produced_qty_start, produced_qty_end, hourly_qty,
                     plc_run_time_start, plc_run_time_end, avg_cpu, avg_ram)
                    VALUES
                    (@machine_id, @prod_date, @prod_hour, @production_count, @production_count, 0,
                     @uptime, @uptime, @avg_cpu, @avg_ram)
                    ON CONFLICT (machine_id, prod_date, prod_hour) DO UPDATE SET
                        produced_qty_end = EXCLUDED.produced_qty_end,
                        hourly_qty = GREATEST(0, EXCLUDED.produced_qty_end - machine_hourly_production.produced_qty_start),
                        plc_run_time_end = EXCLUDED.plc_run_time_end,
                        avg_cpu = EXCLUDED.avg_cpu,
                        avg_ram = EXCLUDED.avg_ram";

                using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("machine_id", machineId);
                cmd.Parameters.AddWithValue("prod_date", now.Date);
                cmd.Parameters.AddWithValue("prod_hour", now.Hour);
                cmd.Parameters.AddWithValue("production_count", state.ProductionCount);
                cmd.Parameters.AddWithValue("uptime", (int)state.UptimeSeconds);
                cmd.Parameters.AddWithValue("avg_cpu", state.CpuPercent);
                cmd.Parameters.AddWithValue("avg_ram", state.RamPercent);
                await cmd.ExecuteNonQueryAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[Simulation] Failed to update hourly production for {MachineId}", machineId);
            }
        }

        public static void ResetState(Guid machineId)
        {
            _machineStates.TryRemove(machineId, out _);
        }
    }

    public class SimulationConfig
    {
        public Guid MachineId { get; set; }
        public decimal TemperatureMin { get; set; }
        public decimal TemperatureMax { get; set; }
        public decimal PressureMin { get; set; }
        public decimal PressureMax { get; set; }
        public decimal SpeedMin { get; set; }
        public decimal SpeedMax { get; set; }
        public decimal ProductionRate { get; set; }
        public decimal ErrorProbability { get; set; }
        public string CurrentStatus { get; set; } = "offline";
        public long UptimeSeconds { get; set; }
        public double CpuPercent { get; set; }
        public double RamPercent { get; set; }
    }

    public class SimulatedMachineState
    {
        public double Temperature { get; set; }
        public double Pressure { get; set; }
        public double Speed { get; set; }
        public int ProductionCount { get; set; }
        public string Status { get; set; } = "offline";
        public double CpuPercent { get; set; }
        public double RamPercent { get; set; }
        public long UptimeSeconds { get; set; }
        public DateTime LastUpdated { get; set; }
    }
}
