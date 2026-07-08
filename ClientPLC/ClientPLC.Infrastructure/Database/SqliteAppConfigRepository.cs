using System;
using System.Diagnostics;
using Microsoft.Data.Sqlite;
using PLC.Database;

namespace PLC.Infrastructure.Database;

public class SqliteAppConfigRepository : IAppConfigRepository
{
    private readonly IDatabaseConnectionFactory _connectionFactory;

    public SqliteAppConfigRepository(IDatabaseConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    public string GetValue(string key, string defaultValue)
    {
        try
        {
            using var conn = _connectionFactory.CreateConnection();
            string query = "SELECT config_value FROM app_config WHERE config_key = @key LIMIT 1;";
            using var cmd = new SqliteCommand(query, (SqliteConnection)conn);
            cmd.Parameters.AddWithValue("@key", key);
            object val = cmd.ExecuteScalar();
            if (val != null && val != DBNull.Value)
            {
                return val.ToString() ?? defaultValue;
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine("[SqliteAppConfigRepository] GetValue error: " + ex.Message);
        }
        return defaultValue;
    }

    public void SaveValue(string key, string value)
    {
        try
        {
            using var conn = _connectionFactory.CreateConnection();
            string query = @"
                INSERT INTO app_config (config_key, config_value)
                VALUES (@key, @value)
                ON CONFLICT(config_key) DO UPDATE SET config_value = @value;";
            using var cmd = new SqliteCommand(query, (SqliteConnection)conn);
            cmd.Parameters.AddWithValue("@key", key);
            cmd.Parameters.AddWithValue("@value", value);
            cmd.ExecuteNonQuery();
        }
        catch (Exception ex)
        {
            Debug.WriteLine("[SqliteAppConfigRepository] SaveValue error: " + ex.Message);
        }
    }
}
