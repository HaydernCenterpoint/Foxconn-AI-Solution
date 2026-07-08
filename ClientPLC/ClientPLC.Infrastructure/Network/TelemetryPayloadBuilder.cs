using System;
using System.Collections.Generic;
using System.Text.Json;
using PLC.Config;
using PLC.Service;

namespace PLC.Network;

public class TelemetryPayloadBuilder
{
    private static readonly JsonSerializerOptions JsonOptions = new JsonSerializerOptions
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true
    };

    public string BuildTelemetryJson(string status, bool isPlcConnected, double cycleTimeSec, int runCount, int plcRuntimeSeconds, Dictionary<string, object> plcData)
    {
        AppConfig config = AppConfig.Current;
        var (ramUsed, ramTotal) = SystemInfoService.GetRamInfo();

        var activeErrors = new List<object>();
        foreach (var kvp in plcData)
        {
            string keyLower = kvp.Key.ToLower();
            if (keyLower.StartsWith("m") && kvp.Value is bool bVal && bVal)
            {
                string addrOnly = kvp.Key.Split(':')[0];
                activeErrors.Add(new
                {
                    error_id = addrOnly,
                    error_name = $"Cảnh báo {addrOnly}",
                    error_description = $"Cảnh báo kích hoạt tại địa chỉ {addrOnly}",
                    error_time = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ"),
                    error_ack = false
                });
            }
        }

        double uph = 0.0;
        double oee = 0.0;
        double yieldRate = 100.0;
        object? shiftSummaryObj = null;

        try
        {
            var shiftInfo = LocalDbService.GetShiftInfo(DateTime.Now);
            if (!AppSettings.Current.UseMockData)
            {
                ShiftSummary shiftSummary = LocalDbService.Instance.GetShiftSummary(shiftInfo.ShiftDate, shiftInfo.ShiftName);
                if (shiftSummary != null)
                {
                    uph = shiftSummary.AvgSpeedPerHour;
                    oee = shiftSummary.Oee;
                    yieldRate = shiftSummary.Quality;
                    shiftSummaryObj = new
                    {
                        shiftDate = shiftInfo.ShiftDate,
                        shiftName = shiftInfo.ShiftName,
                        availability = shiftSummary.Availability,
                        performance = shiftSummary.Performance,
                        quality = shiftSummary.Quality,
                        oee = shiftSummary.Oee
                    };
                }
            }
            else
            {
                uph = 5.5;
                oee = 89.35;
                yieldRate = 99.23;
                shiftSummaryObj = new
                {
                    shiftDate = shiftInfo.ShiftDate,
                    shiftName = shiftInfo.ShiftName,
                    availability = 92.4,
                    performance = 94.6,
                    quality = 99.5,
                    oee = 89.35
                };
            }
        }
        catch (Exception ex)
        {
            Serilog.Log.Warning(ex, "Shift summary fallback failed");
        }

        var envelope = new
        {
            protocolVersion = 1,
            messageId = Guid.NewGuid().ToString(),
            messageType = "telemetry",
            clientId = config.MachineId,
            sentAt = DateTime.UtcNow,
            payload = new
            {
                machineId = config.MachineId,
                machineName = config.MachineName,
                lineId = config.LineId,
                sequence = config.LineOrder,
                status = status,
                plcConnected = isPlcConnected,
                production = new
                {
                    qty = (long)runCount,
                    time = cycleTimeSec,
                    uph = uph,
                    oee = oee,
                    yieldRate = yieldRate,
                    passRate = yieldRate,
                    shiftSummary = shiftSummaryObj
                },
                alarm = new
                {
                    active = (status == "ERROR"),
                    code = ((status == "ERROR") ? "1" : null),
                    message = ((status == "ERROR") ? "PLC Error Active" : null)
                },
                errors = activeErrors
            }
        };

        return JsonSerializer.Serialize(envelope, JsonOptions);
    }

    public string BuildHeartbeatJson(string status, bool isPlcConnected)
    {
        AppConfig config = AppConfig.Current;
        var envelope = new
        {
            protocolVersion = 1,
            messageId = Guid.NewGuid().ToString(),
            messageType = "heartbeat",
            clientId = config.MachineId,
            sentAt = DateTime.UtcNow,
            payload = new
            {
                machineId = config.MachineId,
                machineName = config.MachineName,
                machineCode = config.MachineProfileId,
                status = status,
                plcConnected = isPlcConnected
            }
        };
        return JsonSerializer.Serialize(envelope, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        });
    }

    public string BuildRegisterJson(long lastSyncSeq)
    {
        AppConfig config = AppConfig.Current;
        var envelope = new
        {
            protocolVersion = 1,
            messageId = Guid.NewGuid().ToString(),
            messageType = "register",
            clientId = config.MachineId,
            sentAt = DateTime.UtcNow,
            payload = new
            {
                clientName = (config.MachineName ?? config.MachineId),
                machineCode = (config.MachineProfileId ?? ""),
                clientVersion = "1.0.0",
                token = (config.ServerToken ?? ""),
                machineIds = new string[] { config.MachineId },
                lastSyncSeq = lastSyncSeq
            }
        };
        return JsonSerializer.Serialize(envelope, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        });
    }

    private static string GetLocalIpAddress()
    {
        try
        {
            foreach (var ni in System.Net.NetworkInformation.NetworkInterface.GetAllNetworkInterfaces())
            {
                if (ni.OperationalStatus == System.Net.NetworkInformation.OperationalStatus.Up &&
                    ni.NetworkInterfaceType != System.Net.NetworkInformation.NetworkInterfaceType.Loopback)
                {
                    foreach (var ip in ni.GetIPProperties().UnicastAddresses)
                    {
                        if (ip.Address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
                        {
                            return ip.Address.ToString();
                        }
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Serilog.Log.Warning(ex, "Get IP failed");
        }
        return "127.0.0.1";
    }
}
