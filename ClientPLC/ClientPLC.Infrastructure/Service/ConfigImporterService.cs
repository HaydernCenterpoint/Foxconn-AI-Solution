using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using PLC.Model;

namespace PLC.Service;

/// <summary>
/// Import cấu hình máy từ file CSV hoặc JSON.
/// Tự động detect format và parse thành ImportedMachineConfig.
/// </summary>
public class ConfigImporterService
{
    /// <summary>
    /// Import từ file path. Tự động detect CSV hay JSON dựa trên extension.
    /// </summary>
    public ImportResult ImportFile(string filePath, string? machineId = null)
    {
        if (!File.Exists(filePath))
            return new ImportResult { Success = false, Error = $"File không tồn tại: {filePath}" };

        try
        {
            var ext = Path.GetExtension(filePath).ToLower();
            return ext switch
            {
                ".json" => ImportJson(filePath, machineId),
                ".csv" => ImportCsv(filePath, machineId),
                _ => new ImportResult { Success = false, Error = $"Định dạng không hỗ trợ: {ext}. Chỉ hỗ trợ .json và .csv" }
            };
        }
        catch (Exception ex)
        {
            return new ImportResult { Success = false, Error = $"Lỗi đọc file: {ex.Message}" };
        }
    }

    /// <summary>
    /// Import từ JSON — cấu trúc đầy đủ 1 máy
    /// </summary>
    public ImportResult ImportJson(string filePath, string? machineId = null)
    {
        var json = File.ReadAllText(filePath, System.Text.Encoding.UTF8);
        var cfg = JsonSerializer.Deserialize<ImportedMachineConfig>(json, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        if (cfg == null)
            return new ImportResult { Success = false, Error = "Không thể parse JSON" };

        // Nếu không có machineId trong file, dùng từ tham số hoặc sinh tự động
        if (string.IsNullOrWhiteSpace(cfg.MachineId))
            cfg.MachineId = machineId ?? Guid.NewGuid().ToString("N")[..8];

        // Đảm bảo có status cơ bản
        EnsureDefaultStatus(cfg);

        int totalAddresses = cfg.Status.Count + cfg.Production.Count + cfg.Quality.Count + cfg.Tags.Count;
        return new ImportResult
        {
            Success = true,
            Config = cfg,
            Summary = new ImportSummary
            {
                TotalAddresses = totalAddresses,
                StatusCount = cfg.Status.Count,
                ProductionCount = cfg.Production.Count,
                QualityCount = cfg.Quality.Count,
                AlarmsCount = cfg.Tags.Count,
                HasPlcConfig = !string.IsNullOrWhiteSpace(cfg.Plc?.Ip),
                MachineName = cfg.MachineName,
                MachineId = cfg.MachineId
            }
        };
    }

    /// <summary>
    /// Import từ CSV — danh sách address tags.
    /// Tự động phân loại vào status/production/quality dựa trên group column hoặc address pattern.
    /// </summary>
    public ImportResult ImportCsv(string filePath, string? machineId = null)
    {
        var tags = new List<TagDef>();
        var machineName = Path.GetFileNameWithoutExtension(filePath);

        using var reader = new StreamReader(filePath, System.Text.Encoding.UTF8);
        var headerLine = reader.ReadLine();
        if (string.IsNullOrWhiteSpace(headerLine))
            return new ImportResult { Success = false, Error = "File CSV rỗng" };

        var headers = headerLine.Split(',').Select(h => h.Trim().ToLower()).ToList();
        int addrIdx = headers.IndexOf("address");
        int aliasIdx = headers.IndexOf("alias");
        // Support "error_name" as alias fallback
        if (aliasIdx < 0) aliasIdx = headers.IndexOf("error_name");
        int typeIdx = headers.IndexOf("type");
        int groupIdx = headers.IndexOf("group");
        int severityIdx = headers.IndexOf("severity");
        int descIdx = headers.IndexOf("description");

        if (addrIdx < 0)
            return new ImportResult { Success = false, Error = "CSV thiếu cột 'address'" };

        string? line;
        while ((line = reader.ReadLine()) != null)
        {
            if (string.IsNullOrWhiteSpace(line) || line.StartsWith('#')) continue;
            var cols = SplitCsvLine(line);
            if (cols.Count <= addrIdx) continue;

            var addr = cols[addrIdx].Trim();
            if (string.IsNullOrEmpty(addr)) continue;

            var alias = aliasIdx >= 0 && aliasIdx < cols.Count ? cols[aliasIdx].Trim() : "";
            var type = typeIdx >= 0 && typeIdx < cols.Count ? NormalizeType(cols[typeIdx].Trim()) : "Bool";
            var group = groupIdx >= 0 && groupIdx < cols.Count ? cols[groupIdx].Trim() : "";
            var severity = severityIdx >= 0 && severityIdx < cols.Count ? cols[severityIdx].Trim() : "Medium";
            var desc = descIdx >= 0 && descIdx < cols.Count ? cols[descIdx].Trim() : "";

            tags.Add(new TagDef
            {
                Address = addr,
                Alias = alias,
                Type = type,
                Group = group,
                Severity = severity,
                Description = desc
            });
        }

        if (tags.Count == 0)
            return new ImportResult { Success = false, Error = "Không tìm thấy dữ liệu trong CSV" };

        // Phân loại tags vào status/production/quality dựa trên group hoặc alias patterns
        var cfg = new ImportedMachineConfig
        {
            MachineId = machineId ?? Guid.NewGuid().ToString("N")[..8],
            MachineName = machineName,
            Plc = new PlcConnectionSetting()
        };

        var remainingTags = new List<TagDef>();

        foreach (var tag in tags)
        {
            var aliasLower = tag.Alias.ToLower();
            var groupLower = tag.Group.ToLower();

            // Phân loại dựa trên group
            if (groupLower.Contains("status") || groupLower.Contains("trạng thái"))
            {
                cfg.Status[MakeKey(aliasLower)] = new AddressDef { Address = tag.Address, Type = tag.Type };
            }
            else if (groupLower.Contains("production") || groupLower.Contains("sản phẩm") || groupLower.Contains("product"))
            {
                cfg.Production[MakeKey(aliasLower)] = new AddressDef { Address = tag.Address, Type = tag.Type };
            }
            else if (groupLower.Contains("quality") || groupLower.Contains("chất lượng"))
            {
                cfg.Quality[MakeKey(aliasLower)] = new AddressDef { Address = tag.Address, Type = tag.Type };
            }
            else
            {
                // Phân loại dựa trên alias patterns
                if (aliasLower is "start" or "stop" or "error" or "running" or "alarm" or "status")
                {
                    cfg.Status[aliasLower] = new AddressDef { Address = tag.Address, Type = tag.Type };
                }
                else if (aliasLower.Contains("quantity") || aliasLower.Contains("count") || aliasLower.Contains("cycle") || aliasLower.Contains("time"))
                {
                    cfg.Production[MakeKey(aliasLower)] = new AddressDef { Address = tag.Address, Type = tag.Type };
                }
                else if (aliasLower.Contains("ng") || aliasLower.Contains("defect") || aliasLower.Contains("quality"))
                {
                    cfg.Quality[MakeKey(aliasLower)] = new AddressDef { Address = tag.Address, Type = tag.Type };
                }
                else
                {
                    remainingTags.Add(tag); // Sẽ vào tags (alarms)
                }
            }
        }

        cfg.Tags = remainingTags;
        EnsureDefaultStatus(cfg);

        return new ImportResult
        {
            Success = true,
            Config = cfg,
            Summary = new ImportSummary
            {
                TotalAddresses = cfg.Status.Count + cfg.Production.Count + cfg.Quality.Count + cfg.Tags.Count,
                StatusCount = cfg.Status.Count,
                ProductionCount = cfg.Production.Count,
                QualityCount = cfg.Quality.Count,
                AlarmsCount = cfg.Tags.Count,
                MachineName = cfg.MachineName,
                MachineId = cfg.MachineId
            }
        };
    }

    /// <summary>
    /// Import từ string content (dùng cho paste hoặc test)
    /// </summary>
    public ImportResult ImportFromString(string content, string? fileName = "import.csv", string? machineId = null)
    {
        var tempFile = Path.Combine(Path.GetTempPath(), $"plc_import_{Guid.NewGuid():N}{Path.GetExtension(fileName)}");
        try
        {
            File.WriteAllText(tempFile, content, System.Text.Encoding.UTF8);
            return ImportFile(tempFile, machineId);
        }
        finally
        {
            if (File.Exists(tempFile)) File.Delete(tempFile);
        }
    }

    // ==================== Private ====================

    private static void EnsureDefaultStatus(ImportedMachineConfig cfg)
    {
        if (!cfg.Status.ContainsKey("start"))
            cfg.Status["start"] = new AddressDef { Address = "M0", Type = "Bool" };
        if (!cfg.Status.ContainsKey("stop"))
            cfg.Status["stop"] = new AddressDef { Address = "M1", Type = "Bool" };
        if (!cfg.Status.ContainsKey("error"))
            cfg.Status["error"] = new AddressDef { Address = "M22", Type = "Bool" };
    }

    private static string MakeKey(string alias)
    {
        return alias.Replace(" ", "_").Replace("-", "_").ToLower();
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

public class ImportResult
{
    public bool Success { get; set; }
    public string Error { get; set; } = "";
    public ImportedMachineConfig? Config { get; set; }
    public ImportSummary? Summary { get; set; }
}

public class ImportSummary
{
    public int TotalAddresses { get; set; }
    public int StatusCount { get; set; }
    public int ProductionCount { get; set; }
    public int QualityCount { get; set; }
    public int AlarmsCount { get; set; }
    public bool HasPlcConfig { get; set; }
    public string MachineName { get; set; } = "";
    public string MachineId { get; set; } = "";
    public string? DetectedPlcIp { get; set; }
}
