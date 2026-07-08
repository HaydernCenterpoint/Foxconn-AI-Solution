using System;
using System.Collections.Generic;
using System.Diagnostics;
using Microsoft.Data.Sqlite;
using PLC.Database;

namespace PLC.Infrastructure.Database;

public class SqliteErrorHistoryRepository : IErrorHistoryRepository
{
    private readonly IDatabaseConnectionFactory _connectionFactory;

    public SqliteErrorHistoryRepository(IDatabaseConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    public void AddOrUpdate(string machineId, string machineName, string errorCode, string errorName, string address, string severity, DateTime startedAt, DateTime? endedAt, int? durationSeconds, string status, string triggerValue, string description, string solution)
    {
        try
        {
            using var conn = _connectionFactory.CreateConnection();

            string checkQuery = "SELECT id FROM error_history WHERE machine_id = @machine_id AND error_code = @error_code AND status = 'Active' LIMIT 1;";
            long? existingId = null;
            using (var cmd = new SqliteCommand(checkQuery, (SqliteConnection)conn))
            {
                cmd.Parameters.AddWithValue("@machine_id", machineId);
                cmd.Parameters.AddWithValue("@error_code", errorCode);
                using var reader = cmd.ExecuteReader();
                if (reader.Read())
                {
                    existingId = reader.GetInt64(0);
                }
            }

            if (existingId.HasValue)
            {
                string updateQuery = @"
                    UPDATE error_history
                    SET ended_at = @ended_at, duration_seconds = @duration_seconds, status = @status, trigger_value = @trigger_value, updated_at = @updated_at
                    WHERE id = @id;";
                using var cmd = new SqliteCommand(updateQuery, (SqliteConnection)conn);
                cmd.Parameters.AddWithValue("@id", existingId.Value);
                cmd.Parameters.AddWithValue("@ended_at", endedAt.HasValue ? endedAt.Value.ToString("yyyy-MM-dd HH:mm:ss") : (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@duration_seconds", durationSeconds.HasValue ? durationSeconds.Value : (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@status", status);
                cmd.Parameters.AddWithValue("@trigger_value", triggerValue ?? "true");
                cmd.Parameters.AddWithValue("@updated_at", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
                cmd.ExecuteNonQuery();
            }
            else if (status == "Active")
            {
                string insertQuery = @"
                    INSERT INTO error_history (machine_id, machine_name, error_code, error_name, address, severity, started_at, status, trigger_value, description, solution, created_at)
                    VALUES (@machine_id, @machine_name, @error_code, @error_name, @address, @severity, @started_at, @status, @trigger_value, @description, @solution, @created_at);";
                using var cmd = new SqliteCommand(insertQuery, (SqliteConnection)conn);
                cmd.Parameters.AddWithValue("@machine_id", machineId);
                cmd.Parameters.AddWithValue("@machine_name", machineName ?? "");
                cmd.Parameters.AddWithValue("@error_code", errorCode);
                cmd.Parameters.AddWithValue("@error_name", errorName ?? "");
                cmd.Parameters.AddWithValue("@address", address ?? "");
                cmd.Parameters.AddWithValue("@severity", severity ?? "Medium");
                cmd.Parameters.AddWithValue("@started_at", startedAt.ToString("yyyy-MM-dd HH:mm:ss"));
                cmd.Parameters.AddWithValue("@status", status);
                cmd.Parameters.AddWithValue("@trigger_value", triggerValue ?? "true");
                cmd.Parameters.AddWithValue("@description", description ?? "");
                cmd.Parameters.AddWithValue("@solution", solution ?? "");
                cmd.Parameters.AddWithValue("@created_at", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
                cmd.ExecuteNonQuery();
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine("[SqliteErrorHistoryRepository] AddOrUpdate error: " + ex.Message);
        }
    }

    public List<Dictionary<string, object>> GetHistory(string machineId, string errorCode, string status, DateTime? fromDate, DateTime? toDate, string shift = "")
    {
        var list = new List<Dictionary<string, object>>();
        try
        {
            using var conn = _connectionFactory.CreateConnection();
            string query = "SELECT id, machine_id, machine_name, error_code, error_name, address, severity, started_at, ended_at, duration_seconds, status, trigger_value, description, solution FROM error_history WHERE 1=1";

            if (!string.IsNullOrEmpty(machineId))
                query += " AND machine_id = @machine_id";
            if (!string.IsNullOrEmpty(errorCode))
                query += " AND error_code LIKE @error_code";
            if (!string.IsNullOrEmpty(status))
                query += " AND status = @status";

            DateTime? actualFrom = fromDate;
            DateTime? actualTo = toDate;

            if (!string.IsNullOrEmpty(shift))
            {
                if (shift.Equals("Day", StringComparison.OrdinalIgnoreCase))
                {
                    if (fromDate.HasValue) actualFrom = fromDate.Value.Date.Add(new TimeSpan(7, 30, 0));
                    if (toDate.HasValue) actualTo = toDate.Value.Date.Add(new TimeSpan(19, 30, 0));

                    query += " AND started_at >= @from_date AND started_at <= @to_date";
                    query += " AND (time(started_at) >= '07:30:00' AND time(started_at) < '19:30:00')";
                }
                else if (shift.Equals("Night", StringComparison.OrdinalIgnoreCase))
                {
                    if (fromDate.HasValue) actualFrom = fromDate.Value.Date.Add(new TimeSpan(19, 30, 0));
                    if (toDate.HasValue) actualTo = toDate.Value.Date.AddDays(1).Add(new TimeSpan(7, 30, 0));

                    query += " AND started_at >= @from_date AND started_at <= @to_date";
                    query += " AND (time(started_at) >= '19:30:00' OR time(started_at) < '07:30:00')";
                }
            }
            else
            {
                if (fromDate.HasValue)
                    query += " AND started_at >= @from_date";
                if (toDate.HasValue)
                    query += " AND started_at <= @to_date";
            }

            query += " ORDER BY id DESC;";

            using var cmd = new SqliteCommand(query, (SqliteConnection)conn);
            if (!string.IsNullOrEmpty(machineId))
                cmd.Parameters.AddWithValue("@machine_id", machineId);
            if (!string.IsNullOrEmpty(errorCode))
                cmd.Parameters.AddWithValue("@error_code", "%" + errorCode + "%");
            if (!string.IsNullOrEmpty(status))
                cmd.Parameters.AddWithValue("@status", status);
            if (actualFrom.HasValue)
                cmd.Parameters.AddWithValue("@from_date", actualFrom.Value.ToString("yyyy-MM-dd HH:mm:ss"));
            if (actualTo.HasValue)
                cmd.Parameters.AddWithValue("@to_date", actualTo.Value.ToString("yyyy-MM-dd HH:mm:ss"));

            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                var row = new Dictionary<string, object>
                {
                    ["Id"] = reader.GetInt64(0),
                    ["MachineId"] = reader.GetString(1),
                    ["MachineName"] = reader.IsDBNull(2) ? "" : reader.GetString(2),
                    ["ErrorCode"] = reader.GetString(3),
                    ["ErrorName"] = reader.IsDBNull(4) ? "" : reader.GetString(4),
                    ["Address"] = reader.IsDBNull(5) ? "" : reader.GetString(5),
                    ["Severity"] = reader.IsDBNull(6) ? "" : reader.GetString(6),
                    ["StartedAt"] = reader.GetString(7),
                    ["EndedAt"] = reader.IsDBNull(8) ? "" : reader.GetString(8),
                    ["DurationSeconds"] = reader.IsDBNull(9) ? 0 : reader.GetInt32(9),
                    ["Status"] = reader.GetString(10),
                    ["TriggerValue"] = reader.IsDBNull(11) ? "" : reader.GetString(11),
                    ["Description"] = reader.IsDBNull(12) ? "" : reader.GetString(12),
                    ["Solution"] = reader.IsDBNull(13) ? "" : reader.GetString(13)
                };
                list.Add(row);
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine("[SqliteErrorHistoryRepository] GetHistory error: " + ex.Message);
        }
        return list;
    }
}
