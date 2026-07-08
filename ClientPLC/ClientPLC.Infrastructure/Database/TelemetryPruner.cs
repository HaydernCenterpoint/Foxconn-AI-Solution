using System;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Data.Sqlite;
using PLC.Database;

namespace PLC.Infrastructure.Database;

public class TelemetryPruner
{
    private readonly IDatabaseConnectionFactory _connectionFactory;
    private Timer? _timer;

    public TelemetryPruner(IDatabaseConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    public void Start()
    {
        // Run immediately, then run every 24 hours
        _timer = new Timer(PruneCallback, null, TimeSpan.Zero, TimeSpan.FromHours(24));
    }

    public void Stop()
    {
        _timer?.Dispose();
    }

    private void PruneCallback(object? state)
    {
        try
        {
            using var conn = _connectionFactory.CreateConnection();
            
            // 1. Prune telemetry older than 7 days
            string pruneTelemetry = "DELETE FROM telemetry WHERE timestamp < datetime('now', '-7 days');";
            using (var cmd = new SqliteCommand(pruneTelemetry, (SqliteConnection)conn))
            {
                int rows = cmd.ExecuteNonQuery();
                if (rows > 0)
                {
                    Debug.WriteLine($"[TelemetryPruner] Pruned {rows} old rows from telemetry table.");
                }
            }

            // 2. Prune unit_history older than 7 days
            string pruneUnits = "DELETE FROM unit_history WHERE start_time < datetime('now', '-7 days');";
            using (var cmd = new SqliteCommand(pruneUnits, (SqliteConnection)conn))
            {
                int rows = cmd.ExecuteNonQuery();
                if (rows > 0)
                {
                    Debug.WriteLine($"[TelemetryPruner] Pruned {rows} old rows from unit_history table.");
                }
            }

            // 3. Prune error_history older than 30 days
            string pruneErrors = "DELETE FROM error_history WHERE started_at < datetime('now', '-30 days');";
            using (var cmd = new SqliteCommand(pruneErrors, (SqliteConnection)conn))
            {
                int rows = cmd.ExecuteNonQuery();
                if (rows > 0)
                {
                    Debug.WriteLine($"[TelemetryPruner] Pruned {rows} old rows from error_history table.");
                }
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine("[TelemetryPruner] Error pruning database: " + ex.Message);
        }
    }
}
