#define DEBUG
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Win32;
using System.Net.NetworkInformation;
using System.Security.Cryptography;
using System.Text;
using System.Linq;

namespace PLC.Config;

public interface IConfigStorage
{
	string GetConfigValue(string key);
	void SaveConfigValue(string key, string value);
}

public class AppConfig
{
	public static IConfigStorage Storage { get; set; }

	private static AppConfig _current;

	private static readonly object _lock = new object();

	private static readonly JsonSerializerOptions _jsonOpts = new JsonSerializerOptions
	{
		WriteIndented = true,
		PropertyNameCaseInsensitive = true
	};

	public static AppConfig Current
	{
		get
		{
			if (_current == null)
			{
				lock (_lock)
				{
					if (_current == null)
					{
						_current = Load();
					}
				}
			}
			return _current;
		}
	}



	private string _machineId = string.Empty;

	[JsonPropertyName("machineId")]
	public string MachineId
	{
		get
		{
			if (string.IsNullOrEmpty(_machineId))
			{
				_machineId = GetSystemUniqueId();
			}
			return _machineId;
		}
		set
		{
			_machineId = string.IsNullOrEmpty(value) ? GetSystemUniqueId() : value;
		}
	}

	[JsonPropertyName("machineName")]
	public string MachineName { get; set; } = "May 01";

	[JsonPropertyName("lineId")]
	public string LineId { get; set; } = "line-01";

	[JsonPropertyName("lineName")]
	public string LineName { get; set; } = "Chuyen A";

	[JsonPropertyName("lineOrder")]
	public int LineOrder { get; set; } = 1;

	[JsonPropertyName("plcBrand")]
	public string PlcBrand { get; set; } = "MelsecMcNet";

	[JsonPropertyName("plcIp")]
	public string PlcIp { get; set; } = "192.168.1.100";

	[JsonPropertyName("plcPort")]
	public int PlcPort { get; set; } = 6000;

	[JsonPropertyName("plcRack")]
	public int PlcRack { get; set; } = 0;

	[JsonPropertyName("plcSlot")]
	public int PlcSlot { get; set; } = 0;

	[JsonPropertyName("plcStation")]
	public int PlcStation { get; set; } = 1;

	[JsonPropertyName("readIntervalMs")]
	public int ReadIntervalMs { get; set; } = 5000;

	[JsonPropertyName("serverHost")]
	public string ServerHost { get; set; } = "127.0.0.1";

	[JsonPropertyName("serverPort")]
	public int ServerPort { get; set; } = 1883;

	[JsonPropertyName("machineProfileId")]
	public string MachineProfileId { get; set; } = "screw_machine";

	[JsonPropertyName("readAddresses")]
	public string ReadAddresses { get; set; } = "";

	private string _transientServerToken = "";

	[JsonIgnore]
	public string ServerToken
	{
		get => Environment.GetEnvironmentVariable("FII_MQTT_DEVICE_TOKEN") ?? _transientServerToken;
		set => _transientServerToken = value ?? "";
	}

	[JsonPropertyName("mqttUseTls")]
	public bool MqttUseTls { get; set; }

	[JsonPropertyName("targetSpeed")]
	public int TargetSpeed { get; set; } = 60;

	[JsonPropertyName("localWebPort")]
	public int LocalWebPort { get; set; } = 8080;

	public static AppConfig Load()
	{
		try
		{
			AppConfig appConfig = null;
			string dbJson = Storage?.GetConfigValue("app_config_json");
			bool hasLegacyServerToken = false;
			if (!string.IsNullOrEmpty(dbJson))
			{
				using (JsonDocument document = JsonDocument.Parse(dbJson))
				{
					hasLegacyServerToken = document.RootElement.ValueKind == JsonValueKind.Object
						&& document.RootElement.EnumerateObject().Any(
							property => property.Name.Equals("serverToken", StringComparison.OrdinalIgnoreCase));
				}
				appConfig = JsonSerializer.Deserialize<AppConfig>(dbJson, _jsonOpts);
			}

			if (appConfig == null)
			{
				appConfig = new AppConfig();
			}
			appConfig.EnsureDefaultAddresses();
			if (hasLegacyServerToken)
			{
				appConfig.Save();
			}
			return appConfig;
		}
		catch (Exception ex)
		{
			Debug.WriteLine("[AppConfig] Load error: " + ex.Message);
		}
		AppConfig appConfig2 = new AppConfig();
		appConfig2.EnsureDefaultAddresses();
		return appConfig2;
	}

