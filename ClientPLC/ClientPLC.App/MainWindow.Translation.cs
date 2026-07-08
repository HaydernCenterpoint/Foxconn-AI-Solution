using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using PLC.Config;
using PLC.Service;
using PLC.Views;
using PLC.Views.Guest;

namespace PLC;

public partial class MainWindow
{
	private void OnLanguageChanged(object? sender, EventArgs e)
	{
		ApplyLanguage();
	}

	private void ApplyLanguage()
	{
		TranslateUI();
	}

	private void MnuLang_Click(object sender, RoutedEventArgs e)
	{
		if (sender is MenuItem menuItem && menuItem.Tag is string langTag)
		{
			LanguageManager.SetLanguage(langTag);
		}
	}

	public void TranslateUI()
	{
		try
		{
			string lang = LanguageManager.CurrentLanguageCode.ToLower();

			if (TxtLangQuick != null)
			{
				string langCode = LanguageManager.CurrentLanguageCode;
				if (langCode.StartsWith("vi", StringComparison.OrdinalIgnoreCase))
					TxtLangQuick.Text = "VI";
				else if (langCode.StartsWith("zh", StringComparison.OrdinalIgnoreCase) || langCode.StartsWith("cn", StringComparison.OrdinalIgnoreCase))
					TxtLangQuick.Text = "ZH";
				else
					TxtLangQuick.Text = "EN";
			}

			FooterAppVersion.Text = string.Format(LanguageManager.GetText("Footer.Version") ?? "Phiên bản: {0}", "v1.0");

			// Translate Menus dynamically
			if (MnuGuestHome != null)
			{
				if (lang.StartsWith("zh") || lang.StartsWith("cn"))
				{
					MnuGuestHome.Header = "主页";
					MnuGuestAlerts.Header = "通知/报警";
					MnuGuestProdAnalysis.Header = "产量分析";
					MnuGuestDataTable.Header = "数据表";
				}
				else if (lang.StartsWith("en"))
				{
					MnuGuestHome.Header = "Home";
					MnuGuestAlerts.Header = "Alerts";
					MnuGuestProdAnalysis.Header = "Prod Analysis";
					MnuGuestDataTable.Header = "Data Table";
				}
				else
				{
					MnuGuestHome.Header = "Trang chủ";
					MnuGuestAlerts.Header = "Thông báo";
					MnuGuestProdAnalysis.Header = "Phân tích sản lượng";
					MnuGuestDataTable.Header = "Bảng dữ liệu";
				}
			}

			if (lang.StartsWith("zh") || lang.StartsWith("cn"))
			{
				if (MnuMonitor != null) MnuMonitor.Header = "监控";
				if (MnuPlc != null) MnuPlc.Header = "PLC";
				if (MnuErrorsLogs != null) MnuErrorsLogs.Header = "错误与日志";
				if (MnuTools != null) MnuTools.Header = "工具";
				if (MnuSettings != null) MnuSettings.Header = "设置";

				if (MnuMonitorPerf != null) MnuMonitorPerf.Header = "性能监控";
				if (MnuMonitorStatus != null) MnuMonitorStatus.Header = "状态详情";
				if (MnuMonitorOverview != null) MnuMonitorOverview.Header = "生产总览";
				if (MnuMonitorOee != null) MnuMonitorOee.Header = "OEE效率";
				if (MnuMonitorShiftQty != null) MnuMonitorShiftQty.Header = "班次产量";
				if (MnuRefreshData != null) MnuRefreshData.Header = "刷新数据";

				if (MnuPlcTable != null) MnuPlcTable.Header = "PLC数据表";
				if (MnuPlcConnTest != null) MnuPlcConnTest.Header = "PLC连接测试";
				if (MnuPlcConfigAddr != null) MnuPlcConfigAddr.Header = "PLC地址配置";
				if (MnuPlcConfigIp != null) MnuPlcConfigIp.Header = "IP/端口配置";
				if (MnuPlcConfigCycle != null) MnuPlcConfigCycle.Header = "读取周期配置";

				if (MnuErrorList != null) MnuErrorList.Header = "错误列表";
				if (MnuErrorHistory != null) MnuErrorHistory.Header = "错误历史";
				if (MnuSysLog != null) MnuSysLog.Header = "系统日志";
				if (MnuSearchHistory != null) MnuSearchHistory.Header = "历史查询";
				if (MnuClearFilter != null) MnuClearFilter.Header = "清除过滤器";
				if (MnuExportErrorHistory != null) MnuExportErrorHistory.Header = "导出错误历史";

				if (MnuToolCheckServer != null) MnuToolCheckServer.Header = "检查服务器";
				if (MnuToolCheckPlc != null) MnuToolCheckPlc.Header = "检查PLC";
				if (MnuToolResetView != null) MnuToolResetView.Header = "重置视图";
				if (MnuToolSlideshow != null) MnuToolSlideshow.Header = "幻灯片模式";
				if (MnuToolDiagnostic != null) MnuToolDiagnostic.Header = "系统诊断";
				if (TxtActiveLineName != null)
				{
					TxtActiveLineName.Text = !string.IsNullOrEmpty(AppConfig.Current.LineName)
						? " | " + AppConfig.Current.LineName
						: " | A线";
				}
			}
			else if (lang.StartsWith("en"))
			{
				if (MnuMonitor != null) MnuMonitor.Header = "Monitor";
				if (MnuPlc != null) MnuPlc.Header = "PLC";
				if (MnuErrorsLogs != null) MnuErrorsLogs.Header = "Errors & Logs";
				if (MnuTools != null) MnuTools.Header = "Tools";
				if (MnuSettings != null) MnuSettings.Header = "Settings";

				if (MnuMonitorPerf != null) MnuMonitorPerf.Header = "Performance Monitor";
				if (MnuMonitorStatus != null) MnuMonitorStatus.Header = "Status Detail";
				if (MnuMonitorOverview != null) MnuMonitorOverview.Header = "Production Overview";
				if (MnuMonitorOee != null) MnuMonitorOee.Header = "OEE Performance";
				if (MnuMonitorShiftQty != null) MnuMonitorShiftQty.Header = "Shift Output";
				if (MnuRefreshData != null) MnuRefreshData.Header = "Refresh Data";

				if (MnuPlcTable != null) MnuPlcTable.Header = "PLC Data Table";
				if (MnuPlcConnTest != null) MnuPlcConnTest.Header = "PLC Connection Test";
				if (MnuPlcConfigAddr != null) MnuPlcConfigAddr.Header = "PLC Address Config";
				if (MnuPlcConfigIp != null) MnuPlcConfigIp.Header = "IP / Port Config";
				if (MnuPlcConfigCycle != null) MnuPlcConfigCycle.Header = "Read Cycle Config";

				if (MnuErrorList != null) MnuErrorList.Header = "Error List";
				if (MnuErrorHistory != null) MnuErrorHistory.Header = "Error History";
				if (MnuSysLog != null) MnuSysLog.Header = "System Log";
				if (MnuSearchHistory != null) MnuSearchHistory.Header = "History Query";
				if (MnuClearFilter != null) MnuClearFilter.Header = "Clear Filter";
				if (MnuExportErrorHistory != null) MnuExportErrorHistory.Header = "Export Error History";

				if (MnuToolCheckServer != null) MnuToolCheckServer.Header = "Check Server";
				if (MnuToolCheckPlc != null) MnuToolCheckPlc.Header = "Check PLC";
				if (MnuToolResetView != null) MnuToolResetView.Header = "Reset View";
				if (MnuToolSlideshow != null) MnuToolSlideshow.Header = "Slideshow Mode";
				if (MnuToolDiagnostic != null) MnuToolDiagnostic.Header = "System Diagnostic";
				if (TxtActiveLineName != null)
				{
					TxtActiveLineName.Text = !string.IsNullOrEmpty(AppConfig.Current.LineName)
						? " | " + AppConfig.Current.LineName
						: " | Line A";
				}
			}
			else
			{
				if (MnuMonitor != null) MnuMonitor.Header = "Giám sát";
				if (MnuPlc != null) MnuPlc.Header = "PLC";
				if (MnuErrorsLogs != null) MnuErrorsLogs.Header = "Lỗi & Nhật ký";
				if (MnuTools != null) MnuTools.Header = "Công cụ";
				if (MnuSettings != null) MnuSettings.Header = "Cài đặt";

				if (MnuMonitorPerf != null) MnuMonitorPerf.Header = "Giám sát hiệu suất";
				if (MnuMonitorStatus != null) MnuMonitorStatus.Header = "Chi tiết trạng thái";
				if (MnuMonitorOverview != null) MnuMonitorOverview.Header = "Tổng quan sản xuất";
				if (MnuMonitorOee != null) MnuMonitorOee.Header = "Hiệu suất OEE";
				if (MnuMonitorShiftQty != null) MnuMonitorShiftQty.Header = "Sản lượng theo ca";
				if (MnuRefreshData != null) MnuRefreshData.Header = "Làm mới dữ liệu";

				if (MnuPlcTable != null) MnuPlcTable.Header = "Bảng dữ liệu PLC";
				if (MnuPlcConnTest != null) MnuPlcConnTest.Header = "Kiểm tra kết nối PLC";
				if (MnuPlcConfigAddr != null) MnuPlcConfigAddr.Header = "Cấu hình địa chỉ PLC";
				if (MnuPlcConfigIp != null) MnuPlcConfigIp.Header = "Cấu hình IP / Port";
				if (MnuPlcConfigCycle != null) MnuPlcConfigCycle.Header = "Chu kỳ đọc dữ liệu";

				if (MnuErrorList != null) MnuErrorList.Header = "Danh sách lỗi";
				if (MnuErrorHistory != null) MnuErrorHistory.Header = "Lịch sử lỗi";
				if (MnuSysLog != null) MnuSysLog.Header = "Nhật ký hệ thống";
				if (MnuSearchHistory != null) MnuSearchHistory.Header = "Tra cứu lịch sử";
				if (MnuClearFilter != null) MnuClearFilter.Header = "Xóa bộ lọc";
				if (MnuExportErrorHistory != null) MnuExportErrorHistory.Header = "Xuất lịch sử lỗi";

				if (MnuToolCheckServer != null) MnuToolCheckServer.Header = "Kiểm tra Server";
				if (MnuToolCheckPlc != null) MnuToolCheckPlc.Header = "Kiểm tra PLC";
				if (MnuToolResetView != null) MnuToolResetView.Header = "Reset trạng thái hiển thị";
				if (MnuToolSlideshow != null) MnuToolSlideshow.Header = "Chế độ trình chiếu";
				if (MnuToolDiagnostic != null) MnuToolDiagnostic.Header = "Chẩn đoán hệ thống";
				if (TxtActiveLineName != null)
				{
					TxtActiveLineName.Text = !string.IsNullOrEmpty(AppConfig.Current.LineName)
						? " | " + AppConfig.Current.LineName
						: " | Chuyền A";
				}
			}

			BuildBrandNavigation();
			// Translate page title based on current language
			bool isZh = lang.StartsWith("zh") || lang.StartsWith("cn");
			bool isEn = lang.StartsWith("en");
			switch (_activeViewName)
			{
				case "dashboard.performance":
				case "Dashboard":
					TxtActivePageTitle.Text = isZh ? "实时性能监控" : isEn ? "Performance Monitor" : "Giám Sát Hiệu Suất";
					break;
				case "dashboard.statusDetail":
				case "LiveStatus":
					TxtActivePageTitle.Text = isZh ? "状态详情" : isEn ? "Status Detail" : "Chi Tiết Trạng Thái";
					break;
				case "dashboard.productionOverview":
					TxtActivePageTitle.Text = isZh ? "生产总览" : isEn ? "Production Overview" : "Tổng Quan Sản Xuất";
					break;
				case "dashboard.oee":
					TxtActivePageTitle.Text = isZh ? "OEE效率" : isEn ? "OEE Performance" : "Hiệu Suất OEE";
					break;
				case "dashboard.shiftOutput":
					TxtActivePageTitle.Text = isZh ? "班次产量" : isEn ? "Shift Output" : "Sản Lượng Theo Ca";
					break;

				case "plc.dataTable":
				case "DataTable":
					TxtActivePageTitle.Text = isZh ? "PLC数据表" : isEn ? "PLC Data Table" : "Bảng Dữ Liệu PLC";
					break;
				case "plc.connectionTest":
					TxtActivePageTitle.Text = isZh ? "PLC连接测试" : isEn ? "PLC Connection Test" : "Kiểm Tra Kết Nối PLC";
					break;
				case "plc.addressConfig":
					TxtActivePageTitle.Text = isZh ? "PLC地址配置" : isEn ? "PLC Address Config" : "Cấu HÌnh Địa Chỉ PLC";
					break;
				case "plc.ipPortConfig":
					TxtActivePageTitle.Text = isZh ? "IP/端口配置" : isEn ? "IP / Port Config" : "Cấu Hình IP / Port PLC";
					break;
				case "plc.readCycleConfig":
					TxtActivePageTitle.Text = isZh ? "读取周期配置" : isEn ? "Read Cycle Config" : "Chu Kỳ Đọc Dữ Liệu PLC";
					break;
				case "plc.mitsubishiMelsec":
					TxtActivePageTitle.Text = "Mitsubishi Melsec";
					break;

				case "logs.errorList":
				case "LiveErrors":
					TxtActivePageTitle.Text = isZh ? "错误列表" : isEn ? "Error List" : "Danh Sách Lỗi";
					break;
				case "logs.errorHistory":
					TxtActivePageTitle.Text = isZh ? "错误历史" : isEn ? "Error History" : "Lịch Sử Lỗi";
					break;

				case "logs.systemLog":
				case "Log":
					TxtActivePageTitle.Text = isZh ? "系统日志" : isEn ? "System Log" : "Nhật Ký Hệ Thống";
					break;
				case "logs.historySearch":
				case "HistoryQuery":
					TxtActivePageTitle.Text = isZh ? "历史查询" : isEn ? "History Query" : "Tra Cứu Lịch Sử";
					break;

				case "settings.app":
				case "Settings":
					TxtActivePageTitle.Text = isZh ? "应用设置" : isEn ? "App Settings" : "Cài Đặt Ứng Dụng";
					break;
				case "settings.ui":
					TxtActivePageTitle.Text = isZh ? "界面设置" : isEn ? "UI Settings" : "Cài Đặt Giao Diện";
					break;
				case "settings.language":
					TxtActivePageTitle.Text = isZh ? "语言设置" : isEn ? "Language Settings" : "Cài Đặt Ngôn Ngữ";
					break;
				case "settings.server":
					TxtActivePageTitle.Text = isZh ? "服务器设置" : isEn ? "Server Settings" : "Cài Đặt Server";
					break;
				case "settings.machine":
					TxtActivePageTitle.Text = isZh ? "设备设置" : isEn ? "Machine Settings" : "Cài Đặt Máy Hiện Tại";
					break;
				case "settings.notification":
					TxtActivePageTitle.Text = isZh ? "通知设置" : isEn ? "Notification Settings" : "Cài Đặt Thông Báo";
					break;

				case "PlcGeneric":
					{
						string text = (_activeParameter as string) ?? "MelsecMcNet";
						string plcLabel = isZh ? "PLC连接测试" : isEn ? "PLC Connection Test" : "Kiểm Tra Kết Nối PLC";
						TxtActivePageTitle.Text = plcLabel + " - " + text;
						break;
					}
			}

			if (ContentArea.Content is ILocalizable localizable)
			{
				localizable.TranslateUI();
			}
			UpdateRoleDisplay();
			UpdateConnectionStatuses();
		}
		catch
		{
		}
	}

