using System;
using System.Collections.Generic;
using System.Diagnostics;
using Microsoft.Data.Sqlite;
using PLC.Database;
using PLC.Service;

namespace PLC.Infrastructure.Database;

public class SqliteTelemetryRepository : ITelemetryRepository
{
    private readonly IDatabaseConnectionFactory _connectionFactory;

    public SqliteTelemetryRepository(IDatabaseConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    public void Insert(string status, int plcRuntime, int productionQty, int defectQty, string shiftDate, string shiftName)
    {
        try
        {
            using var conn = _connectionFactory.CreateConnection();
            string sql = @"
                INSERT INTO telemetry (timestamp, status, plc_runtime, production_qty, defect_qty, shift_date, shift_name)
                VALUES (@timestamp, @status, @plc_runtime, @production_qty, @defect_qty, @shift_date, @shift_name);";
            
            using var cmd = new SqliteCommand(sql, (SqliteConnection)conn);
            cmd.Parameters.AddWithValue("@timestamp", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
            cmd.Parameters.AddWithValue("@status", status);
            cmd.Parameters.AddWithValue("@plc_runtime", plcRuntime);
            cmd.Parameters.AddWithValue("@production_qty", productionQty);
            cmd.Parameters.AddWithValue("@defect_qty", defectQty);
            cmd.Parameters.AddWithValue("@shift_date", shiftDate);
            cmd.Parameters.AddWithValue("@shift_name", shiftName);
            cmd.ExecuteNonQuery();
        }
        catch (Exception ex)
        {
            Debug.WriteLine("[SqliteTelemetryRepository] Insert error: " + ex.Message);
        }
    }

    public Dictionary<string, object> GetLatest()
    {
        var row = new Dictionary<string, object>();
        try
        {
            using var conn = _connectionFactory.CreateConnection();
            string sql = "SELECT id, timestamp, status, plc_runtime, production_qty, defect_qty, shift_date, shift_name FROM telemetry ORDER BY id DESC LIMIT 1;";
            using var cmd = new SqliteCommand(sql, (SqliteConnection)conn);
            using var reader = cmd.ExecuteReader();
            if (reader.Read())
            {
                row["id"] = reader.GetInt64(0);
                row["timestamp"] = reader.GetString(1);
                row["status"] = reader.GetString(2);
                row["plc_runtime"] = reader.GetInt32(3);
                row["production_qty"] = reader.GetInt32(4);
                row["defect_qty"] = reader.GetInt32(5);
                row["shift_date"] = reader.GetString(6);
                row["shift_name"] = reader.GetString(7);
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine("[SqliteTelemetryRepository] GetLatest error: " + ex.Message);
        }
        return row;
    }

    public List<TelemetryRecord> GetShiftRecords(string shiftDate, string shiftName)
    {
        var list = new List<TelemetryRecord>();
        try
        {
            using var conn = _connectionFactory.CreateConnection();
            string sql = @"
                SELECT id, timestamp, status, plc_runtime, production_qty, defect_qty 
                FROM telemetry 
                WHERE shift_date = @shift_date AND shift_name = @shift_name 
                ORDER BY timestamp ASC;";
            
            using var cmd = new SqliteCommand(sql, (SqliteConnection)conn);
            cmd.Parameters.AddWithValue("@shift_date", shiftDate);
            cmd.Parameters.AddWithValue("@shift_name", shiftName);
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                list.Add(new TelemetryRecord
                {
                    Id = reader.GetInt64(0),
                    Timestamp = DateTime.Parse(reader.GetString(1)),
                    Status = reader.GetString(2),
                    PlcRuntime = reader.GetInt32(3),
                    ProductionQty = reader.GetInt32(4),
                    DefectQty = reader.GetInt32(5)
                });
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine("[SqliteTelemetryRepository] GetShiftRecords error: " + ex.Message);
        }
        return list;
    }

    public List<(string ShiftDate, string ShiftName)> GetRecentShifts(int days)
    {
        var list = new List<(string, string)>();
        try
        {
            using var conn = _connectionFactory.CreateConnection();
            string sql = @"
                SELECT DISTINCT shift_date, shift_name 
                FROM telemetry 
                WHERE timestamp >= datetime('now', @daysParam) 
                ORDER BY shift_date DESC, shift_name DESC;";
            
            using var cmd = new SqliteCommand(sql, (SqliteConnection)conn);
            cmd.Parameters.AddWithValue("@daysParam", $"-{days} days");
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                list.Add((reader.GetString(0), reader.GetString(1)));
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine("[SqliteTelemetryRepository] GetRecentShifts error: " + ex.Message);
        }
        return list;
    }
}
