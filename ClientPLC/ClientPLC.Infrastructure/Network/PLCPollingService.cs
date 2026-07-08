using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using PLC.Config;
using PLC.Service;

namespace PLC.Network;

public class PLCPollingService : IPLCPollingService
{
    private readonly object _plcLock = new object();
    private readonly PlcConnectionManager _connectionManager = new PlcConnectionManager();
    private readonly PlcAddressReader _addressReader = new PlcAddressReader();
    private readonly MachineStateResolver _stateResolver = new MachineStateResolver();
    private readonly AlarmEdgeDetector _alarmDetector = new AlarmEdgeDetector();

    private volatile string _configuredReadAddresses = "";
    private CancellationTokenSource? _cts;
    private bool _isRunning;
    private bool _wasPlcConnected = true;

    private Dictionary<string, object> _latestPlcData = new Dictionary<string, object>();
    private string _latestStatus = "OFFLINE";
    private int _latestRunCount = 0;
    private int _latestPlcRuntimeSeconds = 0;
    private double _latestCycleTimeSec = 0;
    private int _latestDefectCount = 0;

    private DateTime _lastSuccessfulRead = DateTime.UtcNow;

    public PlcConnectionState ConnectionState => _connectionManager.ConnectionState;
    public bool IsPlcConnected => _connectionManager.IsConnected;
    public string ConnectedPlcBrand => _connectionManager.ConnectedBrand;
    public IPLCAdapter? PlcInstance => _connectionManager.PlcInstance;
    public string LastPlcError => string.IsNullOrEmpty(_connectionManager.LastError) ? _addressReader.LastError : _connectionManager.LastError;

    public Dictionary<string, object> LatestPlcData
    {
        get
        {
            lock (_plcLock)
            {
                return new Dictionary<string, object>(_latestPlcData);
            }
        }
    }

    public Dictionary<string, string> LatestPlcErrors => _addressReader.LatestErrors;

    public string LatestStatus
    {
        get { lock (_plcLock) { return _latestStatus; } }
    }

    public int LatestRunCount
    {
        get { lock (_plcLock) { return _latestRunCount; } }
    }

    public int LatestPlcRuntimeSeconds
    {
        get { lock (_plcLock) { return _latestPlcRuntimeSeconds; } }
    }

    public double LatestCycleTimeSec
    {
        get { lock (_plcLock) { return _latestCycleTimeSec; } }
    }

    public int LatestDefectCount
    {
        get { lock (_plcLock) { return _latestDefectCount; } }
    }

    public event Action<string>? OnLogReceived;
    public event Action<Dictionary<string, object>>? OnPlcDataRead;

    public PLCPollingService()
    {
        // Route logs from child managers to own OnLogReceived event
        _connectionManager.OnLogReceived += msg => OnLogReceived?.Invoke(msg);
        _addressReader.OnLogReceived += msg => OnLogReceived?.Invoke(msg);
        _alarmDetector.OnLogReceived += msg => OnLogReceived?.Invoke(msg);
    }

