using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using PLC.Config;
using PLC.Network;
using PLC.Service;
using PLC.Views;
using MessageBox = PLC.Views.CustomMessageBox;

namespace PLC;

public partial class MainWindow
{
	public void ClearViewCache()
	{
		_viewCache.Clear();
	}

	private void BuildBrandNavigation()
	{
		if (MnuPlc == null) return;

		// 1. Remove all items after the first 5 core config items
		while (MnuPlc.Items.Count > 5)
		{
			MnuPlc.Items.RemoveAt(5);
		}

		var settings = AppSettings.Current;
		if (settings == null) return;

		// 2. Loop through all brand settings alphabetically and add to menu if enabled
		foreach (var kvp in settings.BrandVisibility.OrderBy(x => x.Key))
		{
			string brandName = kvp.Key;
			bool isVisible = kvp.Value;

			if (isVisible)
			{
				var menuItem = new MenuItem
				{
					Header = brandName
				};
				menuItem.SetResourceReference(Control.ForegroundProperty, "MenuText");

				try
				{
					if (TryFindResource("IconPlug") is Geometry geometry)
					{
						var path = new System.Windows.Shapes.Path
						{
							Data = geometry,
							StrokeThickness = 1.5,
							Stretch = Stretch.Uniform,
							Width = 14,
							Height = 14
						};
						path.SetResourceReference(System.Windows.Shapes.Path.StrokeProperty, "MenuText");
						menuItem.Icon = path;
					}
				}
				catch { }

				// Check if this brand has protocols defined in _brandProtocols
				if (_brandProtocols.TryGetValue(brandName, out var protocols) && protocols.Count > 0)
				{
					// Add sub-menu items for each protocol under this brand
					foreach (string protocol in protocols)
					{
						var subItem = new MenuItem
						{
							Header = protocol
						};
						subItem.SetResourceReference(Control.ForegroundProperty, "MenuText");

						subItem.Click += (s, e) =>
						{
							ShowView("PlcGeneric", protocol);
						};

						menuItem.Items.Add(subItem);
					}
				}
				else
				{
					// Fallback for brands without explicit protocol lists
					menuItem.Click += (s, e) =>
					{
						ShowView("PlcGeneric", brandName);
					};
				}

				MnuPlc.Items.Add(menuItem);
			}
		}
	}

	public void RefreshBrandNavigation()
	{
		BuildBrandNavigation();
	}

	private void UpdateActiveTab(string viewName)
	{
		try
		{
			// Reset all top-level menus to use dynamic resource HeaderMenuText
			MnuMonitor.SetResourceReference(Control.ForegroundProperty, "HeaderMenuText");
			MnuPlc.SetResourceReference(Control.ForegroundProperty, "HeaderMenuText");
			MnuErrorsLogs.SetResourceReference(Control.ForegroundProperty, "HeaderMenuText");
			MnuTools.SetResourceReference(Control.ForegroundProperty, "HeaderMenuText");
			MnuSettings.SetResourceReference(Control.ForegroundProperty, "HeaderMenuText");

			MnuGuestHome.SetResourceReference(Control.ForegroundProperty, "HeaderMenuText");
			MnuGuestAlerts.SetResourceReference(Control.ForegroundProperty, "HeaderMenuText");
			MnuGuestProdAnalysis.SetResourceReference(Control.ForegroundProperty, "HeaderMenuText");
			MnuGuestDataTable.SetResourceReference(Control.ForegroundProperty, "HeaderMenuText");

			// Highlight active menu item based on current viewName using HeaderMenuTextActive resource
			if (viewName == "dashboard.performance" || viewName == "Dashboard" || viewName == "LiveStatus")
			{
				MnuGuestHome.SetResourceReference(Control.ForegroundProperty, "HeaderMenuTextActive");
				MnuMonitor.SetResourceReference(Control.ForegroundProperty, "HeaderMenuTextActive");
			}
			else if (viewName == "logs.errorList" || viewName == "LiveErrors")
			{
				MnuGuestAlerts.SetResourceReference(Control.ForegroundProperty, "HeaderMenuTextActive");
				MnuErrorsLogs.SetResourceReference(Control.ForegroundProperty, "HeaderMenuTextActive");
			}

			else if (viewName == "dashboard.shiftOutput" || viewName == "dashboard.oee" || viewName == "dashboard.productionOverview" || viewName == "dashboard.statusDetail")
			{
				MnuGuestProdAnalysis.SetResourceReference(Control.ForegroundProperty, "HeaderMenuTextActive");
				MnuMonitor.SetResourceReference(Control.ForegroundProperty, "HeaderMenuTextActive");
			}
			else if (viewName == "plc.dataTable" || viewName == "DataTable" || viewName == "PlcGeneric" || viewName.StartsWith("PlcGeneric_"))
			{
				MnuGuestDataTable.SetResourceReference(Control.ForegroundProperty, "HeaderMenuTextActive");
				MnuPlc.SetResourceReference(Control.ForegroundProperty, "HeaderMenuTextActive");
			}
			else if (viewName.StartsWith("dashboard."))
			{
				MnuMonitor.SetResourceReference(Control.ForegroundProperty, "HeaderMenuTextActive");
			}
			else if (viewName.StartsWith("plc."))
			{
				MnuPlc.SetResourceReference(Control.ForegroundProperty, "HeaderMenuTextActive");
			}
			else if (viewName.StartsWith("logs.") || viewName == "Log" || viewName == "HistoryQuery")
			{
				MnuErrorsLogs.SetResourceReference(Control.ForegroundProperty, "HeaderMenuTextActive");
			}
			else if (viewName.StartsWith("settings.") || viewName == "Settings")
			{
				MnuSettings.SetResourceReference(Control.ForegroundProperty, "HeaderMenuTextActive");
			}
		}
		catch
		{
		}
	}

