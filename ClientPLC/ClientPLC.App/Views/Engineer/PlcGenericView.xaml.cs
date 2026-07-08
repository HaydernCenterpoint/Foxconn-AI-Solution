using PLC.Views;
using System;
using System.CodeDom.Compiler;
using System.ComponentModel;
using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Markup;
using HslCommunication;
using PLC.Config;
using PLC.Network;
using PLC.Service;

namespace PLC.Views;

public partial class PlcGenericView : UserControl, ILocalizable
{
	private string _brand;

	private IPLCAdapter? _testPlcInstance = null;

	public PlcGenericView(string brand)
	{
		InitializeComponent();
		_brand = brand;
		base.Loaded += PlcGenericView_Loaded;
		base.Unloaded += PlcGenericView_Unloaded;
		BtnConnect.Click += BtnConnect_Click;
		BtnRead.Click += BtnRead_Click;
		BtnWrite.Click += BtnWrite_Click;

		PLC.Service.LanguageManager.LanguageChanged += OnLanguageChanged;
	}

	private void PlcGenericView_Loaded(object sender, RoutedEventArgs e)
	{
		TranslateUI();
		AppConfig config = AppConfig.Current;

		// Fill defaults or custom values from AppConfig if brand matches
		if (config.PlcBrand.Equals(_brand, StringComparison.OrdinalIgnoreCase))
		{
			TxtIp.Text = config.PlcIp;
			TxtPort.Text = config.PlcPort.ToString();
			if (_brand.Equals("SiemensS7Net", StringComparison.OrdinalIgnoreCase))
			{
				TxtAddress.Text = "DB1.DBD0";
			}
			else if (_brand.Equals("ModbusTcpNet", StringComparison.OrdinalIgnoreCase))
			{
				TxtAddress.Text = "40001";
			}
			else
			{
				TxtAddress.Text = "D100";
			}
		}
		else
		{
			if (_brand.Equals("MelsecMcNet", StringComparison.OrdinalIgnoreCase))
			{
				TxtIp.Text = "192.168.1.100";
				TxtPort.Text = "6000";
				TxtAddress.Text = "D100";
			}
			else if (_brand.Equals("SiemensS7Net", StringComparison.OrdinalIgnoreCase))
			{
				TxtIp.Text = "192.168.1.200";
				TxtPort.Text = "102";
				TxtAddress.Text = "DB1.DBD0";
			}
			else if (_brand.Equals("ModbusTcpNet", StringComparison.OrdinalIgnoreCase))
			{
				TxtIp.Text = "192.168.1.150";
				TxtPort.Text = "502";
				TxtAddress.Text = "40001";
			}
			else if (_brand.Equals("OmronFinsNet", StringComparison.OrdinalIgnoreCase))
			{
				TxtIp.Text = "192.168.1.120";
				TxtPort.Text = "9600";
				TxtAddress.Text = "D100";
			}
		}

		// Auto-synchronize with global active PLC connection if brand matches
		if (config.PlcBrand.Equals(_brand, StringComparison.OrdinalIgnoreCase) && MqttClientService.Instance.IsPlcConnected)
		{
			_testPlcInstance = MqttClientService.Instance.PlcInstance;
			LogConsole("Đã tự động đồng bộ kết nối từ cấu hình hệ thống.");
			if (TxtBtnConnect != null) TxtBtnConnect.Text = LanguageManager.GetText("DisconnectPlcBtn") ?? "Ngắt kết nối";
			BtnRead.IsEnabled = true;
			BtnWrite.IsEnabled = true;
		}
		else
		{
			BtnRead.IsEnabled = false;
			BtnWrite.IsEnabled = false;
		}
	}

