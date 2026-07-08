using System;
using System.Collections.Generic;
using System.Data.Common;
using System.Diagnostics;
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

    public DbConnection CreateConnection()
    {
        var conn = new SqliteConnection(_connString);
        conn.Open();
        return conn;
    }

    private void InitializeDatabase()
    {
        try
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
                        topic TEXT NOT NULL,
                        payload TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        sequence BIGINT NOT NULL DEFAULT 0
                    );
                ";
            using (var cmd = new SqliteCommand(commandText, conn))
            {
                cmd.ExecuteNonQuery();
            }

            try
            {
                using (var cmd = new SqliteCommand("PRAGMA table_info(mqtt_offline_queue);", conn))
                using (var rdr = cmd.ExecuteReader())
                {
                    bool hasSeq = false;
                    while (rdr.Read())
                    {
                        if (rdr.GetString(1).ToLower() == "sequence")
                        {
                            hasSeq = true;
                            break;
                        }
                    }
                    if (!hasSeq)
                    {
                        using (var cmdAlter = new SqliteCommand("ALTER TABLE mqtt_offline_queue ADD COLUMN sequence BIGINT NOT NULL DEFAULT 0;", conn))
                        {
                            cmdAlter.ExecuteNonQuery();
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine("[SqliteConnectionFactory] Migration error: " + ex.Message);
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine("[SqliteConnectionFactory] DB Init error: " + ex.Message);
        }
    }
}
