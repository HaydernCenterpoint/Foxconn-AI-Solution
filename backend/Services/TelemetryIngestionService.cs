using System;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using backend.Configuration;
using Mkz.Fusion.Contracts;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using backend.Hubs;

namespace backend.Services
{
    public class TelemetryIngestionService : BackgroundService
    {
        private readonly Channel<string> _channel;
        private readonly DatabaseService _dbService;
        private readonly IHubContext<TelemetryHub> _hubContext;
        private readonly ILogger<TelemetryIngestionService> _logger;
        private readonly IOptions<OpenDataFusionCaptureOptions> _captureOptions;
        private readonly EventRuleEngine? _eventRuleEngine;

        public ChannelWriter<string> Writer => _channel.Writer;

        public TelemetryIngestionService(
            DatabaseService dbService,
            IHubContext<TelemetryHub> hubContext,
            ILogger<TelemetryIngestionService> logger,
            IOptions<OpenDataFusionCaptureOptions> captureOptions,
            EventRuleEngine? eventRuleEngine = null)
        {
            _dbService = dbService;
            _hubContext = hubContext;
            _logger = logger;
            _captureOptions = captureOptions;
            _eventRuleEngine = eventRuleEngine;
            
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

            string machineId = payload.TryGetProperty("machineId", out var midProp) && midProp.ValueKind == JsonValueKind.String
                ? midProp.GetString() ?? ""
                : "";
            if (string.IsNullOrEmpty(machineId)) return;

            long sequence = payload.TryGetProperty("sequence", out var seqProp) && seqProp.TryGetInt64(out var parsedSequence)
                ? parsedSequence
                : 0L;

            string? messageId = root.TryGetProperty("messageId", out var messageIdProp) && messageIdProp.ValueKind == JsonValueKind.String
                ? messageIdProp.GetString()
                : null;

            DateTimeOffset sentAt = DateTimeOffset.UtcNow;
            if (root.TryGetProperty("sentAt", out var sentAtProp) && sentAtProp.ValueKind == JsonValueKind.String)
            {
                if (DateTimeOffset.TryParse(sentAtProp.GetString(), out var parsedSentAt))
                {
                    sentAt = parsedSentAt;
                }
            }

            string status = payload.TryGetProperty("status", out var statusProp) && statusProp.ValueKind == JsonValueKind.String
                ? statusProp.GetString() ?? "OFFLINE"
                : "OFFLINE";
            bool plcConnected = payload.TryGetProperty("plcConnected", out var plcProp) &&
                plcProp.ValueKind is JsonValueKind.True or JsonValueKind.False &&
                plcProp.GetBoolean();

            long productionCount = 0;
            double cycleTime = 0;
            double? uph = null;
            double? oee = null;
            double? yieldRate = null;
            if (payload.TryGetProperty("production", out var prodProp) && prodProp.ValueKind == JsonValueKind.Object)
            {
                if (prodProp.TryGetProperty("qty", out var qtyProp) && qtyProp.TryGetInt64(out var parsedQuantity))
                    productionCount = parsedQuantity;
                if (prodProp.TryGetProperty("time", out var timeProp) && timeProp.TryGetDouble(out var parsedCycleTime))
                    cycleTime = parsedCycleTime;
                if (prodProp.TryGetProperty("uph", out var uphProp) && uphProp.TryGetDouble(out var parsedUph))
                    uph = parsedUph;
                if (prodProp.TryGetProperty("oee", out var oeeProp) && oeeProp.TryGetDouble(out var parsedOee))
                    oee = parsedOee;
                if (prodProp.TryGetProperty("yieldRate", out var yieldProp) && yieldProp.TryGetDouble(out var parsedYieldRate))
                    yieldRate = parsedYieldRate;
            }

            bool? alarmActive = null;
            if (payload.TryGetProperty("alarm", out var alarmProp) && alarmProp.ValueKind == JsonValueKind.Object &&
                alarmProp.TryGetProperty("active", out var alarmActiveProp) &&
                alarmActiveProp.ValueKind is JsonValueKind.True or JsonValueKind.False)
            {
                alarmActive = alarmActiveProp.GetBoolean();
            }

            if (Guid.TryParse(machineId, out var machineGuid))
            {
                var captureInput = new TelemetryCaptureInput(
                    machineGuid,
                    rawJson,
                    sequence,
                    sentAt,
                    messageId,
                    payload.TryGetProperty("machineName", out var machineNameProp) && machineNameProp.ValueKind == JsonValueKind.String
                        ? machineNameProp.GetString()
                        : null,
                    status,
                    plcConnected,
                    productionCount,
                    cycleTime,
                    uph,
                    oee,
                    yieldRate,
                    alarmActive);

                await _dbService.PersistTelemetryAndFusionOutboxAsync(
                    captureInput,
                    _captureOptions.Value.CaptureEnabled);

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

                await _dbService.SaveTelemetryHistoryAsync(
                    machineGuid, status, plcConnected, (int)productionCount, cycleTime,
                    0.0, 0.0, 0L, payload.GetRawText());

                await _dbService.UpdateHourlyProductionAsync(
                    machineGuid, (int)productionCount, 0.0, 0.0, 0L);

                // ── Write normalized telemetry to telemetry_data table ───────
                var dataPoints = TelemetrySchemaContract.Normalize(captureInput).ToList();
                if (dataPoints.Count > 0)
                    await _dbService.InsertTelemetryDataPointsAsync(dataPoints);

                // ── Feed CEP engine for threshold rule evaluation ────────────
                _eventRuleEngine?.Enqueue(captureInput);
            }

            await _hubContext.Clients.Group($"machine_{machineId}").SendAsync("TelemetryUpdate", rawJson);
            await _hubContext.Clients.Group("all_clients").SendAsync("TelemetryUpdate", rawJson);
        }
    }
}
