using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace PLC.Model;

/// <summary>
/// Định nghĩa profile cho một loại máy.
/// Chứa template addresses, alarm config, optional groups.
/// Load từ file JSON trong thư mục profiles/.
/// </summary>
public class MachineProfile
{
    [JsonPropertyName("profileId")]
    public string ProfileId { get; set; } = "";

    [JsonPropertyName("version")]
    public string Version { get; set; } = "1.0";

    [JsonPropertyName("displayName")]
    public string DisplayName { get; set; } = "";

    [JsonPropertyName("description")]
    public string Description { get; set; } = "";

    [JsonPropertyName("plcDefaults")]
    public PlcDefaultConfig PlcDefaults { get; set; } = new();

    [JsonPropertyName("core")]
    public ProfileCore Core { get; set; } = new();

    [JsonPropertyName("optionalGroups")]
    public List<OptionalGroup> OptionalGroups { get; set; } = new();

    [JsonPropertyName("alarmConfig")]
    public AlarmConfig AlarmConfig { get; set; } = new();

    [JsonPropertyName("ioMapping")]
    public IOMapping IoMapping { get; set; } = new();
}

public class PlcDefaultConfig
{
    [JsonPropertyName("brand")]
    public string Brand { get; set; } = "MelsecMcNet";

    [JsonPropertyName("port")]
    public int Port { get; set; } = 6000;

    [JsonPropertyName("readIntervalMs")]
    public int ReadIntervalMs { get; set; } = 5000;
}

public class ProfileCore
{
    [JsonPropertyName("statusAddresses")]
    public List<ProfileAddress> StatusAddresses { get; set; } = new();

    [JsonPropertyName("productionAddresses")]
    public List<ProfileAddress> ProductionAddresses { get; set; } = new();
}

public class ProfileAddress
{
    [JsonPropertyName("key")]
    public string Key { get; set; } = "";

    [JsonPropertyName("alias")]
    public string Alias { get; set; } = "";

    [JsonPropertyName("address")]
    public string Address { get; set; } = "";

    [JsonPropertyName("type")]
    public string Type { get; set; } = "Bool";

    [JsonPropertyName("required")]
    public bool Required { get; set; } = true;
}

public class OptionalGroup
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("displayName")]
    public string DisplayName { get; set; } = "";

    [JsonPropertyName("appliesTo")]
    public List<string> AppliesTo { get; set; } = new();

    [JsonPropertyName("addresses")]
    public List<ProfileAddress> Addresses { get; set; } = new();
}

public class AlarmConfig
{
    [JsonPropertyName("file")]
    public string File { get; set; } = "alarms.csv";

    [JsonPropertyName("format")]
    public string Format { get; set; } = "csv";

    [JsonPropertyName("expectedColumns")]
    public List<string> ExpectedColumns { get; set; } = new() { "address", "alias", "severity", "description" };

    [JsonPropertyName("range")]
    public AlarmRange Range { get; set; } = new();
}

public class AlarmRange
{
    [JsonPropertyName("mStart")]
    public int MStart { get; set; } = 60;

    [JsonPropertyName("mEnd")]
    public int MEnd { get; set; } = 199;
}

public class IOMapping
{
    [JsonPropertyName("xCount")]
    public int XCount { get; set; }

    [JsonPropertyName("yCount")]
    public int YCount { get; set; }

    [JsonPropertyName("plcModel")]
    public string PlcModel { get; set; } = "";

    [JsonPropertyName("description")]
    public string Description { get; set; } = "";
}

/// <summary>
/// Một alarm item trong CSV hoặc từ profile
/// </summary>
public class AlarmItem
{
    public string Address { get; set; } = "";
    public string Alias { get; set; } = "";
    public string Severity { get; set; } = "Medium";
    public string Description { get; set; } = "";
    public string Group { get; set; } = "";
}
