using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;
using Microsoft.Win32;
using PLC.Config;
using PLC.Network;
using PLC.Service;
using WinForms = System.Windows.Forms;

namespace PLC;

public partial class MainWindow : Window
{
	private DispatcherTimer? _timer;
	private WinForms.NotifyIcon? _notifyIcon;
	private bool _isExplicitClose = false;

	private string _activeViewName = "Dashboard";
	private object? _activeParameter = null;
	private readonly Dictionary<string, UserControl> _viewCache = new Dictionary<string, UserControl>();

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
		}
	};

	private string _currentFilePath = string.Empty;
	private bool _isDirty = false;
	private readonly List<string> _recentFiles = new List<string>();

	public bool IsDirty
	{
		get => _isDirty;
		set
		{
			_isDirty = value;
			UpdateTitle();
		}
	}

	private void UpdateTitle()
	{
		string filePart = string.IsNullOrEmpty(_currentFilePath) ? "Chưa lưu cấu hình" : System.IO.Path.GetFileName(_currentFilePath);
		this.Title = $"Client PLC Dashboard - {filePart}{(IsDirty ? " *" : "")}";
	}

	public MainWindow()
	{
		InitializeComponent();
		base.Loaded += MainWindow_Loaded;
		base.Closed += MainWindow_Closed;
		this.Closing += MainWindow_Closing;
		SystemEvents.SessionEnding += SystemEvents_SessionEnding;
		InitializeTrayIcon();
		InitializeMenuBarEvents();

		// Initialize UnitTracking callback
		PLC.Infrastructure.Service.UnitTrackingInitializer.Initialize();

		// Custom Title Bar Events
		TitleBarBorder.MouseDown += TitleBarBorder_MouseDown;
		BtnWinMin.Click += BtnWinMin_Click;
		BtnWinMax.Click += BtnWinMax_Click;
		BtnWinClose.Click += BtnWinClose_Click;
		this.StateChanged += MainWindow_StateChanged;
		PLC.Service.LanguageManager.LanguageChanged += OnLanguageChanged;

		RoleManager.RoleChanged += ApplyRoleRestrictions;
	}

	private void MainWindow_Loaded(object sender, RoutedEventArgs e)
	{
		AppSettings current = AppSettings.Current;
		App.ChangeTheme(current.Theme);
		App.ChangeFontSize(current.FontSize);

		// Wire up Server connection toggle switch
		ChkServerToggle.Checked += (s, ev) => MqttClientService.Instance.ServerCommEnabled = true;
		ChkServerToggle.Unchecked += (s, ev) => MqttClientService.Instance.ServerCommEnabled = false;

		TranslateUI();

		ApplyRoleRestrictions();
		ShowView("dashboard.performance");
		_timer = new DispatcherTimer();
		_timer.Interval = TimeSpan.FromSeconds(1L);
		_timer.Tick += Timer_Tick;
		_timer.Start();
		UpdateSystemStats();
		UpdateConnectionStatuses();
		UpdateHeaderClockAndMetadata();
	}

	private void MainWindow_Closed(object? sender, EventArgs e)
	{
		_timer?.Stop();
		MqttClientService.Instance.Stop();
		PLC.Service.LanguageManager.LanguageChanged -= OnLanguageChanged;
		RoleManager.RoleChanged -= ApplyRoleRestrictions;

		SystemEvents.SessionEnding -= SystemEvents_SessionEnding;
		_notifyIcon?.Dispose();
	}

	private void MainWindow_Closing(object? sender, CancelEventArgs e)
	{
		if (!_isExplicitClose)
		{
			e.Cancel = true;
			this.Hide();
			try
			{
				_notifyIcon?.ShowBalloonTip(3000, "Client PLC Dashboard", "Hệ thống vẫn đang tiếp tục hoạt động ngầm để đọc dữ liệu PLC và truyền về máy chủ.", WinForms.ToolTipIcon.Info);
			}
			catch { }
		}
	}

	private void SystemEvents_SessionEnding(object sender, SessionEndingEventArgs e)
	{
		_isExplicitClose = true;
	}

	private void TitleBarBorder_MouseDown(object sender, System.Windows.Input.MouseButtonEventArgs e)
	{
		if (e.ChangedButton == System.Windows.Input.MouseButton.Left)
		{
			if (e.ClickCount == 2)
			{
				// Disable double-click toggle maximize to prevent shrinking
			}
			else
			{
				try
				{
					this.DragMove();
				}
				catch { }
			}
		}
	}

	private void BtnWinMin_Click(object sender, RoutedEventArgs e)
	{
		this.WindowState = WindowState.Minimized;
	}

	private void BtnWinMax_Click(object sender, RoutedEventArgs e)
	{
		ToggleMaximize();
	}

	private void BtnWinClose_Click(object sender, RoutedEventArgs e)
	{
		this.Close();
	}

	private void MainWindow_StateChanged(object? sender, EventArgs e)
	{
		if (this.WindowState == WindowState.Maximized)
		{
			BtnWinMax.Content = "❐";
		}
		else
		{
			BtnWinMax.Content = "▢";
		}
	}

	private void MnuMonitor_Click(object sender, RoutedEventArgs e)
	{

	}
}
