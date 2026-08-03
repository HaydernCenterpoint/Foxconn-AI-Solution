using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using HslCommunication;
using PLC.Config;
using PLC.Database;
using PLC.Service;
using Serilog;

namespace PLC.Network;

public class MqttClientService
{
    private static readonly object _lock = new object();

    private static MqttClientService? _fallbackInstance;
    public static MqttClientService Instance
    {
        get
        {
            lock (_lock)
            {
                var servicesInstance = AppServiceProvider.Services?.GetService(typeof(MqttClientService)) as MqttClientService;
                if (servicesInstance != null)
                {
                    return servicesInstance;
                }
                if (_fallbackInstance == null)
                {
                    _fallbackInstance = new MqttClientService();
                }
                return _fallbackInstance;
            }
        }
    }

    private readonly IServerTransport _transport;
    private readonly IPLCPollingService _plcPolling;
    private readonly LocalDbService _localDb;
    private readonly ApplicationAcknowledgementHandler _acknowledgementHandler;
    private readonly TelemetryPayloadBuilder _payloadBuilder = new TelemetryPayloadBuilder();
    private readonly SemaphoreSlim _deliveryPumpLock = new SemaphoreSlim(1, 1);
    private readonly SemaphoreSlim _publishLock = new SemaphoreSlim(1, 1);
    
    private CancellationTokenSource _cts;
    private bool _isRunning;
    private readonly object _lifecycleLock = new object();
    private readonly HashSet<Task> _backgroundOperations = new HashSet<Task>();
    private Task? _telemetryLoopTask;
    private Task? _deliveryPumpTask;
    private Task _stopTask = Task.CompletedTask;
    private bool _acceptingProducers = true;
    private bool _stopInitiated;

    // Delta telemetry state variables
    private string? _lastSentStatus;
    private bool? _lastSentPlcConnected;
    private int? _lastSentRunCount;
    private double? _lastSentCycleTimeSec;
    private Dictionary<string, object> _lastSentPlcData = new();
    private DateTime _lastFullTelemetryTime = DateTime.MinValue;

    public ConnectionHealth Health
    {
        get
        {
            bool server = IsConnectedToServer;
            bool plc = IsPlcConnected;
            if (plc && server) return ConnectionHealth.Healthy;
            if (plc && !server) return ConnectionHealth.Degraded;
            if (!plc && server) return ConnectionHealth.Limited;
            return ConnectionHealth.Offline;
        }
    }

    public bool IsConnectedToServer => _transport.IsConnected;
    public bool IsPlcConnected => _plcPolling.IsPlcConnected;
    public PlcConnectionState ConnectionState => _plcPolling.ConnectionState;
    public string LatestStatus => _plcPolling.LatestStatus;
    public string ConnectedPlcBrand => _plcPolling.ConnectedPlcBrand;
    public string LastPlcError => _plcPolling.LastPlcError;
    public IPLCAdapter PlcInstance => _plcPolling.PlcInstance;
    public Dictionary<string, object> LatestPlcData => _plcPolling.LatestPlcData;
    public Dictionary<string, string> LatestPlcErrors => _plcPolling.LatestPlcErrors;
    public System.Collections.ObjectModel.ObservableCollection<PLC.Model.DataAddressItem> ActiveAddressItems { get; } = new System.Collections.ObjectModel.ObservableCollection<PLC.Model.DataAddressItem>();

    public void LoadActiveAddressItems()
    {
        ActiveAddressItems.Clear();
        var items = _localDb.LoadAddressesFromDb();
        foreach (var item in items)
        {
            ActiveAddressItems.Add(item);
        }
    }