	public void ShowView(string viewName, object? parameter = null)
	{
		// Kiểm tra quyền truy cập
		if (!IsViewAccessibleForRole(viewName, RoleManager.CurrentRole))
		{
			MessageBox.Show(
				"Bạn không có quyền truy cập chức năng này!", 
				"Từ chối truy cập", 
				MessageBoxButton.OK, 
				MessageBoxImage.Warning
			);
			return;
		}

		try
		{
			PLC.Service.LogManager.AddLog($"Navigation: Chuyển sang trang '{viewName}'" + (parameter != null ? $" (Tham số: {parameter})" : ""));
		}
		catch { }
		_activeViewName = viewName;
		_activeParameter = parameter;
		UpdateActiveTab(viewName);

		string cacheKey = viewName;
		if (viewName == "PlcGeneric" && parameter is string brandName)
		{
			cacheKey = "PlcGeneric_" + brandName;
		}

		if (!_viewCache.TryGetValue(cacheKey, out var view))
		{
			switch (viewName)
			{
				// Granular Monitor Views
				case "dashboard.performance":
					view = new PerformanceDashboardPage();
					break;
				case "dashboard.statusDetail":
					view = new StatusDetailPage();
					break;
				case "dashboard.productionOverview":
					view = new ProductionOverviewPage();
					break;
				case "dashboard.oee":
					view = new OeeDashboardPage();
					break;
				case "dashboard.shiftOutput":
					view = new ShiftOutputPage();
					break;

				// Granular PLC Views
				case "plc.dataTable":
					view = new StatusDetailPage();
					break;
				case "plc.connectionTest":
					view = new PlcConnectionTestPage();
					break;
				case "plc.addressConfig":
					view = new PlcAddressConfigPage();
					break;
				case "plc.ipPortConfig":
					view = new PlcIpPortConfigPage();
					break;
				case "plc.readCycleConfig":
					view = new PlcReadCycleConfigPage();
					break;
				case "plc.mitsubishiMelsec":
					view = new MitsubishiMelsecPage();
					break;

				// Granular Logs Views
				case "logs.errorList":
					view = new ErrorListPage();
					break;
				case "logs.errorHistory":
					view = new ErrorHistoryPage();
					break;

				case "logs.systemLog":
					view = new SystemLogPage();
					break;
				case "logs.historySearch":
					view = new HistorySearchPage();
					break;

				// Granular Settings Views
				case "settings.app":
					view = new AppSettingsPage();
					break;
				case "settings.ui":
					view = new UiSettingsPage();
					break;
				case "settings.language":
					view = new LanguageSettingsPage();
					break;
				case "settings.server":
					view = new ServerSettingsPage();
					break;
				case "settings.machine":
					view = new MachineSettingsPage();
					break;
				case "settings.notification":
					view = new NotificationSettingsPage();
					break;

				// Legacy/Fallback cases
				case "Dashboard":
					view = new DashboardView();
					break;
				case "LiveStatus":
					view = new StatusDetailPage();
					break;
				case "LiveErrors":
					view = new LiveErrorsView();
					break;
				case "DataTable":
					view = new StatusDetailPage();
					break;
				case "Log":
					view = new SystemLogView();
					break;
				case "Settings":
					view = new SettingsView();
					break;
				case "HistoryQuery":
					view = new HistoryQueryView();
					break;
				case "PlcGeneric":
					{
						string text = (parameter as string) ?? "MelsecMcNet";
						view = new PlcGenericView(text);
						break;
					}
			}
			if (view != null)
			{
				_viewCache[cacheKey] = view;
			}
		}

		if (view != null)
		{
			// Reset breadcrumbs and title based on exact active view
			switch (viewName)
			{
				case "dashboard.performance":
				case "Dashboard":
					PathActivePageIcon.Data = (Geometry)FindResource("IconChartLine");
					TxtActivePageTitle.Text = "Giám sát hiệu suất trực tuyến";
					TxtBreadcrumb.Text = "Giám sát / Hiệu suất";
					break;
				case "dashboard.statusDetail":
				case "LiveStatus":
					PathActivePageIcon.Data = (Geometry)FindResource("IconClipboardList");
					TxtActivePageTitle.Text = "Chi tiết trạng thái máy";
					TxtBreadcrumb.Text = "Giám sát / Chi tiết trạng thái";
					break;
				case "dashboard.productionOverview":
					PathActivePageIcon.Data = (Geometry)FindResource("IconMonitor");
					TxtActivePageTitle.Text = "Tổng quan sản xuất";
					TxtBreadcrumb.Text = "Giám sát / Tổng quan sản xuất";
					break;
				case "dashboard.oee":
					PathActivePageIcon.Data = (Geometry)FindResource("IconGauge");
					TxtActivePageTitle.Text = "Hiệu suất OEE";
					TxtBreadcrumb.Text = "Giám sát / Hiệu suất OEE";
					break;
				case "dashboard.shiftOutput":
					PathActivePageIcon.Data = (Geometry)FindResource("IconChartColumn");
					TxtActivePageTitle.Text = "Sản lượng theo ca";
					TxtBreadcrumb.Text = "Giám sát / Sản lượng theo ca";
					break;

				case "plc.dataTable":
				case "DataTable":
					PathActivePageIcon.Data = (Geometry)FindResource("IconDatabase");
					TxtActivePageTitle.Text = "Bảng dữ liệu PLC";
					TxtBreadcrumb.Text = "PLC / Bảng dữ liệu";
					break;
				case "plc.connectionTest":
					PathActivePageIcon.Data = (Geometry)FindResource("IconActivity");
					TxtActivePageTitle.Text = "Kiểm tra kết nối PLC";
					TxtBreadcrumb.Text = "PLC / Kiểm tra kết nối";
					break;
				case "plc.addressConfig":
					PathActivePageIcon.Data = (Geometry)FindResource("IconSettings");
					TxtActivePageTitle.Text = "Cấu hình địa chỉ PLC";
					TxtBreadcrumb.Text = "PLC / Cấu hình địa chỉ";
					break;
				case "plc.ipPortConfig":
					PathActivePageIcon.Data = (Geometry)FindResource("IconRouter");
					TxtActivePageTitle.Text = "Cấu hình IP / Port PLC";
					TxtBreadcrumb.Text = "PLC / Cấu hình IP / Port";
					break;
				case "plc.readCycleConfig":
					PathActivePageIcon.Data = (Geometry)FindResource("IconClock3");
					TxtActivePageTitle.Text = "Chu kỳ đọc dữ liệu PLC";
					TxtBreadcrumb.Text = "PLC / Chu kỳ đọc dữ liệu";
					break;
				case "plc.mitsubishiMelsec":
					PathActivePageIcon.Data = (Geometry)FindResource("IconPlug");
					TxtActivePageTitle.Text = "Mitsubishi Melsec";
					TxtBreadcrumb.Text = "PLC / Mitsubishi Melsec";
					break;

				case "logs.errorList":
				case "LiveErrors":
					PathActivePageIcon.Data = (Geometry)FindResource("IconTriangleAlert");
					TxtActivePageTitle.Text = "Danh sách lỗi";
					TxtBreadcrumb.Text = "Lỗi & Nhật ký / Danh sách lỗi";
					break;
				case "logs.errorHistory":
					PathActivePageIcon.Data = (Geometry)FindResource("IconHistory");
					TxtActivePageTitle.Text = "Lịch sử lỗi";
					TxtBreadcrumb.Text = "Lỗi & Nhật ký / Lịch sử lỗi";
					break;

				case "logs.systemLog":
				case "Log":
					PathActivePageIcon.Data = (Geometry)FindResource("IconFileText");
					TxtActivePageTitle.Text = "Nhật ký hệ thống";
					TxtBreadcrumb.Text = "Lỗi & Nhật ký / Nhật ký hệ thống";
					break;
				case "logs.historySearch":
				case "HistoryQuery":
					PathActivePageIcon.Data = (Geometry)FindResource("IconSearch");
					TxtActivePageTitle.Text = "Tra cứu lịch sử";
					TxtBreadcrumb.Text = "Lỗi & Nhật ký / Tra cứu lịch sử";
					break;

				case "settings.app":
				case "Settings":
					PathActivePageIcon.Data = (Geometry)FindResource("IconSettings");
					TxtActivePageTitle.Text = "Cài đặt ứng dụng";
					TxtBreadcrumb.Text = "Cài đặt / Cài đặt ứng dụng";
					break;
				case "settings.ui":
					PathActivePageIcon.Data = (Geometry)FindResource("IconEye");
					TxtActivePageTitle.Text = "Cài đặt giao diện";
					TxtBreadcrumb.Text = "Cài đặt / Cài đặt giao diện";
					break;
				case "settings.language":
					PathActivePageIcon.Data = (Geometry)FindResource("IconInfo");
					TxtActivePageTitle.Text = "Cài đặt ngôn ngữ";
					TxtBreadcrumb.Text = "Cài đặt / Cài đặt ngôn ngữ";
					break;
				case "settings.server":
					PathActivePageIcon.Data = (Geometry)FindResource("IconServerCog");
					TxtActivePageTitle.Text = "Cài đặt Server";
					TxtBreadcrumb.Text = "Cài đặt / Cài đặt Server";
					break;
				case "settings.machine":
					PathActivePageIcon.Data = (Geometry)FindResource("IconMicrochip");
					TxtActivePageTitle.Text = "Cài đặt máy hiện tại";
					TxtBreadcrumb.Text = "Cài đặt / Cài đặt máy";
					break;
				case "settings.notification":
					PathActivePageIcon.Data = (Geometry)FindResource("IconFlag");
					TxtActivePageTitle.Text = "Cài đặt thông báo";
					TxtBreadcrumb.Text = "Cài đặt / Cài đặt thông báo";
					break;

				case "PlcGeneric":
					{
						string text = (parameter as string) ?? "MelsecMcNet";
						PathActivePageIcon.Data = (Geometry)FindResource("IconPlug");
						TxtActivePageTitle.Text = "Kiểm tra kết nối PLC - " + text;
						TxtBreadcrumb.Text = "PLC / Kiểm tra kết nối";
						break;
					}
			}
			ContentArea.Content = view;
			TranslateUI();
		}
	}

