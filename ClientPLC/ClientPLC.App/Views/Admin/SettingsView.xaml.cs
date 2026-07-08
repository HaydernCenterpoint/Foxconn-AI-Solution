using PLC.Views;
using System;
using System.CodeDom.Compiler;
using System.Collections;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Linq;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Markup;
using System.Windows.Threading;
using HslCommunication;
using HslCommunication.Language;
using MQTTnet;
using PLC.Config;
using PLC.Network;
using PLC.Service;
using MessageBox = PLC.Views.CustomMessageBox;

namespace PLC.Views;

public partial class SettingsView : UserControl, ILocalizable
{
	private DispatcherTimer? _telemetryTimer;

	private readonly Dictionary<string, List<string>> _brandProtocols = new Dictionary<string, List<string>>
	{
		{
			"Mitsubishi Melsec",
			new List<string> { "MelsecMcNet", "MelsecMcAsciiNet", "MelsecMcUdp", "MelsecMcAsciiUdp", "MelsecA1ENet", "MelsecA1EUdp" }
		},
		{
			"Siemens",
			new List<string> { "SiemensS7Net_S1200", "SiemensS7Net_S1500", "SiemensS7Net_S300", "SiemensS7Net_S400", "SiemensS7Net_S200Smart", "SiemensFetchWriteNet" }
		},
		{
			"Common / Modbus",
			new List<string> { "ModbusTcpNet", "ModbusUdpNet", "ModbusRtuOverTcp", "ModbusAsciiOverTcp" }
		},
		{
			"Omron",
			new List<string> { "OmronFinsNet", "OmronFinsUdp", "OmronCipNet" }
		},
		{
			"Keyence",
			new List<string> { "KeyenceMcNet", "KeyenceMcAsciiNet", "KeyenceMcUdp", "KeyenceMcAsciiUdp" }
		},
		{
			"Delta",
			new List<string> { "DeltaDvpTcpNet", "DeltaDvpUdpNet", "DeltaDvpSerialOverTcp" }
		},
		{
			"Panasonic",
			new List<string> { "PanasonicMewtocOverTcp" }
		},
		{
			"LSIS",
			new List<string> { "LnetFastTcp" }
		},
		{
			"Fuji",
			new List<string> { "FujiSPHNet" }
		},
		{
			"Beckhoff",
			new List<string> { "BeckhoffAdsNet" }
		},
		{
			"Fatek",
			new List<string> { "FatekProLinkOverTcp" }
		},
		{
			"Khác / Hợp chuẩn",
			new List<string> { "PLCGeneric" }
		}
	};

	private float _lastCpu = 0f;

	private float _lastRamUsed = 0f;

	private float _lastRamTotal = 0f;

	private long _lastUptimeMs = 0L;
	public SettingsView()
	{
		InitializeComponent();
		base.Loaded += SettingsView_Loaded;
		base.Unloaded += SettingsView_Unloaded;
		btnTestConnection.Click += BtnTestConnection_Click;
		btnViewTestData.Click += BtnViewTestData_Click;
		btnSendTestData.Click += BtnSendTestData_Click;
		BtnSaveConfig.Click += BtnSave_Click;
		CboBrand.SelectionChanged += CboBrand_SelectionChanged;
		CboProtocol.SelectionChanged += CboProtocol_SelectionChanged;
		SldFontSize.ValueChanged += SldFontSize_ValueChanged;
		
		PLC.Service.LanguageManager.LanguageChanged += OnLanguageChanged;
	}

	private void SettingsView_Loaded(object sender, RoutedEventArgs e)
	{
		LoadConfigValues();
		TranslateUI();
		StartTelemetryTimer();
	}

	private void SettingsView_Unloaded(object sender, RoutedEventArgs e)
	{
		_telemetryTimer?.Stop();
		PLC.Service.LanguageManager.LanguageChanged -= OnLanguageChanged;
	}

	private void OnLanguageChanged(object? sender, EventArgs e)
	{
		ApplyLanguage();
	}

	public void ApplyLanguage()
	{
		TranslateUI();
	}