	public void TranslateUI()
	{
		try
		{
			string text = ((_brand == "MelsecMcNet") ? "Mitsubishi Melsec" : _brand);
			string text2 = LanguageManager.GetText("PlcBrandLabel") ?? "Kiểm tra kết nối PLC";
			TxtTitle.Text = text2 + " - " + text;
			LblPlcHost.Text = LanguageManager.GetText("PlcIpLabel") ?? "Địa chỉ IP PLC:";
			LblPlcPort.Text = LanguageManager.GetText("PlcPortLabel") ?? "Cổng kết nối (Port):";

			if (TxtBtnConnect != null)
			{
				TxtBtnConnect.Text = _testPlcInstance != null
					? (LanguageManager.GetText("DisconnectPlcBtn") ?? "Ngắt kết nối")
					: (LanguageManager.GetText("ConnectPlcBtn") ?? "Kết nối PLC");
			}
			if (TxtBtnRead != null)
			{
				TxtBtnRead.Text = LanguageManager.GetText("BtnRead") ?? "ĐỌC DỮ LIỆU";
			}
			if (TxtBtnWrite != null)
			{
				TxtBtnWrite.Text = LanguageManager.GetText("BtnWrite") ?? "GHI DỮ LIỆU";
			}

			if (LblOperationConfigHeader != null)
				LblOperationConfigHeader.Text = LanguageManager.GetText("PlcOperationConfig") ?? "CẤU HÌNH THAO TÁC";
			if (LblRegisterAddress != null)
				LblRegisterAddress.Content = LanguageManager.GetText("PlcRegisterAddress") ?? "Địa chỉ thanh ghi:";
			if (LblDataType != null)
				LblDataType.Content = LanguageManager.GetText("DataType") ?? "Kiểu dữ liệu:";
			if (LblWriteValue != null)
				LblWriteValue.Content = LanguageManager.GetText("PlcWriteValueLabel") ?? "Giá trị cần ghi (nếu có):";
			if (LblExecutionResultHeader != null)
				LblExecutionResultHeader.Text = LanguageManager.GetText("PlcExecutionResult") ?? "KẾT QUẢ THỰC THI";
		}
		catch
		{
		}
	}

