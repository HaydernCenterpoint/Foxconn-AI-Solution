using System;
using System.Data;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Npgsql;

namespace backend.Services
{
    public class DatabaseService
    {
        private readonly string _connectionString;
        private readonly bool _isDevelopment;

        public DatabaseService(IConfiguration configuration, IHostEnvironment environment)
        {
            _connectionString = configuration.GetConnectionString("DefaultConnection")
                ?? throw new ArgumentNullException("ConnectionStrings:DefaultConnection is missing in configuration.");
            _isDevelopment = environment.IsDevelopment();

            // Initialize database schema and seed data synchronously during startup
            InitializeDatabase();
        }

        public NpgsqlConnection CreateConnection()
        {
            return new NpgsqlConnection(_connectionString);
        }

        private void InitializeDatabase()
        {
            try
            {
                using var conn = CreateConnection();
                conn.Open();

                // ─── 1. production_lines ────────────────────────────────────────────────
                ExecuteSync(conn, @"
                    CREATE TABLE IF NOT EXISTS production_lines (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        name VARCHAR(100) NOT NULL,
                        description TEXT,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );");

                // ─── 2. machines ────────────────────────────────────────────────────────
                ExecuteSync(conn, @"
                    CREATE TABLE IF NOT EXISTS machines (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        name VARCHAR(100) NOT NULL,
                        ip VARCHAR(50),
                        status VARCHAR(50) DEFAULT 'offline',
                        plc_connected BOOLEAN DEFAULT FALSE,
                        last_plc_data TEXT,
                        client_id VARCHAR(100) UNIQUE,
                        approval_status VARCHAR(20) NOT NULL DEFAULT 'APPROVED',
                        cpu_percent DOUBLE PRECISION DEFAULT 0,
                        ram_percent DOUBLE PRECISION DEFAULT 0,
                        uptime_seconds BIGINT DEFAULT 0,
                        last_heartbeat TIMESTAMP WITH TIME ZONE,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );");

                // Add missing columns to machines (migration for existing tables)
                ExecuteSync(conn, @"
                    DO $$
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='machines' AND column_name='client_id'
                        ) THEN
                            ALTER TABLE machines ADD COLUMN client_id VARCHAR(100);
                        END IF;
                        IF NOT EXISTS (
                            SELECT 1 FROM pg_constraint WHERE conname = 'unique_client_id'
                        ) THEN
                            ALTER TABLE machines ADD CONSTRAINT unique_client_id UNIQUE (client_id);
                        END IF;
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='machines' AND column_name='plc_connected'
                        ) THEN
                            ALTER TABLE machines ADD COLUMN plc_connected BOOLEAN DEFAULT FALSE;
                        END IF;
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='machines' AND column_name='machine_code'
                        ) THEN
                            ALTER TABLE machines ADD COLUMN machine_code VARCHAR(50);
                        END IF;
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='machines' AND column_name='approval_status'
                        ) THEN
                            ALTER TABLE machines ADD COLUMN approval_status VARCHAR(20) NOT NULL DEFAULT 'APPROVED';
                        END IF;
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='machines' AND column_name='cpu_percent'
                        ) THEN
                            ALTER TABLE machines ADD COLUMN cpu_percent DOUBLE PRECISION DEFAULT 0;
                        END IF;
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='machines' AND column_name='ram_percent'
                        ) THEN
                            ALTER TABLE machines ADD COLUMN ram_percent DOUBLE PRECISION DEFAULT 0;
                        END IF;
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='machines' AND column_name='uptime_seconds'
                        ) THEN
                            ALTER TABLE machines ADD COLUMN uptime_seconds BIGINT DEFAULT 0;
                        END IF;
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='machines' AND column_name='last_heartbeat'
                        ) THEN
                            ALTER TABLE machines ADD COLUMN last_heartbeat TIMESTAMP WITH TIME ZONE;
                        END IF;
                    END
                    $$;");

                // ─── 3. line_machines ───────────────────────────────────────────────────
                ExecuteSync(conn, @"
                    CREATE TABLE IF NOT EXISTS line_machines (
                        line_id UUID REFERENCES production_lines(id) ON DELETE CASCADE,
                        machine_id UUID REFERENCES machines(id) ON DELETE CASCADE,
                        sequence_order INT NOT NULL,
                        PRIMARY KEY (line_id, machine_id)
                    );");

                // ─── 4. machine_hourly_production ───────────────────────────────────────
                ExecuteSync(conn, @"
                    CREATE TABLE IF NOT EXISTS machine_hourly_production (
                        id BIGSERIAL PRIMARY KEY,
                        machine_id UUID REFERENCES machines(id) ON DELETE CASCADE,
                        prod_date DATE NOT NULL,
                        prod_hour INT NOT NULL,
                        produced_qty_start INT NOT NULL DEFAULT 0,
                        produced_qty_end INT NOT NULL DEFAULT 0,
                        hourly_qty INT NOT NULL DEFAULT 0,
                        plc_run_time_start INT NOT NULL DEFAULT 0,
                        plc_run_time_end INT NOT NULL DEFAULT 0,
                        avg_cpu REAL,
                        avg_ram REAL,
                        last_raw_qty INT NOT NULL DEFAULT 0,
                        oee_availability REAL DEFAULT 0,
                        received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        CONSTRAINT unique_machine_hour UNIQUE (machine_id, prod_date, prod_hour)
                    );");

                // Migration: add new columns if not present (idempotent)
                ExecuteSync(conn, @"
                    DO $$
                    BEGIN
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                                       WHERE table_name='machine_hourly_production' AND column_name='last_raw_qty') THEN
                            ALTER TABLE machine_hourly_production ADD COLUMN last_raw_qty INT NOT NULL DEFAULT 0;
                        END IF;
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                                       WHERE table_name='machine_hourly_production' AND column_name='oee_availability') THEN
                            ALTER TABLE machine_hourly_production ADD COLUMN oee_availability REAL DEFAULT 0;
                        END IF;
                    END
                    $$;");;

                // ─── 5. users ───────────────────────────────────────────────────────────
                ExecuteSync(conn, @"
                    CREATE TABLE IF NOT EXISTS users (
                        id SERIAL PRIMARY KEY,
                        username VARCHAR(50) UNIQUE NOT NULL,
                        password VARCHAR(100) NOT NULL,
                        role VARCHAR(20) NOT NULL DEFAULT 'GUEST'
                    );");

                // ─── 6. audit_logs ──────────────────────────────────────────────────────
                ExecuteSync(conn, @"
                    CREATE TABLE IF NOT EXISTS audit_logs (
                        id SERIAL PRIMARY KEY,
                        username VARCHAR(100) NOT NULL,
                        action VARCHAR(100) NOT NULL,
                        details TEXT,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );");

                // ─── 7. plc_clients ─────────────────────────────────────────────────────
                ExecuteSync(conn, @"
                    CREATE TABLE IF NOT EXISTS plc_clients (
                        id BIGSERIAL PRIMARY KEY,
                        client_id VARCHAR(100) UNIQUE NOT NULL,
                        name VARCHAR(200),
                        ip_address VARCHAR(50),
                        status VARCHAR(20) NOT NULL DEFAULT 'OFFLINE',
                        approval_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
                        machine_id UUID REFERENCES machines(id) ON DELETE SET NULL,
                        cpu_percent DOUBLE PRECISION DEFAULT 0,
                        ram_percent DOUBLE PRECISION DEFAULT 0,
                        uptime_seconds BIGINT DEFAULT 0,
                        last_heartbeat TIMESTAMP WITH TIME ZONE,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );");

                // Migrate existing plc_clients rows (add approval_status, machine_id if missing)
                ExecuteSync(conn, @"
                    DO $$
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='plc_clients' AND column_name='approval_status'
                        ) THEN
                            ALTER TABLE plc_clients ADD COLUMN approval_status VARCHAR(20) NOT NULL DEFAULT 'PENDING';
                        END IF;
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='plc_clients' AND column_name='machine_id'
                        ) THEN
                            ALTER TABLE plc_clients ADD COLUMN machine_id UUID REFERENCES machines(id) ON DELETE SET NULL;
                        END IF;
                    END
                    $$;");

                // ─── 8. alarms ──────────────────────────────────────────────────────────
                ExecuteSync(conn, @"
                    CREATE TABLE IF NOT EXISTS alarms (
                        id BIGSERIAL PRIMARY KEY,
                        machine_id UUID REFERENCES machines(id) ON DELETE CASCADE,
                        severity VARCHAR(20) NOT NULL DEFAULT 'LOW',
                        message TEXT NOT NULL,
                        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
                        acknowledged_by VARCHAR(100),
                        acknowledged_at TIMESTAMP WITH TIME ZONE,
                        resolved_at TIMESTAMP WITH TIME ZONE,
                        notes TEXT,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );");

                // ─── 9. simulation_configs ───────────────────────────────────────────────
                ExecuteSync(conn, @"
                    CREATE TABLE IF NOT EXISTS simulation_configs (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        machine_id UUID UNIQUE NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
                        enabled BOOLEAN NOT NULL DEFAULT false,
                        temperature_min DECIMAL(5,2) DEFAULT 20.0,
                        temperature_max DECIMAL(5,2) DEFAULT 80.0,
                        pressure_min DECIMAL(6,2) DEFAULT 1.0,
                        pressure_max DECIMAL(6,2) DEFAULT 10.0,
                        speed_min DECIMAL(6,2) DEFAULT 0.0,
                        speed_max DECIMAL(6,2) DEFAULT 100.0,
                        production_rate DECIMAL(8,2) DEFAULT 10.0,
                        error_probability DECIMAL(3,2) DEFAULT 0.02,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );");

                // ─── 10. machine_telemetry_history ──────────────────────────────────────
                ExecuteSync(conn, @"
                    CREATE TABLE IF NOT EXISTS machine_telemetry_history (
                        id BIGSERIAL PRIMARY KEY,
                        machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
                        status VARCHAR(50),
                        plc_connected BOOLEAN,
                        production_count INT,
                        cycle_time REAL,
                        cpu_percent REAL,
                        ram_percent REAL,
                        uptime_seconds BIGINT,
                        tags JSONB,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );");

                ExecuteSync(conn, @"
                    CREATE INDEX IF NOT EXISTS idx_telemetry_hist_machine_time 
                    ON machine_telemetry_history(machine_id, created_at DESC);");

                // ─── 11. machine_telemetry ───────────────────────────────────────────────
                ExecuteSync(conn, @"
                    CREATE TABLE IF NOT EXISTS machine_telemetry (
                        id BIGSERIAL PRIMARY KEY,
                        machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
                        raw_json JSONB NOT NULL,
                        sequence BIGINT NOT NULL DEFAULT 0,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );");

                ExecuteSync(conn, @"
                    CREATE INDEX IF NOT EXISTS idx_machine_telemetry_machine_seq 
                    ON machine_telemetry(machine_id, sequence DESC);");


                // ─── 12. Seed default users ──────────────────────────────────────────────
                long count = 0;
                using (var cmd = new NpgsqlCommand("SELECT COUNT(*) FROM users", conn))
                {
                    count = (long)(cmd.ExecuteScalar() ?? 0L);
                }

                if (count == 0)
                {
                    using var cmdInsert = new NpgsqlCommand(@"
                        INSERT INTO users (username, password, role) VALUES
                        (@adminUser, @adminPass, 'ADMIN'),
                        (@engUser,   @engPass,   'ENGINEER'),
                        (@guestUser, @guestPass, 'GUEST')", conn);

                    cmdInsert.Parameters.AddWithValue("adminUser",  "admin");
                    cmdInsert.Parameters.AddWithValue("adminPass",  Security.PasswordHasher.HashPassword("admin123"));
                    cmdInsert.Parameters.AddWithValue("engUser",    "engineer");
                    cmdInsert.Parameters.AddWithValue("engPass",    Security.PasswordHasher.HashPassword("engineer123"));
                    cmdInsert.Parameters.AddWithValue("guestUser",  "guest");
                    cmdInsert.Parameters.AddWithValue("guestPass",  Security.PasswordHasher.HashPassword("guest123"));
                    cmdInsert.ExecuteNonQuery();
                }

                using (var cmdAiUser = new NpgsqlCommand(@"
                    INSERT INTO users (username, password, role)
                    VALUES (@aiUser, @aiPass, 'GUEST')
                    ON CONFLICT (username) DO NOTHING;", conn))
                {
                    cmdAiUser.Parameters.AddWithValue("aiUser", "ai_service");
                    cmdAiUser.Parameters.AddWithValue("aiPass", Security.PasswordHasher.HashPassword(
                        Environment.GetEnvironmentVariable("AI_SERVICE_PASSWORD") ?? "change-me-ai-service-password"));
                    cmdAiUser.ExecuteNonQuery();
                }

                // Auto-create simulation configs for machines and enable them by default
                string seedSimConfigsSql = @"
                    INSERT INTO simulation_configs (machine_id, enabled, temperature_min, temperature_max, pressure_min, pressure_max, speed_min, speed_max, production_rate, error_probability)
                    SELECT id, true, 20.0, 80.0, 1.0, 10.0, 0.0, 100.0, 15.0, 0.02
                    FROM machines
                    ON CONFLICT (machine_id) DO NOTHING;";
                ExecuteSync(conn, seedSimConfigsSql);

                if (_isDevelopment)
                {
                    ExecuteSync(conn, "TRUNCATE machine_telemetry_history, machine_hourly_production, alarms CASCADE;");
                    ExecuteSync(conn, "UPDATE machines SET status = 'OFFLINE', plc_connected = false, production_count = 0, last_plc_data = NULL, uptime_seconds = 0, cpu_percent = 0.0, ram_percent = 0.0;");
                    ExecuteSync(conn, @"
                        INSERT INTO alarms (machine_id, severity, message, status, created_at)
                        SELECT id, 'HIGH', 'Nhiệt độ vượt ngưỡng an toàn', 'ACTIVE', NOW()
                        FROM machines
                        WHERE approval_status = 'APPROVED'
                        ORDER BY created_at, id
                        LIMIT 1;");
                }

                Console.WriteLine("[DB] Database initialized successfully.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DB] Initialization failed: {ex.Message}");
            }
        }

        private static void ExecuteSync(NpgsqlConnection conn, string sql)
        {
            using var cmd = new NpgsqlCommand(sql, conn);
            cmd.ExecuteNonQuery();
        }

        public async Task ExecuteNonQueryAsync(string sql, Action<NpgsqlParameterCollection>? parameterBinder = null)
        {
            using var conn = CreateConnection();
            await conn.OpenAsync();
            using var cmd = new NpgsqlCommand(sql, conn);
            parameterBinder?.Invoke(cmd.Parameters);
            await cmd.ExecuteNonQueryAsync();
        }

        public async Task<T?> ExecuteScalarAsync<T>(string sql, Action<NpgsqlParameterCollection>? parameterBinder = null)
        {
            using var conn = CreateConnection();
            await conn.OpenAsync();
            using var cmd = new NpgsqlCommand(sql, conn);
            parameterBinder?.Invoke(cmd.Parameters);
            var result = await cmd.ExecuteScalarAsync();
            if (result == null || result == DBNull.Value) return default;
            return (T)result;
        }

        /// <summary>
        /// Upsert a PLC client record directly as a machine based on the clientId reported from the TCP socket.
        /// </summary>
        public async Task UpsertPlcClientAsync(string clientId, string? name, string? machineCode, string? ipAddress, double cpu, double ram, long uptimeSeconds)
        {
            try
            {
                Guid candidateMachineId = Guid.TryParse(clientId, out var parsedGuid) ? parsedGuid : Guid.NewGuid();

                // On first insert: approval_status = 'PENDING' (admin must approve)
                // On conflict: do NOT overwrite approval_status - keep whatever admin set.
                // Resolve an existing machine by either its primary key or client_id so a GUID client can
                // reconnect to a seeded machine without colliding with the primary key.
                // Overwrite name/machine_code if they are null, empty, or currently equal to the client_id (raw GUID).
                string sql = @"
                    WITH target_machine AS (
                        SELECT id
                        FROM machines
                        WHERE id = @id OR client_id = @clientId
                        ORDER BY CASE WHEN client_id = @clientId THEN 0 ELSE 1 END
                        LIMIT 1
                    )
                    INSERT INTO machines (id, client_id, name, machine_code, ip, status, approval_status, cpu_percent, ram_percent, uptime_seconds, last_heartbeat)
                    VALUES (COALESCE((SELECT id FROM target_machine), @id), @clientId, @name, @machineCode, @ip, 'offline', 'PENDING', @cpu, @ram, @uptime, NOW())
                    ON CONFLICT (id) DO UPDATE SET
                        client_id = EXCLUDED.client_id,
                        name = CASE 
                            WHEN machines.name IS NULL OR machines.name = '' OR machines.name = machines.client_id THEN EXCLUDED.name 
                            ELSE machines.name 
                        END,
                        machine_code = CASE 
                            WHEN machines.machine_code IS NULL OR machines.machine_code = '' OR machines.machine_code = machines.client_id THEN EXCLUDED.machine_code 
                            ELSE machines.machine_code 
                        END,
                        ip = EXCLUDED.ip,
                        status = machines.status,
                        cpu_percent = CASE WHEN EXCLUDED.cpu_percent > 0 THEN EXCLUDED.cpu_percent ELSE machines.cpu_percent END,
                        ram_percent = CASE WHEN EXCLUDED.ram_percent > 0 THEN EXCLUDED.ram_percent ELSE machines.ram_percent END,
                        uptime_seconds = CASE WHEN EXCLUDED.uptime_seconds > 0 THEN EXCLUDED.uptime_seconds ELSE machines.uptime_seconds END,
                        last_heartbeat = NOW()";

                await ExecuteNonQueryAsync(sql, p =>
                {
                    p.AddWithValue("id", candidateMachineId);
                    p.AddWithValue("clientId", clientId);
                    p.AddWithValue("name", (object?)(name) ?? (clientId.Length >= 8 ? $"Machine {clientId[..8]}" : "Machine"));
                    p.AddWithValue("machineCode", (object?)(machineCode) ?? DBNull.Value);
                    p.AddWithValue("ip", (object?)(ipAddress) ?? DBNull.Value);
                    p.AddWithValue("cpu", cpu);
                    p.AddWithValue("ram", ram);
                    p.AddWithValue("uptime", uptimeSeconds);
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DB] UpsertPlcClientAsync failed: {ex.Message}");
            }
        }
        /// <summary>
        /// Kiểm tra xem PLC Client (Máy) có được Admin duyệt hay không.
        /// </summary>
        public async Task<bool> IsClientApprovedAsync(string clientId)
        {
            if (string.IsNullOrEmpty(clientId)) return false;
            try
            {
                var result = await ExecuteScalarAsync<string>(
                    "SELECT approval_status FROM machines WHERE client_id = @cid",
                    p => p.AddWithValue("cid", clientId));
                return result == "APPROVED";
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Saves telemetry details to the historical table in an optimized way.
        /// </summary>
        public async Task SaveTelemetryHistoryAsync(
            Guid machineId, string status, bool plcConnected, int productionCount, double cycleTime,
            double cpu, double ram, long uptime, string tagsJson)
        {
            try
            {
                // We optimize storage by not writing duplicate consecutive heartbeats with identical status and count.
                // We only write if status/count changes, or if the last record is older than 5 minutes.
                const string checkLastSql = @"
                    SELECT status, production_count, created_at 
                    FROM machine_telemetry_history 
                    WHERE machine_id = @mid 
                    ORDER BY created_at DESC LIMIT 1";

                bool shouldInsert = true;
                using (var conn = CreateConnection())
                {
                    await conn.OpenAsync();
                    using var cmd = new NpgsqlCommand(checkLastSql, conn);
                    cmd.Parameters.AddWithValue("mid", machineId);
                    using var reader = await cmd.ExecuteReaderAsync();
                    if (await reader.ReadAsync())
                    {
                        string lastStatus = reader.GetString(0);
                        int lastCount = reader.GetInt32(1);
                        DateTime lastTime = reader.GetDateTime(2);

                        if (lastStatus == status && lastCount == productionCount && (DateTime.UtcNow - lastTime).TotalMinutes < 5.0)
                        {
                            shouldInsert = false; // Skip redundant write
                        }
                    }
                }

                if (!shouldInsert) return;

                const string insertSql = @"
                    INSERT INTO machine_telemetry_history 
                    (machine_id, status, plc_connected, production_count, cycle_time, cpu_percent, ram_percent, uptime_seconds, tags)
                    VALUES 
                    (@mid, @status, @plcConn, @prodCount, @cycleTime, @cpu, @ram, @uptime, CAST(@tags AS jsonb))";

                await ExecuteNonQueryAsync(insertSql, p =>
                {
                    p.AddWithValue("mid", machineId);
                    p.AddWithValue("status", status);
                    p.AddWithValue("plcConn", plcConnected);
                    p.AddWithValue("prodCount", productionCount);
                    p.AddWithValue("cycleTime", cycleTime);
                    p.AddWithValue("cpu", cpu);
                    p.AddWithValue("ram", ram);
                    p.AddWithValue("uptime", uptime);
                    p.AddWithValue("tags", tagsJson);
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DB] SaveTelemetryHistoryAsync failed: {ex.Message}");
            }
        }

        public async Task InsertRawTelemetryAsync(string machineId, string rawJson, long sequence = 0, DateTime? createdAt = null)
        {
            if (!Guid.TryParse(machineId, out var machineGuid)) return;
            try
            {
                const string sql = @"
                    INSERT INTO machine_telemetry (machine_id, raw_json, sequence, created_at)
                    VALUES (@mid, CAST(@raw AS jsonb), @seq, @created)";
                
                await ExecuteNonQueryAsync(sql, p =>
                {
                    p.AddWithValue("mid", machineGuid);
                    p.AddWithValue("raw", rawJson);
                    p.AddWithValue("seq", sequence);
                    p.AddWithValue("created", createdAt ?? DateTime.UtcNow);
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DB] InsertRawTelemetryAsync failed: {ex.Message}");
            }
        }

        public async Task<long> GetMaxSequenceAsync(string machineId)
        {
            if (!Guid.TryParse(machineId, out var machineGuid)) return 0;
            try
            {
                const string sql = "SELECT COALESCE(MAX(sequence), 0) FROM machine_telemetry WHERE machine_id = @mid";
                using var conn = CreateConnection();
                await conn.OpenAsync();
                using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("mid", machineGuid);
                var val = await cmd.ExecuteScalarAsync();
                return val != null && val != DBNull.Value ? Convert.ToInt64(val) : 0L;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DB] GetMaxSequenceAsync failed: {ex.Message}");
                return 0;
            }
        }

        /// <summary>
        /// Cleans up old telemetry records from the database.
        /// </summary>
        public async Task PruneTelemetryHistoryAsync(int retentionDays = 30)
        {
            try
            {
                string sql = "DELETE FROM machine_telemetry_history WHERE created_at < NOW() - INTERVAL '1 day' * @days";
                await ExecuteNonQueryAsync(sql, p => p.AddWithValue("days", retentionDays));
                Console.WriteLine($"[DB] Telemetry history pruned (records older than {retentionDays} days deleted).");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DB] PruneTelemetryHistoryAsync failed: {ex.Message}");
            }
        }

        public async Task UpdateHourlyProductionAsync(Guid machineId, int productionCount, double cpuPercent, double ramPercent, long uptimeSeconds)
        {
            try
            {
                DateTime now = DateTime.UtcNow;
                DateTime prodDate = now.Date;
                int prodHour = now.Hour;

                using var conn = CreateConnection();
                await conn.OpenAsync();

                string checkSql = @"
                    SELECT id, produced_qty_start, produced_qty_end, avg_cpu, avg_ram
                    FROM machine_hourly_production
                    WHERE machine_id = @machine_id AND prod_date = @prod_date AND prod_hour = @prod_hour";

                long existingId = -1;
                int startQty = 0;

                using (var cmd = new NpgsqlCommand(checkSql, conn))
                {
                    cmd.Parameters.AddWithValue("machine_id", machineId);
                    cmd.Parameters.AddWithValue("prod_date", prodDate);
                    cmd.Parameters.AddWithValue("prod_hour", prodHour);
                    using var reader = await cmd.ExecuteReaderAsync();
                    if (await reader.ReadAsync())
                    {
                        existingId = reader.GetInt64(0);
                        startQty = reader.GetInt32(1);
                    }
                }

                if (existingId == -1)
                {
                    try
                    {
                        string insertSql = @"
                            INSERT INTO machine_hourly_production
                            (machine_id, prod_date, prod_hour, produced_qty_start, produced_qty_end, hourly_qty, plc_run_time_start, plc_run_time_end, avg_cpu, avg_ram)
                            VALUES (@machine_id, @prod_date, @prod_hour, @produced_qty_start, @produced_qty_end, 0, 0, 0, @avg_cpu, @avg_ram)";

                        using var cmdInsert = new NpgsqlCommand(insertSql, conn);
                        cmdInsert.Parameters.AddWithValue("machine_id", machineId);
                        cmdInsert.Parameters.AddWithValue("prod_date", prodDate);
                        cmdInsert.Parameters.AddWithValue("prod_hour", prodHour);
                        cmdInsert.Parameters.AddWithValue("produced_qty_start", productionCount);
                        cmdInsert.Parameters.AddWithValue("produced_qty_end", productionCount);
                        cmdInsert.Parameters.AddWithValue("avg_cpu", cpuPercent);
                        cmdInsert.Parameters.AddWithValue("avg_ram", ramPercent);
                        await cmdInsert.ExecuteNonQueryAsync();
                    }
                    catch (PostgresException pgex) when (pgex.SqlState == "23505")
                    {
                        // Fallback if another thread inserted it between the check and insert
                        string getSql = @"
                            SELECT id, produced_qty_start
                            FROM machine_hourly_production
                            WHERE machine_id = @machine_id AND prod_date = @prod_date AND prod_hour = @prod_hour";
                        using var cmdGet = new NpgsqlCommand(getSql, conn);
                        cmdGet.Parameters.AddWithValue("machine_id", machineId);
                        cmdGet.Parameters.AddWithValue("prod_date", prodDate);
                        cmdGet.Parameters.AddWithValue("prod_hour", prodHour);
                        using var reader = await cmdGet.ExecuteReaderAsync();
                        if (await reader.ReadAsync())
                        {
                            existingId = reader.GetInt64(0);
                            startQty = reader.GetInt32(1);
                        }
                    }
                }

                if (existingId != -1)
                {
                    string updateSql = @"
                        UPDATE machine_hourly_production
                        SET produced_qty_end = @produced_qty_end,
                            hourly_qty = @hourly_qty,
                            plc_run_time_end = @plc_run_time_end,
                            avg_cpu = @avg_cpu,
                            avg_ram = @avg_ram
                        WHERE id = @id";

                    using var cmdUpdate = new NpgsqlCommand(updateSql, conn);
                    cmdUpdate.Parameters.AddWithValue("produced_qty_end", productionCount);
                    cmdUpdate.Parameters.AddWithValue("hourly_qty", Math.Max(0, productionCount - startQty));
                    cmdUpdate.Parameters.AddWithValue("plc_run_time_end", (int)uptimeSeconds);
                    cmdUpdate.Parameters.AddWithValue("avg_cpu", cpuPercent);
                    cmdUpdate.Parameters.AddWithValue("avg_ram", ramPercent);
                    cmdUpdate.Parameters.AddWithValue("id", existingId);
                    await cmdUpdate.ExecuteNonQueryAsync();
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DB] UpdateHourlyProductionAsync failed: {ex.Message}");
            }
        }
    }
}
