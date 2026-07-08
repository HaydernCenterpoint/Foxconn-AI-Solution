using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using HslCommunication;
using PLC.Config;
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
    private readonly TelemetryPayloadBuilder _payloadBuilder = new TelemetryPayloadBuilder();
    
    private CancellationTokenSource _cts;
    private bool _isRunning;

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
        var items = LocalDbService.Instance.LoadAddressesFromDb();
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

    public MqttClientService(IServerTransport transport, IPLCPollingService plcPolling)
    {
        _transport = transport;
        _plcPolling = plcPolling;
        InitializeService();
    }

    public MqttClientService() : this(new MqttTransport(), new PLCPollingService())
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

            if (_isRunning && _serverCommEnabled)
            {
                _ = Task.Run(async () =>
                {
                    try
                    {
                        await SendTelemetryInternalAsync(
                            _plcPolling.LatestStatus,
                            _plcPolling.IsPlcConnected,
                            _plcPolling.LatestCycleTimeSec,
                            _plcPolling.LatestRunCount,
                            data,
                            CancellationToken.None
                        );
                    }
                    catch (Exception ex)
                    {
                        Log.Error(ex, "[MqttClientService] Immediate telemetry send failed");
                    }
                });
            }
        };

        _transport.OnConnected += HandleConnectedAsync;
    }

    private async Task HandleConnectedAsync()
    {
        await SendRegisterAsync(CancellationToken.None);
        _ = Task.Run(async () =>
        {
            try
            {
                await ProcessSyncAsync();
            }
            catch (Exception ex)
            {
                Log.Error(ex, "[MqttClientService] ProcessSyncAsync failed");
            }
        });
        _ = Task.Run(async () =>
        {
            try
            {
                await ProcessOfflineQueueAsync(CancellationToken.None);
            }
            catch (Exception ex)
            {
                Log.Error(ex, "[MqttClientService] ProcessOfflineQueueAsync failed");
            }
        });
    }

    private async Task SendRegisterAsync(CancellationToken token)
    {
        AppConfig config = AppConfig.Current;
        string topic = $"client/{config.MachineId}/register";
        long lastSyncSeq = LocalDbService.Instance.GetLastSyncSequence();
        string json = _payloadBuilder.BuildRegisterJson(lastSyncSeq);

        if (await _transport.SendMessageAsync(topic, json, token))
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
        if (!_isRunning)
        {
            _isRunning = true;
            _cts = new CancellationTokenSource();
            if (_serverCommEnabled)
            {
                _transport.Start();
            }
            _plcPolling.Start();

            Task.Run(async () =>
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
        }
    }

    public void Stop()
    {
        _isRunning = false;
        _cts?.Cancel();

        // Publish final offline message before disconnecting!
        if (_serverCommEnabled && IsConnectedToServer)
        {
            try
            {
                AppConfig config = AppConfig.Current;
                string topic = $"client/{config.MachineId}/telemetry";
                var offlineEnvelope = new
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
                string json = System.Text.Json.JsonSerializer.Serialize(offlineEnvelope);
                
                // Run in a background thread to prevent UI thread deadlock
                Task.Run(async () =>
                {
                    try
                    {
                        await _transport.SendMessageAsync(topic, json, CancellationToken.None);
                    }
                    catch (Exception ex)
                    {
                        Serilog.Log.Warning(ex, "Failed to send final offline message in background Task");
                    }
                    finally
                    {
                        _transport.Stop();
                    }
                });
            }
            catch (Exception ex)
            {
                Serilog.Log.Warning(ex, "Failed to send final offline telemetry message on Stop");
                _transport.Stop();
            }
        }
        else
        {
            _transport.Stop();
        }

        _plcPolling.Stop();
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
                if (_serverCommEnabled && (DateTime.UtcNow - lastTelemetrySent).TotalMilliseconds >= (double)configInterval)
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
            string json = GenerateTelemetryJson(status, isPlcConnected, cycleTimeSec, runCount, _plcPolling.LatestPlcRuntimeSeconds, plcData);

            long localId = LocalDbService.Instance.InsertTelemetryRecord(json, runCount, 0, cycleTimeSec);

            if (!IsConnectedToServer)
            {
                LocalDbService.Instance.EnqueueOfflineMessage(topic, json);
                OnLogReceived?.Invoke($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Telemetry: Mất kết nối, đã lưu vào hàng đợi ngoại tuyến SQLite.");
                return;
            }

            if (await _transport.SendMessageAsync(topic, json, token))
            {
                LocalDbService.Instance.MarkTelemetryRecordsAsSynced(new List<long> { localId });
                OnLogReceived?.Invoke($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Telemetry: Đã gửi qua server (Status={status}, PLC={isPlcConnected}, Tags={plcData.Count})");
                
                _lastSentStatus = status;
                _lastSentPlcConnected = isPlcConnected;
                _lastSentRunCount = runCount;
                _lastSentCycleTimeSec = cycleTimeSec;
                _lastSentPlcData = new Dictionary<string, object>(plcData);
                _lastFullTelemetryTime = DateTime.UtcNow;
            }
            else
            {
                LocalDbService.Instance.EnqueueOfflineMessage(topic, json);
                OnLogReceived?.Invoke($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Telemetry Error: Gửi thất bại, đã lưu vào hàng đợi ngoại tuyến SQLite.");
            }
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
            await _transport.SendMessageAsync(topic, json, token);
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
            var messages = LocalDbService.Instance.GetOfflineMessages();
            if (messages.Count == 0) return;

            OnLogReceived?.Invoke($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Offline Queue: Phát hiện {messages.Count} bản tin ngoại tuyến trong SQLite. Đang gửi lại...");
            foreach (var msg in messages)
            {
                if (token.IsCancellationRequested || !IsConnectedToServer) break;

                if (await _transport.SendMessageAsync(msg.Topic, msg.Payload, token))
                {
                    LocalDbService.Instance.DeleteOfflineMessage(msg.Id);
                    await Task.Delay(100, token);
                }
                else
                {
                    OnLogReceived?.Invoke($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Offline Queue: Gửi lại thất bại, tạm ngưng xử lý hàng đợi.");
                    break;
                }
            }
            OnLogReceived?.Invoke($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Offline Queue: Hoàn tất gửi lại dữ liệu ngoại tuyến.");
        }
        catch (Exception ex)
        {
            OnLogReceived?.Invoke($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Offline Queue Error: {ex.Message}");
        }
    }

    private async Task ProcessSyncAsync()
    {
        try
        {
            var unsynced = LocalDbService.Instance.GetUnsyncedTelemetryRecords();
            if (unsynced == null || unsynced.Count == 0) return;

            OnLogReceived?.Invoke($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Sync: Phát hiện {unsynced.Count} bản ghi chưa đồng bộ. Đang đồng bộ hóa...");
            
            AppConfig config = AppConfig.Current;
            string topic = $"client/{config.MachineId}/sync";
            
            var payload = new
            {
                machineId = config.MachineId,
                records = unsynced.Select(r => new
                {
                    sequence = r.Sequence,
                    timestamp = r.Timestamp,
                    rawJson = r.RawJson
                }).ToList()
            };

            var syncMessage = new
            {
                protocolVersion = 1,
                messageId = Guid.NewGuid().ToString(),
                messageType = "sync",
                clientId = config.MachineId,
                sentAt = DateTime.UtcNow,
                payload = payload
            };

            string json = JsonSerializer.Serialize(syncMessage, new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            });

            if (await _transport.SendMessageAsync(topic, json, CancellationToken.None))
            {
                var ids = unsynced.Select(r => r.Sequence).ToList();
                LocalDbService.Instance.MarkTelemetryRecordsAsSynced(ids);
                OnLogReceived?.Invoke($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Sync: Đồng bộ thành công {ids.Count} bản ghi.");
            }
            else
            {
                OnLogReceived?.Invoke($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Sync: Đồng bộ thất bại, sẽ thử lại sau.");
            }
        }
        catch (Exception ex)
        {
            OnLogReceived?.Invoke($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Sync Error: {ex.Message}");
        }
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
        await SendTelemetryInternalAsync(
            _plcPolling.LatestStatus ?? "OFFLINE",
            _plcPolling.IsPlcConnected,
            _plcPolling.LatestCycleTimeSec,
            _plcPolling.LatestRunCount,
            _plcPolling.LatestPlcData ?? new Dictionary<string, object>(),
            CancellationToken.None
        );
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
