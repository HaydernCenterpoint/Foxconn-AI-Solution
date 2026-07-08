using System;
using System.Collections.Generic;
using System.Diagnostics;
using PLC.Config;
using PLC.Model;
using PLC.Service;

namespace PLC.Network;

public class AlarmEdgeDetector
{
    private readonly object _lock = new object();
    private readonly Dictionary<string, bool> _activeErrorsState = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, bool> _activeQualityState = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
    
    private int _accumulatedDefectCount = -1;
    private string _activeShiftKey = "";

    public int AccumulatedDefectCount
    {
        get { lock (_lock) { return _accumulatedDefectCount; } }
    }

    public event Action<string>? OnLogReceived;

    private void Log(string msg)
    {
        OnLogReceived?.Invoke($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {msg}");
    }

    public void DetectEdges(
        Dictionary<string, object> plcData,
        List<DataAddressItem> dbAddresses,
        string machineId,
        string machineName,
        bool isPlcConnected,
        out int defectCount)
    {
        lock (_lock)
        {
            // 1. Initialize defect count on shift change
            var currentShift = LocalDbService.GetShiftInfo(DateTime.Now);
            string shiftKey = $"{currentShift.ShiftDate}:{currentShift.ShiftName}";

            if (_activeShiftKey != shiftKey || _accumulatedDefectCount == -1)
            {
                _activeShiftKey = shiftKey;
                _accumulatedDefectCount = 0;

                try
                {
                    var records = LocalDbService.Instance.GetShiftTelemetryRecords(currentShift.ShiftDate, currentShift.ShiftName);
                    if (records != null && records.Count > 0)
                    {
                        var lastRec = records[records.Count - 1];
                        _accumulatedDefectCount = lastRec.DefectQty;
                    }
                }
                catch (Exception ex)
                {
                    Debug.WriteLine("[AlarmEdgeDetector] Shift change defect init error: " + ex.Message);
                }
            }

            // 2. Perform Quality Tag Edge Detection
            foreach (var item in dbAddresses)
            {
                if (!item.Enabled) continue;
                if (item.Group == "Nhóm chất lượng" || item.Group == "Quality")
                {
                    string key = (item.Address + ":" + item.Type).ToLower();
                    if (plcData.TryGetValue(key, out var val))
                    {
                        bool isCurrentNG = false;
                        if (val is bool b) { isCurrentNG = b; }
                        else if (val != null && double.TryParse(val.ToString(), out double num)) { isCurrentNG = num != 0; }

                        string qualityStateKey = $"{machineId}:{item.Address}";
                        _activeQualityState.TryGetValue(qualityStateKey, out bool isPrevNG);

                        bool isOkOrPass = item.Alias.Contains("ok", StringComparison.OrdinalIgnoreCase) || 
                                          item.Alias.Contains("pass", StringComparison.OrdinalIgnoreCase);

                        if (isCurrentNG && !isPrevNG)
                        {
                            _activeQualityState[qualityStateKey] = true;
                            if (!isOkOrPass)
                            {
                                _accumulatedDefectCount++;
                                Log($"Lỗi chất lượng kích hoạt: Máy: {machineName}, Loại: {item.Alias}, Địa chỉ: {item.Address}. Tổng số lỗi lũy kế: {_accumulatedDefectCount}");
                            }
                        }
                        else if (!isCurrentNG && isPrevNG)
                        {
                            _activeQualityState[qualityStateKey] = false;
                        }
                    }
                }
            }

            defectCount = _accumulatedDefectCount;

            // 3. Perform Alarm / Warning Tag Edge Detection
            if (isPlcConnected)
            {
                foreach (var item in dbAddresses)
                {
                    if (!item.Enabled) continue;
                    if (item.Group == "Quy trình báo động" || item.Group == "Nhóm lỗi" || item.Group == "Error")
                    {
                        string key = (item.Address + ":" + item.Type).ToLower();
                        bool isCurrentError = false;

                        if (plcData.TryGetValue(key, out var val))
                        {
                            string strVal = val?.ToString()?.Trim()?.ToLower() ?? "";
                            string activePattern = (item.ActiveValue ?? "true").Trim().ToLower();
                            if (activePattern == "true")
                            {
                                isCurrentError = strVal == "true" || strVal == "1" || strVal == "on";
                            }
                            else if (activePattern == "false")
                            {
                                isCurrentError = strVal == "false" || strVal == "0" || strVal == "off";
                            }
                            else
                            {
                                isCurrentError = strVal.Equals(activePattern, StringComparison.OrdinalIgnoreCase);
                            }
                        }

                        string errStateKey = $"{machineId}:{item.Address}";
                        _activeErrorsState.TryGetValue(errStateKey, out bool isPrevError);

                        if (isCurrentError && !isPrevError)
                        {
                            _activeErrorsState[errStateKey] = true;
                            LocalDbService.Instance.AddOrUpdateErrorHistory(
                                machineId,
                                machineName,
                                item.Alias, // ErrorCode
                                string.IsNullOrWhiteSpace(item.Description) ? item.Alias : item.Description, // ErrorName / Description
                                item.Address,
                                item.Severity,
                                DateTime.Now,
                                null,
                                null,
                                "Active",
                                isCurrentError.ToString(),
                                item.Description,
                                item.Solution
                            );
                            Log($"Lỗi kích hoạt: Máy: {machineName}, Mã lỗi: {item.Alias}, Địa chỉ: {item.Address}");
                        }
                        else if (!isCurrentError && isPrevError)
                        {
                            _activeErrorsState[errStateKey] = false;
                            var activeHistory = LocalDbService.Instance.GetErrorHistory(machineId, item.Alias, "Active");
                            if (activeHistory.Count > 0)
                            {
                                var record = activeHistory[0];
                                DateTime start = DateTime.Parse(record["StartedAt"].ToString());
                                DateTime end = DateTime.Now;
                                int duration = (int)(end - start).TotalSeconds;

                                LocalDbService.Instance.AddOrUpdateErrorHistory(
                                    machineId,
                                    machineName,
                                    item.Alias,
                                    string.IsNullOrWhiteSpace(item.Description) ? item.Alias : item.Description,
                                    item.Address,
                                    item.Severity,
                                    start,
                                    end,
                                    duration,
                                    "Resolved",
                                    isCurrentError.ToString(),
                                    item.Description,
                                    item.Solution
                                );
                                Log($"Lỗi đã khắc phục: Máy: {machineName}, Mã lỗi: {item.Alias}, Thời gian: {duration} giây");
                            }
                        }
                    }
                }
            }
        }
    }

    public void ResetAccumulation()
    {
        lock (_lock)
        {
            _activeErrorsState.Clear();
            _activeQualityState.Clear();
            _accumulatedDefectCount = -1;
            _activeShiftKey = "";
        }
    }
}
