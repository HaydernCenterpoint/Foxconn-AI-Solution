using System;
using System.Diagnostics;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using MQTTnet;
using PLC.Config;
using PLC.Service;

namespace PLC.Network;

public class MqttTransport : IServerTransport
{
    private readonly MqttClientFactory _factory = new MqttClientFactory();
    private IMqttClient? _mqttClient;
    private CancellationTokenSource? _cts;
    private bool _isRunning;
    private readonly SemaphoreSlim _sendLock = new SemaphoreSlim(1, 1);

    public bool IsConnected => _mqttClient != null && _mqttClient.IsConnected;

    public event Action<string>? OnLogReceived;
    public event Func<string, Task>? OnMessageReceived;
    public event Func<Task>? OnConnected;

    private void Log(string msg)
    {
        OnLogReceived?.Invoke($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {msg}");
    }

    public void Start()
    {
        if (!_isRunning)
        {
            _isRunning = true;
            _cts = new CancellationTokenSource();
            Task.Run(async () =>
            {
                try
                {
                    await ConnectAndLoopAsync(_cts.Token);
                }
                catch (Exception ex)
                {
                    Serilog.Log.Error(ex, "MQTT ConnectAndLoopAsync crashed");
                }
            });
        }
    }

    public void Stop()
    {
        _isRunning = false;
        _cts?.Cancel();
        DisconnectClient();
    }

    private void DisconnectClient()
    {
        try
        {
            if (_mqttClient != null)
            {
                _mqttClient.ApplicationMessageReceivedAsync -= HandleMessageReceivedAsync;
                var client = _mqttClient;
                if (client.IsConnected)
                {
                    Task.Run(async () =>
                    {
                        try
                        {
                            await client.DisconnectAsync();
                        }
                        catch (Exception ex)
                        {
                            Serilog.Log.Error(ex, "MQTT client DisconnectAsync failed");
                        }
                        finally
                        {
                            try { client.Dispose(); } catch { }
                        }
                    });
                }
                else
                {
                    try { client.Dispose(); } catch { }
                }
            }
        }
        catch (Exception ex)
        {
            Serilog.Log.Error(ex, "Error disposing/disconnecting MQTT client");
        }
        finally
        {
            _mqttClient = null;
        }
    }

    private async Task ConnectAndLoopAsync(CancellationToken token)
    {
        int reconnectAttempts = 0;
        while (!token.IsCancellationRequested)
        {
            try
            {
                if (IsConnected)
                {
                    reconnectAttempts = 0; // Reset attempts on successful active connection
                    await Task.Delay(1000, token);
                    continue;
                }

                DisconnectClient();
                AppConfig config = AppConfig.Current;
                if (string.IsNullOrWhiteSpace(config.ServerHost) || config.ServerPort <= 0 || string.IsNullOrWhiteSpace(config.MachineId) || config.MachineId == Guid.Empty.ToString())
                {
                    Debug.WriteLine("[MqttTransport] Cấu hình không hợp lệ. Vui lòng thiết lập thông tin Server và MachineId đúng chuẩn trước.");
                    await Task.Delay(3000, token);
                    continue;
                }

                Log($"MQTT: Đang kết nối đến broker {config.ServerHost}:{config.ServerPort}...");
                _mqttClient = _factory.CreateMqttClient();
                
                var lwtEnvelope = new
                {
                    protocolVersion = 1,
                    messageId = Guid.NewGuid().ToString(),
                    messageType = "telemetry",
                    clientId = config.MachineId,
                    sentAt = DateTime.UtcNow,
                    payload = new
                    {
                        machineId = config.MachineId,
                        status = "OFFLINE",
                        plcConnected = false
                    }
                };
                string lwtJson = System.Text.Json.JsonSerializer.Serialize(lwtEnvelope);
                string encryptedLwtPayload = CryptoHelper.Encrypt(lwtJson);

                var options = _factory.CreateClientOptionsBuilder()
                    .WithTcpServer(config.ServerHost, config.ServerPort)
                    .WithClientId(config.MachineId)
                    .WithCleanSession(true)
                    .WithKeepAlivePeriod(TimeSpan.FromSeconds(15))
                    .WithWillTopic($"client/{config.MachineId}/telemetry")
                    .WithWillPayload(encryptedLwtPayload)
                    .WithWillQualityOfServiceLevel(MQTTnet.Protocol.MqttQualityOfServiceLevel.AtLeastOnce)
                    .Build();

                _mqttClient.ApplicationMessageReceivedAsync += HandleMessageReceivedAsync;

                var connectResult = await _mqttClient.ConnectAsync(options, token);
                
                if (connectResult.ResultCode == MqttClientConnectResultCode.Success)
                {
                    Log("MQTT: Đã kết nối thành công đến broker.");
                    reconnectAttempts = 0; // Reset on success
                    
                    // Subscribe to incoming commands
                    string commandTopic = $"client/{config.MachineId}/command";
                    var subscribeOptions = _factory.CreateSubscribeOptionsBuilder()
                        .WithTopicFilter(f => f.WithTopic(commandTopic))
                        .Build();
                    await _mqttClient.SubscribeAsync(subscribeOptions, token);
                    Log($"MQTT: Đã subscribe vào topic {commandTopic}");

                    if (OnConnected != null)
                    {
                        await OnConnected.Invoke();
                    }
                }
                else
                {
                    reconnectAttempts++;
                    int delaySeconds = (int)Math.Min(Math.Pow(2, reconnectAttempts), 60);
                    Log($"MQTT: Kết nối thất bại: {connectResult.ResultCode}. Thử lại sau {delaySeconds} giây...");
                    await Task.Delay(delaySeconds * 1000, token);
                }
            }
            catch (Exception ex)
            {
                reconnectAttempts++;
                int delaySeconds = (int)Math.Min(Math.Pow(2, reconnectAttempts), 60);
                Log($"MQTT: Lỗi kết nối: {ex.Message}. Thử lại sau {delaySeconds} giây...");
                DisconnectClient();
                await Task.Delay(delaySeconds * 1000, token);
            }
        }
    }

    private async Task HandleMessageReceivedAsync(MqttApplicationMessageReceivedEventArgs e)
    {
        try
        {
            string topic = e.ApplicationMessage.Topic;
            string payloadString = e.ApplicationMessage.ConvertPayloadToString();

            // Decrypt payload from server (e.g. commands)
            string json = CryptoHelper.Decrypt(payloadString);
            
            Log($"MQTT: Nhận bản tin trên topic {topic}: {json}");
            
            if (OnMessageReceived != null)
            {
                await OnMessageReceived.Invoke(json);
            }
        }
        catch (Exception ex)
        {
            Log($"MQTT: Lỗi xử lý bản tin nhận được: {ex.Message}");
        }
    }

    public async Task<bool> SendMessageAsync(string topic, string payload, CancellationToken token)
    {
        if (!IsConnected || _mqttClient == null)
        {
            return false;
        }

        try
        {
            // Encrypt payload before publishing
            string encryptedPayload = CryptoHelper.Encrypt(payload);

            var message = _factory.CreateApplicationMessageBuilder()
                .WithTopic(topic)
                .WithPayload(encryptedPayload)
                .WithQualityOfServiceLevel(MQTTnet.Protocol.MqttQualityOfServiceLevel.AtLeastOnce)
                .Build();

            await _sendLock.WaitAsync(token);
            try
            {
                await _mqttClient.PublishAsync(message, token);
                return true;
            }
            finally
            {
                _sendLock.Release();
            }
        }
        catch (Exception ex)
        {
            Log($"MQTT Publish Error on {topic}: {ex.Message}");
            DisconnectClient();
            return false;
        }
    }
}
