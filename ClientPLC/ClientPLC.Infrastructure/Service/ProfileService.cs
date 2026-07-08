using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using PLC.Model;

namespace PLC.Service;

/// <summary>
/// Service quản lý MachineProfile: load từ JSON, parse CSV alarms,
/// merge profile + overrides thành DataAddressItem list.
/// </summary>
public class ProfileService
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true
    };

    private readonly Dictionary<string, MachineProfile> _cache = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Thư mục gốc chứa profiles. Mặc định: "{AppContext.BaseDirectory}/profiles/"
    /// Có thể set trước khi gọi LoadProfile.
    /// </summary>
    public string ProfilesRoot { get; set; }

    public ProfileService()
    {
        // Try multiple possible locations
        var baseDir = AppContext.BaseDirectory;
        var candidates = new[]
        {
            Path.Combine(baseDir, "profiles"),
            Path.Combine(baseDir, "..", "..", "..", "profiles"),
            Path.Combine(baseDir, "..", "..", "..", "..", "profiles"),
            Path.Combine(Directory.GetCurrentDirectory(), "profiles")
        };

        ProfilesRoot = candidates.FirstOrDefault(Directory.Exists)
            ?? Path.Combine(baseDir, "profiles");
    }

    public ProfileService(string profilesRoot)
    {
        ProfilesRoot = profilesRoot;
    }

    /// <summary>
    /// Đăng ký thư mục profiles. Tạo nếu chưa có.
    /// </summary>
    public void EnsureProfilesDirectory()
    {
        if (!Directory.Exists(ProfilesRoot))
        {
            Directory.CreateDirectory(ProfilesRoot);
        }
    }

    /// <summary>
    /// Load MachineProfile từ file JSON.
    /// Kết quả được cache trong memory.
    /// </summary>
    public MachineProfile? LoadProfile(string profileId)
    {
        if (_cache.TryGetValue(profileId, out var cached))
            return cached;

        string profileDir = GetProfileDir(profileId);
        string profilePath = Path.Combine(profileDir, "profile.json");

        if (!File.Exists(profilePath))
        {
            // Try finding by directory name
            var dirs = Directory.GetDirectories(ProfilesRoot, $"{profileId}*");
            if (dirs.Length > 0)
            {
                profilePath = Path.Combine(dirs[0], "profile.json");
            }
        }

        if (!File.Exists(profilePath))
        {
            System.Diagnostics.Debug.WriteLine($"[ProfileService] Profile not found: {profileId} at {profilePath}");
            return null;
        }

        try
        {
            string json = File.ReadAllText(profilePath);
            var profile = JsonSerializer.Deserialize<MachineProfile>(json, JsonOpts);
            if (profile != null)
            {
                profile.ProfileId = profileId;
                _cache[profileId] = profile;
            }
            return profile;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[ProfileService] Error loading profile {profileId}: {ex.Message}");
            return null;
        }
    }

    /// <summary>
    /// Load alarm list từ CSV file trong thư mục profile.
    /// </summary>
    public List<AlarmItem> LoadAlarms(string profileId)
    {
        var profile = LoadProfile(profileId);
        if (profile == null) return new();

        string profileDir = GetProfileDir(profileId);
        string csvFile = Path.Combine(profileDir, profile.AlarmConfig.File);

        return LoadAlarmsFromCsv(csvFile);
    }

    /// <summary>
    /// Load alarm list từ CSV file bất kỳ.
    /// </summary>
    public List<AlarmItem> LoadAlarmsFromCsv(string csvPath)
    {
        var alarms = new List<AlarmItem>();

        if (!File.Exists(csvPath))
        {
            System.Diagnostics.Debug.WriteLine($"[ProfileService] Alarm CSV not found: {csvPath}");
            return alarms;
        }

        try
        {
            using var reader = new StreamReader(csvPath);
            string? headerLine = reader.ReadLine();
            if (string.IsNullOrWhiteSpace(headerLine)) return alarms;

            // Parse header
            var headers = headerLine.Split(',').Select(h => h.Trim().ToLower()).ToList();
            int addrIdx = headers.IndexOf("address");
            int aliasIdx = headers.IndexOf("alias");
            int severityIdx = headers.IndexOf("severity");
            int descIdx = headers.IndexOf("description");
            int groupIdx = headers.IndexOf("group");

            if (addrIdx < 0)
            {
                System.Diagnostics.Debug.WriteLine($"[ProfileService] CSV missing 'address' column");
                return alarms;
            }

            string? line;
            while ((line = reader.ReadLine()) != null)
            {
                if (string.IsNullOrWhiteSpace(line) || line.StartsWith('#'))
                    continue;

                var cols = SplitCsvLine(line);
                if (cols.Count <= addrIdx) continue;

                var alarm = new AlarmItem
                {
                    Address = cols[addrIdx].Trim(),
                    Alias = aliasIdx >= 0 && aliasIdx < cols.Count ? cols[aliasIdx].Trim() : "",
                    Severity = severityIdx >= 0 && severityIdx < cols.Count ? cols[severityIdx].Trim() : "Medium",
                    Description = descIdx >= 0 && descIdx < cols.Count ? cols[descIdx].Trim() : "",
                    Group = groupIdx >= 0 && groupIdx < cols.Count ? cols[groupIdx].Trim() : ""
                };

                if (!string.IsNullOrEmpty(alarm.Address))
                    alarms.Add(alarm);
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[ProfileService] Error loading CSV {csvPath}: {ex.Message}");
        }

        return alarms;
    }

    /// <summary>
    /// Tạo danh sách DataAddressItem từ profile + overrides + alarms.
    /// Đây là method chính để client code sử dụng.
    /// </summary>
    public List<DataAddressItem> BuildAddressItems(string profileId, List<AddressOverride>? overrides = null, string? alarmsFile = null)
    {
        var items = new List<DataAddressItem>();
        var profile = LoadProfile(profileId);
        if (profile == null) return items;

        int index = 1;

        // 1. Core status addresses
        foreach (var addr in profile.Core.StatusAddresses)
        {
            var resolved = ResolveAddress(addr, overrides);
            items.Add(new DataAddressItem
            {
                Index = index++,
                Address = resolved.Address,
                Type = resolved.Type,
                Alias = resolved.Alias,
                Group = "Nhóm trạng thái",
                Enabled = true
            });
        }

        // 2. Core production addresses
        foreach (var addr in profile.Core.ProductionAddresses)
        {
            var resolved = ResolveAddress(addr, overrides);
            items.Add(new DataAddressItem
            {
                Index = index++,
                Address = resolved.Address,
                Type = resolved.Type,
                Alias = resolved.Alias,
                Group = "Nhóm sản phẩm",
                Enabled = true
            });
        }

        // 3. Optional groups (kiểm tra appliesTo)
        foreach (var group in profile.OptionalGroups)
        {
            if (!group.AppliesTo.Contains(profileId, StringComparer.OrdinalIgnoreCase) &&
                group.AppliesTo.Count > 0)
                continue;

            string groupName = group.Id switch
            {
                "quality" => "Nhóm chất lượng",
                "robot" => "Nhóm sản phẩm",
                "conveyor" => "Nhóm sản phẩm",
                _ => "Khác"
            };

            foreach (var addr in group.Addresses)
            {
                var resolved = ResolveAddress(addr, overrides);
                items.Add(new DataAddressItem
                {
                    Index = index++,
                    Address = resolved.Address,
                    Type = resolved.Type,
                    Alias = resolved.Alias,
                    Group = groupName,
                    Enabled = true
                });
            }
        }

        // 4. Alarms
        var alarms = !string.IsNullOrEmpty(alarmsFile) && File.Exists(alarmsFile)
            ? LoadAlarmsFromCsv(alarmsFile)
            : LoadAlarms(profileId);

        foreach (var alarm in alarms)
        {
            items.Add(new DataAddressItem
            {
                Index = index++,
                Address = alarm.Address,
                Type = "Bool",
                Alias = alarm.Alias,
                Group = "Quy trình báo động",
                Enabled = true,
                Severity = alarm.Severity,
                Description = alarm.Description
            });
        }

        return items;
    }

    /// <summary>
    /// Lấy danh sách alarm display items từ profile (dùng cho LiveErrorsView).
    /// </summary>
    public List<AlarmDisplayItem> GetAlarmDisplayItems(string profileId)
    {
        var alarms = LoadAlarms(profileId);
        return alarms.Select(a => new AlarmDisplayItem
        {
            Address = a.Address,
            Alias = a.Alias,
            Severity = a.Severity,
            Description = a.Description,
            Group = a.Group
        }).ToList();
    }

    /// <summary>
    /// Đọc tất cả profileId có trong thư mục profiles.
    /// </summary>
    public List<string> GetAvailableProfileIds()
    {
        var ids = new List<string>();
        if (!Directory.Exists(ProfilesRoot)) return ids;

        foreach (var dir in Directory.GetDirectories(ProfilesRoot))
        {
            var profileFile = Path.Combine(dir, "profile.json");
            if (File.Exists(profileFile))
            {
                ids.Add(Path.GetFileName(dir));
            }
        }
        return ids;
    }

    /// <summary>
    /// Lấy thông tin hiển thị cho tất cả profiles.
    /// </summary>
    public List<(string id, string name)> GetAvailableProfiles()
    {
        var list = new List<(string, string)>();
        if (!Directory.Exists(ProfilesRoot)) return list;

        foreach (var dir in Directory.GetDirectories(ProfilesRoot))
        {
            var profileFile = Path.Combine(dir, "profile.json");
            if (!File.Exists(profileFile)) continue;

            try
            {
                var json = File.ReadAllText(profileFile);
                using var doc = JsonDocument.Parse(json);
                var id = Path.GetFileName(dir);
                var name = doc.RootElement.TryGetProperty("displayName", out var dn)
                    ? dn.GetString() ?? id : id;
                list.Add((id, name));
            }
            catch { list.Add((Path.GetFileName(dir), Path.GetFileName(dir))); }
        }
        return list;
    }

    // ==================== Private ====================

    private string GetProfileDir(string profileId)
    {
        return Path.Combine(ProfilesRoot, profileId);
    }

    private (string Address, string Type, string Alias) ResolveAddress(
        ProfileAddress addr, List<AddressOverride>? overrides)
    {
        if (overrides != null)
        {
            var ov = overrides.FirstOrDefault(o =>
                o.Key.Equals(addr.Key, StringComparison.OrdinalIgnoreCase));
            if (ov != null)
            {
                return (
                    !string.IsNullOrEmpty(ov.Address) ? ov.Address : addr.Address,
                    !string.IsNullOrEmpty(ov.Type) ? ov.Type : addr.Type,
                    !string.IsNullOrEmpty(ov.Alias) ? ov.Alias : addr.Alias
                );
            }
        }
        return (addr.Address, addr.Type, addr.Alias);
    }

    private static List<string> SplitCsvLine(string line)
    {
        var cols = new List<string>();
        bool inQuotes = false;
        int start = 0;

        for (int i = 0; i < line.Length; i++)
        {
            if (line[i] == '"')
                inQuotes = !inQuotes;
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

/// <summary>
/// Item dùng cho hiển thị alarm list (LiveErrorsView).
/// </summary>
public class AlarmDisplayItem
{
    public string Address { get; set; } = "";
    public string Alias { get; set; } = "";
    public string Severity { get; set; } = "Medium";
    public string Description { get; set; } = "";
    public string Group { get; set; } = "";
}
