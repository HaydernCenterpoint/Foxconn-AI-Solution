using System;
using System.Collections.Generic;
using System.Diagnostics;
using PLC.Config;
using PLC.Model;
using PLC.Service;

namespace PLC.Network;

public struct MachineState
{
    public string ResolvedStatus { get; init; }
    public int RunCount { get; init; }
    public int PlcRuntimeSeconds { get; init; }
    public double CycleTimeSec { get; init; }
}

public class MachineStateResolver
{
    private readonly object _lock = new object();
    
    // Accumulation states
    private int _prevPlcRawQty = -1;
    private int _accumulatedProduction = -1;
    private string _activeShiftKey = "";
    
    private readonly Dictionary<string, double> _accumulatedRunTimes = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
    private DateTime _lastPollTime = DateTime.MinValue;

    public int AccumulatedProduction
    {
        get { lock (_lock) { return _accumulatedProduction; } }
    }

    public MachineState ResolveState(
        Dictionary<string, object> plcData,
        List<DataAddressItem> dbAddresses,
        string machineId,
        string machineName,
        bool isPlcConnected)
    {
        bool startActive = false;
        bool stopActive = false;
        bool errorActive = false;
        int plcRawQty = -1;
        double cycleTimeSec = 0;
        bool hasPlcRunTimeAddress = false;
        int plcRunTimeMs = 0;

        // 1. Scan address configurations to extract raw status & production values
        foreach (var item in dbAddresses)
        {
            if (!item.Enabled) continue;
            string key = (item.Address + ":" + item.Type).ToLower();
            if (plcData.TryGetValue(key, out var val))
            {
                double numericVal = 0;
                bool boolVal = false;
                if (val is bool b) { boolVal = b; numericVal = b ? 1 : 0; }
                else if (val != null && double.TryParse(val.ToString(), out double num)) { numericVal = num; boolVal = num != 0; }

                if (item.Group == "Nhóm trạng thái" || item.Group == "Status")
                {
                    if (item.Alias.Equals("START", StringComparison.OrdinalIgnoreCase) ||
                        item.Alias.Equals("RUNNING", StringComparison.OrdinalIgnoreCase))
                        startActive = boolVal;
                    else if (item.Alias.Equals("STOP", StringComparison.OrdinalIgnoreCase) ||
                             item.Alias.Equals("STOPPED", StringComparison.OrdinalIgnoreCase) ||
                             item.Alias.Equals("PAUSE", StringComparison.OrdinalIgnoreCase))
                        stopActive = boolVal;
                    else if (item.Alias.Equals("ERROR", StringComparison.OrdinalIgnoreCase))
                        errorActive = boolVal;
                }
                else if (item.Group == "Nhóm sản phẩm" || item.Group == "Production")
                {
                    if (item.Alias.Equals("QUANTITY", StringComparison.OrdinalIgnoreCase) || item.Alias.Equals("Quantity", StringComparison.OrdinalIgnoreCase))
                    {
                        plcRawQty = (int)numericVal;
                    }
                    else if (item.Alias.Equals("RUNNING_TIME", StringComparison.OrdinalIgnoreCase) || item.Alias.Equals("Cycle Time", StringComparison.OrdinalIgnoreCase) || item.Alias.Equals("CycleTime", StringComparison.OrdinalIgnoreCase) || item.Alias.Equals("Time", StringComparison.OrdinalIgnoreCase))
                    {
                        cycleTimeSec = numericVal;
                    }
                }
            }
        }

        string resolvedStatus;
        int runCount;
        int plcRuntimeSeconds;

        lock (_lock)
        {
            // 2. Shift change detection and initialization
            var currentShift = LocalDbService.GetShiftInfo(DateTime.Now);
            string shiftKey = $"{currentShift.ShiftDate}:{currentShift.ShiftName}";

            if (_activeShiftKey != shiftKey || _accumulatedProduction == -1)
            {
                bool isStartup = _accumulatedProduction == -1;
                _activeShiftKey = shiftKey;
                _accumulatedProduction = 0;
                _accumulatedRunTimes[machineId] = 0;

                try
                {
                    var records = LocalDbService.Instance.GetShiftTelemetryRecords(currentShift.ShiftDate, currentShift.ShiftName);
                    if (records != null && records.Count > 0)
                    {
                        var lastRec = records[records.Count - 1];
                        _accumulatedProduction = lastRec.ProductionQty;
                        _accumulatedRunTimes[machineId] = lastRec.PlcRuntime;
                    }
                }
                catch (Exception ex)
                {
                    Debug.WriteLine("[MachineStateResolver] Shift change production init error: " + ex.Message);
                }

                if (_accumulatedProduction == 0 && isStartup && plcRawQty != -1)
                {
                    _accumulatedProduction = plcRawQty;
                    _prevPlcRawQty = plcRawQty;
                }
            }

            // 3. Accumulate production qty
            if (plcRawQty != -1)
            {
                if (_prevPlcRawQty == -1)
                {
                    _prevPlcRawQty = plcRawQty;
                }
                else
                {
                    if (plcRawQty > _prevPlcRawQty)
                    {
                        int diff = plcRawQty - _prevPlcRawQty;
                        _accumulatedProduction += diff;
                        _prevPlcRawQty = plcRawQty;
                    }
                    else if (plcRawQty < _prevPlcRawQty)
                    {
                        _prevPlcRawQty = plcRawQty;
                    }
                }
            }

            runCount = _accumulatedProduction;

            if (errorActive)
            {
                stopActive = true;
            }

            // 4. Resolve machine status: OFFLINE > ERROR > RUNNING > STOPPED > UNKNOWN
            resolvedStatus = "UNKNOWN";
            if (!isPlcConnected)
            {
                resolvedStatus = "STOPPED";
            }
            else if (errorActive)
            {
                resolvedStatus = "ERROR";
            }
            else if (startActive)
            {
                resolvedStatus = "RUNNING";
            }
            else if (stopActive)
            {
                resolvedStatus = "STOPPED";
            }

            // 5. Accumulate running time
            DateTime now = DateTime.Now;
            double elapsedSeconds = 0;
            if (_lastPollTime != DateTime.MinValue)
            {
                elapsedSeconds = (now - _lastPollTime).TotalSeconds;
            }
            _lastPollTime = now;

            if (!hasPlcRunTimeAddress)
            {
                if (!_accumulatedRunTimes.TryGetValue(machineId, out double accTime))
                {
                    accTime = 0;
                }

                if (resolvedStatus == "RUNNING" && elapsedSeconds > 0)
                {
                    accTime += elapsedSeconds;
                    _accumulatedRunTimes[machineId] = accTime;
                }
                plcRunTimeMs = (int)(accTime * 1000);
            }

            plcRuntimeSeconds = plcRunTimeMs / 1000;
        }

        return new MachineState
        {
            ResolvedStatus = resolvedStatus,
            RunCount = runCount,
            PlcRuntimeSeconds = plcRuntimeSeconds,
            CycleTimeSec = cycleTimeSec
        };
    }

    public void ResetAccumulation()
    {
        lock (_lock)
        {
            _prevPlcRawQty = -1;
            _accumulatedProduction = -1;
            _activeShiftKey = "";
            _lastPollTime = DateTime.MinValue;
            _accumulatedRunTimes.Clear();
        }
    }
}