	public void EnsureDefaultAddresses()
	{
		List<string> existingAliases = new List<string>();
		List<string> oldDelimitedList = new List<string>();
		bool isJson = false;
		
		string readAddresses = (ReadAddresses ?? "").Trim();
		if (!string.IsNullOrWhiteSpace(readAddresses))
		{
			if (readAddresses.StartsWith("["))
			{
				isJson = true;
				try
				{
					using var doc = System.Text.Json.JsonDocument.Parse(readAddresses);
					foreach (var elem in doc.RootElement.EnumerateArray())
					{
						if (elem.TryGetProperty("Alias", out var aliasProp))
						{
							existingAliases.Add(aliasProp.GetString()?.Trim() ?? "");
						}
					}
				}
				catch
				{
					isJson = false;
				}
			}
			
			if (!isJson)
			{
				string[] array = readAddresses.Split(',', StringSplitOptions.RemoveEmptyEntries);
				foreach (string text in array)
				{
					string[] array3 = text.Split(':');
					if (array3.Length > 2)
					{
						existingAliases.Add(array3[2].Trim());
					}
					oldDelimitedList.Add(text.Trim());
				}
			}
		}

		List<(string, string)> allDefaults = new List<(string, string)>
		{
			// Core status
			("Running", "M20:Bool:Running:1:Nhóm trạng thái"),
			("Stopped", "M21:Bool:Stopped:1:Nhóm trạng thái"),
			("Error", "M22:Bool:Error:1:Nhóm trạng thái"),
			// Production
			("Quantity", "D1026:Int16:Quantity:1:Nhóm sản phẩm"),
			("Cycle Time", "D1022:Int16:Cycle Time:1:Nhóm sản phẩm"),
			// Quality (empty addresses by default — user sets them per machine)
			("OK", ":Bool:OK:1:Nhóm chất lượng"),
			("NG", ":Bool:NG:1:Nhóm chất lượng")
		};

		bool isFreshInit = existingAliases.Count == 0;
		List<(string, string)> defaultsToMerge;

		if (isFreshInit)
		{
			defaultsToMerge = allDefaults;
		}
		else
		{
			// Only merge mandatory status aliases: Running, Stopped, Error
			defaultsToMerge = allDefaults.Where(d =>
				d.Item1.Equals("Running", StringComparison.OrdinalIgnoreCase) ||
				d.Item1.Equals("Stopped", StringComparison.OrdinalIgnoreCase) ||
				d.Item1.Equals("Error", StringComparison.OrdinalIgnoreCase)
			).ToList();
		}

		if (isJson)
		{
			try
			{
				var items = System.Text.Json.JsonSerializer.Deserialize<List<System.Text.Json.Nodes.JsonObject>>(readAddresses) ?? new List<System.Text.Json.Nodes.JsonObject>();
				foreach (var d in defaultsToMerge)
				{
					if (!existingAliases.Any(a => a.Equals(d.Item1, StringComparison.OrdinalIgnoreCase)))
					{
						string[] parts = d.Item2.Split(':');
						var obj = new System.Text.Json.Nodes.JsonObject
						{
							["Address"] = parts[0],
							["Type"] = parts[1],
							["Alias"] = parts[2],
							["Enabled"] = parts[3] == "1",
							["Group"] = parts.Length > 4 ? parts[4] : "",
							["ActiveValue"] = "true",
							["Severity"] = "Medium"
						};
						items.Add(obj);
					}
				}
				ReadAddresses = System.Text.Json.JsonSerializer.Serialize(items);
			}
			catch
			{
				ReadAddresses = string.Join(",", oldDelimitedList);
			}
		}
		else
		{
			foreach (var d in defaultsToMerge)
			{
				if (!existingAliases.Any(a => a.Equals(d.Item1, StringComparison.OrdinalIgnoreCase)))
				{
					oldDelimitedList.Add(d.Item2);
				}
			}
			ReadAddresses = string.Join(",", oldDelimitedList);
		}
	}

	public void Save()
	{
		try
		{
			string contents = JsonSerializer.Serialize(this, _jsonOpts);
			Storage?.SaveConfigValue("app_config_json", contents);
			_current = this;
		}
		catch (Exception ex)
		{
			Debug.WriteLine("[AppConfig] Save error: " + ex.Message);
		}
	}

	public static void Reload()
	{
		lock (_lock)
		{
			_current = Load();
		}
	}

	private static string GetSystemUniqueId()
	{
		try
		{
			using (var key = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry64))
			{
				using (var subkey = key.OpenSubKey(@"SOFTWARE\Microsoft\Cryptography"))
				{
					if (subkey != null)
					{
						object val = subkey.GetValue("MachineGuid");
						if (val != null)
						{
							return val.ToString();
						}
					}
				}
			}
		}
		catch
		{
		}

		try
		{
			var interfaces = NetworkInterface.GetAllNetworkInterfaces();
			foreach (var ni in interfaces)
			{
				if (ni.OperationalStatus == OperationalStatus.Up)
				{
					string mac = ni.GetPhysicalAddress().ToString();
					if (!string.IsNullOrEmpty(mac))
					{
						using (var md5 = MD5.Create())
						{
							byte[] hash = md5.ComputeHash(Encoding.UTF8.GetBytes(mac));
							return new Guid(hash).ToString();
						}
					}
				}
			}
		}
		catch
		{
		}

		return "00000000-0000-0000-0000-000000000001";
	}
}
