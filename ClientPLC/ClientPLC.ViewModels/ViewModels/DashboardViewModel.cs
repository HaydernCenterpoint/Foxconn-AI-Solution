using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows.Threading;
using System.Windows.Media;
using PLC.Config;
using PLC.Network;
using PLC.Service;

namespace PLC.ViewModels;

public class DashboardViewModel : ViewModelBase, IDisposable
{
    private readonly MqttClientService _mqttClient;
    private readonly DispatcherTimer _timer;
    private ShiftSummary? _cachedSummary;
    private List<TelemetryRecord>? _cachedRecords;
    private DateTime _lastCacheTime = DateTime.MinValue;
    private string _lastShiftDate = "";
    private string _lastShiftName = "";
    
    // 1. Localized UI Text Properties
    private string _title = "GIÁM SÁT HIỆU SUẤT TRỰC TUYẾN";
    private string _todayQtyTitle = "今日产量";
    private string _yieldTitle = "良率(%)";
    private string _uphTitle = "UPH";
    private string _oeeTitle = "OEE(%)";
    private string _alarmsTitle = "报警总数(条)";
    private string _productionChartTitle = "产量趋势(件)";
    private string _yieldChartTitle = "良率趋势(%)";
    private string _todayLegend1 = "今日";
    private string _todayLegend2 = "今日";
    private string _hourlyOutputTitle = "Sản lượng theo giờ (Ca hiện tại)";
    private string _hourlyOutputLegend = "Sản lượng (sp)";
    private string _topAlarmsTitle = "TOP 5 CẢNH BÁO";
    private string _colRank = "Hạng";
    private string _colDevice = "Nội dung cảnh báo";
    private string _colCount = "Số lượng";
    private string _colDuration = "Tích lũy thời gian";
    private string _noDataText = "Không có dữ liệu";

    public string Title { get => _title; set => SetProperty(ref _title, value); }
    public string TodayQtyTitle { get => _todayQtyTitle; set => SetProperty(ref _todayQtyTitle, value); }
    public string YieldTitle { get => _yieldTitle; set => SetProperty(ref _yieldTitle, value); }
    public string UphTitle { get => _uphTitle; set => SetProperty(ref _uphTitle, value); }
    public string OeeTitle { get => _oeeTitle; set => SetProperty(ref _oeeTitle, value); }
    public string AlarmsTitle { get => _alarmsTitle; set => SetProperty(ref _alarmsTitle, value); }
    public string ProductionChartTitle { get => _productionChartTitle; set => SetProperty(ref _productionChartTitle, value); }
    public string YieldChartTitle { get => _yieldChartTitle; set => SetProperty(ref _yieldChartTitle, value); }
    public string TodayLegend1 { get => _todayLegend1; set => SetProperty(ref _todayLegend1, value); }
    public string TodayLegend2 { get => _todayLegend2; set => SetProperty(ref _todayLegend2, value); }
    public string HourlyOutputTitle { get => _hourlyOutputTitle; set => SetProperty(ref _hourlyOutputTitle, value); }
    public string HourlyOutputLegend { get => _hourlyOutputLegend; set => SetProperty(ref _hourlyOutputLegend, value); }
    public string TopAlarmsTitle { get => _topAlarmsTitle; set => SetProperty(ref _topAlarmsTitle, value); }
    public string ColRank { get => _colRank; set => SetProperty(ref _colRank, value); }
    public string ColDevice { get => _colDevice; set => SetProperty(ref _colDevice, value); }
    public string ColCount { get => _colCount; set => SetProperty(ref _colCount, value); }
    public string ColDuration { get => _colDuration; set => SetProperty(ref _colDuration, value); }
    public string NoDataText { get => _noDataText; set => SetProperty(ref _noDataText, value); }