    private void Log(string msg)
    {
        OnLogReceived?.Invoke($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {msg}");
    }

    public void Start()
    {
        if (!_isRunning)
        {
            _isRunning = true;
            _stateResolver.ResetAccumulation();
            _alarmDetector.ResetAccumulation();
            _configuredReadAddresses = AppConfig.Current.ReadAddresses;
            _cts = new CancellationTokenSource();
            _lastSuccessfulRead = DateTime.UtcNow;
            Task.Run(async () =>
            {
                try
                {
                    await PlcPollingLoopAsync(_cts.Token);
                }
                catch (Exception ex)
                {
                    Serilog.Log.Error(ex, "PLC polling loop crashed");
                }
            });
        }
    }

    public void Stop()
    {
        _isRunning = false;
        _cts?.Cancel();
        DisconnectPlc();
    }

    public void EnsurePlcConnected()
    {
        _connectionManager.EnsureConnected();
    }

    public void ReconnectDefaultPlc()
    {
        _connectionManager.ReconnectDefault();
    }

    public void UpdateReadAddresses(string readAddresses)
    {
        _configuredReadAddresses = readAddresses;
    }

    public bool ConnectPlc(string brand, string ip, int port)
    {
        _lastSuccessfulRead = DateTime.UtcNow;
        return _connectionManager.Connect(brand, ip, port);
    }

    public void DisconnectPlc()
    {
        _connectionManager.Disconnect();
    }

    private async Task PlcPollingLoopAsync(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            try
            {
                EnsurePlcConnected();
                
                bool hasSuccessfulRead;
                bool hasConnectionError;
                string firstConnectionErrorMsg;

                var plcData = _addressReader.ReadConfiguredAddresses(
                    PlcInstance,
                    _configuredReadAddresses,
                    out hasSuccessfulRead,
                    out hasConnectionError,
                    out firstConnectionErrorMsg);

                UpdateConnectionDebounceState(hasSuccessfulRead, hasConnectionError, firstConnectionErrorMsg);
                
                OnPlcDataRead?.Invoke(plcData);

                string machineId = AppConfig.Current.MachineId;
                string machineName = AppConfig.Current.MachineName;
                var dbAddresses = LocalDbService.Instance.LoadAddressesFromDb();

                int defectCount;
                var state = _stateResolver.ResolveState(
                    plcData,
                    dbAddresses,
                    machineId,
                    machineName,
                    IsPlcConnected);

                string status = state.ResolvedStatus;
                int runCount = state.RunCount;
                int plcRuntimeSeconds = state.PlcRuntimeSeconds;
                double cycleTimeSec = state.CycleTimeSec;

                _alarmDetector.DetectEdges(
                    plcData,
                    dbAddresses,
                    machineId,
                    machineName,
                    IsPlcConnected,
                    out defectCount);

                bool currentConnectionState = IsPlcConnected;
                if (currentConnectionState)
                {
                    if (!_wasPlcConnected)
                    {
                        Log("PLC: Đã kết nối lại thành công với PLC.");
                        _wasPlcConnected = true;
                    }
                }
                else
                {
                    if (_wasPlcConnected)
                    {
                        Log($"PLC Error: Máy {machineName} mất kết nối PLC. Trạng thái chuyển sang OFFLINE.");
                        _wasPlcConnected = false;
                    }
                }

                lock (_plcLock)
                {
                    _latestPlcData = plcData;
                    _latestStatus = status;
                    _latestRunCount = runCount;
                    _latestPlcRuntimeSeconds = plcRuntimeSeconds;
                    _latestCycleTimeSec = cycleTimeSec;
                    _latestDefectCount = defectCount;
                }

                LocalDbService.Instance.InsertTelemetry(status, plcRuntimeSeconds, runCount, defectCount);
            }
            catch (Exception ex)
            {
                Debug.WriteLine("[PLCPollingService] Local PLC Polling error: " + ex.Message);
            }

            int interval = AppConfig.Current.ReadIntervalMs;
            if (interval < 500)
            {
                interval = 500;
            }
            await Task.Delay(interval, token);
        }
    }

    private void UpdateConnectionDebounceState(bool hasSuccessfulRead, bool hasConnectionError, string firstConnectionErrorMsg)
    {
        int interval = AppConfig.Current.ReadIntervalMs;
        if (interval < 500) interval = 500;

        if (hasSuccessfulRead && !hasConnectionError)
        {
            _lastSuccessfulRead = DateTime.UtcNow;
            if (_connectionManager.ConnectionState != PlcConnectionState.Connected)
            {
                _connectionManager.ConnectionState = PlcConnectionState.Connected;
            }
        }
        else if (hasConnectionError)
        {
            double secondsSinceLastSuccess = (DateTime.UtcNow - _lastSuccessfulRead).TotalSeconds;
            double timeoutDisconnectLimit = 5.0 * (interval / 1000.0);
            double timeoutNoResponseLimit = 2.0 * (interval / 1000.0);

            if (timeoutDisconnectLimit < 15.0) timeoutDisconnectLimit = 15.0;
            if (timeoutNoResponseLimit < 10.0) timeoutNoResponseLimit = 10.0;

            if (secondsSinceLastSuccess > timeoutDisconnectLimit)
            {
                Log($"PLC Conn Error: Lỗi truyền thông vượt quá {timeoutDisconnectLimit}s, ngắt kết nối. Chi tiết: {firstConnectionErrorMsg}");
                DisconnectPlc();
            }
            else if (secondsSinceLastSuccess > timeoutNoResponseLimit)
            {
                Log($"PLC Warning: Chậm dữ liệu / Không phản hồi từ PLC quá {timeoutNoResponseLimit}s. Chi tiết: {firstConnectionErrorMsg}");
                _connectionManager.ConnectionState = PlcConnectionState.NoResponse;
            }
        }
    }
}