	private void LoadConfigValues()
	{
		try
		{
			AppConfig current = AppConfig.Current;
			AppSettings current2 = AppSettings.Current;
			TxtMachineId.Text = current.MachineId;
			TxtMachineName.Text = current.MachineName;
			TxtLineId.Text = current.LineId;
			TxtLineName.Text = current.LineName;
			TxtLineOrder.Text = current.LineOrder.ToString();
			foreach (ComboBoxItem item in (IEnumerable)CboTheme.Items)
			{
				if (item.Tag?.ToString() == current2.Theme)
				{
					CboTheme.SelectedItem = item;
					break;
				}
			}
			SldFontSize.Value = current2.FontSize;
			TxtFontSizeVal.Text = $"{current2.FontSize} px";
			ChkUseMockData.IsChecked = current2.UseMockData;
			foreach (ComboBoxItem item2 in (IEnumerable)CboLanguage.Items)
			{
				if (item2.Tag?.ToString() == current2.Language)
				{
					CboLanguage.SelectedItem = item2;
					break;
				}
			}
			PanelBrandsCheckboxes.Children.Clear();
			foreach (KeyValuePair<string, bool> item3 in current2.BrandVisibility.OrderBy<KeyValuePair<string, bool>, string>((KeyValuePair<string, bool> x) => x.Key))
			{
				CheckBox checkBox = new CheckBox();
				checkBox.Content = item3.Key;
				checkBox.IsChecked = item3.Value;
				checkBox.Margin = new Thickness(0.0, 0.0, 10.0, 10.0);
				checkBox.Style = (Style)FindResource(typeof(CheckBox));
				CheckBox element = checkBox;
				PanelBrandsCheckboxes.Children.Add(element);
			}
			CboBrand.Items.Clear();
			foreach (string key in _brandProtocols.Keys)
			{
				CboBrand.Items.Add(key);
			}
			string plcBrand = current.PlcBrand;
			string selectedItem = "Khác / Hợp chuẩn";
			foreach (KeyValuePair<string, List<string>> brandProtocol in _brandProtocols)
			{
				if (brandProtocol.Value.Contains(plcBrand))
				{
					selectedItem = brandProtocol.Key;
					break;
				}
			}
			CboBrand.SelectedItem = selectedItem;
			CboProtocol.SelectedItem = plcBrand;
			TxtPlcIp.Text = current.PlcIp;
			TxtPlcPort.Text = current.PlcPort.ToString();
			TxtInterval.Text = current.ReadIntervalMs.ToString();
			TxtPlcRack.Text = current.PlcRack.ToString();
			TxtPlcSlot.Text = current.PlcSlot.ToString();
			TxtPlcStation.Text = current.PlcStation.ToString();
			TxtServerHost.Text = current.ServerHost;
			TxtServerPort.Text = current.ServerPort.ToString();
		}
		catch (Exception ex)
		{
			CustomMessageBox.Show("Lỗi tải cài đặt: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Hand);
		}
	}

	private void CboBrand_SelectionChanged(object sender, SelectionChangedEventArgs e)
	{
		if (!(CboBrand.SelectedItem is string key))
		{
			return;
		}
		CboProtocol.Items.Clear();
		if (!_brandProtocols.TryGetValue(key, out List<string> value))
		{
			return;
		}
		foreach (string item in value)
		{
			CboProtocol.Items.Add(item);
		}
		if (CboProtocol.Items.Count > 0)
		{
			CboProtocol.SelectedIndex = 0;
		}
	}

	private void CboProtocol_SelectionChanged(object sender, SelectionChangedEventArgs e)
	{
		if (CboProtocol.SelectedItem is string text)
		{
			bool flag = text.Contains("SiemensS7Net") || text.Contains("Modbus") || text.Contains("Omron") || text.Contains("Fins");
			PanelAdvancedPlcOptions.Visibility = ((!flag) ? Visibility.Collapsed : Visibility.Visible);
			PanelRack.Visibility = ((!text.Contains("SiemensS7Net")) ? Visibility.Collapsed : Visibility.Visible);
			PanelSlot.Visibility = ((!text.Contains("SiemensS7Net")) ? Visibility.Collapsed : Visibility.Visible);
			PanelStation.Visibility = ((!text.Contains("Modbus") && !text.Contains("Omron") && !text.Contains("Fins")) ? Visibility.Collapsed : Visibility.Visible);
		}
	}

	private void SldFontSize_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
	{
		if (TxtFontSizeVal != null)
		{
			TxtFontSizeVal.Text = $"{(int)e.NewValue} px";
		}
	}

	private void StartTelemetryTimer()
	{
		UpdateTelemetryLabels();
		_telemetryTimer = new DispatcherTimer();
		_telemetryTimer.Interval = TimeSpan.FromSeconds(1L);
		_telemetryTimer.Tick += delegate
		{
			try
			{
				_lastCpu = SystemInfoService.GetCpuPercent();
				(float usedMb, float totalMb) ramInfo = SystemInfoService.GetRamInfo();
				float item = ramInfo.usedMb;
				float item2 = ramInfo.totalMb;
				_lastRamUsed = item;
				_lastRamTotal = item2;
				_lastUptimeMs = SystemInfoService.GetSystemUptimeMs();
				UpdateTelemetryLabels();
			}
			catch
			{
			}
		};
		_telemetryTimer.Start();
	}

	private void UpdateTelemetryLabels()
	{
		try
		{
			string format = LanguageManager.GetText("TelemetryOS") ?? "Hệ điều hành: {0} ({1})";
			LblOS.Content = string.Format(format, RuntimeInformation.OSDescription, RuntimeInformation.OSArchitecture);
			string format2 = LanguageManager.GetText("TelemetryCpuCores") ?? "Số luồng CPU: {0}";
			LblCpuCores.Content = string.Format(format2, Environment.ProcessorCount);
			string format3 = LanguageManager.GetText("TelemetryCpuUsage") ?? "Sử dụng CPU: {0:F1}%";
			LblCpuUsage.Content = string.Format(format3, _lastCpu);
			string format4 = LanguageManager.GetText("TelemetryRamUsage") ?? "Sử dụng RAM: {0} / {1} MB";
			LblRamUsage.Content = string.Format(format4, _lastRamUsed);
			string format5 = LanguageManager.GetText("TelemetryUptime") ?? "Thời gian chạy PC: {0} ngày {1} giờ {2} phút";
			TimeSpan timeSpan = TimeSpan.FromMilliseconds(_lastUptimeMs, 0L);
			LblUptime.Content = string.Format(format5, timeSpan.Days, timeSpan.Hours, timeSpan.Minutes);
		}
		catch
		{
		}
	}

	public void TranslateUI()
	{
		try
		{
			TxtTitle.Text = LanguageManager.GetText("TitleAppSettings") ?? "CẤU HÌNH HỆ THỐNG & THIẾT BỊ";
			TabGeneral.Header = LanguageManager.GetText("ConnectionConfig") ?? "Cấu hình chung";
			TabBrandVis.Header = LanguageManager.GetText("LabelBrands") ?? "Hiển thị hãng";
			TxtBrandVisHelp.Text = LanguageManager.GetText("LabelBrands") ?? "Chọn các hãng PLC muốn hiển thị trên danh mục Sidebar:";

			string langCode = LanguageManager.CurrentLanguageCode.ToLower();
			if (langCode.StartsWith("zh") || langCode.StartsWith("cn"))
			{
				BtnSelectAllBrands.Content = "全选";
				BtnUnselectAllBrands.Content = "全不选";
			}
			else if (langCode.StartsWith("en"))
			{
				BtnSelectAllBrands.Content = "Select All";
				BtnUnselectAllBrands.Content = "Unselect All";
			}
			else
			{
				BtnSelectAllBrands.Content = "Bật tất cả";
				BtnUnselectAllBrands.Content = "Tắt tất cả";
			}
			TabPlc.Header = LanguageManager.GetText("PlcConfig") ?? "Cấu hình PLC";
			TxtAdvancedTitle.Text = LanguageManager.GetText("ConnectionConfig") ?? "Thông số nâng cao";
			TabServer.Header = LanguageManager.GetText("ServerConfig") ?? "Kết nối Server";
			TabTelemetry.Header = LanguageManager.GetText("ComputerInfo") ?? "Tài nguyên PC";
			BtnSaveConfig.Content = LanguageManager.GetText("SaveConfig") ?? "\ud83d\udcbe LƯU CẤU HÌNH";

			LblTheme.Content = LanguageManager.GetText("LabelTheme") ?? "Chủ đề hiển thị (Theme):";
			LblFontSize.Content = LanguageManager.GetText("LabelFontSize") ?? "Cỡ chữ hệ thống (Font Size):";
			LblLang.Content = LanguageManager.GetText("LabelLang") ?? "Ngôn ngữ giao diện:";
			ChkUseMockData.Content = LanguageManager.GetText("UseMockDataText") ?? "Sử dụng dữ liệu ảo (Demo Mode)";
			LblMachineName.Content = LanguageManager.GetText("MachineNameLabel") ?? "Tên máy trạm (Machine Name):";
			LblLineId.Content = LanguageManager.GetText("LineIdLabel") ?? "Mã chuyền (Line ID):";
			LblLineName.Content = LanguageManager.GetText("LineNameLabel") ?? "Tên chuyền (Line Name):";
			LblLineOrder.Content = LanguageManager.GetText("LineOrderLabel") ?? "Thứ tự máy:";
			LblMachineId.Content = LanguageManager.GetText("MachineIdLabel") ?? "ID máy (Chỉ đọc):";
			LblPlcBrand.Content = LanguageManager.GetText("PlcBrand") ?? "Hãng sản xuất PLC (Brand):";
			LblPlcProtocol.Content = LanguageManager.GetText("PlcProtocol") ?? "Kiểu kết nối / Driver (Protocol):";
			LblPlcIp.Content = LanguageManager.GetText("PlcIp") ?? "Địa chỉ IP (Hoặc Serial Port):";
			LblPlcPort.Content = LanguageManager.GetText("PlcPort") ?? "Cổng (Hoặc BaudRate):";
			LblReadInterval.Content = LanguageManager.GetText("ReadInterval") ?? "Chu kỳ đọc liên tục (ms):";
			LblServerHost.Content = LanguageManager.GetText("ServerHost") ?? "Địa chỉ IP / Host của MQTT Broker:";
			LblServerPort.Content = LanguageManager.GetText("ServerPort") ?? "Cổng dịch vụ MQTT Broker:";
			btnTestConnection.Content = LanguageManager.GetText("TestConnection") ?? "⚡ Kiểm Tra Kết Nối Broker";
			LblTestDataTitle.Content = LanguageManager.GetText("TestDataTitle") ?? "Dữ liệu Test Telemetry JSON:";
			txtBtnViewTestData.Text = LanguageManager.GetText("ViewJsonData") ?? "Xem Dữ Liệu JSON";
			txtBtnSendTestData.Text = LanguageManager.GetText("SendToServer") ?? "Gửi Lên Broker";

			UpdateTelemetryLabels();
		}
		catch
		{
		}
	}

	private async void BtnTestConnection_Click(object sender, RoutedEventArgs e)
	{
		string host = TxtServerHost.Text.Trim();
		if (!int.TryParse(TxtServerPort.Text.Trim(), out var port))
		{
			CustomMessageBox.Show("Cổng Server không hợp lệ!", "Lỗi nhập liệu", MessageBoxButton.OK, MessageBoxImage.Exclamation);
			return;
		}
		if (string.IsNullOrWhiteSpace(host))
		{
			CustomMessageBox.Show("Vui lòng nhập IP/Host Server!", "Thông báo", MessageBoxButton.OK, MessageBoxImage.Exclamation);
			return;
		}
		btnTestConnection.IsEnabled = false;
		PLC.Service.LogManager.AddLog($"Settings: Đang kiểm tra kết nối đến MQTT Broker tại {host}:{port}...");
		try
		{
			var factory = new MqttClientFactory();
			using (var client = factory.CreateMqttClient())
			{
				var options = factory.CreateClientOptionsBuilder()
					.WithTcpServer(host, port)
					.WithClientId("TestClient_" + Guid.NewGuid().ToString())
					.WithCleanSession(true)
					.Build();

				using (var cts = new CancellationTokenSource(TimeSpan.FromSeconds(3)))
				{
					var connectResult = await client.ConnectAsync(options, cts.Token);
					if (connectResult.ResultCode == MqttClientConnectResultCode.Success)
					{
						await client.DisconnectAsync();
						PLC.Service.LogManager.AddLog($"Settings: Kết nối đến MQTT Broker tại {host}:{port} thành công.");
						CustomMessageBox.Show($"Kết nối đến MQTT Broker ({host}:{port}) thành công!", "Kết nối tốt", MessageBoxButton.OK, MessageBoxImage.Asterisk);
					}
					else
					{
						PLC.Service.LogManager.AddLog($"Settings: Kết nối đến MQTT Broker tại {host}:{port} thất bại: {connectResult.ResultCode}");
						CustomMessageBox.Show($"Không thể kết nối đến MQTT Broker ({host}:{port}). Mã phản hồi: {connectResult.ResultCode}", "Lỗi kết nối", MessageBoxButton.OK, MessageBoxImage.Hand);
					}
				}
			}
		}
		catch (Exception ex)
		{
			Exception ex2 = ex;
			PLC.Service.LogManager.AddLog($"Settings Error: Lỗi kiểm tra kết nối đến MQTT Broker ({host}:{port}) - {ex2.Message}");
			CustomMessageBox.Show($"Không thể kết nối đến MQTT Broker ({host}:{port}).\nChi tiết: {ex2.Message}", "Lỗi kết nối", MessageBoxButton.OK, MessageBoxImage.Hand);
		}
		finally
		{
			btnTestConnection.IsEnabled = true;
		}
	}

	private void BtnSave_Click(object sender, RoutedEventArgs e)
	{
		if (string.IsNullOrWhiteSpace(TxtMachineName.Text))
		{
			CustomMessageBox.Show("Tên máy không được để trống!", "Lỗi cấu hình", MessageBoxButton.OK, MessageBoxImage.Exclamation);
			return;
		}
		if (string.IsNullOrWhiteSpace(TxtServerHost.Text))
		{
			CustomMessageBox.Show("IP/Host Server không được để trống!", "Lỗi cấu hình", MessageBoxButton.OK, MessageBoxImage.Exclamation);
			return;
		}
		try
		{
			AppConfig current = AppConfig.Current;
			AppSettings current2 = AppSettings.Current;
			current.MachineName = TxtMachineName.Text.Trim();
			current.LineId = TxtLineId.Text.Trim();
			current.LineName = TxtLineName.Text.Trim();
			current.LineOrder = ((!int.TryParse(TxtLineOrder.Text.Trim(), out var result)) ? 1 : result);
			if (CboTheme.SelectedItem is ComboBoxItem { Tag: not null } comboBoxItem)
			{
				current2.Theme = comboBoxItem.Tag.ToString() ?? "light";
			}
			current2.FontSize = (float)SldFontSize.Value;
			current2.UseMockData = ChkUseMockData.IsChecked == true;
			if (CboLanguage.SelectedItem is ComboBoxItem { Tag: not null } comboBoxItem2)
			{
				current2.Language = comboBoxItem2.Tag.ToString() ?? "vi";
			}
			foreach (object child in PanelBrandsCheckboxes.Children)
			{
				if (child is CheckBox { Content: not null } checkBox)
				{
					string text = checkBox.Content.ToString() ?? "";
					if (!string.IsNullOrEmpty(text))
					{
						current2.BrandVisibility[text] = checkBox.IsChecked == true;
					}
				}
			}
			current2.Save();
			current.PlcBrand = CboProtocol.SelectedItem?.ToString() ?? "MelsecMcNet";
			current.PlcIp = TxtPlcIp.Text.Trim();
			current.PlcPort = (int.TryParse(TxtPlcPort.Text.Trim(), out var result2) ? result2 : 6000);
			current.ReadIntervalMs = (int.TryParse(TxtInterval.Text.Trim(), out var result3) ? result3 : 5000);
			current.PlcRack = (int.TryParse(TxtPlcRack.Text.Trim(), out var result4) ? result4 : 0);
			current.PlcSlot = (int.TryParse(TxtPlcSlot.Text.Trim(), out var result5) ? result5 : 0);
			current.PlcStation = ((!int.TryParse(TxtPlcStation.Text.Trim(), out var result6)) ? 1 : result6);
			current.ServerHost = TxtServerHost.Text.Trim();
			current.ServerPort = (int.TryParse(TxtServerPort.Text.Trim(), out var result7) ? result7 : 9999);
			current.Save();
			App.ChangeTheme(current2.Theme ?? "light");
			App.ChangeFontSize(current2.FontSize);
			PLC.Service.LanguageManager.SetLanguage(current2.Language);
			if (current2.Language.Equals("zh", StringComparison.OrdinalIgnoreCase))
			{
				Program.Language = 1;
				StringResources.Language = new DefaultLanguage();
			}
			else
			{
				Program.Language = 2;
				StringResources.Language = new English();
			}
			PLC.Service.LogManager.AddLog($"Settings: Đã lưu cấu hình thiết bị (MachineName={current.MachineName}, PLC={current.PlcBrand} tại {current.PlcIp}:{current.PlcPort}, Server={current.ServerHost}:{current.ServerPort}).");
			CustomMessageBox.Show("Đã lưu cấu hình kết nối và thiết kế thành công! Cài đặt mới sẽ được áp dụng ngay lập tức.", "Thành công", MessageBoxButton.OK, MessageBoxImage.Asterisk);
			MqttClientService.Instance.ReconnectDefaultPlc();
			if (Application.Current.MainWindow is MainWindow mainWindow)
			{
				mainWindow.ClearViewCache();
				mainWindow.TranslateUI();
				mainWindow.ShowView("Dashboard");
			}
			foreach (Window window in Application.Current.Windows)
			{
				if (window is PLCDataConfigWindow plcConfigWindow)
				{
					plcConfigWindow.TranslateUI();
				}
			}
		}
		catch (Exception ex)
		{
			PLC.Service.LogManager.AddLog($"Settings Error: Lỗi lưu cấu hình - {ex.Message}");
			CustomMessageBox.Show("Lỗi lưu cấu hình: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Hand);
		}
	}

	private void BtnViewTestData_Click(object sender, RoutedEventArgs e)
	{
		try
		{
			string json = MqttClientService.Instance.GenerateTelemetryJson();
			txtTestDataJson.Text = json;
		}
		catch (Exception ex)
		{
			CustomMessageBox.Show("Lỗi khi tạo dữ liệu JSON: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Hand);
		}
	}

	private async void BtnSendTestData_Click(object sender, RoutedEventArgs e)
	{
		if (!MqttClientService.Instance.IsConnectedToServer)
		{
			CustomMessageBox.Show(LanguageManager.GetText("ServerStatusDisconnected") ?? "Mất kết nối đến Server! Vui lòng kiểm tra lại.", "Lỗi kết nối", MessageBoxButton.OK, MessageBoxImage.Warning);
			return;
		}

		btnSendTestData.IsEnabled = false;
		try
		{
			await MqttClientService.Instance.SendTelemetryManualAsync();
			CustomMessageBox.Show(LanguageManager.GetText("Success") ?? "Gửi dữ liệu thành công!", "Thành công", MessageBoxButton.OK, MessageBoxImage.Asterisk);
		}
		catch (Exception ex)
		{
			CustomMessageBox.Show(ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Hand);
		}
		finally
		{
			btnSendTestData.IsEnabled = true;
		}
	}

	private void BtnSelectAllBrands_Click(object sender, RoutedEventArgs e)
	{
		foreach (object child in PanelBrandsCheckboxes.Children)
		{
			if (child is CheckBox checkBox)
			{
				checkBox.IsChecked = true;
			}
		}
	}

	private void BtnUnselectAllBrands_Click(object sender, RoutedEventArgs e)
	{
		foreach (object child in PanelBrandsCheckboxes.Children)
		{
			if (child is CheckBox checkBox)
			{
				checkBox.IsChecked = false;
			}
		}
	}
}