    // 2. Clock and Badge Properties
    private string _currentTime = "--:--:--";
    private string _machineBadge = "Machine: --";
    private string _shiftBadge = "Shift: --";
    private string _dateBadge = "Date: --";
    private string _cycleBadge = "Cycle: -- ms";
    private string _lineName = "Line-01";

    public string CurrentTime { get => _currentTime; set => SetProperty(ref _currentTime, value); }
    public string MachineBadge { get => _machineBadge; set => SetProperty(ref _machineBadge, value); }
    public string ShiftBadge { get => _shiftBadge; set => SetProperty(ref _shiftBadge, value); }
    public string DateBadge { get => _dateBadge; set => SetProperty(ref _dateBadge, value); }
    public string CycleBadge { get => _cycleBadge; set => SetProperty(ref _cycleBadge, value); }
    public string LineName { get => _lineName; set => SetProperty(ref _lineName, value); }

    // 3. Server Badge Properties
    private string _serverStatusText = "Server: Disconnected";
    private Brush _serverStatusBackground = Brushes.Transparent;
    private Brush _serverStatusBorder = Brushes.Transparent;
    private Brush _serverStatusForeground = Brushes.Gray;
    private Brush _serverIconFill = Brushes.Gray;

    public string ServerStatusText { get => _serverStatusText; set => SetProperty(ref _serverStatusText, value); }
    public Brush ServerStatusBackground { get => _serverStatusBackground; set => SetProperty(ref _serverStatusBackground, value); }
    public Brush ServerStatusBorder { get => _serverStatusBorder; set => SetProperty(ref _serverStatusBorder, value); }
    public Brush ServerStatusForeground { get => _serverStatusForeground; set => SetProperty(ref _serverStatusForeground, value); }
    public Brush ServerIconFill { get => _serverIconFill; set => SetProperty(ref _serverIconFill, value); }

    // 4. PLC Badge Properties
    private string _plcStatusText = "PLC: Disconnected";
    private Brush _plcStatusBackground = Brushes.Transparent;
    private Brush _plcStatusBorder = Brushes.Transparent;
    private Brush _plcStatusForeground = Brushes.Gray;

    public string PlcStatusText { get => _plcStatusText; set => SetProperty(ref _plcStatusText, value); }
    public Brush PlcStatusBackground { get => _plcStatusBackground; set => SetProperty(ref _plcStatusBackground, value); }
    public Brush PlcStatusBorder { get => _plcStatusBorder; set => SetProperty(ref _plcStatusBorder, value); }
    public Brush PlcStatusForeground { get => _plcStatusForeground; set => SetProperty(ref _plcStatusForeground, value); }

    // 5. KPI Metrics Values
    private string _todayQty = "0";
    private string _yieldValue = "0.00%";
    private string _uphValue = "0";
    private string _oeeValue = "0.00%";
    private string _alarmsCount = "0";

    public string TodayQty { get => _todayQty; set => SetProperty(ref _todayQty, value); }
    public string YieldValue { get => _yieldValue; set => SetProperty(ref _yieldValue, value); }
    public string UphValue { get => _uphValue; set => SetProperty(ref _uphValue, value); }
    public string OeeValue { get => _oeeValue; set => SetProperty(ref _oeeValue, value); }
    public string AlarmsCount { get => _alarmsCount; set => SetProperty(ref _alarmsCount, value); }

    // 6. Top 5 Alarms Properties
    private string _topAlarmDevice1 = ""; private string _topAlarmCount1 = ""; private string _topAlarmDuration1 = "";
    private string _topAlarmDevice2 = ""; private string _topAlarmCount2 = ""; private string _topAlarmDuration2 = "";
    private string _topAlarmDevice3 = ""; private string _topAlarmCount3 = ""; private string _topAlarmDuration3 = "";
    private string _topAlarmDevice4 = ""; private string _topAlarmCount4 = ""; private string _topAlarmDuration4 = "";
    private string _topAlarmDevice5 = ""; private string _topAlarmCount5 = ""; private string _topAlarmDuration5 = "";

