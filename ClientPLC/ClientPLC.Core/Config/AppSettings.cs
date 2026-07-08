#define DEBUG
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;

namespace PLC.Config;

public class AppSettings
{
	private static AppSettings? _current;

	private static readonly object _lock = new object();

	public static AppSettings Current
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

	public static string IniPath
	{
		get
		{
			string appDataFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ClientPLC");
			if (!Directory.Exists(appDataFolder))
			{
				Directory.CreateDirectory(appDataFolder);
			}
			string newPath = Path.Combine(appDataFolder, "setting.ini");
			string oldPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "setting.ini");
			if (File.Exists(oldPath) && !File.Exists(newPath))
			{
				try
				{
					File.Copy(oldPath, newPath, overwrite: false);
				}
				catch (Exception ex)
				{
					Debug.WriteLine("[AppSettings] Migration error: " + ex.Message);
				}
			}
			return newPath;
		}
	}

	public string Language { get; set; } = "vi";

	public string Mode { get; set; } = "gui";

	public string Theme { get; set; } = "dark";

	public bool StartWithWindows { get; set; } = false;

	public float FontSize { get; set; } = 10f;

	public bool UseMockData { get; set; } = false;

	public Dictionary<string, bool> BrandVisibility { get; private set; } = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);

	public static AppSettings Load()
	{
		AppSettings appSettings = new AppSettings();
		string[] array = new string[27]
		{
			"Allen Bradley", "Beckhoff", "Cimon", "Common / Modbus", "Delta", "Fatek", "Freedom", "Fuji", "GE", "Inovance",
			"INVT", "Keyence", "LSIS", "MegMeet", "Mitsubishi Melsec", "Omron", "Oriental Motor", "Panasonic", "Secs", "Siemens",
			"Toyota", "Turck", "Vigor", "WeCon", "XINJE", "YASKAWA", "Yokogawa"
		};
		string[] array2 = array;
		foreach (string key in array2)
		{
			appSettings.BrandVisibility[key] = true;
		}
		try
		{
			if (!File.Exists(IniPath))
			{
				appSettings.Save();
				return appSettings;
			}
			string text = "";
			foreach (string item in File.ReadLines(IniPath))
			{
				string text2 = item.Trim();
				if (string.IsNullOrEmpty(text2) || text2.StartsWith(";") || text2.StartsWith("#"))
				{
					continue;
				}
				if (text2.StartsWith("[") && text2.EndsWith("]"))
				{
					text = text2.Substring(1, text2.Length - 2).Trim().ToLower();
					continue;
				}
				int num = text2.IndexOf('=');
				if (num < 0)
				{
					continue;
				}
				string text3 = text2.Substring(0, num).Trim();
				string text4 = text2.Substring(num + 1).Trim();
				bool result3;
				if (text == "app")
				{
					float result2;
					if (text3.Equals("Language", StringComparison.OrdinalIgnoreCase))
					{
						appSettings.Language = text4;
					}
					else if (text3.Equals("Mode", StringComparison.OrdinalIgnoreCase))
					{
						appSettings.Mode = text4;
					}
					else if (text3.Equals("Theme", StringComparison.OrdinalIgnoreCase))
					{
						appSettings.Theme = text4;
					}
					else if (text3.Equals("StartWithWindows", StringComparison.OrdinalIgnoreCase))
					{
						if (bool.TryParse(text4, out var result))
						{
							appSettings.StartWithWindows = result;
						}
					}
					else if (text3.Equals("FontSize", StringComparison.OrdinalIgnoreCase) && float.TryParse(text4, out result2))
					{
						appSettings.FontSize = result2;
					}
					else if (text3.Equals("UseMockData", StringComparison.OrdinalIgnoreCase))
					{
						if (bool.TryParse(text4, out var result))
						{
							appSettings.UseMockData = result;
						}
					}
				}
				else if (text == "brands" && bool.TryParse(text4, out result3))
				{
					appSettings.BrandVisibility[text3] = result3;
				}
			}
		}
		catch (Exception ex)
		{
			Debug.WriteLine("[AppSettings] Load error: " + ex.Message);
		}
		if (appSettings.BrandVisibility.TryGetValue("Melsec", out var value))
		{
			appSettings.BrandVisibility["Mitsubishi Melsec"] = value;
			appSettings.BrandVisibility.Remove("Melsec");
		}
		if (appSettings.BrandVisibility.TryGetValue("OrientalMotor", out var value2))
		{
			appSettings.BrandVisibility["Oriental Motor"] = value2;
			appSettings.BrandVisibility.Remove("OrientalMotor");
		}
		return appSettings;
	}

	public void Save()
	{
		try
		{
			StringBuilder stringBuilder = new StringBuilder();
			stringBuilder.AppendLine("[App]");
			StringBuilder stringBuilder2 = stringBuilder;
			StringBuilder stringBuilder3 = stringBuilder2;
			StringBuilder.AppendInterpolatedStringHandler handler = new StringBuilder.AppendInterpolatedStringHandler(9, 1, stringBuilder2);
			handler.AppendLiteral("Language=");
			handler.AppendFormatted(Language);
			stringBuilder3.AppendLine(ref handler);
			stringBuilder2 = stringBuilder;
			StringBuilder stringBuilder4 = stringBuilder2;
			handler = new StringBuilder.AppendInterpolatedStringHandler(5, 1, stringBuilder2);
			handler.AppendLiteral("Mode=");
			handler.AppendFormatted(Mode);
			stringBuilder4.AppendLine(ref handler);
			stringBuilder2 = stringBuilder;
			StringBuilder stringBuilder5 = stringBuilder2;
			handler = new StringBuilder.AppendInterpolatedStringHandler(6, 1, stringBuilder2);
			handler.AppendLiteral("Theme=");
			handler.AppendFormatted(Theme);
			stringBuilder5.AppendLine(ref handler);
			stringBuilder2 = stringBuilder;
			StringBuilder stringBuilder6 = stringBuilder2;
			handler = new StringBuilder.AppendInterpolatedStringHandler(17, 1, stringBuilder2);
			handler.AppendLiteral("StartWithWindows=");
			handler.AppendFormatted(StartWithWindows);
			stringBuilder6.AppendLine(ref handler);
			stringBuilder2 = stringBuilder;
			StringBuilder stringBuilder7 = stringBuilder2;
			handler = new StringBuilder.AppendInterpolatedStringHandler(9, 1, stringBuilder2);
			handler.AppendLiteral("FontSize=");
			handler.AppendFormatted(FontSize);
			stringBuilder7.AppendLine(ref handler);
			stringBuilder2 = stringBuilder;
			StringBuilder stringBuilder9 = stringBuilder2;
			handler = new StringBuilder.AppendInterpolatedStringHandler(12, 1, stringBuilder2);
			handler.AppendLiteral("UseMockData=");
			handler.AppendFormatted(UseMockData);
			stringBuilder9.AppendLine(ref handler);
			stringBuilder.AppendLine();
			stringBuilder.AppendLine("[Brands]");
			foreach (KeyValuePair<string, bool> item in BrandVisibility)
			{
				stringBuilder2 = stringBuilder;
				StringBuilder stringBuilder8 = stringBuilder2;
				handler = new StringBuilder.AppendInterpolatedStringHandler(1, 2, stringBuilder2);
				handler.AppendFormatted(item.Key);
				handler.AppendLiteral("=");
				handler.AppendFormatted(item.Value);
				stringBuilder8.AppendLine(ref handler);
			}
			File.WriteAllText(IniPath, stringBuilder.ToString(), Encoding.UTF8);
			_current = this;
		}
		catch (Exception ex)
		{
			Debug.WriteLine("[AppSettings] Save error: " + ex.Message);
		}
	}
}
