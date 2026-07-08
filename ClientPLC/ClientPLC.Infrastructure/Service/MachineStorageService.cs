using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using PLC.Model;

namespace PLC.Service;

/// <summary>
/// Quản lý lưu trữ cấu hình máy đã import.
/// Mỗi máy = 1 thư mục trong data/machines/{machineId}/
/// </summary>
public class MachineStorageService
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true
    };

    private readonly string _dataRoot;

    public MachineStorageService()
    {
        // data/ ngay cạnh app
        var baseDir = AppContext.BaseDirectory;
        _dataRoot = Path.Combine(baseDir, "data", "machines");
        EnsureDirectories();
    }

    public MachineStorageService(string dataRoot)
    {
        _dataRoot = dataRoot;
        EnsureDirectories();
    }

    public string DataRoot => _dataRoot;

    private void EnsureDirectories()
    {
        if (!Directory.Exists(_dataRoot))
            Directory.CreateDirectory(_dataRoot);
    }

    // ==================== Machine CRUD ====================

    /// <summary>
    /// Lấy danh sách máy đã import
    /// </summary>
    public List<MachineSummary> ListMachines()
    {
        var list = new List<MachineSummary>();
        if (!Directory.Exists(_dataRoot)) return list;

        foreach (var dir in Directory.GetDirectories(_dataRoot))
        {
            var machineFile = Path.Combine(dir, "machine.json");
            if (!File.Exists(machineFile)) continue;

            try
            {
                var json = File.ReadAllText(machineFile);
                var cfg = JsonSerializer.Deserialize<ImportedMachineConfig>(json, JsonOpts);
                if (cfg != null)
                {
                    list.Add(new MachineSummary
                    {
                        MachineId = cfg.MachineId,
                        MachineName = cfg.MachineName,
                        PlcIp = cfg.Plc?.Ip ?? "",
                        LineName = cfg.LineName
                    });
                }
            }
            catch { /* skip corrupt machine */ }
        }
        return list;
    }

    /// <summary>
    /// Đọc config đầy đủ của 1 máy
    /// </summary>
    public ImportedMachineConfig? LoadMachine(string machineId)
    {
        var dir = GetMachineDir(machineId);
        var machineFile = Path.Combine(dir, "machine.json");
        if (!File.Exists(machineFile)) return null;

        try
        {
            var json = File.ReadAllText(machineFile);
            var cfg = JsonSerializer.Deserialize<ImportedMachineConfig>(json, JsonOpts);

            // Load alarms từ CSV nếu có
            if (cfg != null)
            {
                var alarms = LoadAlarmsFromCsv(machineId);
                foreach (var alarm in alarms)
                {
                    cfg.Tags.Add(new TagDef
                    {
                        Address = alarm.Address,
                        Alias = alarm.Alias,
                        Type = "Bool",
                        Group = alarm.Group,
                        Severity = alarm.Severity,
                        Description = alarm.Description
                    });
                }
            }
            return cfg;
        }
        catch { return null; }
    }

    /// <summary>
    /// Lưu config cho 1 máy
    /// </summary>
    public void SaveMachine(ImportedMachineConfig config)
    {
        var dir = GetMachineDir(config.MachineId);
        if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);

        // Tách alarms ra khỏi tags trước khi lưu machine.json
        var alarms = config.Tags.Where(t =>
            t.Address.StartsWith("M", StringComparison.OrdinalIgnoreCase) &&
            !config.Status.ContainsValue(new AddressDef { Address = t.Address }) &&
            !config.Production.ContainsValue(new AddressDef { Address = t.Address })
        ).ToList();

        var nonAlarmTags = config.Tags.Except(alarms).ToList();

        // Save machine.json (không có alarms)
        var saveConfig = new ImportedMachineConfig
        {
            MachineId = config.MachineId,
            MachineName = config.MachineName,
            LineId = config.LineId,
            LineName = config.LineName,
            LineOrder = config.LineOrder,
            Plc = config.Plc,
            Status = config.Status,
            Production = config.Production,
            Quality = config.Quality,
            Tags = nonAlarmTags
        };
        var machineJson = JsonSerializer.Serialize(saveConfig, JsonOpts);
        File.WriteAllText(Path.Combine(dir, "machine.json"), machineJson);

        // Save alarms CSV riêng
        SaveAlarmsToCsv(config.MachineId, alarms);
    }

    /// <summary>
    /// Xóa máy
    /// </summary>
    public void DeleteMachine(string machineId)
    {
        var dir = GetMachineDir(machineId);
        if (Directory.Exists(dir))
            Directory.Delete(dir, true);
    }

    // ==================== Alarms CSV ====================

    private List<TagDef> LoadAlarmsFromCsv(string machineId)
    {
        var alarms = new List<TagDef>();
        var csvPath = Path.Combine(GetMachineDir(machineId), "alarms.csv");
        if (!File.Exists(csvPath)) return alarms;

        try
        {
            using var reader = new StreamReader(csvPath);
            var headerLine = reader.ReadLine();
            if (string.IsNullOrWhiteSpace(headerLine)) return alarms;

            var headers = headerLine.Split(',').Select(h => h.Trim().ToLower()).ToList();
            int addrIdx = headers.IndexOf("address");
            int aliasIdx = headers.IndexOf("alias");
            int typeIdx = headers.IndexOf("type");
            int groupIdx = headers.IndexOf("group");
            int severityIdx = headers.IndexOf("severity");
            int descIdx = headers.IndexOf("description");

            if (addrIdx < 0) return alarms;

            string? line;
            while ((line = reader.ReadLine()) != null)
            {
                if (string.IsNullOrWhiteSpace(line) || line.StartsWith('#')) continue;
                var cols = SplitCsvLine(line);
                if (cols.Count <= addrIdx) continue;

                var alarm = new TagDef
                {
                    Address = cols[addrIdx].Trim(),
                    Alias = aliasIdx >= 0 && aliasIdx < cols.Count ? cols[aliasIdx].Trim() : "",
                    Type = typeIdx >= 0 && typeIdx < cols.Count ? NormalizeType(cols[typeIdx].Trim()) : "Bool",
                    Group = groupIdx >= 0 && groupIdx < cols.Count ? cols[groupIdx].Trim() : "General",
                    Severity = severityIdx >= 0 && severityIdx < cols.Count ? cols[severityIdx].Trim() : "Medium",
                    Description = descIdx >= 0 && descIdx < cols.Count ? cols[descIdx].Trim() : ""
                };
                if (!string.IsNullOrEmpty(alarm.Address))
                    alarms.Add(alarm);
            }
        }
        catch { /* ignore CSV errors */ }

        return alarms;
    }

    public void SaveAlarmsToCsv(string machineId, List<TagDef> alarms)
    {
        var dir = GetMachineDir(machineId);
        if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);

        var csvPath = Path.Combine(dir, "alarms.csv");
        using var writer = new StreamWriter(csvPath, false, System.Text.Encoding.UTF8);
        writer.WriteLine("address,alias,type,group,severity,description");
        foreach (var a in alarms)
        {
            var aliasEsc = a.Alias.Contains(',') ? $"\"{a.Alias}\"" : a.Alias;
            var descEsc = a.Description.Contains(',') ? $"\"{a.Description}\"" : a.Description;
            writer.WriteLine($"{a.Address},{aliasEsc},{a.Type},{a.Group},{a.Severity},{descEsc}");
        }
    }

    // ==================== Utility ====================

    private string GetMachineDir(string machineId)
    {
        // Sanitize machineId for folder name
        string safeId = string.Join("_", machineId.Split(Path.GetInvalidFileNameChars()));
        return Path.Combine(_dataRoot, safeId);
    }

    private static string NormalizeType(string type)
    {
        var lower = type.ToLower();
        if (lower is "bool" or "boolean" or "bit") return "Bool";
        if (lower is "int16" or "short") return "Int16";
        if (lower is "uint16" or "ushort" or "word") return "UInt16";
        if (lower is "int32" or "int" or "dint") return "Int32";
        if (lower is "uint32" or "uint" or "dword") return "UInt32";
        if (lower is "float" or "single" or "real") return "Float";
        if (lower is "double") return "Double";
        return "Int16";
    }

    private static List<string> SplitCsvLine(string line)
    {
        var cols = new List<string>();
        bool inQuotes = false;
        int start = 0;
        for (int i = 0; i < line.Length; i++)
        {
            if (line[i] == '"') inQuotes = !inQuotes;
            else if (line[i] == ',' && !inQuotes)
            {
                cols.Add(line[start..i]);
                start = i + 1;
            }
        }
        cols.Add(line[start..]);
        return cols;
    }
}

public class MachineSummary
{
    public string MachineId { get; set; } = "";
    public string MachineName { get; set; } = "";
    public string PlcIp { get; set; } = "";
    public string LineName { get; set; } = "";
}
