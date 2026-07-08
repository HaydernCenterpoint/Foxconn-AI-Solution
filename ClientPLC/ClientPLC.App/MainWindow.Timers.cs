using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using PLC.Config;
using PLC.Network;
using PLC.Service;

namespace PLC;

public partial class MainWindow
{
	private void Timer_Tick(object? sender, EventArgs e)
	{
		UpdateSystemStats();
		UpdateConnectionStatuses();
		UpdateHeaderClockAndMetadata();
	}

	private void UpdateConnectionStatuses()
	{
		MqttClientService instance = MqttClientService.Instance;
		if (!instance.ServerCommEnabled)
		{
			LedServer.Fill = new SolidColorBrush(Colors.Gray);
			TxtServerStatus.Text = (LanguageManager.GetText("Server.Status") ?? "Server") + ": " + (LanguageManager.GetText("Status.Offline") ?? "Đã tắt");
			string statusText = LanguageManager.GetText("Status.Offline") ?? "Đã tắt";
			FooterServerStatus.Text = string.Format(LanguageManager.GetText("Footer.Server") ?? "Server: {0}", statusText);
			FooterServerStatus.Foreground = new SolidColorBrush(Colors.Gray);
		}
		else if (instance.IsConnectedToServer)
		{
			LedServer.Fill = new SolidColorBrush(Colors.ForestGreen);
			TextBlock txtServerStatus = TxtServerStatus;
			object obj = LanguageManager.GetText("ServerStatusConnected") ?? "Server: 已连接";
			txtServerStatus.Text = (string)obj;
			string statusText = LanguageManager.GetText("Status.Connected") ?? "Đã kết nối";
			FooterServerStatus.Text = string.Format(LanguageManager.GetText("Footer.Server") ?? "Server: {0}", statusText);
			FooterServerStatus.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#16A34A"));
		}
		else
		{
			LedServer.Fill = new SolidColorBrush(Colors.OrangeRed);
			TextBlock txtServerStatus2 = TxtServerStatus;
			object obj2 = LanguageManager.GetText("ServerStatusDisconnected") ?? "Server: 连接断开";
			txtServerStatus2.Text = (string)obj2;
			string statusText = LanguageManager.GetText("Status.Disconnected") ?? "Mất kết nối";
			FooterServerStatus.Text = string.Format(LanguageManager.GetText("Footer.Server") ?? "Server: {0}", statusText);
			FooterServerStatus.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#DC2626"));
		}

		if (instance.IsPlcConnected)
		{
			LedPlc.Fill = new SolidColorBrush(Colors.ForestGreen);
			TxtPlcStatus.Text = (LanguageManager.GetText("PlcStatusConnected") ?? "PLC: 已连接") + " (" + instance.ConnectedPlcBrand + ")";
			FooterPlcResponse.Text = string.Format(LanguageManager.GetText("Footer.PlcResponse") ?? "Phản hồi PLC: {0}", "15 ms");
			FooterPlcResponse.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#0891B2"));
		}
		else
		{
			LedPlc.Fill = new SolidColorBrush(Colors.OrangeRed);
			if (!string.IsNullOrEmpty(instance.LastPlcError))
			{
				TxtPlcStatus.Text = (string)(LanguageManager.GetText("PlcStatusError") ?? "PLC: 连接错误");
			}
			else
			{
				TxtPlcStatus.Text = (string)(LanguageManager.GetText("PlcStatusNotConnected") ?? "PLC: 未连接");
			}
			FooterPlcResponse.Text = string.Format(LanguageManager.GetText("Footer.PlcResponse") ?? "Phản hồi PLC: {0}", "0 ms");
			FooterPlcResponse.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#DC2626"));
		}

		FooterLastUpdate.Text = string.Format(LanguageManager.GetText("Footer.LastUpdated") ?? "Cập nhật: {0}", DateTime.Now.ToString("HH:mm:ss"));
		FooterAppVersion.Text = string.Format(LanguageManager.GetText("Footer.Version") ?? "Phiên bản: {0}", "v1.0");
	}

	private void UpdateSystemStats()
	{
		try
		{
			float cpuPercent = SystemInfoService.GetCpuPercent();
			(float usedMb, float totalMb) ramInfo = SystemInfoService.GetRamInfo();
			float item = ramInfo.usedMb;
			float item2 = ramInfo.totalMb;
			long systemUptimeMs = SystemInfoService.GetSystemUptimeMs();
			TimeSpan timeSpan = TimeSpan.FromMilliseconds(systemUptimeMs);
			string text = $"{timeSpan.Days:D2}d {timeSpan.Hours:D2}h {timeSpan.Minutes:D2}m";
			FooterCpu.Text = string.Format(LanguageManager.GetText("Footer.Cpu") ?? "CPU: {0:F1}%", cpuPercent);
			FooterRam.Text = string.Format(LanguageManager.GetText("Footer.Ram") ?? "RAM: {0}", $"{item:F0} / {item2:F0} MB");
			FooterUptime.Text = string.Format(LanguageManager.GetText("Footer.Uptime") ?? "Uptime: {0}", text);
		}
		catch
		{
		}
	}

	private void UpdateHeaderClockAndMetadata()
	{
		try
		{
			DateTime now = DateTime.Now;
			if (TxtHeaderClock != null)
			{
				TxtHeaderClock.Text = now.ToString("HH:mm:ss");
			}

			AppConfig current = AppConfig.Current;
			(string ShiftName, string ShiftDate, DateTime ShiftStart, DateTime ShiftEnd) shiftInfo = LocalDbService.GetShiftInfo(now);
			string shiftDisplayName = (shiftInfo.ShiftName == "Day")
				? (LanguageManager.GetText("Shift.DayLabel") ?? "Ca sáng")
				: (LanguageManager.GetText("Shift.NightLabel") ?? "Ca tối");

			string lang = AppSettings.Current.Language?.ToLower() ?? "vi";
			string dateFormat = (lang.StartsWith("zh")) ? "yyyy年MM月dd日" : ((lang.StartsWith("en")) ? "MM/dd/yyyy" : "dd/MM/yyyy");
			string formattedDate = now.ToString(dateFormat);

			string machineNameVal = current.MachineName ?? "01";
			if (lang.StartsWith("vi") && machineNameVal.StartsWith("May ", StringComparison.OrdinalIgnoreCase))
			{
				machineNameVal = "Máy " + machineNameVal.Substring(4);
			}

			if (TxtMetadataMachine != null)
				TxtMetadataMachine.Text = string.Format(LanguageManager.GetText("Dashboard.Machine") ?? "Machine: {0}", machineNameVal);

			string shiftTime = (shiftInfo.ShiftName == "Day") ? "07:30 - 19:30" : "19:30 - 07:30";
			if (TxtMetadataShift != null)
				TxtMetadataShift.Text = string.Format(LanguageManager.GetText("Dashboard.ShiftBadge") ?? "{0}: {1}", shiftDisplayName, shiftTime);

			if (TxtMetadataDate != null)
				TxtMetadataDate.Text = string.Format(LanguageManager.GetText("Dashboard.Date") ?? "Date: {0}", formattedDate);

			if (TxtMetadataCycle != null)
				TxtMetadataCycle.Text = string.Format(LanguageManager.GetText("Dashboard.ReadCycle") ?? "Cycle: {0} ms", current.ReadIntervalMs);
		}
		catch { }
	}
}
