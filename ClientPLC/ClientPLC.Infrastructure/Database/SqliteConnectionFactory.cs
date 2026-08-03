using System;
using System.Collections.Generic;
using System.Data.Common;
using System.IO;
using Microsoft.Data.Sqlite;
using PLC.Database;

namespace PLC.Infrastructure.Database;

public class SqliteConnectionFactory : IDatabaseConnectionFactory
{
    private readonly string _dbPath;
    private readonly string _connString;

    public string DbPath => _dbPath;

    public SqliteConnectionFactory()
    {
        string appDataFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ClientPLC");
        if (!Directory.Exists(appDataFolder))
        {
            Directory.CreateDirectory(appDataFolder);
        }
        _dbPath = Path.Combine(appDataFolder, "AE_ClientPLC.db");

        // Migrate from old cplc_telemetry.db in LocalApplicationData if it exists
        string legacyAppDataPath = Path.Combine(appDataFolder, "cplc_telemetry.db");
        if (File.Exists(legacyAppDataPath) && !File.Exists(_dbPath))
        {
            try
            {
                File.Copy(legacyAppDataPath, _dbPath, overwrite: false);
            }
            catch (Exception ex)
            {
                Console.WriteLine("[SqliteConnectionFactory] Legacy LocalAppData DB Migration error: " + ex.Message);
            }
        }

        string oldPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "AE_ClientPLC.db");
        if (File.Exists(oldPath) && !File.Exists(_dbPath))
        {
            try
            {
                File.Copy(oldPath, _dbPath, overwrite: false);
            }
            catch (Exception ex)
            {
                Console.WriteLine("[SqliteConnectionFactory] DB Migration error: " + ex.Message);
            }
        }

