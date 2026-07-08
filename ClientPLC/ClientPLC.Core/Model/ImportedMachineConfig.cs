using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace PLC.Model;

/// <summary>
/// Cấu hình đầy đủ của một máy, được import từ file CSV/JSON
/// hoặc tạo từ UI. Lưu trong data/machines/{machineId}/
/// </summary>
public class ImportedMachineConfig
{
    [JsonPropertyName("machineId")]
    public string MachineId { get; set; } = "";

    [JsonPropertyName("machineName")]
    public string MachineName { get; set; } = "";

    [JsonPropertyName("lineId")]
    public string LineId { get; set; } = "";

    [JsonPropertyName("lineName")]
    public string LineName { get; set; } = "";

    [JsonPropertyName("lineOrder")]
    public int LineOrder { get; set; } = 1;

    [JsonPropertyName("plc")]
    public PlcConnectionSetting Plc { get; set; } = new();

    [JsonPropertyName("status")]
    public Dictionary<string, AddressDef> Status { get; set; } = new();

    [JsonPropertyName("production")]
    public Dictionary<string, AddressDef> Production { get; set; } = new();

    [JsonPropertyName("quality")]
    public Dictionary<string, AddressDef> Quality { get; set; } = new();

    [JsonPropertyName("tags")]
    public List<TagDef> Tags { get; set; } = new();
}

public class PlcConnectionSetting
{
    [JsonPropertyName("brand")]
    public string Brand { get; set; } = "MelsecMcNet";

    [JsonPropertyName("ip")]
    public string Ip { get; set; } = "192.168.1.100";

    [JsonPropertyName("port")]
    public int Port { get; set; } = 6000;

    [JsonPropertyName("readIntervalMs")]
    public int ReadIntervalMs { get; set; } = 5000;

    [JsonPropertyName("rack")]
    public int Rack { get; set; } = 0;

    [JsonPropertyName("slot")]
    public int Slot { get; set; } = 0;

    [JsonPropertyName("station")]
    public int Station { get; set; } = 1;
}

public class AddressDef
{
    [JsonPropertyName("address")]
    public string Address { get; set; } = "";

    [JsonPropertyName("type")]
    public string Type { get; set; } = "Bool";
}

/// <summary>
/// Một tag address bất kỳ (alarm, process, extended...)
/// </summary>
public class TagDef
{
    [JsonPropertyName("address")]
    public string Address { get; set; } = "";

    [JsonPropertyName("alias")]
    public string Alias { get; set; } = "";

    [JsonPropertyName("type")]
    public string Type { get; set; } = "Bool";

    [JsonPropertyName("group")]
    public string Group { get; set; } = "General";

    [JsonPropertyName("severity")]
    public string Severity { get; set; } = "Medium";

    [JsonPropertyName("description")]
    public string Description { get; set; } = "";
}
