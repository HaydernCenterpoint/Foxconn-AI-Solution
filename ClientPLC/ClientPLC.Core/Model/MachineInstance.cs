using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace PLC.Model;

/// <summary>
/// Một instance máy cụ thể — kết nối PLC thật.
/// Gắn với một MachineProfile qua profileId.
/// </summary>
public class MachineInstance
{
    [JsonPropertyName("machineId")]
    public string MachineId { get; set; } = "";

    [JsonPropertyName("profileId")]
    public string ProfileId { get; set; } = "";

    [JsonPropertyName("machineName")]
    public string MachineName { get; set; } = "";

    [JsonPropertyName("lineId")]
    public string LineId { get; set; } = "";

    [JsonPropertyName("lineName")]
    public string LineName { get; set; } = "";

    [JsonPropertyName("lineOrder")]
    public int LineOrder { get; set; } = 1;

    [JsonPropertyName("plcConnection")]
    public PlcConnectionConfig PlcConnection { get; set; } = new();

    [JsonPropertyName("overrides")]
    public MachineOverrides Overrides { get; set; } = new();

    [JsonPropertyName("enabled")]
    public bool Enabled { get; set; } = true;
}

public class PlcConnectionConfig
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

public class MachineOverrides
{
    [JsonPropertyName("addresses")]
    public List<AddressOverride> Addresses { get; set; } = new();

    [JsonPropertyName("alarmsFile")]
    public string AlarmsFile { get; set; } = "";

    [JsonPropertyName("notes")]
    public string Notes { get; set; } = "";
}

public class AddressOverride
{
    [JsonPropertyName("key")]
    public string Key { get; set; } = "";

    [JsonPropertyName("address")]
    public string Address { get; set; } = "";

    [JsonPropertyName("type")]
    public string Type { get; set; } = "";

    [JsonPropertyName("alias")]
    public string Alias { get; set; } = "";

    [JsonPropertyName("note")]
    public string Note { get; set; } = "";
}
