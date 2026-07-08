using System;
using System.Collections.Generic;

namespace PLC.Network;

public enum PlcConnectionState
{
    NotConfigured,
    Connecting,
    Connected,
    Disconnected,
    ConfigError,
    NoResponse
}

public interface IPLCPollingService
{
    PlcConnectionState ConnectionState { get; }
    bool IsPlcConnected { get; }
    string ConnectedPlcBrand { get; }
    IPLCAdapter PlcInstance { get; }
    string LastPlcError { get; }
    Dictionary<string, object> LatestPlcData { get; }
    Dictionary<string, string> LatestPlcErrors { get; }
    string LatestStatus { get; }
    int LatestRunCount { get; }
    int LatestPlcRuntimeSeconds { get; }
    double LatestCycleTimeSec { get; }
    int LatestDefectCount { get; }

    event Action<string> OnLogReceived;
    event Action<Dictionary<string, object>> OnPlcDataRead;

    void Start();
    void Stop();
    void EnsurePlcConnected();
    void ReconnectDefaultPlc();
    void UpdateReadAddresses(string readAddresses);
    bool ConnectPlc(string brand, string ip, int port);
    void DisconnectPlc();
}
