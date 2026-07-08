using System;
using System.Collections.Generic;
using System.Diagnostics;
using Microsoft.Data.Sqlite;
using PLC.Database;
using PLC.Model;

namespace PLC.Infrastructure.Database;

public class SqliteUnitHistoryRepository : IUnitHistoryRepository
{
    private readonly IDatabaseConnectionFactory _connectionFactory;

    public SqliteUnitHistoryRepository(IDatabaseConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    public void Insert(UnitRecord unit)
    {
        try
        {
            using var conn = _connectionFactory.CreateConnection();
            string query = @"
                INSERT INTO unit_history (serial_number, start_time, end_time, error_count, is_ng, cycle_time_seconds, machine_id, shift_date, shift_name, status, front_robot_count, rear_robot_count, stud_ng, spring_screw_ng)
                VALUES (@serial_number, @start_time, @end_time, @error_count, @is_ng, @cycle_time_seconds, @machine_id, @shift_date, @shift_name, @status, @front_robot_count, @rear_robot_count, @stud_ng, @spring_screw_ng);";

            using var cmd = new SqliteCommand(query, (SqliteConnection)conn);
            cmd.Parameters.AddWithValue("@serial_number", unit.SerialNumber ?? (object)DBNull.Value);
            cmd.Parameters.AddWithValue("@start_time", unit.StartTime.ToString("yyyy-MM-dd HH:mm:ss"));
            cmd.Parameters.AddWithValue("@end_time", unit.EndTime?.ToString("yyyy-MM-dd HH:mm:ss") ?? (object)DBNull.Value);
            cmd.Parameters.AddWithValue("@error_count", unit.ErrorCount);
            cmd.Parameters.AddWithValue("@is_ng", unit.IsNG ? 1 : 0);
            cmd.Parameters.AddWithValue("@cycle_time_seconds", unit.CycleTimeSeconds);
            cmd.Parameters.AddWithValue("@machine_id", unit.MachineId);
            cmd.Parameters.AddWithValue("@shift_date", unit.ShiftDate ?? (object)DBNull.Value);
            cmd.Parameters.AddWithValue("@shift_name", unit.ShiftName ?? (object)DBNull.Value);
            cmd.Parameters.AddWithValue("@status", unit.Status);
            cmd.Parameters.AddWithValue("@front_robot_count", unit.FrontRobotCount ?? (object)DBNull.Value);
            cmd.Parameters.AddWithValue("@rear_robot_count", unit.RearRobotCount ?? (object)DBNull.Value);
            cmd.Parameters.AddWithValue("@stud_ng", unit.HasQualityFail ? 1 : 0);
            cmd.Parameters.AddWithValue("@spring_screw_ng", unit.HasQualityFail ? 1 : 0);
            cmd.ExecuteNonQuery();
        }
        catch (Exception ex)
        {
            Debug.WriteLine("[SqliteUnitHistoryRepository] Insert error: " + ex.Message);
        }
    }

    public List<UnitRecord> GetHistory(string machineId, string status, DateTime? fromDate, DateTime? toDate, int limit)
    {
        var list = new List<UnitRecord>();
        try
        {
            using var conn = _connectionFactory.CreateConnection();
            string query = "SELECT id, serial_number, start_time, end_time, error_count, is_ng, cycle_time_seconds, machine_id, shift_date, shift_name, status, front_robot_count, rear_robot_count, stud_ng, spring_screw_ng FROM unit_history WHERE 1=1";

            if (!string.IsNullOrEmpty(machineId))
                query += " AND machine_id = @machine_id";
            if (!string.IsNullOrEmpty(status))
                query += " AND status = @status";
            if (fromDate.HasValue)
                query += " AND start_time >= @from_date";
            if (toDate.HasValue)
                query += " AND start_time <= @to_date";

            query += " ORDER BY id DESC LIMIT @limit;";

            using var cmd = new SqliteCommand(query, (SqliteConnection)conn);
            if (!string.IsNullOrEmpty(machineId))
                cmd.Parameters.AddWithValue("@machine_id", machineId);
            if (!string.IsNullOrEmpty(status))
                cmd.Parameters.AddWithValue("@status", status);
            if (fromDate.HasValue)
                cmd.Parameters.AddWithValue("@from_date", fromDate.Value.ToString("yyyy-MM-dd HH:mm:ss"));
            if (toDate.HasValue)
                cmd.Parameters.AddWithValue("@to_date", toDate.Value.ToString("yyyy-MM-dd HH:mm:ss"));
            cmd.Parameters.AddWithValue("@limit", limit);

            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                var unit = new UnitRecord
                {
                    Id = reader.GetInt64(0),
                    SerialNumber = reader.IsDBNull(1) ? null : reader.GetString(1),
                    StartTime = DateTime.Parse(reader.GetString(2)),
                    EndTime = reader.IsDBNull(3) ? null : DateTime.Parse(reader.GetString(3)),
                    ErrorCount = reader.GetInt32(4),
                    IsNG = reader.GetInt32(5) == 1,
                    CycleTimeSeconds = reader.GetDouble(6),
                    MachineId = reader.GetString(7),
                    ShiftDate = reader.IsDBNull(8) ? null : reader.GetString(8),
                    ShiftName = reader.IsDBNull(9) ? null : reader.GetString(9),
                    Status = reader.GetString(10),
                    FrontRobotCount = reader.IsDBNull(11) ? null : reader.GetInt32(11),
                    RearRobotCount = reader.IsDBNull(12) ? null : reader.GetInt32(12),
                    				HasQualityFail = reader.GetInt32(13) == 1 || reader.GetInt32(14) == 1
                };
                list.Add(unit);
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine("[SqliteUnitHistoryRepository] GetHistory error: " + ex.Message);
        }
        return list;
    }

    public Dictionary<string, int> GetStatistics(string shiftDate, string shiftName)
    {
        var stats = new Dictionary<string, int>
        {
            ["Total"] = 0,
            ["OK"] = 0,
            ["NG"] = 0,
            ["InProgress"] = 0
        };

        try
        {
            using var conn = _connectionFactory.CreateConnection();
            string query = "SELECT status, COUNT(*) FROM unit_history WHERE 1=1";
            if (!string.IsNullOrEmpty(shiftDate))
                query += " AND shift_date = @shift_date";
            if (!string.IsNullOrEmpty(shiftName))
                query += " AND shift_name = @shift_name";
            query += " GROUP BY status;";

            using var cmd = new SqliteCommand(query, (SqliteConnection)conn);
            if (!string.IsNullOrEmpty(shiftDate))
                cmd.Parameters.AddWithValue("@shift_date", shiftDate);
            if (!string.IsNullOrEmpty(shiftName))
                cmd.Parameters.AddWithValue("@shift_name", shiftName);

            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                string status = reader.GetString(0);
                int count = reader.GetInt32(1);
                stats[status] = count;
                stats["Total"] += count;
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine("[SqliteUnitHistoryRepository] GetStatistics error: " + ex.Message);
        }
        return stats;
    }
}