	private void BtnDashboard_Click(object sender, RoutedEventArgs e)
	{
		try
		{
			ShowView("Dashboard");
		}
		catch (Exception ex)
		{
			MessageBox.Show("Lỗi hiển thị bảng giám sát: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Hand);
		}
	}

	private void BtnDataTable_Click(object sender, RoutedEventArgs e)
	{
		try
		{
			var win = new PLCDataConfigWindow();
			win.Owner = this;
			win.ShowDialog();
		}
		catch (Exception ex)
		{
			MessageBox.Show("Lỗi hiển thị bảng dữ liệu: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Hand);
		}
	}

	private void BtnLog_Click(object sender, RoutedEventArgs e)
	{
		try
		{
			ShowView("Log");
		}
		catch (Exception ex)
		{
			MessageBox.Show("Lỗi hiển thị nhật ký: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Hand);
		}
	}

	private void BtnHistoryQuery_Click(object sender, RoutedEventArgs e)
	{
		try
		{
			ShowView("HistoryQuery");
		}
		catch (Exception ex)
		{
			MessageBox.Show("Lỗi hiển thị tra cứu lịch sử: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Hand);
		}
	}

	private void BtnSettings_Click(object sender, RoutedEventArgs e)
	{
		try
		{
			ShowView("Settings");
		}
		catch (Exception ex)
		{
			MessageBox.Show("Lỗi hiển thị cài đặt: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Hand);
		}
	}

	private void BtnLiveStatus_Click(object sender, RoutedEventArgs e)
	{
		try
		{
			ShowView("LiveStatus");
		}
		catch (Exception ex)
		{
			MessageBox.Show("Lỗi hiển thị chi tiết trạng thái: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Hand);
		}
	}

	private void BtnLiveErrors_Click(object sender, RoutedEventArgs e)
	{
		try
		{
			ShowView("LiveErrors");
		}
		catch (Exception ex)
		{
			MessageBox.Show("Lỗi hiển thị danh sách lỗi: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Hand);
		}
	}

	private void BtnBrand_Click(object sender, RoutedEventArgs e)
	{
		try
		{
			if (sender is Button { Tag: string tag })
			{
				ShowView("PlcGeneric", tag);
			}
		}
		catch (Exception ex)
		{
			MessageBox.Show("Lỗi hiển thị test PLC: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Hand);
		}
	}

	private void InitializeMenuBarEvents()
	{
		// Guest Menu Items Click Handlers
		MnuGuestHome.Click += (s, e) => ShowView("dashboard.performance");

		MnuGuestAlerts.Click += (s, e) => ShowView("logs.errorList");
		MnuGuestProdAnalysis.Click += (s, e) => ShowView("dashboard.shiftOutput");
		MnuGuestDataTable.Click += (s, e) => ShowView("plc.dataTable");

		// Giám sát
		MnuMonitorPerf.Click += (s, e) => ShowView("dashboard.performance");
		MnuMonitorStatus.Click += (s, e) => ShowView("dashboard.statusDetail");
		MnuMonitorOverview.Click += (s, e) => ShowView("dashboard.productionOverview");
		MnuMonitorOee.Click += (s, e) => ShowView("dashboard.oee");
		MnuMonitorShiftQty.Click += (s, e) => ShowView("dashboard.shiftOutput");
		MnuRefreshData.Click += (s, e) =>
		{
			UpdateSystemStats();
			UpdateConnectionStatuses();
			MessageBox.Show("Đã làm mới dữ liệu hệ thống.", "Thông báo", MessageBoxButton.OK, MessageBoxImage.Information);
		};

		// PLC
		MnuPlcTable.Click += (s, e) => ShowView("plc.dataTable");
		MnuPlcConnTest.Click += (s, e) => ShowView("plc.connectionTest");
		MnuPlcConfigAddr.Click += (s, e) => ShowView("plc.addressConfig");
		MnuPlcConfigIp.Click += (s, e) => ShowView("plc.ipPortConfig");
		MnuPlcConfigCycle.Click += (s, e) => ShowView("plc.readCycleConfig");

		// Lỗi & Nhật ký
		MnuErrorList.Click += (s, e) => ShowView("logs.errorList");
		MnuErrorHistory.Click += (s, e) => ShowView("logs.errorHistory");
		MnuSysLog.Click += (s, e) => ShowView("logs.systemLog");
		MnuSearchHistory.Click += (s, e) => ShowView("logs.historySearch");
		MnuClearFilter.Click += (s, e) => MessageBox.Show("Đã xóa tất cả bộ lọc tìm kiếm.", "Thông báo", MessageBoxButton.OK, MessageBoxImage.Information);
		MnuExportErrorHistory.Click += (s, e) => ShowView("logs.errorHistory");

		// Công cụ
		MnuToolCheckServer.Click += (s, e) => MessageBox.Show("Ping máy chủ: Thành công (1ms)\nServer Trạng thái: Đang kết nối", "Kiểm tra Server", MessageBoxButton.OK, MessageBoxImage.Information);
		MnuToolCheckPlc.Click += (s, e) => ShowView("plc.connectionTest");
		MnuToolResetView.Click += (s, e) => ShowView(_activeViewName, _activeParameter);
		MnuToolSlideshow.Click += (s, e) => MessageBox.Show("Đã kích hoạt chế độ trình chiếu.", "Thông báo", MessageBoxButton.OK, MessageBoxImage.Information);

		MnuToolDiagnostic.Click += ShowAboutWindow;

		// Cài đặt
		MnuSettings.Click += (s, e) => ShowView("Settings");

		BtnLogin.Click += BtnLogin_Click;

		// Setup shortcut key bindings
		this.KeyDown += MainWindow_KeyDown;
	}

	private void FocusNavigationAndSendKeys(string shortcut)
	{
		// Handle generic textbox/datagrid clipboard operations
		var focusedElement = System.Windows.Input.Keyboard.FocusedElement;
		if (focusedElement is TextBox txt)
		{
			switch (shortcut)
			{
				case "Ctrl+Z": if (txt.CanUndo) txt.Undo(); break;
				case "Ctrl+Y": if (txt.CanRedo) txt.Redo(); break;
				case "Ctrl+X": txt.Cut(); break;
				case "Ctrl+C": txt.Copy(); break;
				case "Ctrl+V": txt.Paste(); break;
				case "Delete": txt.SelectedText = ""; break;
				case "Ctrl+A": txt.SelectAll(); break;
			}
		}
		else if (focusedElement is DataGrid dg)
		{
			if (shortcut == "Ctrl+C")
			{
				System.Windows.Input.ApplicationCommands.Copy.Execute(null, dg);
			}
		}
	}

	private void MainWindow_KeyDown(object sender, System.Windows.Input.KeyEventArgs e)
	{
		var key = e.Key;
		var ctrl = (System.Windows.Input.Keyboard.Modifiers & System.Windows.Input.ModifierKeys.Control) == System.Windows.Input.ModifierKeys.Control;
		var shift = (System.Windows.Input.Keyboard.Modifiers & System.Windows.Input.ModifierKeys.Shift) == System.Windows.Input.ModifierKeys.Shift;

		if (ctrl && !shift && key == System.Windows.Input.Key.O)
		{
			MnuOpen_Click(this, new RoutedEventArgs());
			e.Handled = true;
		}
		else if (ctrl && !shift && key == System.Windows.Input.Key.S)
		{
			MnuSave_Click(this, new RoutedEventArgs());
			e.Handled = true;
		}
		else if (key == System.Windows.Input.Key.F5)
		{
			UpdateSystemStats();
			UpdateConnectionStatuses();
			e.Handled = true;
		}
		else if (key == System.Windows.Input.Key.F11)
		{
			ToggleFullScreen();
			e.Handled = true;
		}
	}

	private void MnuNew_Click(object sender, RoutedEventArgs e)
	{
		var win = new PLCDataConfigWindow();
		win.Owner = this;
		win.ShowDialog();
	}

	private void MnuOpen_Click(object sender, RoutedEventArgs e)
	{
		var win = new PLCDataConfigWindow();
		win.Owner = this;
		// Trigger Open File inside the window
		win.Loaded += (s, ev) => {
			win.MnuOpen.RaiseEvent(new RoutedEventArgs(MenuItem.ClickEvent));
		};
		win.ShowDialog();
	}

	private void MnuSave_Click(object sender, RoutedEventArgs e)
	{
		MessageBox.Show("Vui lòng thực hiện thao tác lưu từ cửa sổ Bảng Dữ Liệu PLC.", "Lưu cấu hình", MessageBoxButton.OK, MessageBoxImage.Information);
	}

	private void MnuSaveAs_Click(object sender, RoutedEventArgs e)
	{
		MessageBox.Show("Vui lòng thực hiện thao tác lưu từ cửa sổ Bảng Dữ Liệu PLC.", "Lưu cấu hình", MessageBoxButton.OK, MessageBoxImage.Information);
	}
}