	private void ShowAboutWindow(object sender, RoutedEventArgs e)
	{
		string dbFile = PLC.Service.LocalDbService.Instance.DbPath;

		var aboutWin = new Window
		{
			Title = "Về ClientPLC",
			Width = 500,
			Height = 350,
			WindowStartupLocation = WindowStartupLocation.CenterOwner,
			Owner = this,
			Background = this.FindResource("WindowBackground") as SolidColorBrush,
			ResizeMode = ResizeMode.NoResize
		};

		var grid = new Grid { Margin = new Thickness(20) };
		grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
		grid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });

		var title = new TextBlock { Text = "💻 ClientPLC", FontSize = 20, FontWeight = FontWeights.Bold, Foreground = this.FindResource("TextPrimary") as SolidColorBrush, Margin = new Thickness(0, 0, 0, 15) };
		Grid.SetRow(title, 0);
		grid.Children.Add(title);

		var info = new TextBlock
		{
			Text = $"Phiên bản: 1.0.0\n" +
				   $"Ngày build: {DateTime.Now:dd/MM/yyyy}\n" +
				   $".NET Runtime: {Environment.Version}\n" +
				   $"Hệ điều hành: {Environment.OSVersion}\n\n" +
				   $"Vị trí lưu cấu hình:\nSQLite DB (bảng app_config)\n\n" +
				   $"Đường dẫn database cục bộ:\n{dbFile}",
			TextWrapping = TextWrapping.Wrap,
			Foreground = this.FindResource("TextSecondary") as SolidColorBrush,
			FontSize = 13
		};
		Grid.SetRow(info, 1);
		grid.Children.Add(info);

		aboutWin.Content = grid;
		aboutWin.ShowDialog();
	}
}
