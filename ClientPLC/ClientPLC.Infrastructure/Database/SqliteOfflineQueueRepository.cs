using System;
using System.Collections.Generic;
using System.Diagnostics;
using Microsoft.Data.Sqlite;
using PLC.Database;

namespace PLC.Infrastructure.Database;

public class SqliteOfflineQueueRepository : IOfflineQueueRepository
{
    private readonly IDatabaseConnectionFactory _connectionFactory;

    public SqliteOfflineQueueRepository(IDatabaseConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    public void Enqueue(string topic, string payload)
    {
        try
        {
            using var conn = _connectionFactory.CreateConnection();
            string sql = "INSERT INTO mqtt_offline_queue (topic, payload, created_at) VALUES (@topic, @payload, @created_at)";
            using var cmd = new SqliteCommand(sql, (SqliteConnection)conn);
            cmd.Parameters.AddWithValue("@topic", topic);
            cmd.Parameters.AddWithValue("@payload", payload);
            cmd.Parameters.AddWithValue("@created_at", DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss"));
            cmd.ExecuteNonQuery();
        }
        catch (Exception ex)
        {
            Debug.WriteLine("[SqliteOfflineQueueRepository] Enqueue error: " + ex.Message);
        }
    }

    public List<(long Id, string Topic, string Payload)> GetMessages()
    {
        var list = new List<(long Id, string Topic, string Payload)>();
        try
        {
            using var conn = _connectionFactory.CreateConnection();
            string sql = "SELECT id, topic, payload FROM mqtt_offline_queue ORDER BY id ASC";
            using var cmd = new SqliteCommand(sql, (SqliteConnection)conn);
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                list.Add((reader.GetInt64(0), reader.GetString(1), reader.GetString(2)));
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine("[SqliteOfflineQueueRepository] GetMessages error: " + ex.Message);
        }
        return list;
    }

    public void Delete(long id)
    {
        try
        {
            using var conn = _connectionFactory.CreateConnection();
            string sql = "DELETE FROM mqtt_offline_queue WHERE id = @id";
            using var cmd = new SqliteCommand(sql, (SqliteConnection)conn);
            cmd.Parameters.AddWithValue("@id", id);
            cmd.ExecuteNonQuery();
        }
        catch (Exception ex)
        {
            Debug.WriteLine("[SqliteOfflineQueueRepository] Delete error: " + ex.Message);
        }
    }
}