    public string TopAlarmDevice1 { get => _topAlarmDevice1; set => SetProperty(ref _topAlarmDevice1, value); }
    public string TopAlarmCount1 { get => _topAlarmCount1; set => SetProperty(ref _topAlarmCount1, value); }
    public string TopAlarmDuration1 { get => _topAlarmDuration1; set => SetProperty(ref _topAlarmDuration1, value); }

    public string TopAlarmDevice2 { get => _topAlarmDevice2; set => SetProperty(ref _topAlarmDevice2, value); }
    public string TopAlarmCount2 { get => _topAlarmCount2; set => SetProperty(ref _topAlarmCount2, value); }
    public string TopAlarmDuration2 { get => _topAlarmDuration2; set => SetProperty(ref _topAlarmDuration2, value); }

    public string TopAlarmDevice3 { get => _topAlarmDevice3; set => SetProperty(ref _topAlarmDevice3, value); }
    public string TopAlarmCount3 { get => _topAlarmCount3; set => SetProperty(ref _topAlarmCount3, value); }
    public string TopAlarmDuration3 { get => _topAlarmDuration3; set => SetProperty(ref _topAlarmDuration3, value); }

    public string TopAlarmDevice4 { get => _topAlarmDevice4; set => SetProperty(ref _topAlarmDevice4, value); }
    public string TopAlarmCount4 { get => _topAlarmCount4; set => SetProperty(ref _topAlarmCount4, value); }
    public string TopAlarmDuration4 { get => _topAlarmDuration4; set => SetProperty(ref _topAlarmDuration4, value); }

    public string TopAlarmDevice5 { get => _topAlarmDevice5; set => SetProperty(ref _topAlarmDevice5, value); }
    public string TopAlarmCount5 { get => _topAlarmCount5; set => SetProperty(ref _topAlarmCount5, value); }
    public string TopAlarmDuration5 { get => _topAlarmDuration5; set => SetProperty(ref _topAlarmDuration5, value); }

    // 7. Trend & Historical Data points for Drawing charts
    public List<TelemetryRecord> ShiftTelemetryRecords { get; private set; } = new List<TelemetryRecord>();
    public DateTime ShiftStart { get; private set; }
    public DateTime ShiftEnd { get; private set; }
    public double[] ProductionTrendData { get; private set; } = new double[7];
    public double[] YieldTrendData { get; private set; } = new double[7];
    public List<int> HourlyOutputData { get; private set; } = new List<int>();

    public event Action? OnDataUpdated;

    private int _tickCount = 0;

    public DashboardViewModel() : this(MqttClientService.Instance)
    {
    }

    public DashboardViewModel(MqttClientService mqttClient)
    {
        _mqttClient = mqttClient;
        TranslateUI();
        UpdateDashboardData();

        LanguageManager.LanguageChanged += OnLanguageChanged;
        MqttClientService.OnPlcDataRead += OnPlcDataRead;

        _timer = new DispatcherTimer();
        _timer.Interval = TimeSpan.FromSeconds(1);
        _timer.Tick += Timer_Tick;
        _timer.Start();
    }

    private void OnPlcDataRead(Dictionary<string, object> data)
    {
        UpdateDashboardData();
    }

    private void Timer_Tick(object? sender, EventArgs e)
    {
        CurrentTime = DateTime.Now.ToString("HH:mm:ss");

        _tickCount++;
        if (_tickCount >= 5)
        {
            _tickCount = 0;
            UpdateDashboardData();
        }
    }

    private void OnLanguageChanged(object? sender, EventArgs e)
    {
        TranslateUI();
        UpdateDashboardData();
    }

