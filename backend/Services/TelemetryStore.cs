using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;

namespace backend.Services
{
    /// <summary>
    /// In-memory store for the latest raw telemetry payload per PLC client.
    /// Singleton – shared between TcpServerService (writer) and TelemetryController (reader).
    /// </summary>
    public class TelemetryStore
    {
        // Key: clientId, Value: latest snapshot
        private readonly ConcurrentDictionary<string, TelemetrySnapshot> _snapshots = new();

        // Rolling log – last 200 messages across all clients
        private readonly System.Collections.Generic.Queue<TelemetrySnapshot> _log = new();
        private const int MaxLog = 200;
        private readonly object _logLock = new();

        public void Save(string clientId, string rawJson, string? machineName, string? ipAddress)
        {
            var snapshot = new TelemetrySnapshot
            {
                ClientId    = clientId,
                MachineName = machineName,
                IpAddress   = ipAddress,
                ReceivedAt  = DateTimeOffset.UtcNow,
                RawJson     = rawJson
            };

            _snapshots[clientId] = snapshot;

            lock (_logLock)
            {
                _log.Enqueue(snapshot);
                while (_log.Count > MaxLog)
                    _log.Dequeue();
            }
        }

        /// <summary>Latest snapshot per client (one entry per unique clientId).</summary>
        public IReadOnlyList<TelemetrySnapshot> GetLatest() =>
            _snapshots.Values.OrderByDescending(s => s.ReceivedAt).ToList();

        /// <summary>Recent log of last N messages across all clients.</summary>
        public IReadOnlyList<TelemetrySnapshot> GetLog(int count = 50)
        {
            lock (_logLock)
            {
                return _log.TakeLast(Math.Min(count, MaxLog)).Reverse().ToList();
            }
        }
    }

    public class TelemetrySnapshot
    {
        public string  ClientId    { get; init; } = "";
        public string? MachineName { get; init; }
        public string? IpAddress   { get; init; }
        public DateTimeOffset ReceivedAt { get; init; }
        public string  RawJson     { get; init; } = "{}";
    }
}
