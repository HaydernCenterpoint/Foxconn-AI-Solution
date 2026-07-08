using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Text.RegularExpressions;
using HslCommunication;

namespace PLC.Network;

public class PlcAddressReader
{
    private readonly object _lock = new object();
    private readonly Dictionary<string, string> _latestErrors = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    private string _lastError = "";

    public Dictionary<string, string> LatestErrors
    {
        get { lock (_lock) { return new Dictionary<string, string>(_latestErrors, StringComparer.OrdinalIgnoreCase); } }
    }

    public string LastError
    {
        get { lock (_lock) { return _lastError; } }
        private set { lock (_lock) { _lastError = value; } }
    }

    public int BatchGapTolerance { get; set; } = 8;

    public event Action<string>? OnLogReceived;

    private void Log(string msg)
    {
        OnLogReceived?.Invoke($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {msg}");
    }

    private class PlcAddressConfig
    {
        public string RawAddress { get; set; } = "";
        public string Type { get; set; } = "int16";
        public string FullKey => $"{RawAddress}:{Type}".ToLower();
        public bool Enabled { get; set; } = true;
        
        // Grouping fields
        public string Prefix { get; set; } = "";
        public int Index { get; set; } = -1;
        public string TypeNormalized { get; set; } = "";
        public bool CanBatch { get; set; }
    }

    public Dictionary<string, object> ReadConfiguredAddresses(IPLCAdapter? plc, string configuredReadAddresses, out bool hasSuccessfulRead, out bool hasConnectionError, out string firstConnectionErrorMsg)
    {
        Dictionary<string, object> dictionary = new Dictionary<string, object>();
        hasSuccessfulRead = false;
        hasConnectionError = false;
        firstConnectionErrorMsg = "";

        if (string.IsNullOrWhiteSpace(configuredReadAddresses) || plc == null)
        {
            return dictionary;
        }

        // 1. Parse and classify address configurations
        var configs = ParseAddressConfigs(configuredReadAddresses);
        var batchableConfigs = configs.Where(c => c.Enabled && c.CanBatch).ToList();
        var nonBatchableConfigs = configs.Where(c => c.Enabled && !c.CanBatch).ToList();

        // 2. Perform Batch Reads
        var batchGroups = batchableConfigs
            .GroupBy(c => new { c.TypeNormalized, c.Prefix })
            .ToList();

        foreach (var group in batchGroups)
        {
            var sortedGroup = group.OrderBy(c => c.Index).ToList();
            int i = 0;
            while (i < sortedGroup.Count)
            {
                var batch = new List<PlcAddressConfig> { sortedGroup[i] };
                int j = i + 1;
                while (j < sortedGroup.Count && sortedGroup[j].Index - sortedGroup[j - 1].Index <= BatchGapTolerance)
                {
                    batch.Add(sortedGroup[j]);
                    j++;
                }
                i = j;

                bool batchSuccess = ReadBatch(plc, batch, dictionary, ref hasSuccessfulRead, out var batchConnError, out var batchConnErrorMsg);
                if (batchConnError)
                {
                    hasConnectionError = true;
                    if (string.IsNullOrEmpty(firstConnectionErrorMsg))
                    {
                        firstConnectionErrorMsg = batchConnErrorMsg;
                    }
                    return dictionary; // Abort cycle on connection loss
                }

                if (!batchSuccess)
                {
                    // Fallback to individual reads for this batch
                    foreach (var config in batch)
                    {
                        ReadIndividual(plc, config, dictionary, ref hasSuccessfulRead, out var indConnError, out var indConnErrorMsg);
                        if (indConnError)
                        {
                            hasConnectionError = true;
                            if (string.IsNullOrEmpty(firstConnectionErrorMsg))
                            {
                                firstConnectionErrorMsg = indConnErrorMsg;
                            }
                            return dictionary;
                        }
                    }
                }
            }
        }

        // 3. Perform Non-Batchable/Individual Reads
        foreach (var config in nonBatchableConfigs)
        {
            ReadIndividual(plc, config, dictionary, ref hasSuccessfulRead, out var indConnError, out var indConnErrorMsg);
            if (indConnError)
            {
                hasConnectionError = true;
                if (string.IsNullOrEmpty(firstConnectionErrorMsg))
                {
                    firstConnectionErrorMsg = indConnErrorMsg;
                }
                return dictionary;
            }
        }

        return dictionary;
    }

    private List<PlcAddressConfig> ParseAddressConfigs(string configuredReadAddresses)
    {
        var list = new List<PlcAddressConfig>();
        string[] array = configuredReadAddresses.Split(',', StringSplitOptions.RemoveEmptyEntries);

        foreach (string text in array)
        {
            try
            {
                string[] array3 = text.Split(':');
                if (array3.Length < 1) continue;

                string rawAddress = array3[0].Trim();
                string type = ((array3.Length > 1) ? array3[1].Trim().ToLower() : "int16");
                bool enabled = true;
                if (array3.Length > 3)
                {
                    enabled = array3[3].Trim() != "0" && !array3[3].Trim().Equals("false", StringComparison.OrdinalIgnoreCase);
                }

                if (string.IsNullOrEmpty(rawAddress) || rawAddress.Equals("null", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var config = new PlcAddressConfig
                {
                    RawAddress = rawAddress,
                    Type = type,
                    Enabled = enabled
                };

                // Classify batch-ability: only bool, int16, uint16
                string typeNorm = type switch
                {
                    "bool" or "boolean" => "bool",
                    "int16" or "short" => "int16",
                    "uint16" or "ushort" => "uint16",
                    _ => ""
                };

                if (!string.IsNullOrEmpty(typeNorm))
                {
                    var match = Regex.Match(rawAddress, @"^([a-zA-Z]+)(\d+)$");
                    if (match.Success)
                    {
                        config.Prefix = match.Groups[1].Value;
                        config.Index = int.Parse(match.Groups[2].Value);
                        config.TypeNormalized = typeNorm;
                        config.CanBatch = true;
                    }
                }

                list.Add(config);
            }
            catch (Exception ex)
            {
                Debug.WriteLine("[PlcAddressReader] Error parsing config item: " + ex.Message);
            }
        }

        return list;
    }

    private bool ReadBatch(IPLCAdapter plc, List<PlcAddressConfig> batch, Dictionary<string, object> dictionary, ref bool hasSuccessfulRead, out bool hasConnectionError, out string connectionErrorMsg)
    {
        hasConnectionError = false;
        connectionErrorMsg = "";

        if (batch.Count == 0) return true;

        var first = batch[0];
        var last = batch[batch.Count - 1];
        int length = last.Index - first.Index + 1;
        string startAddress = $"{first.Prefix}{first.Index}";

        try
        {
            if (first.TypeNormalized == "bool")
            {
                var res = plc.ReadBool(startAddress, (ushort)length);
                if (res.IsSuccess)
                {
                    for (int i = 0; i < batch.Count; i++)
                    {
                        var config = batch[i];
                        int offset = config.Index - first.Index;
                        if (offset >= 0 && offset < res.Content.Length)
                        {
                            dictionary[config.FullKey] = res.Content[offset];
                            lock (_lock) { _latestErrors.Remove(config.FullKey); }
                        }
                    }
                    hasSuccessfulRead = true;
                    return true;
                }
                else
                {
                    CheckConnectionError(res.Message, out hasConnectionError, out connectionErrorMsg);
                    return false;
                }
            }
            else if (first.TypeNormalized == "int16")
            {
                var res = plc.ReadInt16(startAddress, (ushort)length);
                if (res.IsSuccess)
                {
                    for (int i = 0; i < batch.Count; i++)
                    {
                        var config = batch[i];
                        int offset = config.Index - first.Index;
                        if (offset >= 0 && offset < res.Content.Length)
                        {
                            dictionary[config.FullKey] = res.Content[offset];
                            lock (_lock) { _latestErrors.Remove(config.FullKey); }
                        }
                    }
                    hasSuccessfulRead = true;
                    return true;
                }
                else
                {
                    CheckConnectionError(res.Message, out hasConnectionError, out connectionErrorMsg);
                    return false;
                }
            }
            else if (first.TypeNormalized == "uint16")
            {
                var res = plc.ReadUInt16(startAddress, (ushort)length);
                if (res.IsSuccess)
                {
                    for (int i = 0; i < batch.Count; i++)
                    {
                        var config = batch[i];
                        int offset = config.Index - first.Index;
                        if (offset >= 0 && offset < res.Content.Length)
                        {
                            dictionary[config.FullKey] = res.Content[offset];
                            lock (_lock) { _latestErrors.Remove(config.FullKey); }
                        }
                    }
                    hasSuccessfulRead = true;
                    return true;
                }
                else
                {
                    CheckConnectionError(res.Message, out hasConnectionError, out connectionErrorMsg);
                    return false;
                }
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[PlcAddressReader] Batch read exception for {startAddress} length {length}: {ex.Message}");
            hasConnectionError = true;
            connectionErrorMsg = ex.Message;
            return false;
        }

        return false;
    }

    private void ReadIndividual(IPLCAdapter plc, PlcAddressConfig config, Dictionary<string, object> dictionary, ref bool hasSuccessfulRead, out bool hasConnectionError, out string connectionErrorMsg)
    {
        hasConnectionError = false;
        connectionErrorMsg = "";

        try
        {
            object? obj = null;
            bool isSuccess = false;
            string readErrorMessage = "";

            switch (config.Type)
            {
                case "bool":
                case "boolean":
                    {
                        var res = plc.ReadBool(config.RawAddress);
                        if (res.IsSuccess) { obj = res.Content; isSuccess = true; }
                        else { readErrorMessage = res.Message; }
                        break;
                    }
                case "int16":
                case "short":
                    {
                        var res = plc.ReadInt16(config.RawAddress);
                        if (res.IsSuccess) { obj = res.Content; isSuccess = true; }
                        else { readErrorMessage = res.Message; }
                        break;
                    }
                case "uint16":
                case "ushort":
                    {
                        var res = plc.ReadUInt16(config.RawAddress);
                        if (res.IsSuccess) { obj = res.Content; isSuccess = true; }
                        else { readErrorMessage = res.Message; }
                        break;
                    }
                case "int32":
                case "int":
                    {
                        var res = plc.ReadInt32(config.RawAddress);
                        if (res.IsSuccess) { obj = res.Content; isSuccess = true; }
                        else { readErrorMessage = res.Message; }
                        break;
                    }
                case "uint32":
                case "uint":
                    {
                        var res = plc.ReadUInt32(config.RawAddress);
                        if (res.IsSuccess) { obj = res.Content; isSuccess = true; }
                        else { readErrorMessage = res.Message; }
                        break;
                    }
                case "float":
                case "single":
                    {
                        var res = plc.ReadFloat(config.RawAddress);
                        if (res.IsSuccess) { obj = res.Content; isSuccess = true; }
                        else { readErrorMessage = res.Message; }
                        break;
                    }
                case "double":
                    {
                        var res = plc.ReadDouble(config.RawAddress);
                        if (res.IsSuccess) { obj = res.Content; isSuccess = true; }
                        else { readErrorMessage = res.Message; }
                        break;
                    }
                case "string":
                    {
                        var res = plc.ReadString(config.RawAddress, 10);
                        if (res.IsSuccess) { obj = res.Content; isSuccess = true; }
                        else { readErrorMessage = res.Message; }
                        break;
                    }
            }

            if (isSuccess && obj != null)
            {
                dictionary[config.FullKey] = obj;
                hasSuccessfulRead = true;
                lock (_lock) { _latestErrors.Remove(config.FullKey); }
            }
            else
            {
                string errorMsg = string.IsNullOrWhiteSpace(readErrorMessage) ? "Lỗi đọc không xác định" : readErrorMessage;
                lock (_lock) { _latestErrors[config.FullKey] = errorMsg; }
                
                if (!string.IsNullOrEmpty(readErrorMessage) && (readErrorMessage.Contains("format") || readErrorMessage.Contains("length") || readErrorMessage.Contains("range") || readErrorMessage.Contains("type") || readErrorMessage.Contains("overflow") || readErrorMessage.Contains("illegal") || readErrorMessage.Contains("invalid") || readErrorMessage.Contains("match")))
                {
                    LastError = $"Lỗi sai kiểu dữ liệu/định dạng địa chỉ [{config.RawAddress}] (Kiểu: {config.Type}): {readErrorMessage}";
                }
                else
                {
                    LastError = "Lỗi đọc [" + config.RawAddress + "]: " + readErrorMessage;
                }
                Log(LastError);

                CheckConnectionError(readErrorMessage, out hasConnectionError, out connectionErrorMsg);
            }
        }
        catch (Exception ex)
        {
            LastError = "Lỗi đọc: " + ex.Message;
            Log($"PLC Exception: Lỗi đọc dữ liệu: {ex.Message}");
            hasConnectionError = true;
            connectionErrorMsg = ex.Message;
        }
    }

    private void CheckConnectionError(string errorMsg, out bool hasConnectionError, out string connectionErrorMsg)
    {
        hasConnectionError = false;
        connectionErrorMsg = "";

        if (!string.IsNullOrEmpty(errorMsg))
        {
            string tLower = errorMsg.ToLower();
            if (tLower.Contains("timeout") ||
                tLower.Contains("time out") ||
                tLower.Contains("connect") ||
                tLower.Contains("socket") ||
                tLower.Contains("refused") ||
                tLower.Contains("close") ||
                tLower.Contains("exception") ||
                tLower.Contains("offline") ||
                tLower.Contains("send") ||
                tLower.Contains("receive"))
            {
                hasConnectionError = true;
                connectionErrorMsg = errorMsg;
            }
        }
    }
}
