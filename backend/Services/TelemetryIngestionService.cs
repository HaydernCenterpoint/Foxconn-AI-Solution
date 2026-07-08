using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using backend.Hubs;

namespace backend.Services
{
    public class TelemetryIngestionService : BackgroundService
    {
        private readonly Channel<string> _channel;
        private readonly DatabaseService _dbService;
        private readonly IHubContext<TelemetryHub> _hubContext;
        private readonly ILogger<TelemetryIngestionService> _logger;

        public ChannelWriter<string> Writer => _channel.Writer;

        public TelemetryIngestionService(
            DatabaseService dbService,
            IHubContext<TelemetryHub> hubContext,
            ILogger<TelemetryIngestionService> logger)
        {
            _dbService = dbService;
            _hubContext = hubContext;
            _logger = logger;
            
            var options = new UnboundedChannelOptions
            {
                SingleReader = true,
                SingleWriter = false
            };
            _channel = Channel.CreateUnbounded<string>(options);
        }

        public void Enqueue(string rawJson)
        {
            if (!_channel.Writer.TryWrite(rawJson))
            {
                _logger.LogWarning("Failed to enqueue telemetry message to Channel.");
            }
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("Telemetry Ingestion Service started.");

            try
            {
                await foreach (var rawJson in _channel.Reader.ReadAllAsync(stoppingToken))
                {
                    try
                    {
                        await ProcessMessageAsync(rawJson);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error processing enqueued telemetry message.");
                    }
                }
            }
            catch (OperationCanceledException)
            {
                _logger.LogInformation("Telemetry Ingestion Service is stopping.");
            }
        }

        private async Task ProcessMessageAsync(string rawJson)
        {
            using var doc = JsonDocument.Parse(rawJson);
            var root = doc.RootElement;
            
            if (!root.TryGetProperty("payload", out var payload)) return;

            string machineId = payload.TryGetProperty("machineId", out var midProp) ? midProp.GetString() ?? "" : "";
            if (string.IsNullOrEmpty(machineId)) return;

            long sequence = payload.TryGetProperty("sequence", out var seqProp) ? seqProp.GetInt64() : 0L;

            DateTime sentAt = DateTime.UtcNow;
            if (root.TryGetProperty("sentAt", out var sentAtProp))
            {
                if (DateTime.TryParse(sentAtProp.GetString(), out var parsedSentAt))
                {
                    sentAt = parsedSentAt;
                }
            }

            // 1. Write raw to DB
            await _dbService.InsertRawTelemetryAsync(machineId, rawJson, sequence, sentAt);

            // 2. Extract properties for quick machine record update
            string status = payload.TryGetProperty("status", out var statusProp) ? statusProp.GetString() ?? "OFFLINE" : "OFFLINE";
            bool plcConnected = payload.TryGetProperty("plcConnected", out var plcProp) && plcProp.GetBoolean();

            // Extract production properties
            long productionCount = 0;
            double cycleTime = 0;
            if (payload.TryGetProperty("production", out var prodProp))
            {
                if (prodProp.TryGetProperty("qty", out var qp)) productionCount = qp.GetInt64();
                if (prodProp.TryGetProperty("time", out var tp)) cycleTime = tp.GetDouble();
            }

            // 3. Update machines table
            if (Guid.TryParse(machineId, out var machineGuid))
            {
                const string updateMachineSql = @"
                    UPDATE machines SET
                        status = @status,
                        plc_connected = @plcConnected,
                        last_plc_data = @raw,
                        created_at = COALESCE(created_at, NOW())
                    WHERE id = @mid";
                
                await _dbService.ExecuteNonQueryAsync(updateMachineSql, p =>
                {
                    p.AddWithValue("status", status);
                    p.AddWithValue("plcConnected", plcConnected);
                    p.AddWithValue("raw", rawJson);
                    p.AddWithValue("mid", machineGuid);
                });

                // 4. Save history records
                await _dbService.SaveTelemetryHistoryAsync(
                    machineGuid, status, plcConnected, (int)productionCount, cycleTime,
                    0.0, 0.0, 0L, payload.GetRawText());

                // 5. Update hourly production table
                await _dbService.UpdateHourlyProductionAsync(
                    machineGuid, (int)productionCount, 0.0, 0.0, 0L);
            }

            // 5. Broadcast real-time SignalR updates
            await _hubContext.Clients.Group($"machine_{machineId}").SendAsync("TelemetryUpdate", rawJson);
            await _hubContext.Clients.Group("all_clients").SendAsync("TelemetryUpdate", rawJson);
        }
    }
}