    public void TranslateUI()
    {
        string lang = LanguageManager.CurrentLanguageCode.ToLower();
        if (lang.StartsWith("zh") || lang.StartsWith("cn"))
        {
            Title = "实时性能监控";
            TodayQtyTitle = "今日产量";
            YieldTitle = "良率(%)";
            UphTitle = "UPH";
            OeeTitle = "OEE(%)";
            AlarmsTitle = "报警总数(条)";
            ProductionChartTitle = "产量趋势(件)";
            YieldChartTitle = "良率趋势(%)";
            TodayLegend1 = "今日";
            TodayLegend2 = "今日";
            HourlyOutputTitle = "按小时产量 (当前班次)";
            HourlyOutputLegend = "产量 (件)";
            TopAlarmsTitle = "TOP 5 报警";
            ColRank = "排名";
            ColDevice = "报警内容";
            ColCount = "次数";
            ColDuration = "累计时间";
            NoDataText = "暂无数据";
        }
        else if (lang.StartsWith("en"))
        {
            Title = "Performance Monitor";
            TodayQtyTitle = "Today's Output";
            YieldTitle = "Yield (%)";
            UphTitle = "UPH";
            OeeTitle = "OEE (%)";
            AlarmsTitle = "Total Alarms";
            ProductionChartTitle = "Production Trend (pcs)";
            YieldChartTitle = "Yield Trend (%)";
            TodayLegend1 = "Today";
            TodayLegend2 = "Today";
            HourlyOutputTitle = "Hourly Production (Current Shift)";
            HourlyOutputLegend = "Qty (pcs)";
            TopAlarmsTitle = "TOP 5 ALARMS";
            ColRank = "Rank";
            ColDevice = "Alarm Details";
            ColCount = "Count";
            ColDuration = "Total Duration";
            NoDataText = "No data available";
        }
        else
        {
            Title = "GIÁM SÁT HIỆU SUẤT TRỰC TUYẾN";
            TodayQtyTitle = "Sản lượng ngày";
            YieldTitle = "Tỷ lệ đạt (%)";
            UphTitle = "UPH";
            OeeTitle = "OEE (%)";
            AlarmsTitle = "Tổng số cảnh báo";
            ProductionChartTitle = "Xu hướng sản lượng (sp)";
            YieldChartTitle = "Xu hướng tỷ lệ đạt (%)";
            TodayLegend1 = "Hôm nay";
            TodayLegend2 = "Hôm nay";
            HourlyOutputTitle = "Sản lượng theo giờ (Ca hiện tại)";
            HourlyOutputLegend = "Sản lượng (sp)";
            TopAlarmsTitle = "TOP 5 CẢNH BÁO";
            ColRank = "Hạng";
            ColDevice = "Nội dung cảnh báo";
            ColCount = "Số lượng";
            ColDuration = "Tích lũy thời gian";
            NoDataText = "Không có dữ liệu";
        }
    }