	private void PlcGenericView_Unloaded(object sender, RoutedEventArgs e)
	{
		DisconnectPlc();
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

	private void LogConsole(string msg)
	{
		TxtConsole.AppendText($"[{DateTime.Now.ToString("HH:mm:ss")}] {msg}\r\n");
		TxtConsole.ScrollToEnd();
	}

	private void BtnConnect_Click(object sender, RoutedEventArgs e)
	{
		if (_testPlcInstance != null)
		{
			DisconnectPlc();
			return;
		}
		string text = TxtIp.Text.Trim();
		if (!int.TryParse(TxtPort.Text.Trim(), out var result))
		{
			CustomMessageBox.Show("Cổng kết nối không hợp lệ!", "Lỗi nhập liệu", MessageBoxButton.OK, MessageBoxImage.Exclamation);
			return;
		}
		if (string.IsNullOrWhiteSpace(text))
		{
			CustomMessageBox.Show("Vui lòng nhập địa chỉ IP PLC!", "Lỗi nhập liệu", MessageBoxButton.OK, MessageBoxImage.Exclamation);
			return;
		}
		try
		{
			BtnConnect.IsEnabled = false;
			if (TxtBtnConnect != null) TxtBtnConnect.Text = LanguageManager.GetText("Status.Connecting") ?? "Đang kết nối...";
			LogConsole($"Đang kết nối đến {_brand} tại {text}:{result}...");
			_testPlcInstance = new PLCGeneric(_brand, text, result);
			PLC.Service.LogManager.AddLog($"PlcTest: Đang kết nối đến {_brand} tại {text}:{result}...");
			Task.Run(() =>
			{
				OperateResult operateResult = _testPlcInstance.Connect();
				Dispatcher.Invoke(() =>
				{
					BtnConnect.IsEnabled = true;
					if (operateResult.IsSuccess)
					{
						PLC.Service.LogManager.AddLog($"PlcTest: Kết nối đến {_brand} thành công.");
						LogConsole("Kết nối PLC thành công!");
						if (TxtBtnConnect != null) TxtBtnConnect.Text = LanguageManager.GetText("DisconnectPlcBtn") ?? "Ngắt kết nối";
						BtnRead.IsEnabled = true;
						BtnWrite.IsEnabled = true;
					}
					else
					{
						_testPlcInstance = null;
						if (TxtBtnConnect != null) TxtBtnConnect.Text = LanguageManager.GetText("ConnectPlcBtn") ?? "Kết nối PLC";
						PLC.Service.LogManager.AddLog($"PlcTest: Kết nối đến {_brand} thất bại: {operateResult.Message}");
						LogConsole("Lỗi kết nối: " + operateResult.Message);
					}
				});
			});
		}
		catch (Exception ex)
		{
			_testPlcInstance = null;
			BtnConnect.IsEnabled = true;
			if (TxtBtnConnect != null) TxtBtnConnect.Text = LanguageManager.GetText("ConnectPlcBtn") ?? "Kết nối PLC";
			PLC.Service.LogManager.AddLog($"PlcTest Error: Lỗi kết nối - {ex.Message}");
			LogConsole("Lỗi kết nối (Exception): " + ex.Message);
		}
	}

	private void DisconnectPlc()
	{
		if (_testPlcInstance != null)
		{
			try
			{
				if (_testPlcInstance != MqttClientService.Instance.PlcInstance)
				{
					_testPlcInstance.Disconnect();
				}
			}
			catch
			{
			}
			_testPlcInstance = null;
			if (TxtBtnConnect != null) TxtBtnConnect.Text = LanguageManager.GetText("ConnectPlcBtn") ?? "Kết nối PLC";
			BtnRead.IsEnabled = false;
			BtnWrite.IsEnabled = false;
			LogConsole("Đã ngắt kết nối PLC.");
		}
	}

	private void BtnRead_Click(object sender, RoutedEventArgs e)
	{
		IPLCAdapter testPlcInstance = _testPlcInstance;
		if (testPlcInstance == null)
		{
			return;
		}
		string text = TxtAddress.Text.Trim();
		string text2 = (CboDataType.SelectedItem as ComboBoxItem)?.Content.ToString() ?? "Int16";
		if (string.IsNullOrWhiteSpace(text))
		{
			LogConsole("Địa chỉ đọc không được rỗng!");
			return;
		}
		try
		{
			LogConsole($"Đang đọc địa chỉ {text} ({text2})...");
			object value = null;
			bool flag = false;
			string text3 = "";
			switch (text2.ToLower())
			{
			case "bool":
			{
				OperateResult<bool> operateResult5 = testPlcInstance.ReadBool(text);
				flag = operateResult5.IsSuccess;
				if (flag)
				{
					value = operateResult5.Content;
				}
				else
				{
					text3 = operateResult5.Message;
				}
				break;
			}
			case "int16":
			{
				OperateResult<short> operateResult2 = testPlcInstance.ReadInt16(text);
				flag = operateResult2.IsSuccess;
				if (flag)
				{
					value = operateResult2.Content;
				}
				else
				{
					text3 = operateResult2.Message;
				}
				break;
			}
			case "uint16":
			{
				OperateResult<ushort> operateResult6 = testPlcInstance.ReadUInt16(text);
				flag = operateResult6.IsSuccess;
				if (flag)
				{
					value = operateResult6.Content;
				}
				else
				{
					text3 = operateResult6.Message;
				}
				break;
			}
			case "int32":
			{
				OperateResult<int> operateResult8 = testPlcInstance.ReadInt32(text);
				flag = operateResult8.IsSuccess;
				if (flag)
				{
					value = operateResult8.Content;
				}
				else
				{
					text3 = operateResult8.Message;
				}
				break;
			}
			case "uint32":
			{
				OperateResult<uint> operateResult3 = testPlcInstance.ReadUInt32(text);
				flag = operateResult3.IsSuccess;
				if (flag)
				{
					value = operateResult3.Content;
				}
				else
				{
					text3 = operateResult3.Message;
				}
				break;
			}
			case "float":
			{
				OperateResult<float> operateResult7 = testPlcInstance.ReadFloat(text);
				flag = operateResult7.IsSuccess;
				if (flag)
				{
					value = operateResult7.Content;
				}
				else
				{
					text3 = operateResult7.Message;
				}
				break;
			}
			case "double":
			{
				OperateResult<double> operateResult4 = testPlcInstance.ReadDouble(text);
				flag = operateResult4.IsSuccess;
				if (flag)
				{
					value = operateResult4.Content;
				}
				else
				{
					text3 = operateResult4.Message;
				}
				break;
			}
			case "string":
			{
				OperateResult<string> operateResult = testPlcInstance.ReadString(text, 10);
				flag = operateResult.IsSuccess;
				if (flag)
				{
					value = operateResult.Content;
				}
				else
				{
					text3 = operateResult.Message;
				}
				break;
			}
			}
			if (flag)
			{
				PLC.Service.LogManager.AddLog($"PlcTest: Đọc địa chỉ {text} ({text2}) - Kết quả: Thành công, Giá trị = {value}");
				LogConsole($"=> Giá trị đọc được: {value}");
			}
			else
			{
				PLC.Service.LogManager.AddLog($"PlcTest: Đọc địa chỉ {text} ({text2}) - Kết quả: Thất bại, Lỗi: {text3}");
				LogConsole("Lỗi đọc: " + text3);
			}
		}
		catch (Exception ex)
		{
			PLC.Service.LogManager.AddLog($"PlcTest Error: Lỗi đọc địa chỉ {text} ({text2}) - {ex.Message}");
			LogConsole("Lỗi đọc (Exception): " + ex.Message);
		}
	}

	private void BtnWrite_Click(object sender, RoutedEventArgs e)
	{
		IPLCAdapter testPlcInstance = _testPlcInstance;
		if (testPlcInstance == null)
		{
			return;
		}
		string text = TxtAddress.Text.Trim();
		string text2 = (CboDataType.SelectedItem as ComboBoxItem)?.Content.ToString() ?? "Int16";
		string text3 = TxtWriteValue.Text.Trim();
		if (string.IsNullOrWhiteSpace(text))
		{
			LogConsole("Địa chỉ ghi không được rỗng!");
			return;
		}
		try
		{
			LogConsole($"Đang ghi '{text3}' vào địa chỉ {text} ({text2})...");
			OperateResult operateResult = null;
			switch (text2.ToLower())
			{
			case "bool":
				operateResult = testPlcInstance.Write(text, bool.Parse(text3));
				break;
			case "int16":
				operateResult = testPlcInstance.Write(text, short.Parse(text3));
				break;
			case "uint16":
				operateResult = testPlcInstance.Write(text, ushort.Parse(text3));
				break;
			case "int32":
				operateResult = testPlcInstance.Write(text, int.Parse(text3));
				break;
			case "uint32":
				operateResult = testPlcInstance.Write(text, uint.Parse(text3));
				break;
			case "float":
				operateResult = testPlcInstance.Write(text, float.Parse(text3));
				break;
			case "double":
				operateResult = testPlcInstance.Write(text, double.Parse(text3));
				break;
			case "string":
				operateResult = testPlcInstance.Write(text, text3);
				break;
			}
			if (operateResult != null && operateResult.IsSuccess)
			{
				PLC.Service.LogManager.AddLog($"PlcTest: Ghi dữ liệu vào địa chỉ {text} ({text2}, Giá trị: {text3}) - Kết quả: Thành công");
				LogConsole("=> Ghi dữ liệu thành công!");
			}
			else
			{
				string err = operateResult?.Message ?? "Sai định dạng đầu vào";
				PLC.Service.LogManager.AddLog($"PlcTest: Ghi dữ liệu vào địa chỉ {text} ({text2}, Giá trị: {text3}) - Kết quả: Thất bại, Lỗi: {err}");
				LogConsole("Lỗi ghi: " + err);
			}
		}
		catch (Exception ex)
		{
			PLC.Service.LogManager.AddLog($"PlcTest Error: Lỗi ghi địa chỉ {text} ({text2}) - {ex.Message}");
			LogConsole("Lỗi ghi (Exception): " + ex.Message);
		}
	}
}


