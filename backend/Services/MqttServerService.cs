using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.AspNetCore.SignalR;
using backend.Hubs;
using MQTTnet;
using MQTTnet.Server;
using backend.Security;

namespace backend.Services
{
    public class MqttServerService : BackgroundService
    {
        private readonly int _port;
        private readonly DatabaseService _dbService;
        private readonly TelemetryStore _telemetryStore;
        private readonly TelemetryIngestionService _telemetryIngestionService;
        private readonly SyncService _syncService;
        private readonly IHubContext<TelemetryHub> _hubContext;
        private readonly ILogger<MqttServerService> _logger;
        private readonly System.Collections.Concurrent.ConcurrentDictionary<string, string> _clientIps = new();
        private MqttServer? _mqttServer;
        private Timer? _pruningTimer;

        public MqttServerService(
            IConfiguration configuration, 
            DatabaseService dbService,
            TelemetryStore telemetryStore, 
            TelemetryIngestionService telemetryIngestionService,
            SyncService syncService,
            IHubContext<TelemetryHub> hubContext,
            ILogger<MqttServerService> logger)
        {
            _port = configuration.GetValue<int>("MqttServer:Port", 1883);
            _dbService = dbService;
            _telemetryStore = telemetryStore;
            _telemetryIngestionService = telemetryIngestionService;
            _syncService = syncService;
            _hubContext = hubContext;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            try
            {
                var factory = new MqttServerFactory();
                var options = new MqttServerOptionsBuilder()
                    .WithDefaultEndpoint()
                    .WithDefaultEndpointPort(_port)
                    .Build();

                _mqttServer = factory.CreateMqttServer(options);

                _mqttServer.ClientConnectedAsync += async e =>
                {
                    string clientId = e.ClientId;
                    string endpoint = e.RemoteEndPoint?.ToString() ?? "";
                    string ip = "";
                    if (!string.IsNullOrEmpty(endpoint))
                    {
                        int lastColon = endpoint.LastIndexOf(':');
                        if (lastColon > 0)
                        {
                            ip = endpoint.Substring(0, lastColon).Trim('[', ']');
                        }
                        else
                        {
                            ip = endpoint;
                        }
                    }
                    _clientIps[clientId] = ip;
                    _logger.LogInformation("MQTT Client connected: {ClientId} from {Ip}", clientId, ip);
                    await Task.CompletedTask;
                };

                _mqttServer.ClientDisconnectedAsync += async e =>
                {
                    _clientIps.TryRemove(e.ClientId, out _);
                    _logger.LogInformation("MQTT Client disconnected: {ClientId}", e.ClientId);

                    if (Guid.TryParse(e.ClientId, out var machineGuid))
                    {
                        try
                        {
                            const string updateSql = @"
                                UPDATE machines SET
                                    status = 'OFFLINE',
                                    plc_connected = false,
                                    last_heartbeat = NOW()
                                WHERE id = @mid";
                            await _dbService.ExecuteNonQueryAsync(updateSql, p => p.AddWithValue("mid", machineGuid));
                            
                            await _dbService.SaveTelemetryHistoryAsync(
                                machineGuid, "OFFLINE", false, 0, 0.0, 0.0, 0.0, 0L, "{}");

                            var offlineJson = JsonSerializer.Serialize(new
                            {
                                protocolVersion = 1,
                                messageId = Guid.NewGuid().ToString(),
                                messageType = "telemetry",
                                clientId = e.ClientId,
                                sentAt = DateTime.UtcNow,
                                payload = new
                                {
                                    machineId = e.ClientId,
                                    status = "OFFLINE",
                                    plcConnected = false
                                }
                            });

                            await _hubContext.Clients.Group($"machine_{e.ClientId}").SendAsync("TelemetryUpdate", offlineJson);
                            await _hubContext.Clients.Group("all_clients").SendAsync("TelemetryUpdate", offlineJson);
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "Failed to mark machine {MachineId} as offline on disconnection", e.ClientId);
                        }
                    }
                };

                // Handle incoming publishes
                _mqttServer.InterceptingPublishAsync += HandlePublishAsync;

                await _mqttServer.StartAsync();
                _logger.LogInformation("MQTT Broker listening on port {Port}", _port);

                // Start periodic database pruner (once a day, starts after 1 hour)
                _pruningTimer = new Timer(async _ => await RunDatabasePrunerAsync(), null, 
                    TimeSpan.FromHours(1), TimeSpan.FromDays(1));

                // Wait until stopped
                await Task.Delay(Timeout.Infinite, stoppingToken);
            }
            catch (Exception) when (stoppingToken.IsCancellationRequested)
            {
                _logger.LogInformation("MQTT Server stopping...");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to start MQTT broker on port {Port}", _port);
            }
        }