    private void UpdateDashboardData()
    {
        try
        {
            DateTime now = DateTime.Now;
            CurrentTime = now.ToString("HH:mm:ss");

            AppConfig current = AppConfig.Current;
            var shiftInfo = LocalDbService.GetShiftInfo(now);
            ShiftStart = shiftInfo.ShiftStart;
            ShiftEnd = shiftInfo.ShiftEnd;

            string lang = AppSettings.Current.Language?.ToLower() ?? "vi";
            string shiftDisplayName = (shiftInfo.ShiftName == "Day")
                ? (LanguageManager.GetText("Shift.DayLabel") ?? "Ca sáng")
                : (LanguageManager.GetText("Shift.NightLabel") ?? "Ca tối");

            string dateFormat = (lang.StartsWith("zh")) ? "yyyy年MM月dd日" : ((lang.StartsWith("en")) ? "MM/dd/yyyy" : "dd/MM/yyyy");
            string formattedDate = now.ToString(dateFormat);

            string machineNameVal = current.MachineName ?? "01";
            if (lang.StartsWith("vi") && machineNameVal.StartsWith("May ", StringComparison.OrdinalIgnoreCase))
            {
                machineNameVal = "Máy " + machineNameVal.Substring(4);
            }

            MachineBadge = string.Format(LanguageManager.GetText("Dashboard.Machine") ?? "Machine: {0}", machineNameVal);
            string shiftTime = (shiftInfo.ShiftName == "Day") ? "07:30 - 19:30" : "19:30 - 07:30";
            ShiftBadge = string.Format(LanguageManager.GetText("Dashboard.ShiftBadge") ?? "{0}: {1}", shiftDisplayName, shiftTime);
            DateBadge = string.Format(LanguageManager.GetText("Dashboard.Date") ?? "Date: {0}", formattedDate);
            CycleBadge = string.Format(LanguageManager.GetText("Dashboard.ReadCycle") ?? "Cycle: {0} ms", current.ReadIntervalMs);
            LineName = current.LineName ?? "Line-01";

            // Network statuses
            MqttClientService tcpClient = _mqttClient;
            bool isDark = AppSettings.Current.Theme?.ToLower() == "dark";

            if (tcpClient.IsConnectedToServer)
            {
                ServerStatusText = LanguageManager.GetText("ServerStatusConnected") ?? "Server: Connected";
                ServerStatusBackground = GetFrozenBrush(isDark ? Color.FromRgb(20, 83, 45) : Color.FromRgb(240, 253, 244));
                ServerStatusBorder = GetFrozenBrush(isDark ? Color.FromRgb(34, 197, 94) : Color.FromRgb(134, 239, 172));
                ServerStatusForeground = GetFrozenBrush(isDark ? Color.FromRgb(74, 222, 128) : Color.FromRgb(21, 128, 61));
                ServerIconFill = ServerStatusForeground;
            }
            else
            {
                ServerStatusText = LanguageManager.GetText("ServerStatusDisconnected") ?? "Server: Disconnected";
                ServerStatusBackground = GetFrozenBrush(isDark ? Color.FromRgb(127, 29, 29) : Color.FromRgb(254, 242, 242));
                ServerStatusBorder = GetFrozenBrush(isDark ? Color.FromRgb(239, 68, 68) : Color.FromRgb(252, 165, 165));
                ServerStatusForeground = GetFrozenBrush(isDark ? Color.FromRgb(248, 113, 113) : Color.FromRgb(220, 38, 38));
                ServerIconFill = ServerStatusForeground;
            }

            PlcConnectionState plcState = tcpClient.ConnectionState;
            string stateText = "Unknown";
            Brush plcBg, plcBorder, plcFore;

            switch (plcState)
            {
                case PlcConnectionState.Connected:
                    stateText = LanguageManager.GetText("Status.Connected") ?? "Đã kết nối";
                    plcBg = GetFrozenBrush(isDark ? Color.FromRgb(20, 83, 45) : Color.FromRgb(240, 253, 244));
                    plcBorder = GetFrozenBrush(isDark ? Color.FromRgb(34, 197, 94) : Color.FromRgb(134, 239, 172));
                    plcFore = GetFrozenBrush(isDark ? Color.FromRgb(74, 222, 128) : Color.FromRgb(21, 128, 61));
                    break;
                case PlcConnectionState.Connecting:
                    stateText = LanguageManager.GetText("Status.Connecting") ?? "Đang kết nối";
                    plcBg = GetFrozenBrush(isDark ? Color.FromRgb(30, 58, 138) : Color.FromRgb(239, 246, 255));
                    plcBorder = GetFrozenBrush(isDark ? Color.FromRgb(59, 130, 246) : Color.FromRgb(147, 197, 253));
                    plcFore = GetFrozenBrush(isDark ? Color.FromRgb(96, 165, 250) : Color.FromRgb(29, 78, 216));
                    break;
                case PlcConnectionState.NotConfigured:
                    stateText = LanguageManager.GetText("Status.NotConfigured") ?? "Chưa cấu hình";
                    plcBg = GetFrozenBrush(isDark ? Color.FromRgb(69, 26, 3) : Color.FromRgb(255, 247, 237));
                    plcBorder = GetFrozenBrush(isDark ? Color.FromRgb(217, 119, 6) : Color.FromRgb(253, 186, 116));
                    plcFore = GetFrozenBrush(isDark ? Color.FromRgb(251, 191, 36) : Color.FromRgb(180, 83, 9));
                    break;
                case PlcConnectionState.ConfigError:
                    stateText = LanguageManager.GetText("Status.ConfigError") ?? "Lỗi cấu hình";
                    plcBg = GetFrozenBrush(isDark ? Color.FromRgb(127, 29, 29) : Color.FromRgb(254, 242, 242));
                    plcBorder = GetFrozenBrush(isDark ? Color.FromRgb(239, 68, 68) : Color.FromRgb(252, 165, 165));
                    plcFore = GetFrozenBrush(isDark ? Color.FromRgb(248, 113, 113) : Color.FromRgb(220, 38, 38));
                    break;
                case PlcConnectionState.NoResponse:
                    stateText = LanguageManager.GetText("Status.NoResponse") ?? "Khống phản hồi";
                    plcBg = GetFrozenBrush(isDark ? Color.FromRgb(120, 53, 15) : Color.FromRgb(254, 249, 195));
                    plcBorder = GetFrozenBrush(isDark ? Color.FromRgb(202, 138, 4) : Color.FromRgb(253, 224, 71));
                    plcFore = GetFrozenBrush(isDark ? Color.FromRgb(250, 204, 21) : Color.FromRgb(161, 98, 7));
                    break;
                case PlcConnectionState.Disconnected:
                default:
                    stateText = LanguageManager.GetText("Status.Disconnected") ?? "Mất kết nối";
                    plcBg = GetFrozenBrush(isDark ? Color.FromRgb(127, 29, 29) : Color.FromRgb(254, 242, 242));
                    plcBorder = GetFrozenBrush(isDark ? Color.FromRgb(239, 68, 68) : Color.FromRgb(252, 165, 165));
                    plcFore = GetFrozenBrush(isDark ? Color.FromRgb(248, 113, 113) : Color.FromRgb(220, 38, 38));
                    break;
            }

            PlcStatusText = "PLC: " + stateText + (plcState == PlcConnectionState.Connected ? " (" + tcpClient.ConnectedPlcBrand + ")" : "");
            PlcStatusBackground = plcBg;
            PlcStatusBorder = plcBorder;
            PlcStatusForeground = plcFore;

            // Shift telemetry records & Alarms summary cache check
            bool isCacheValid = _cachedSummary != null &&
                               _cachedRecords != null &&
                               (now - _lastCacheTime).TotalSeconds < 5.0 &&
                               _lastShiftDate == shiftInfo.ShiftDate &&
                               _lastShiftName == shiftInfo.ShiftName;

            if (!isCacheValid)
            {
                _cachedRecords = LocalDbService.Instance.GetShiftTelemetryRecords(shiftInfo.ShiftDate, shiftInfo.ShiftName);
                _cachedSummary = LocalDbService.Instance.GetShiftSummary(shiftInfo.ShiftDate, shiftInfo.ShiftName);
                _lastCacheTime = now;
                _lastShiftDate = shiftInfo.ShiftDate;
                _lastShiftName = shiftInfo.ShiftName;
            }

            ShiftTelemetryRecords = _cachedRecords;
            ShiftSummary shiftSummary = _cachedSummary;
            var activeErrors = LocalDbService.Instance.GetErrorHistory(status: "Active");

            // Calculate ProductionTrendData
            if (AppSettings.Current.UseMockData)
            {
                ProductionTrendData = new double[] { 10, 22, 33, 42, 50, 56, 61 };
            }
            else
            {
                double[] trend = new double[7];
                if (ShiftTelemetryRecords.Count == 0)
                {
                    ProductionTrendData = new double[] { 0, 0, 0, 0, 0, 0, 0 };
                }
                else
                {
                    int firstProd = ShiftTelemetryRecords[0].ProductionQty;
                    for (int i = 0; i < 7; i++)
                    {
                        DateTime targetTime = ShiftStart.AddHours(i == 6 ? 11 : i * 2);
                        var lastRec = ShiftTelemetryRecords.LastOrDefault(r => r.Timestamp <= targetTime);
                        if (lastRec == null)
                        {
                            trend[i] = 0;
                        }
                        else
                        {
                            trend[i] = Math.Max(0, lastRec.ProductionQty - firstProd);
                        }
                    }
                    ProductionTrendData = trend;
                }
            }

            // Calculate YieldTrendData
            if (AppSettings.Current.UseMockData)
            {
                YieldTrendData = new double[] { 98.0, 96.0, 94.0, 95.0, 84.0, 93.0, 96.0 };
            }
            else
            {
                double[] trend = new double[7];
                if (ShiftTelemetryRecords.Count == 0)
                {
                    YieldTrendData = new double[] { 100.0, 100.0, 100.0, 100.0, 100.0, 100.0, 100.0 };
                }
                else
                {
                    int firstProd = ShiftTelemetryRecords[0].ProductionQty;
                    int firstDefect = ShiftTelemetryRecords[0].DefectQty;

                    for (int i = 0; i < 7; i++)
                    {
                        DateTime targetTime = ShiftStart.AddHours(i == 6 ? 11 : i * 2);
                        var lastRec = ShiftTelemetryRecords.LastOrDefault(r => r.Timestamp <= targetTime);
                        if (lastRec == null)
                        {
                            trend[i] = 100.0;
                        }
                        else
                        {
                            int prodDiff = Math.Max(0, lastRec.ProductionQty - firstProd);
                            int defectDiff = Math.Max(0, lastRec.DefectQty - firstDefect);
                            if (prodDiff > 0)
                            {
                                trend[i] = Math.Max(0.0, (double)(prodDiff - defectDiff) / prodDiff * 100.0);
                            }
                            else
                            {
                                trend[i] = 100.0;
                            }
                        }
                    }
                    YieldTrendData = trend;
                }
            }

            // Calculate HourlyOutputData
            var hourlyData = shiftSummary.HourlyProduction;
            if (AppSettings.Current.UseMockData)
            {
                HourlyOutputData = new List<int> { 4, 5, 6, 5, 5, 3, 5, 6, 6, 5, 6, 5 };
            }
            else
            {
                if (hourlyData == null || hourlyData.Count < 12)
                {
                    HourlyOutputData = new List<int>(new int[12]);
                }
                else
                {
                    HourlyOutputData = hourlyData;
                }
            }

            int production;
            double yield;
            double uph;
            double oee;
            int defectQty;
            int totalAlarms = activeErrors.Count;

            if (!AppSettings.Current.UseMockData)
            {
                production = shiftSummary.ProductionQty;
                yield = shiftSummary.Quality;
                uph = shiftSummary.AvgSpeedPerHour;
                oee = shiftSummary.Oee;
                defectQty = shiftSummary.DefectQty;
            }
            else
            {
                production = 61;
                yield = 99.23;
                uph = 5.5;
                oee = 89.35;
                defectQty = 98;
                if (totalAlarms == 0) totalAlarms = 3;
            }

            TodayQty = production.ToString("N0", LanguageManager.CurrentCulture);
            YieldValue = $"{yield:F2}%";
            UphValue = uph.ToString("F1", LanguageManager.CurrentCulture) + "/h";
            OeeValue = $"{oee:F2}%";
            AlarmsCount = totalAlarms.ToString();

            // Populate Top 5 Alarms Properties
            UpdateTop5AlarmsViewModel(lang);

            // Notify View to redraw charts
            OnDataUpdated?.Invoke();
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine("[DashboardViewModel] Error updating data: " + ex.Message);
        }
    }

