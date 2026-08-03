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
    private Task _loopTask = Task.CompletedTask;
    private Task _stopTask = Task.CompletedTask;
    private bool _isRunning;
    private readonly object _lifecycleLock = new object();
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
        lock (_lifecycleLock)
        {
            if (_isRunning)
            {
                return;
            }

            _isRunning = true;
            _cts = new CancellationTokenSource();
            CancellationToken token = _cts.Token;
            _loopTask = Task.Run(async () =>
            {
                try
                {
                    await ConnectAndLoopAsync(token);
                }
                catch (OperationCanceledException) when (token.IsCancellationRequested)
                {
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
        StopAsync().GetAwaiter().GetResult();
    }

    public Task StopAsync()
    {
        lock (_lifecycleLock)
        {
            if (!_isRunning)
            {
                return _stopTask;
            }

            _isRunning = false;
            _cts?.Cancel();
            _stopTask = StopCoreAsync(_loopTask, _cts);
            _cts = null;
            return _stopTask;
        }
    }

    private async Task StopCoreAsync(Task loopTask, CancellationTokenSource? cts)
    {
        try
        {
            await loopTask.ConfigureAwait(false);
        }
        finally
        {
            await DisconnectClientAsync().ConfigureAwait(false);
            cts?.Dispose();
        }
    }


    private async Task DisconnectClientAsync()
    {
        IMqttClient? client = null;
        try
        {
            if (_mqttClient != null)
            {
                _mqttClient.ApplicationMessageReceivedAsync -= HandleMessageReceivedAsync;
                client = _mqttClient;
                _mqttClient = null;
                if (client.IsConnected)
                {
                    try
                    {
                        await client.DisconnectAsync().ConfigureAwait(false);
                    }
                    catch (Exception ex)
                    {
                        Serilog.Log.Error(ex, "MQTT client DisconnectAsync failed");
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Serilog.Log.Error(ex, "Error disposing/disconnecting MQTT client");
        }
        finally
        {
            try { client?.Dispose(); }
            catch (Exception ex)
            {
                Serilog.Log.Warning(ex, "[MqttTransport] Failed to dispose MQTT client");
            }
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

                await DisconnectClientAsync().ConfigureAwait(false);
                AppConfig config = AppConfig.Current;
                if (string.IsNullOrWhiteSpace(config.ServerHost) || config.ServerPort <= 0 || string.IsNullOrWhiteSpace(config.MachineId) || config.MachineId == Guid.Empty.ToString())
                {
                    Debug.WriteLine("[MqttTransport] Cấu hình không hợp lệ. Vui lòng thiết lập thông tin Server và MachineId đúng chuẩn trước.");
                    await Task.Delay(3000, token);
                    continue;
                }

                Log($"MQTT: Đang kết nối đến broker {config.ServerHost}:{config.ServerPort}...");
                _mqttClient = _factory.CreateMqttClient();

                if (string.IsNullOrWhiteSpace(config.ServerToken))
                {
                    Log("MQTT: Device token is missing. Configure FII_MQTT_DEVICE_TOKEN before connecting.");
                    await Task.Delay(3000, token);
                    continue;
                }
                
                string lwtJson = BuildLastWillJson(config.MachineId);
                string encryptedLwtPayload = CryptoHelper.Encrypt(lwtJson);

                var optionsBuilder = _factory.CreateClientOptionsBuilder()
                    .WithTcpServer(config.ServerHost, config.ServerPort)
                    .WithClientId(config.MachineId)
                    .WithCredentials(config.MachineId, config.ServerToken)
                    .WithCleanSession(true)
                    .WithKeepAlivePeriod(TimeSpan.FromSeconds(15))
                    .WithWillTopic(BuildLastWillTopic(config.MachineId))
                    .WithWillPayload(encryptedLwtPayload)
                    .WithWillQualityOfServiceLevel(MQTTnet.Protocol.MqttQualityOfServiceLevel.AtLeastOnce);

                if (config.MqttUseTls)
                {
                    optionsBuilder.WithTlsOptions(tls => tls.UseTls());
                }

                var options = optionsBuilder.Build();

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
                await DisconnectClientAsync().ConfigureAwait(false);
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
            await ProcessInboundMessageAsync(topic, payloadString);
        }
        catch (Exception ex)
        {
            Log($"MQTT: Lỗi xử lý bản tin nhận được: {ex.Message}");
        }
    }

    private static string BuildLastWillJson(string machineId)
    {
        var lwtEnvelope = new
        {
            protocolVersion = 1,
            messageId = Guid.NewGuid().ToString(),
            messageType = "heartbeat",
            clientId = machineId,
            sentAt = DateTime.UtcNow,
            payload = new
            {
                machineId,
                status = "OFFLINE",
                plcConnected = false
            }
        };
        return System.Text.Json.JsonSerializer.Serialize(lwtEnvelope);
    }

    private static string BuildLastWillTopic(string machineId) =>
        $"client/{machineId}/heartbeat";

    internal async Task ProcessInboundMessageAsync(string topic, string encryptedPayload)
    {
        string json = CryptoHelper.Decrypt(encryptedPayload);

        Log($"MQTT: Nhận bản tin trên topic {topic}");

        if (OnMessageReceived != null)
        {
            await OnMessageReceived.Invoke(json);
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
        catch (OperationCanceledException) when (token.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            Log($"MQTT Publish Error on {topic}: {ex.Message}");
            await DisconnectClientAsync().ConfigureAwait(false);
            return false;
        }
    }
}