        // Also check if legacy base directory db needs migrating
        string oldLegacyPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "cplc_telemetry.db");
        if (File.Exists(oldLegacyPath) && !File.Exists(_dbPath))
        {
            try
            {
                File.Copy(oldLegacyPath, _dbPath, overwrite: false);
            }
            catch (Exception ex)
            {
                Console.WriteLine("[SqliteConnectionFactory] Legacy BaseDirectory DB Migration error: " + ex.Message);
            }
        }

        _connString = "Data Source=" + _dbPath;
        InitializeDatabase();
    }

    public SqliteConnectionFactory(string dbPath)
    {
        if (string.IsNullOrWhiteSpace(dbPath))
        {
            throw new ArgumentException("A database path is required.", nameof(dbPath));
        }

        _dbPath = Path.GetFullPath(dbPath);
        Directory.CreateDirectory(Path.GetDirectoryName(_dbPath)!);
        _connString = "Data Source=" + _dbPath;
        InitializeDatabase();
    }

    public DbConnection CreateConnection()
    {
        var conn = new SqliteConnection(_connString);
        conn.Open();
        return conn;
    }

    private void InitializeDatabase()
    {
        Console.WriteLine("[SqliteConnectionFactory] Opening DB path: " + Path.GetFullPath(_dbPath));
        using var conn = new SqliteConnection(_connString);
        conn.Open();

            string commandText = @"
                    CREATE TABLE IF NOT EXISTS telemetry (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp TEXT NOT NULL,
                        status TEXT,
                        plc_runtime INTEGER,
                        production_qty INTEGER,
                        defect_qty INTEGER,
                        shift_date TEXT,
                        shift_name TEXT
                    );
                    CREATE INDEX IF NOT EXISTS idx_telemetry_shift ON telemetry(shift_date, shift_name);
                    CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry(timestamp);

                    CREATE TABLE IF NOT EXISTS telemetry_records (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        delivery_sequence INTEGER,
                        timestamp TEXT NOT NULL,
                        raw_json TEXT NOT NULL,
                        synced INTEGER DEFAULT 0,
                        shift_date TEXT,
                        shift_name TEXT,
                        production_qty INTEGER DEFAULT 0,
                        defect_qty INTEGER DEFAULT 0,
                        plc_runtime REAL DEFAULT 0
                    );
                    CREATE INDEX IF NOT EXISTS idx_telemetry_records_synced ON telemetry_records(synced);

                    CREATE TABLE IF NOT EXISTS telemetry_delivery_sequence (
                        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
                        next_value INTEGER NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS error_history (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        machine_id TEXT NOT NULL,
                        machine_name TEXT,
                        error_code TEXT NOT NULL,
                        error_name TEXT,
                        address TEXT,
                        severity TEXT,
                        started_at TEXT NOT NULL,
                        ended_at TEXT,
                        duration_seconds INTEGER,
                        status TEXT NOT NULL,
                        trigger_value TEXT,
                        description TEXT,
                        solution TEXT,
                        created_at TEXT NOT NULL,
                        updated_at TEXT
                    );
                    CREATE INDEX IF NOT EXISTS idx_error_history_machine_code ON error_history(machine_id, error_code, status);

                    CREATE TABLE IF NOT EXISTS unit_history (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        serial_number TEXT,
                        start_time TEXT NOT NULL,
                        end_time TEXT,
                        error_count INTEGER DEFAULT 0,
                        is_ng INTEGER DEFAULT 0,
                        cycle_time_seconds REAL,
                        machine_id TEXT NOT NULL,
                        shift_date TEXT,
                        shift_name TEXT,
                        status TEXT,
                        front_robot_count INTEGER,
                        rear_robot_count INTEGER,
                        stud_ng INTEGER DEFAULT 0,
                        spring_screw_ng INTEGER DEFAULT 0
                    );
                    CREATE INDEX IF NOT EXISTS idx_unit_history_shift ON unit_history(shift_date, shift_name);
                    CREATE INDEX IF NOT EXISTS idx_unit_history_time ON unit_history(start_time);
                    CREATE INDEX IF NOT EXISTS idx_unit_history_machine ON unit_history(machine_id);

                    CREATE TABLE IF NOT EXISTS app_config (
                        config_key TEXT PRIMARY KEY,
                        config_value TEXT
                    );

                    CREATE TABLE IF NOT EXISTS mqtt_offline_queue (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        message_id TEXT NOT NULL UNIQUE,
                        topic TEXT NOT NULL,
                        payload TEXT NOT NULL,
                        status TEXT NOT NULL DEFAULT 'PENDING',
                        retry_count INTEGER NOT NULL DEFAULT 0,
                        next_attempt_at TEXT,
                        last_error TEXT,
                        payload_bytes INTEGER NOT NULL DEFAULT 0,
                        created_at TEXT NOT NULL,
                        sequence BIGINT NOT NULL DEFAULT 0
                    );

                    CREATE TABLE IF NOT EXISTS mqtt_offline_queue_audit (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        message_id TEXT NOT NULL,
                        topic TEXT NOT NULL,
                        status TEXT NOT NULL,
                        reason TEXT NOT NULL,
                        detail TEXT,
                        payload_bytes INTEGER NOT NULL,
                        created_at TEXT NOT NULL,
                        audited_at TEXT NOT NULL,
                        blocks_topic INTEGER NOT NULL DEFAULT 0,
                        resolved_at TEXT
                    );

                    CREATE TABLE IF NOT EXISTS mqtt_offline_queue_audit_summary (
                        reason TEXT NOT NULL,
                        status TEXT NOT NULL,
                        event_count INTEGER NOT NULL,
                        payload_bytes INTEGER NOT NULL,
                        first_audited_at TEXT NOT NULL,
                        last_audited_at TEXT NOT NULL,
                        PRIMARY KEY (reason, status)
                    );

                    CREATE TABLE IF NOT EXISTS mqtt_offline_queue_blocker (
                        message_id TEXT PRIMARY KEY,
                        topic TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        resolved_at TEXT,
                        resolution_detail TEXT
                    );
                ";
        using (var cmd = new SqliteCommand(commandText, conn))
        {
            cmd.ExecuteNonQuery();
        }

        MigrateOfflineQueueSchema(conn);
        MigrateTelemetryDeliverySchema(conn);
    }

    private static void MigrateTelemetryDeliverySchema(SqliteConnection connection)
    {
        using var transaction = connection.BeginTransaction();
        var columns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        using (var command = new SqliteCommand("PRAGMA table_info(telemetry_records);", connection, transaction))
        using (var reader = command.ExecuteReader())
        {
            while (reader.Read())
            {
                columns.Add(reader.GetString(1));
            }
        }

        AddColumnIfMissing(
            connection,
            transaction,
            columns,
            "delivery_sequence",
            "INTEGER",
            "telemetry_records");

        const string sql = @"
            UPDATE telemetry_records
            SET delivery_sequence = CASE
                WHEN json_valid(raw_json) = 1
                 AND json_type(raw_json, '$.payload.sequence') = 'integer'
                THEN CAST(json_extract(raw_json, '$.payload.sequence') AS INTEGER)
                ELSE id
            END
            WHERE delivery_sequence IS NULL;
            INSERT OR IGNORE INTO telemetry_delivery_sequence (singleton, next_value)
            SELECT 1, MAX(maximum_value) + 1
            FROM (
                SELECT COALESCE(MAX(id), 0) AS maximum_value FROM telemetry_records
                UNION ALL
                SELECT COALESCE(MAX(delivery_sequence), 0) FROM telemetry_records
            );
            UPDATE telemetry_delivery_sequence
            SET next_value = MAX(
                next_value,
                (SELECT COALESCE(MAX(id), 0) + 1 FROM telemetry_records),
                (SELECT COALESCE(MAX(delivery_sequence), 0) + 1 FROM telemetry_records))
            WHERE singleton = 1;
            CREATE INDEX IF NOT EXISTS idx_telemetry_records_delivery_sequence
                ON telemetry_records(delivery_sequence);";
        using var migration = new SqliteCommand(sql, connection, transaction);
        migration.ExecuteNonQuery();
        transaction.Commit();
    }

    private static void MigrateOfflineQueueSchema(SqliteConnection connection)
    {
        using var transaction = connection.BeginTransaction();
        var columns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        using (var command = new SqliteCommand("PRAGMA table_info(mqtt_offline_queue);", connection, transaction))
        using (var reader = command.ExecuteReader())
        {
            while (reader.Read())
            {
                columns.Add(reader.GetString(1));
            }
        }

        AddColumnIfMissing(connection, transaction, columns, "message_id", "TEXT");
        AddColumnIfMissing(connection, transaction, columns, "status", "TEXT NOT NULL DEFAULT 'PENDING'");
        AddColumnIfMissing(connection, transaction, columns, "retry_count", "INTEGER NOT NULL DEFAULT 0");
        AddColumnIfMissing(connection, transaction, columns, "next_attempt_at", "TEXT");
        AddColumnIfMissing(connection, transaction, columns, "last_error", "TEXT");
        AddColumnIfMissing(connection, transaction, columns, "payload_bytes", "INTEGER NOT NULL DEFAULT 0");
        AddColumnIfMissing(connection, transaction, columns, "sequence", "BIGINT NOT NULL DEFAULT 0");

        var auditColumns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        using (var command = new SqliteCommand("PRAGMA table_info(mqtt_offline_queue_audit);", connection, transaction))
        using (var reader = command.ExecuteReader())
        {
            while (reader.Read())
            {
                auditColumns.Add(reader.GetString(1));
            }
        }
        AddColumnIfMissing(
            connection,
            transaction,
            auditColumns,
            "blocks_topic",
            "INTEGER NOT NULL DEFAULT 0",
            "mqtt_offline_queue_audit");
        AddColumnIfMissing(
            connection,
            transaction,
            auditColumns,
            "resolved_at",
            "TEXT",
            "mqtt_offline_queue_audit");

        const string backfillSql = @"
            UPDATE mqtt_offline_queue AS current
            SET message_id = CASE
                WHEN json_valid(current.payload) = 1
                 AND json_type(current.payload, '$.messageId') = 'text'
                 AND trim(json_extract(current.payload, '$.messageId')) <> ''
                 AND NOT EXISTS (
                    SELECT 1 FROM mqtt_offline_queue AS duplicate
                    WHERE duplicate.id <> current.id
                      AND json_valid(duplicate.payload) = 1
                      AND json_type(duplicate.payload, '$.messageId') = 'text'
                      AND trim(json_extract(duplicate.payload, '$.messageId')) =
                          trim(json_extract(current.payload, '$.messageId'))
                 )
                 AND NOT EXISTS (
                    SELECT 1 FROM mqtt_offline_queue AS conflicting
                    WHERE conflicting.id <> current.id
                      AND conflicting.message_id =
                          trim(json_extract(current.payload, '$.messageId'))
                 )
                THEN trim(json_extract(current.payload, '$.messageId'))
                ELSE 'legacy-' || current.id
            END
            WHERE current.message_id IS NULL
               OR trim(current.message_id) = ''
               OR current.message_id = 'legacy-' || current.id;
            UPDATE mqtt_offline_queue AS current
            SET message_id = 'legacy-' || id
            WHERE EXISTS (
                    SELECT 1
                    FROM mqtt_offline_queue AS earlier
                    WHERE earlier.id < current.id
                      AND earlier.message_id = current.message_id
               );
            UPDATE mqtt_offline_queue
            SET status = 'PENDING'
            WHERE status IS NULL OR status NOT IN ('PENDING', 'AWAITING_ACK', 'RETRY', 'DEAD');
            UPDATE mqtt_offline_queue
            SET retry_count = 0
            WHERE retry_count IS NULL OR retry_count < 0;
            UPDATE mqtt_offline_queue
            SET next_attempt_at = created_at
            WHERE next_attempt_at IS NULL AND status <> 'DEAD';
            UPDATE mqtt_offline_queue
            SET payload_bytes = length(CAST(payload AS BLOB))
            WHERE payload_bytes IS NULL OR payload_bytes <> length(CAST(payload AS BLOB));
            CREATE UNIQUE INDEX IF NOT EXISTS ux_mqtt_offline_queue_message_id
                ON mqtt_offline_queue(message_id);
            CREATE INDEX IF NOT EXISTS ix_mqtt_offline_queue_due_fifo
                ON mqtt_offline_queue(status, next_attempt_at, created_at, id);
            CREATE INDEX IF NOT EXISTS ix_mqtt_offline_queue_created
                ON mqtt_offline_queue(created_at, id);
            CREATE INDEX IF NOT EXISTS ix_mqtt_offline_queue_audit_time
                ON mqtt_offline_queue_audit(audited_at, id);";
        using (var command = new SqliteCommand(backfillSql, connection, transaction))
        {
            command.ExecuteNonQuery();
        }

        transaction.Commit();
    }

    private static void AddColumnIfMissing(
        SqliteConnection connection,
        SqliteTransaction transaction,
        ISet<string> columns,
        string name,
        string definition,
        string tableName = "mqtt_offline_queue")
    {
        if (columns.Contains(name))
        {
            return;
        }

        using var command = new SqliteCommand(
            $"ALTER TABLE {tableName} ADD COLUMN {name} {definition};",
            connection,
            transaction);
        command.ExecuteNonQuery();
        columns.Add(name);
    }
}