        private async Task HandlePublishAsync(InterceptingPublishEventArgs e)
        {
            try
            {
                string topic = e.ApplicationMessage.Topic;
                string rawPayload = e.ApplicationMessage.ConvertPayloadToString();

                // Symmetrical payload decryption
                string decryptedPayload = CryptoHelper.Decrypt(rawPayload);

                _logger.LogDebug("MQTT Msg Topic: {Topic}, Payload: {Payload}", topic, decryptedPayload);

                // Detect topic patterns
                // Pattern: client/{clientId}/register, client/{clientId}/telemetry, client/{clientId}/heartbeat
                var parts = topic.Split('/');
                if (parts.Length < 3 || parts[0] != "client")
                {
                    return;
                }

                string clientId = parts[1];
                string messageType = parts[2];

                using var doc = JsonDocument.Parse(decryptedPayload);
                var root = doc.RootElement;

                if (messageType == "register")
                {
                    await ProcessRegisterAsync(clientId, root);
                }
                else if (messageType == "telemetry")
                {
                    await ProcessTelemetryAsync(clientId, decryptedPayload, root);
                }
                else if (messageType == "heartbeat")
                {
                    await ProcessHeartbeatAsync(clientId, root);
                }
                else if (messageType == "sync")
                {
                    await ProcessSyncMqttAsync(clientId, root);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing MQTT message on topic {Topic}", e.ApplicationMessage.Topic);
            }
        }

        private async Task ProcessRegisterAsync(string clientId, JsonElement root)
        {
            long lastSyncSeq = 0;
            string? clientName = null;
            string? machineCode = null;

            if (root.TryGetProperty("payload", out var payload))
            {
                if (payload.TryGetProperty("lastSyncSeq", out var lastSeqProp))
                {
                    lastSyncSeq = lastSeqProp.GetInt64();
                }
                if (payload.TryGetProperty("clientName", out var nameProp))
                {
                    clientName = nameProp.GetString();
                }
                if (payload.TryGetProperty("machineCode", out var codeProp))
                {
                    machineCode = codeProp.GetString();
                }
            }

            long serverSeq = await _syncService.GetMaxSequenceAsync(clientId);
            string clientIp = _clientIps.TryGetValue(clientId, out var ip) ? ip : "";
            
            await _dbService.UpsertPlcClientAsync(clientId, clientName, machineCode, clientIp, 0.0, 0.0, 0L);

            if (Guid.TryParse(clientId, out var machineGuid))
            {
                const string updateSql = @"
                    UPDATE machines SET
                        status = CASE WHEN status = 'OFFLINE' THEN 'STOPPED' ELSE status END,
                        last_heartbeat = NOW()
                    WHERE id = @mid";
                await _dbService.ExecuteNonQueryAsync(updateSql, p => p.AddWithValue("mid", machineGuid));
            }

            // Send RegisterAck with ackSeq
            var registerAck = new
            {
                messageType = "registerAck",
                messageId = Guid.NewGuid().ToString(),
                payload = new 
                { 
                    success = true,
                    ackSeq = serverSeq
                }
            };

            await SendCommandToClientAsync(clientId, registerAck);
        }

        private async Task ProcessTelemetryAsync(string clientId, string rawJson, JsonElement root)
        {
            bool isApproved = await _dbService.IsClientApprovedAsync(clientId);
            if (isApproved)
            {
                _telemetryIngestionService.Enqueue(rawJson);
            }
            else
            {
                _logger.LogWarning("Telemetry from client {ClientId} rejected - not APPROVED", clientId);
            }

            // Send Ack back to client
            var ack = new
            {
                messageType = "ack",
                messageId = root.TryGetProperty("messageId", out var idProp) ? idProp.GetString() ?? "" : "",
                payload = new { success = true, approved = isApproved }
            };

            await SendCommandToClientAsync(clientId, ack);
        }

        private async Task ProcessHeartbeatAsync(string clientId, JsonElement root)
        {
            string? clientName = null;
            string? machineCode = null;
            string? status = null;
            bool? plcConnected = null;

            if (root.TryGetProperty("payload", out var payload))
            {
                if (payload.TryGetProperty("machineName", out var nameProp))
                {
                    clientName = nameProp.GetString();
                }
                else if (payload.TryGetProperty("clientName", out nameProp))
                {
                    clientName = nameProp.GetString();
                }

                if (payload.TryGetProperty("machineCode", out var codeProp))
                {
                    machineCode = codeProp.GetString();
                }

                if (payload.TryGetProperty("status", out var statusProp))
                {
                    status = statusProp.GetString();
                }

                if (payload.TryGetProperty("plcConnected", out var plcProp))
                {
                    plcConnected = plcProp.GetBoolean();
                }
            }

            string clientIp = _clientIps.TryGetValue(clientId, out var ip) ? ip : "";
            await _dbService.UpsertPlcClientAsync(clientId, clientName, machineCode, clientIp, 0.0, 0.0, 0L);

            if (Guid.TryParse(clientId, out var machineGuid))
            {
                if (!string.IsNullOrEmpty(status))
                {
                    const string updateSql = @"
                        UPDATE machines SET
                            status = @status,
                            plc_connected = COALESCE(@plcConnected, plc_connected),
                            last_heartbeat = NOW()
                        WHERE id = @mid";
                    await _dbService.ExecuteNonQueryAsync(updateSql, p =>
                    {
                        p.AddWithValue("status", status);
                        p.AddWithValue("plcConnected", plcConnected.HasValue ? (object)plcConnected.Value : DBNull.Value);
                        p.AddWithValue("mid", machineGuid);
                    });
                }
            }

            // Send HeartbeatAck
            var hbAck = new
            {
                messageType = "heartbeatAck",
                messageId = root.TryGetProperty("messageId", out var idProp) ? idProp.GetString() ?? "" : "",
                payload = new { success = true }
            };

            await SendCommandToClientAsync(clientId, hbAck);
        }

        private async Task ProcessSyncMqttAsync(string clientId, JsonElement root)
        {
            try
            {
                if (root.TryGetProperty("payload", out var payload) && payload.TryGetProperty("records", out var recordsProp))
                {
                    var records = JsonSerializer.Deserialize<List<TelemetryRecordDto>>(recordsProp.GetRawText(), new JsonSerializerOptions
                    {
                        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                    });
                    if (records != null)
                    {
                        await _syncService.ProcessBatchUploadAsync(clientId, records);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing sync batch via MQTT for client {ClientId}", clientId);
            }

            // Send SyncAck
            var syncAck = new
            {
                messageType = "syncAck",
                messageId = root.TryGetProperty("messageId", out var idProp) ? idProp.GetString() ?? "" : "",
                payload = new { success = true }
            };

            await SendCommandToClientAsync(clientId, syncAck);
        }

        public async Task SendCommandToClientAsync(string clientId, object commandObj)
        {
            if (_mqttServer == null || !_mqttServer.IsStarted) return;

            try
            {
                string topic = $"client/{clientId}/command";
                string json = JsonSerializer.Serialize(commandObj, new JsonSerializerOptions
                {
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                });

                // Encrypt payload sent back to client
                string encrypted = CryptoHelper.Encrypt(json);

                var message = new MqttApplicationMessageBuilder()
                    .WithTopic(topic)
                    .WithPayload(encrypted)
                    .WithQualityOfServiceLevel(MQTTnet.Protocol.MqttQualityOfServiceLevel.AtLeastOnce)
                    .Build();

                await _mqttServer.InjectApplicationMessage(
                    new InjectedMqttApplicationMessage(message));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send MQTT command to client {ClientId}", clientId);
            }
        }

        private async Task RunDatabasePrunerAsync()
        {
            try
            {
                _logger.LogInformation("Database Pruner Triggered...");
                // Keep telemetry data for 7 days
                await _dbService.ExecuteNonQueryAsync(
                    "DELETE FROM machine_telemetry_history WHERE created_at < NOW() - INTERVAL '7 days'", _ => { });
                
                // Keep errors log for 30 days
                await _dbService.ExecuteNonQueryAsync(
                    "DELETE FROM alarms WHERE created_at < NOW() - INTERVAL '30 days' AND status = 'RESOLVED'", _ => { });

                // Keep shift aggregates for 30 days
                await _dbService.ExecuteNonQueryAsync(
                    "DELETE FROM machine_hourly_production WHERE received_at < NOW() - INTERVAL '30 days'", _ => { });

                _logger.LogInformation("Database Pruning Completed.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error running database pruning job");
            }
        }

        public override async Task StopAsync(CancellationToken cancellationToken)
        {
            _pruningTimer?.Dispose();
            if (_mqttServer != null)
            {
                await _mqttServer.StopAsync();
            }
            await base.StopAsync(cancellationToken);
        }
    }
}
