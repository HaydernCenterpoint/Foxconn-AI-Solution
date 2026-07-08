using System;
using System.Diagnostics;
using System.Threading.Tasks;
using HslCommunication;
using PLC.Config;

namespace PLC.Network;

public class PlcConnectionManager
{
    private readonly object _lock = new object();
    private IPLCAdapter? _plc;
    private bool _isConnecting;
    private DateTime _lastConnectAttempt = DateTime.MinValue;
    private PlcConnectionState _connectionState = PlcConnectionState.Disconnected;
    private string _lastError = "";

    public PlcConnectionState ConnectionState
    {
        get { lock (_lock) { return _connectionState; } }
        set { lock (_lock) { _connectionState = value; } }
    }

    public bool IsConnected
    {
        get
        {
            lock (_lock)
            {
                return _connectionState == PlcConnectionState.Connected;
            }
        }
    }

    public string ConnectedBrand
    {
        get { lock (_lock) { return _plc?.ClassName ?? ""; } }
    }

    public IPLCAdapter? PlcInstance
    {
        get { lock (_lock) { return _plc; } }
    }

    public string LastError
    {
        get { lock (_lock) { return _lastError; } }
        private set { lock (_lock) { _lastError = value; } }
    }

    public event Action<string>? OnLogReceived;

    private void Log(string msg)
    {
        OnLogReceived?.Invoke($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {msg}");
    }

    public void EnsureConnected()
    {
        AppConfig config = AppConfig.Current;
        if (string.IsNullOrWhiteSpace(config.PlcIp) || config.PlcPort <= 0 || string.IsNullOrWhiteSpace(config.PlcBrand))
        {
            ConnectionState = PlcConnectionState.NotConfigured;
            return;
        }

        lock (_lock)
        {
            if (_plc != null || _isConnecting)
            {
                if (_plc != null && ConnectionState != PlcConnectionState.Connected && ConnectionState != PlcConnectionState.NoResponse)
                {
                    ConnectionState = PlcConnectionState.Connected;
                }
                return;
            }

            // Exponential backoff check (minimum 10s cooldown between retries)
            if ((DateTime.UtcNow - _lastConnectAttempt).TotalSeconds < 10.0)
            {
                return;
            }

            _isConnecting = true;
            ConnectionState = PlcConnectionState.Connecting;
            _lastConnectAttempt = DateTime.UtcNow;
        }

        Task.Run(() =>
        {
            try
            {
                Debug.WriteLine($"[PlcConnectionManager] Auto-connecting to default PLC: {config.PlcBrand} at {config.PlcIp}:{config.PlcPort}");
                Log($"PLC: Đang tự động kết nối đến {config.PlcBrand} tại {config.PlcIp}:{config.PlcPort}...");
                PLCGeneric newPlc = new PLCGeneric(config.PlcBrand, config.PlcIp, config.PlcPort);
                OperateResult result = newPlc.Connect();
                if (result.IsSuccess)
                {
                    lock (_lock)
                    {
                        if (_plc == null)
                        {
                            _plc = newPlc;
                            LastError = "";
                            ConnectionState = PlcConnectionState.Connected;
                            Debug.WriteLine("[PlcConnectionManager] Connected to default PLC successfully.");
                            Log("PLC: Kết nối đến PLC thành công.");
                            return;
                        }
                        try { newPlc.Disconnect(); } catch { }
                        return;
                    }
                }
                
                lock (_lock)
                {
                    LastError = result.Message;
                    string errMsg = result.Message ?? "";
                    bool isConfigErr = errMsg.Contains("IP", StringComparison.OrdinalIgnoreCase) ||
                                       errMsg.Contains("address", StringComparison.OrdinalIgnoreCase) ||
                                       errMsg.Contains("port", StringComparison.OrdinalIgnoreCase) ||
                                       errMsg.Contains("protocol", StringComparison.OrdinalIgnoreCase);
                    ConnectionState = isConfigErr ? PlcConnectionState.ConfigError : PlcConnectionState.Disconnected;
                }
                Debug.WriteLine("[PlcConnectionManager] Auto-connect failed: " + result.Message);
                Log("PLC Error: Không thể kết nối. Chi tiết: " + result.Message);
            }
            catch (Exception ex)
            {
                lock (_lock)
                {
                    LastError = ex.Message;
                    string errMsg = ex.Message ?? "";
                    bool isConfigErr = errMsg.Contains("IP", StringComparison.OrdinalIgnoreCase) ||
                                       errMsg.Contains("address", StringComparison.OrdinalIgnoreCase) ||
                                       errMsg.Contains("port", StringComparison.OrdinalIgnoreCase) ||
                                       errMsg.Contains("protocol", StringComparison.OrdinalIgnoreCase);
                    ConnectionState = isConfigErr ? PlcConnectionState.ConfigError : PlcConnectionState.Disconnected;
                }
                Debug.WriteLine("[PlcConnectionManager] Error auto-connecting to default PLC: " + ex.Message);
                Log("PLC Error: Lỗi ngoại lệ kết nối: " + ex.Message);
            }
            finally
            {
                lock (_lock)
                {
                    _isConnecting = false;
                }
            }
        });
    }

    public void ReconnectDefault()
    {
        lock (_lock)
        {
            if (_plc != null)
            {
                try { _plc.Disconnect(); } catch { }
                _plc = null;
            }
            _lastConnectAttempt = DateTime.MinValue;
        }
        EnsureConnected();
    }

    public bool Connect(string brand, string ip, int port)
    {
        try
        {
            PLCGeneric newPlc = new PLCGeneric(brand, ip, port);
            OperateResult result = newPlc.Connect();
            if (result.IsSuccess)
            {
                lock (_lock)
                {
                    if (_plc != null)
                    {
                        try { _plc.Disconnect(); } catch { }
                    }
                    _plc = newPlc;
                    ConnectionState = PlcConnectionState.Connected;
                    LastError = "";
                }
                return true;
            }

            lock (_lock)
            {
                LastError = result.Message;
                string errMsg = result.Message ?? "";
                bool isConfigErr = errMsg.Contains("IP", StringComparison.OrdinalIgnoreCase) ||
                                   errMsg.Contains("address", StringComparison.OrdinalIgnoreCase) ||
                                   errMsg.Contains("port", StringComparison.OrdinalIgnoreCase) ||
                                   errMsg.Contains("protocol", StringComparison.OrdinalIgnoreCase);
                ConnectionState = isConfigErr ? PlcConnectionState.ConfigError : PlcConnectionState.Disconnected;
            }
            return false;
        }
        catch (Exception ex)
        {
            lock (_lock)
            {
                LastError = ex.Message;
                string errMsg = ex.Message ?? "";
                bool isConfigErr = errMsg.Contains("IP", StringComparison.OrdinalIgnoreCase) ||
                                   errMsg.Contains("address", StringComparison.OrdinalIgnoreCase) ||
                                   errMsg.Contains("port", StringComparison.OrdinalIgnoreCase) ||
                                   errMsg.Contains("protocol", StringComparison.OrdinalIgnoreCase);
                ConnectionState = isConfigErr ? PlcConnectionState.ConfigError : PlcConnectionState.Disconnected;
            }
            Debug.WriteLine("[PlcConnectionManager] Connect PLC error: " + ex.Message);
            return false;
        }
    }

    public void Disconnect()
    {
        lock (_lock)
        {
            if (_plc != null)
            {
                try { _plc.Disconnect(); } catch { }
                _plc = null;
            }
            ConnectionState = PlcConnectionState.Disconnected;
        }
    }
}
