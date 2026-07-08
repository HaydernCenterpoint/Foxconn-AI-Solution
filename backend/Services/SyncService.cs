using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;

namespace backend.Services
{
    public class SyncService
    {
        private readonly DatabaseService _dbService;

        public SyncService(DatabaseService dbService)
        {
            _dbService = dbService;
        }

        public async Task<long> GetMaxSequenceAsync(string machineId)
        {
            return await _dbService.GetMaxSequenceAsync(machineId);
        }

        public async Task ProcessBatchUploadAsync(string machineId, List<TelemetryRecordDto> records)
        {
            if (records == null || records.Count == 0) return;

            foreach (var record in records)
            {
                try
                {
                    if (string.IsNullOrEmpty(record.RawJson)) continue;

                    using var doc = JsonDocument.Parse(record.RawJson);
                    var root = doc.RootElement;
                    if (!root.TryGetProperty("payload", out var payload)) continue;

                    DateTime sentAt = DateTime.UtcNow;
                    if (root.TryGetProperty("sentAt", out var sentAtProp))
                    {
                        if (DateTime.TryParse(sentAtProp.GetString(), out var parsedSentAt))
                        {
                            sentAt = parsedSentAt;
                        }
                    }

                    await _dbService.InsertRawTelemetryAsync(machineId, record.RawJson, record.Sequence, sentAt);

                    string status = payload.TryGetProperty("status", out var statusProp) ? statusProp.GetString() ?? "OFFLINE" : "OFFLINE";
                    bool plcConnected = payload.TryGetProperty("plcConnected", out var plcProp) && plcProp.GetBoolean();

                    long productionCount = 0;
                    double cycleTime = 0;
                    if (payload.TryGetProperty("production", out var prodProp))
                    {
                        if (prodProp.TryGetProperty("qty", out var qp)) productionCount = qp.GetInt64();
                        if (prodProp.TryGetProperty("time", out var tp)) cycleTime = tp.GetDouble();
                    }

                    if (Guid.TryParse(machineId, out var machineGuid))
                    {
                        await _dbService.SaveTelemetryHistoryAsync(
                            machineGuid, status, plcConnected, (int)productionCount, cycleTime,
                            0.0, 0.0, 0L, payload.GetRawText());
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[SyncService] Error inserting offline batch record sequence {record.Sequence}: {ex.Message}");
                }
            }
        }
    }

    public class TelemetryRecordDto
    {
        public long Sequence { get; set; }
        public string Timestamp { get; set; }
        public string RawJson { get; set; }
    }
}