    private void UpdateActiveAddressValues(Dictionary<string, object> plcData)
    {
        try
        {
            string timeStr = DateTime.Now.ToString("HH:mm:ss");
            var latestErrors = LatestPlcErrors;
            foreach (var item in ActiveAddressItems)
            {
                if (!item.Enabled)
                {
                    item.Value = LanguageManager.GetText("Disabled") ?? "Bị tắt";
                }
                else
                {
                    string key = (item.Address + ":" + item.Type).ToLower();
                    if (plcData.TryGetValue(key, out var val))
                    {
                        if (val is bool b)
                        {
                            item.Value = b ? "ON (True)" : "OFF (False)";
                        }
                        else
                        {
                            item.Value = val?.ToString() ?? "null";
                        }
                        item.LastUpdate = timeStr;
                    }
                    else if (!IsPlcConnected)
                    {
                        item.Value = LanguageManager.GetText("Disconnected") ?? "Mất kết nối";
                    }
                    else
                    {
                        if (latestErrors.TryGetValue(key, out var errDetail))
                        {
                            item.Value = $"Lỗi: {errDetail}";
                        }
                        else
                        {
                            item.Value = LanguageManager.GetText("ReadError") ?? "Lỗi đọc";
                        }
                    }
                }
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine("[MqttClientService] Error updating active address values: " + ex.Message);
        }
    }

    public static event Action<string> OnLogReceived;
    public static event Action<Dictionary<string, object>> OnPlcDataRead;

    public MqttClientService(
        IServerTransport transport,
        IPLCPollingService plcPolling,
        LocalDbService localDb)
    {
        _transport = transport;
        _plcPolling = plcPolling;
        _localDb = localDb;
        _acknowledgementHandler = new ApplicationAcknowledgementHandler(
            _localDb.OfflineQueueRepository,
            HandleCompletedDelivery);
        InitializeService();
    }

    public MqttClientService(IServerTransport transport, IPLCPollingService plcPolling)
        : this(transport, plcPolling, LocalDbService.Instance)
    {
    }

    public MqttClientService() : this(new MqttTransport(), new PLCPollingService(), new LocalDbService())
    {
    }

    private void InitializeService()
    {
        LoadActiveAddressItems();

        // Bind logging events
        _transport.OnLogReceived += msg => OnLogReceived?.Invoke(msg);
        _plcPolling.OnLogReceived += msg => OnLogReceived?.Invoke(msg);

        // Bind PLC read events
        _plcPolling.OnPlcDataRead += data =>
        {
            UpdateActiveAddressValues(data);
            OnPlcDataRead?.Invoke(data);

            if (_isRunning && _acceptingProducers && _serverCommEnabled)
            {
                _ = TrackOperation(() => RunProducerAsync(async token =>
                {
                    await SendTelemetryInternalAsync(
                        _plcPolling.LatestStatus,
                        _plcPolling.IsPlcConnected,
                        _plcPolling.LatestCycleTimeSec,
                        _plcPolling.LatestRunCount,
                        data,
                        token);
                }));
            }
        };

        _transport.OnConnected += () =>
            _acceptingProducers
                ? TrackOperation(HandleConnectedAsync)
                : Task.CompletedTask;
    }

    private async Task HandleConnectedAsync()
    {
        if (!_acceptingProducers)
        {
            return;
        }
        CancellationToken token = _cts?.Token ?? CancellationToken.None;
        try
        {
            await SendRegisterAsync(token);
            await PumpDeliveryAsync(token);
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested)
        {
        }
        catch (Exception ex)
        {
            Log.Error(ex, "[MqttClientService] Connected delivery processing failed");
        }
    }

    private async Task SendRegisterAsync(CancellationToken token)
    {
        AppConfig config = AppConfig.Current;
        string topic = $"client/{config.MachineId}/register";
        long lastSyncSeq = _localDb.GetLastSyncSequence();
        string json = _payloadBuilder.BuildRegisterJson(lastSyncSeq);

        if (await SendSerializedAsync(topic, json, token))
        {
            OnLogReceived?.Invoke($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Server: Đã gửi bản tin register (clientId={config.MachineId}, lastSyncSeq={lastSyncSeq}).");
        }
    }

    private bool _serverCommEnabled = true;
    public bool ServerCommEnabled
    {
        get => _serverCommEnabled;
        set
        {
            if (_serverCommEnabled != value)
            {
                _serverCommEnabled = value;
                if (value)
                {
                    if (_isRunning) _transport.Start();
                }
                else
                {
                    _transport.Stop();
                }
            }
        }
    }

    public void Start()
    {
        lock (_lifecycleLock)
        {
            if (_isRunning || _stopInitiated)
            {
                return;
            }
            _isRunning = true;
            _acceptingProducers = true;
            _cts = new CancellationTokenSource();
            if (_serverCommEnabled)
            {
                _transport.Start();
            }
            _plcPolling.Start();

            _telemetryLoopTask = Task.Run(async () =>
            {
                try
                {
                    await TelemetryLoopAsync(_cts.Token);
                }
                catch (Exception ex)
                {
                    Log.Error(ex, "[MqttClientService] TelemetryLoopAsync failed");
                }
            });
            _deliveryPumpTask = Task.Run(async () =>
            {
                try
                {
                    await DeliveryPumpLoopAsync(_cts.Token);
                }
                catch (OperationCanceledException) when (_cts.IsCancellationRequested)
                {
                }
                catch (Exception ex)
                {
                    Log.Error(ex, "[MqttClientService] DeliveryPumpLoopAsync failed");
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
            if (_stopInitiated)
            {
                return _stopTask;
            }
            _stopInitiated = true;
            _acceptingProducers = false;
            _isRunning = false;
            _cts?.Cancel();
            _stopTask = StopCoreAsync();
            return _stopTask;
        }
    }

    private async Task StopCoreAsync()
    {
        _plcPolling.Stop();
        await AwaitBackgroundWorkAsync().ConfigureAwait(false);

        StoredOfflineTelemetry? finalOffline = null;
        try
        {
            finalOffline = StoreFinalOfflineTelemetry();
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Failed to durably store final offline telemetry; publish suppressed");
        }

        if (finalOffline is not null && _serverCommEnabled && IsConnectedToServer)
        {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
            try
            {
                _localDb.PrepareOfflineMessageForPublish(
                    new OfflineQueueEnqueueRequest(
                        finalOffline.MessageId,
                        finalOffline.Topic,
                        finalOffline.Json),
                    enqueueIfMissing: false);
                if (!await SendSerializedAsync(
                        finalOffline.Topic,
                        finalOffline.Json,
                        timeout.Token).ConfigureAwait(false))
                {
                    _localDb.RecordOfflineMessageFailure(
                        finalOffline.MessageId,
                        "Final offline telemetry publish failed.");
                }
            }
            catch (OperationCanceledException)
            {
                _localDb.RecordOfflineMessageFailure(
                    finalOffline.MessageId,
                    "Final offline telemetry publish timed out.");
            }
            catch (Exception ex)
            {
                Log.Warning(ex, "Failed to send final offline telemetry");
                _localDb.RecordOfflineMessageFailure(
                    finalOffline.MessageId,
                    "Final offline telemetry publish failed.");
            }
        }

        await _transport.StopAsync().ConfigureAwait(false);
    }

    private StoredOfflineTelemetry StoreFinalOfflineTelemetry()
    {
        AppConfig config = AppConfig.Current;
        string topic = $"client/{config.MachineId}/telemetry";
        long deliverySequence = _localDb.ReserveTelemetryDeliverySequence();
        string messageId = Guid.NewGuid().ToString();
        string json = _payloadBuilder.BuildTelemetryJson(
            "OFFLINE",
            isPlcConnected: false,
            cycleTimeSec: 0,
            runCount: 0,
            plcRuntimeSeconds: 0,
            plcData: new Dictionary<string, object>(),
            deliverySequence,
            messageId);
        _localDb.StoreTelemetryForDelivery(
            new OfflineQueueEnqueueRequest(messageId, topic, json),
            deliverySequence,
            0,
            0,
            0);
        return new StoredOfflineTelemetry(topic, json, messageId);
    }

    private sealed record StoredOfflineTelemetry(string Topic, string Json, string MessageId);

    private async Task AwaitBackgroundWorkAsync()
    {
        Task[] tracked;
        lock (_lifecycleLock)
        {
            tracked = _backgroundOperations.ToArray();
        }
        Task[] tasks = new[] { _telemetryLoopTask, _deliveryPumpTask }
            .Where(task => task is not null)
            .Cast<Task>()
            .Concat(tracked)
            .Distinct()
            .ToArray();
        if (tasks.Length == 0)
        {
            return;
        }

        try
        {
            await Task.WhenAll(tasks).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
        }
    }

    private async Task RunProducerAsync(Func<CancellationToken, Task> producer)
    {
        CancellationToken token = _cts?.Token ?? CancellationToken.None;
        if (!_acceptingProducers || token.IsCancellationRequested)
        {
            return;
        }
        try
        {
            await producer(token);
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested)
        {
        }
        catch (Exception ex)
        {
            Log.Error(ex, "[MqttClientService] Producer failed");
        }
    }

    private Task TrackOperation(Func<Task> operationFactory)
    {
        ArgumentNullException.ThrowIfNull(operationFactory);
        Task operation;
        lock (_lifecycleLock)
        {
            if (_stopInitiated)
            {
                return Task.CompletedTask;
            }
            operation = operationFactory();
            if (!operation.IsCompleted)
            {
                _backgroundOperations.Add(operation);
            }
        }

        if (operation.IsCompleted)
        {
            return operation;
        }

        _ = operation.ContinueWith(
            completed =>
            {
                lock (_lifecycleLock)
                {
                    _backgroundOperations.Remove(completed);
                }
            },
            CancellationToken.None,
            TaskContinuationOptions.ExecuteSynchronously,
            TaskScheduler.Default);
        return operation;
    }

    private async Task<bool> SendSerializedAsync(
        string topic,
        string payload,
        CancellationToken token)
    {
        await _publishLock.WaitAsync(token).ConfigureAwait(false);
        try
        {
            return await _transport.SendMessageAsync(topic, payload, token).ConfigureAwait(false);
        }
        finally
        {
            _publishLock.Release();
        }
    }

    public void ReconnectDefaultPlc()
    {
        _plcPolling.ReconnectDefaultPlc();
    }

    public void UpdateReadAddresses(string readAddresses)
    {
        _plcPolling.UpdateReadAddresses(readAddresses);
    }

    private async Task TelemetryLoopAsync(CancellationToken token)
    {
        DateTime lastTelemetrySent = DateTime.MinValue;
        while (!token.IsCancellationRequested)
        {
            try
            {
                int configInterval = AppConfig.Current.ReadIntervalMs;
                if (_acceptingProducers && _serverCommEnabled &&
                    (DateTime.UtcNow - lastTelemetrySent).TotalMilliseconds >= (double)configInterval)
                {
                    await SendTelemetryInternalAsync(
                        _plcPolling.LatestStatus,
                        _plcPolling.IsPlcConnected,
                        _plcPolling.LatestCycleTimeSec,
                        _plcPolling.LatestRunCount,
                        _plcPolling.LatestPlcData,
                        token
                    );
                    lastTelemetrySent = DateTime.UtcNow;
                }
            }
            catch (OperationCanceledException) when (token.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                Log.Error(ex, "[MqttClientService] Telemetry loop error");
            }
            await Task.Delay(1000, token);
        }
    }

    private async Task SendTelemetryInternalAsync(string status, bool isPlcConnected, double cycleTimeSec, int runCount, Dictionary<string, object> plcData, CancellationToken token)
    {
        try
        {
            bool hasChanged = HasTelemetryChanged(status, isPlcConnected, cycleTimeSec, runCount, plcData);
            bool shouldSendFull = hasChanged || (DateTime.UtcNow - _lastFullTelemetryTime).TotalSeconds >= 60.0;

            if (!shouldSendFull)
            {
                await SendHeartbeatAsync(status, isPlcConnected, token);
                return;
            }

            AppConfig config = AppConfig.Current;
            string topic = $"client/{config.MachineId}/telemetry";
            long deliverySequence = _localDb.ReserveTelemetryDeliverySequence();
            string messageId = Guid.NewGuid().ToString();
            string json = _payloadBuilder.BuildTelemetryJson(
                status,
                isPlcConnected,
                cycleTimeSec,
                runCount,
                _plcPolling.LatestPlcRuntimeSeconds,
                plcData,
                deliverySequence,
                messageId);
            var queueMessage = new OfflineQueueEnqueueRequest(messageId, topic, json);
            _localDb.StoreTelemetryForDelivery(
                queueMessage,
                deliverySequence,
                runCount,
                0,
                cycleTimeSec);

            if (!IsConnectedToServer)
            {
                OnLogReceived?.Invoke($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Telemetry: Mất kết nối, đã lưu vào hàng đợi ngoại tuyến SQLite.");
                return;
            }

            _localDb.PrepareOfflineMessageForPublish(queueMessage, enqueueIfMissing: false);
            if (await SendSerializedAsync(topic, json, token))
            {
                OnLogReceived?.Invoke($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Telemetry: Đã gửi qua server, đang chờ application ACK (Status={status}, PLC={isPlcConnected}, Tags={plcData.Count})");
                
                _lastSentStatus = status;
                _lastSentPlcConnected = isPlcConnected;
                _lastSentRunCount = runCount;
                _lastSentCycleTimeSec = cycleTimeSec;
                _lastSentPlcData = new Dictionary<string, object>(plcData);
                _lastFullTelemetryTime = DateTime.UtcNow;
            }
            else
            {
                _localDb.RecordOfflineMessageFailure(messageId, "MQTT publish failed.");
                OnLogReceived?.Invoke($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Telemetry Error: Gửi thất bại, đã lưu vào hàng đợi ngoại tuyến SQLite.");
            }
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            OnLogReceived?.Invoke($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Telemetry Error: {ex.Message}");
            _transport.Stop();
        }
    }

    private bool HasTelemetryChanged(string status, bool isPlcConnected, double cycleTimeSec, int runCount, Dictionary<string, object> plcData)
    {
        if (_lastSentStatus != status) return true;
        if (_lastSentPlcConnected != isPlcConnected) return true;
        if (_lastSentRunCount != runCount) return true;
        if (Math.Abs((_lastSentCycleTimeSec ?? 0.0) - cycleTimeSec) > 0.001) return true;

        if (plcData.Count != _lastSentPlcData.Count) return true;
        foreach (var kvp in plcData)
        {
            if (!_lastSentPlcData.TryGetValue(kvp.Key, out var oldVal) || !Equals(oldVal, kvp.Value))
            {
                return true;
            }
        }
        return false;
    }

    private async Task SendHeartbeatAsync(string status, bool isPlcConnected, CancellationToken token)
    {
        if (!IsConnectedToServer) return;
        try
        {
            AppConfig config = AppConfig.Current;
            string topic = $"client/{config.MachineId}/heartbeat";
            string json = _payloadBuilder.BuildHeartbeatJson(status, isPlcConnected);
            await SendSerializedAsync(topic, json, token);
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "[MqttClientService] Send heartbeat failed");
        }
    }

    private async Task ProcessOfflineQueueAsync(CancellationToken token)
    {
        try
        {
            var messages = _localDb.GetDueOfflineMessages(100);
            if (messages.Count == 0) return;

            OnLogReceived?.Invoke($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Offline Queue: Phát hiện {messages.Count} bản tin ngoại tuyến trong SQLite. Đang gửi lại...");
            foreach (var msg in messages)
            {
                if (token.IsCancellationRequested || !IsConnectedToServer) break;

                _localDb.PrepareOfflineMessageForPublish(
                    new OfflineQueueEnqueueRequest(msg.MessageId, msg.Topic, msg.Payload),
                    enqueueIfMissing: false);
                if (await SendSerializedAsync(msg.Topic, msg.Payload, token))
                {
                    await Task.Delay(100, token);
                }
                else
                {
                    _localDb.RecordOfflineMessageFailure(msg.MessageId, "MQTT publish failed.");
                    OnLogReceived?.Invoke($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Offline Queue: Gửi lại thất bại, tạm ngưng xử lý hàng đợi.");
                    break;
                }
            }
            OnLogReceived?.Invoke($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Offline Queue: Hoàn tất gửi lại dữ liệu ngoại tuyến.");
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            OnLogReceived?.Invoke($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Offline Queue Error: {ex.Message}");
        }
    }

    private async Task DeliveryPumpLoopAsync(CancellationToken token)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1));
        while (await timer.WaitForNextTickAsync(token))
        {
            if (_serverCommEnabled && IsConnectedToServer)
            {
                await PumpDeliveryAsync(token);
            }
        }
    }

    private async Task PumpDeliveryAsync(CancellationToken token)
    {
        if (!await _deliveryPumpLock.WaitAsync(0, token))
        {
            return;
        }

        try
        {
            await ProcessOfflineQueueAsync(token);
            await ProcessSyncAsync(token);
        }
        finally
        {
            _deliveryPumpLock.Release();
        }
    }

    private async Task ProcessSyncAsync(CancellationToken token)
    {
        try
        {
            var unsynced = _localDb.GetUnsyncedTelemetryRecords();
            if (unsynced == null || unsynced.Count == 0) return;

            OnLogReceived?.Invoke($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Sync: Phát hiện {unsynced.Count} bản ghi chưa đồng bộ. Đang đồng bộ hóa...");
            
            AppConfig config = AppConfig.Current;
            string topic = $"client/{config.MachineId}/sync";
            if (!_localDb.CanCreateSyncBatch(topic))
            {
                return;
            }
            
            var payload = new
            {
                machineId = config.MachineId,
                records = unsynced.Select(r => new
                {
                    localRowId = r.Id,
                    sequence = r.Sequence,
                    timestamp = r.Timestamp,
                    rawJson = r.RawJson
                }).ToList()
            };

            string messageId = Guid.NewGuid().ToString();
            var syncMessage = new
            {
                protocolVersion = 1,
                messageId,
                messageType = "sync",
                clientId = config.MachineId,
                sentAt = DateTime.UtcNow,
                payload = payload
            };

            string json = JsonSerializer.Serialize(syncMessage, new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            });

            var queueMessage = new OfflineQueueEnqueueRequest(messageId, topic, json);
            _localDb.PrepareOfflineMessageForPublish(queueMessage, enqueueIfMissing: true);
            if (await SendSerializedAsync(topic, json, token))
            {
                var ids = unsynced.Select(r => r.Sequence).ToList();
                OnLogReceived?.Invoke($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Sync: Đã gửi {ids.Count} bản ghi, đang chờ application ACK.");
            }
            else
            {
                _localDb.RecordOfflineMessageFailure(messageId, "MQTT sync publish failed.");
                OnLogReceived?.Invoke($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Sync: Đồng bộ thất bại, sẽ thử lại sau.");
            }
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            OnLogReceived?.Invoke($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Sync Error: {ex.Message}");
        }
    }

    public Task HandleApplicationAcknowledgementAsync(string json)
    {
        ApplicationAcknowledgementDisposition disposition = _acknowledgementHandler.Handle(json);
        OnLogReceived?.Invoke(
            $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Delivery ACK: {disposition}.");
        return Task.CompletedTask;
    }

    private void HandleCompletedDelivery(
        OfflineQueueMessage message,
        ApplicationAcknowledgement acknowledgement)
    {
        if (acknowledgement.MessageType == "syncAck")
        {
            List<long> rowIds = ReadSyncRowIds(message.Payload);
            if (rowIds.Count == 0)
            {
                throw new InvalidOperationException(
                    "Acknowledged sync envelope does not contain local telemetry row IDs.");
            }
            _localDb.MarkTelemetryRecordsAsSynced(rowIds);
        }
        else
        {
            _localDb.MarkTelemetryPayloadAsSynced(message.Payload);
        }
    }

    private static List<long> ReadSyncRowIds(string json)
    {
        using JsonDocument document = JsonDocument.Parse(json);
        if (!document.RootElement.TryGetProperty("payload", out JsonElement payload) ||
            !payload.TryGetProperty("records", out JsonElement records) ||
            records.ValueKind != JsonValueKind.Array)
        {
            return new List<long>();
        }

        return records.EnumerateArray()
            .Where(record => record.TryGetProperty("localRowId", out JsonElement rowId) && rowId.TryGetInt64(out _))
            .Select(record => record.GetProperty("localRowId").GetInt64())
            .ToList();
    }

    private static string ReadMessageId(string json)
    {
        using JsonDocument document = JsonDocument.Parse(json);
        if (!document.RootElement.TryGetProperty("messageId", out JsonElement messageId) ||
            messageId.ValueKind != JsonValueKind.String ||
            string.IsNullOrWhiteSpace(messageId.GetString()))
        {
            throw new InvalidOperationException("Telemetry payload does not contain a stable messageId.");
        }

        return messageId.GetString()!.Trim();
    }

    public string GenerateTelemetryJson(string status, bool isPlcConnected, double cycleTimeSec, int runCount, int plcRuntimeSeconds, Dictionary<string, object> plcData)
    {
        return _payloadBuilder.BuildTelemetryJson(status, isPlcConnected, cycleTimeSec, runCount, plcRuntimeSeconds, plcData);
    }

    public string GenerateTelemetryJson()
    {
        return GenerateTelemetryJson(
            _plcPolling.LatestStatus ?? "OFFLINE",
            _plcPolling.IsPlcConnected,
            _plcPolling.LatestCycleTimeSec,
            _plcPolling.LatestRunCount,
            _plcPolling.LatestPlcRuntimeSeconds,
            _plcPolling.LatestPlcData ?? new Dictionary<string, object>()
        );
    }

    public async Task SendTelemetryManualAsync()
    {
        if (!_acceptingProducers)
        {
            return;
        }
        await TrackOperation(() => RunProducerAsync(token => SendTelemetryInternalAsync(
            _plcPolling.LatestStatus ?? "OFFLINE",
            _plcPolling.IsPlcConnected,
            _plcPolling.LatestCycleTimeSec,
            _plcPolling.LatestRunCount,
            _plcPolling.LatestPlcData ?? new Dictionary<string, object>(),
            token)));
    }

    // Public API for command handlers
    public Task<bool> ConnectPlcAsync(string brand, string ip, int port)
    {
        return Task.FromResult(_plcPolling.ConnectPlc(brand, ip, port));
    }

    public Task DisconnectPlcAsync()
    {
        _plcPolling.DisconnectPlc();
        return Task.CompletedTask;
    }

    public Task ConfigurePlcAsync(string brand, string ip, int port, string readAddresses)
    {
        AppConfig config = AppConfig.Current;
        if (!string.IsNullOrEmpty(brand) && !string.IsNullOrEmpty(ip) && port > 0)
        {
            config.PlcBrand = brand;
            config.PlcIp = ip;
            config.PlcPort = port;
        }
        config.ReadAddresses = readAddresses;
        config.Save();
        _plcPolling.UpdateReadAddresses(readAddresses);
        _plcPolling.ReconnectDefaultPlc();
        return Task.CompletedTask;
    }

    public Task<(bool success, object value, string error)> ReadPlcAsync(string address, string dataType, ushort length)
    {
        var plc = _plcPolling.PlcInstance;
        if (plc == null)
        {
            return Task.FromResult<(bool success, object value, string error)>((false, null, "PLC not connected. Connect first."));
        }

        try
        {
            object val = null;
            bool isSuccess = false;
            string errMsg = "";

            switch (dataType.ToLower())
            {
                case "bool":
                    {
                        var res = plc.ReadBool(address);
                        isSuccess = res.IsSuccess;
                        if (isSuccess) val = res.Content;
                        else errMsg = res.Message;
                        break;
                    }
                case "int16":
                case "short":
                    {
                        var res = plc.ReadInt16(address);
                        isSuccess = res.IsSuccess;
                        if (isSuccess) val = res.Content;
                        else errMsg = res.Message;
                        break;
                    }
                case "uint16":
                case "ushort":
                    {
                        var res = plc.ReadUInt16(address);
                        isSuccess = res.IsSuccess;
                        if (isSuccess) val = res.Content;
                        else errMsg = res.Message;
                        break;
                    }
                case "int32":
                case "int":
                    {
                        var res = plc.ReadInt32(address);
                        isSuccess = res.IsSuccess;
                        if (isSuccess) val = res.Content;
                        else errMsg = res.Message;
                        break;
                    }
                case "uint32":
                case "uint":
                    {
                        var res = plc.ReadUInt32(address);
                        isSuccess = res.IsSuccess;
                        if (isSuccess) val = res.Content;
                        else errMsg = res.Message;
                        break;
                    }
                case "float":
                case "single":
                    {
                        var res = plc.ReadFloat(address);
                        isSuccess = res.IsSuccess;
                        if (isSuccess) val = res.Content;
                        else errMsg = res.Message;
                        break;
                    }
                case "double":
                    {
                        var res = plc.ReadDouble(address);
                        isSuccess = res.IsSuccess;
                        if (isSuccess) val = res.Content;
                        else errMsg = res.Message;
                        break;
                    }
                case "string":
                    {
                        var res = plc.ReadString(address, length);
                        isSuccess = res.IsSuccess;
                        if (isSuccess) val = res.Content;
                        else errMsg = res.Message;
                        break;
                    }
                default:
                    return Task.FromResult<(bool success, object value, string error)>((false, null, $"Data type '{dataType}' not supported."));
            }

            if (isSuccess)
            {
                return Task.FromResult<(bool success, object value, string error)>((true, val, null));
            }
            return Task.FromResult<(bool success, object value, string error)>((false, null, errMsg));
        }
        catch (Exception ex)
        {
            return Task.FromResult<(bool success, object value, string error)>((false, null, ex.Message));
        }
    }

    public Task<(bool success, string error)> WritePlcAsync(string address, string dataType, JsonElement jsonValue)
    {
        var plc = _plcPolling.PlcInstance;
        if (plc == null)
        {
            return Task.FromResult<(bool success, string error)>((false, "PLC not connected. Connect first."));
        }

        try
        {
            OperateResult writeResult;
            switch (dataType.ToLower())
            {
                case "bool":
                    writeResult = plc.Write(address, jsonValue.GetBoolean());
                    break;
                case "int16":
                case "short":
                    writeResult = plc.Write(address, jsonValue.GetInt16());
                    break;
                case "uint16":
                case "ushort":
                    writeResult = plc.Write(address, jsonValue.GetUInt16());
                    break;
                case "int32":
                case "int":
                    writeResult = plc.Write(address, jsonValue.GetInt32());
                    break;
                case "uint32":
                case "uint":
                    writeResult = plc.Write(address, jsonValue.GetUInt32());
                    break;
                case "float":
                case "single":
                    writeResult = plc.Write(address, jsonValue.GetSingle());
                    break;
                case "double":
                    writeResult = plc.Write(address, jsonValue.GetDouble());
                    break;
                case "string":
                    writeResult = plc.Write(address, jsonValue.GetString());
                    break;
                default:
                    return Task.FromResult<(bool success, string error)>((false, $"Data type '{dataType}' not supported for writing."));
            }

            if (writeResult?.IsSuccess ?? false)
            {
                return Task.FromResult<(bool success, string error)>((true, null));
            }
            return Task.FromResult<(bool success, string error)>((false, writeResult?.Message ?? "Unknown error."));
        }
        catch (Exception ex)
        {
            return Task.FromResult<(bool success, string error)>((false, ex.Message));
        }
    }

    public Task RefreshStatusAsync()
    {
        return SendTelemetryManualAsync();
    }

    public void RestartConnection()
    {
        _transport.Stop();
        _transport.Start();
    }
}

public enum ConnectionHealth
{
    Healthy,
    Degraded,
    Limited,
    Offline
}