    private void UpdateTop5AlarmsViewModel(string lang)
    {
        var logs = LocalDbService.Instance.GetErrorHistory();
        var grouped = logs
            .GroupBy(x => !string.IsNullOrEmpty(x["ErrorName"]?.ToString()) ? x["ErrorName"].ToString() : (x["ErrorCode"]?.ToString() ?? "UNKNOWN"))
            .Select(g => new {
                Alarm = g.Key,
                Count = g.Count(),
                Duration = g.Sum(x => Convert.ToInt32(x["DurationSeconds"]))
            })
            .OrderByDescending(x => x.Count)
            .Take(5)
            .ToList();

        for (int i = 0; i < 5; i++)
        {
            string alarm = "";
            string count = "";
            string duration = "";

            if (AppSettings.Current.UseMockData)
            {
                if (i == 0)
                {
                    alarm = (lang.StartsWith("zh")) ? "滑牙" : ((lang.StartsWith("en")) ? "Slipped Thread" : "Trượt ren vít");
                    count = "12"; duration = "01:23:15";
                }
                else if (i == 1)
                {
                    alarm = (lang.StartsWith("zh")) ? "锁付浮高" : ((lang.StartsWith("en")) ? "Screw Floating Height" : "Vít nổi / Vít chưa chặt");
                    count = "6"; duration = "00:54:21";
                }
                else if (i == 2)
                {
                    alarm = (lang.StartsWith("zh")) ? "漏锁" : ((lang.StartsWith("en")) ? "Missed Lock" : "Bỏ sót vít / Thiếu vít");
                    count = "4"; duration = "00:32:11";
                }
                else if (i == 3)
                {
                    alarm = (lang.StartsWith("zh")) ? "角度异常" : ((lang.StartsWith("en")) ? "Abnormal Angle" : "Góc siết bất thường");
                    count = "3"; duration = "00:21:55";
                }
                else if (i == 4)
                {
                    alarm = (lang.StartsWith("zh")) ? "扭力超限" : ((lang.StartsWith("en")) ? "Torque Limit Exceeded" : "Lực siết không đạt");
                    count = "2"; duration = "00:15:32";
                }
            }
            else
            {
                if (i < grouped.Count)
                {
                    var item = grouped[i];
                    alarm = item.Alarm;
                    count = item.Count.ToString();
                    TimeSpan ts = TimeSpan.FromSeconds(item.Duration);
                    duration = string.Format("{0:00}:{1:00}:{2:00}", (int)ts.TotalHours, ts.Minutes, ts.Seconds);
                }
            }

            SetAlarmRowViewModel(i + 1, alarm, count, duration);
        }
    }

    private void SetAlarmRowViewModel(int rank, string device, string count, string duration)
    {
        switch (rank)
        {
            case 1: TopAlarmDevice1 = device; TopAlarmCount1 = count; TopAlarmDuration1 = duration; break;
            case 2: TopAlarmDevice2 = device; TopAlarmCount2 = count; TopAlarmDuration2 = duration; break;
            case 3: TopAlarmDevice3 = device; TopAlarmCount3 = count; TopAlarmDuration3 = duration; break;
            case 4: TopAlarmDevice4 = device; TopAlarmCount4 = count; TopAlarmDuration4 = duration; break;
            case 5: TopAlarmDevice5 = device; TopAlarmCount5 = count; TopAlarmDuration5 = duration; break;
        }
    }

    private Brush GetFrozenBrush(Color color)
    {
        var brush = new SolidColorBrush(color);
        brush.Freeze();
        return brush;
    }

    public void Dispose()
    {
        _timer.Stop();
        LanguageManager.LanguageChanged -= OnLanguageChanged;
        MqttClientService.OnPlcDataRead -= OnPlcDataRead;
    }
}
