using PLC.Views;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;
using System.Windows.Threading;
using PLC.Config;
using PLC.Network;
using PLC.Service;

namespace PLC.Views
{
    public partial class LiveErrorsView : UserControl, ILocalizable
    {
        private DispatcherTimer? _timer;
        private readonly Dictionary<string, DateTime> _errorTimestamps = new Dictionary<string, DateTime>(StringComparer.OrdinalIgnoreCase);

        // Navigation State
        private string _activeTab = "Current"; // "Current" or "History"
        private int _currentPage = 1;
        private int _pageSize = 10;
        private int _totalRecords = 0;

        // Custom Alarm Code & Metadata Mapping
        private static readonly Dictionary<string, (string code, string desc, string eqId)> ALARM_CODE_MAP = new Dictionary<string, (string, string, string)>(StringComparer.OrdinalIgnoreCase)
        {
            { "M139", ("E101", "Main Motor Overload", "SCREW-002") },
            { "M138", ("E203", "Hydraulic Pressure High", "AUTO-SCREW-035") },
            { "M160", ("E305", "Cooling Water Temperature High", "FCTC-24-SKV-001") },
            { "M60", ("E409", "Vibration Level High", "DEEZIN-01") },
            { "M61", ("E501", "Communication Timeout", "SCREW-006") },
            { "M62", ("E602", "Insulation Resistance Low", "AUTO-SCREW-001") },
            { "M161", ("E701", "Door Open", "ROCKER-PCBA-A01") },
            { "M166", ("E801", "Power Supply Abnormal", "FCTC-24-SKV-001") },
            { "M190", ("E901", "Fan Failure", "ROBOT-ARM-01") }
        };

        private static Dictionary<string, (string alias, string desc)>? _tagMap;

        private static Dictionary<string, (string alias, string desc)> TAG_MAP
        {
            get
            {
                if (_tagMap == null)
                {
                    _tagMap = LoadTagMap();
                }
                return _tagMap;
            }
        }

        private static Dictionary<string, (string alias, string desc)> LoadTagMap()
        {
            var map = new Dictionary<string, (string, string)>(StringComparer.OrdinalIgnoreCase);

            try
            {
                var storage = new PLC.Service.MachineStorageService();
                var cfg = storage.LoadMachine(PLC.Config.AppConfig.Current.MachineId);
                if (cfg != null)
                {
                    foreach (var tag in cfg.Tags)
                    {
                        if (!string.IsNullOrEmpty(tag.Address) && !string.IsNullOrEmpty(tag.Alias))
                            map[tag.Address] = (tag.Alias, tag.Description);
                    }
                    foreach (var kvp in cfg.Status)
                        map[kvp.Value.Address] = (kvp.Key, $"{kvp.Key}");
                    foreach (var kvp in cfg.Production)
                        map[kvp.Value.Address] = (kvp.Key, $"{kvp.Key}");
                }
            }
            catch { }

            if (map.Count == 0)
            {
                map["M100"] = ("Start", "Khởi động máy");
                map["M180"] = ("Stop", "Dừng máy");
                map["M139"] = ("Error", "Lỗi khẩn cấp");
                map["M60"] = ("Jam Alarm", "Lỗi kẹt liệu");
                map["M138"] = ("Guard Alarm", "Cửa an toàn");
                map["M160"] = ("Robot 1 E-Stop", "Robot 1 dừng khẩn cấp");
            }

            return map;
        }

        public LiveErrorsView()
        {
            InitializeComponent();
            TranslateUI();
            base.Loaded += LiveErrorsView_Loaded;
            base.Unloaded += LiveErrorsView_Unloaded;
            PLC.Service.LanguageManager.LanguageChanged += OnLanguageChanged;
        }

        public void TranslateUI()
        {
            try
            {
                // Translate localized texts
                string lang = LanguageManager.CurrentLanguageCode.ToLower();
                if (lang.StartsWith("zh") || lang.StartsWith("cn"))
                {
                    BtnTabCurrent.Content = "当前报警";
                    BtnTabHistory.Content = "历史报警";
                    TxtKpiCurrentTitle.Text = "当前报警数";
                    TxtKpiTodayTitle.Text = "今日累计报警";

                    if (TxtRefreshText != null) TxtRefreshText.Text = "刷新";
                    if (TxtQueryDate != null) TxtQueryDate.Text = "选择日期:";
                    if (TxtQueryHour != null) TxtQueryHour.Text = "选择小时:";
                    if (CboHourItemAll != null) CboHourItemAll.Content = "所有时间";

                    if (CboItemPage5 != null) CboItemPage5.Content = "5 条/页";
                    if (CboItemPage10 != null) CboItemPage10.Content = "10 条/页";
                    if (CboItemPage20 != null) CboItemPage20.Content = "20 条/页";

                    if (TxtAlarmFreqTitle != null) TxtAlarmFreqTitle.Text = "报警频率趋势";
                    if (TxtLegendAlarms != null) TxtLegendAlarms.Text = "当前报警";
                    if (TxtLegendAvg != null) TxtLegendAvg.Text = "7天平均";
                    if (TxtTop10Title != null) TxtTop10Title.Text = "TOP 10 告警代码";
                    if (TxtEmptyStateAlarms != null) TxtEmptyStateAlarms.Text = "暂无数据";

                    if (GridAlarms != null && GridAlarms.Columns.Count >= 8)
                    {
                        GridAlarms.Columns[0].Header = "序号";
                        GridAlarms.Columns[1].Header = "设备 ID";
                        GridAlarms.Columns[2].Header = "报警代码";
                        GridAlarms.Columns[3].Header = "报警描述";
                        GridAlarms.Columns[4].Header = "触发时间";
                        GridAlarms.Columns[5].Header = "持续时间";
                        GridAlarms.Columns[6].Header = "状态";
                        GridAlarms.Columns[7].Header = "操作";
                    }
                }
                else if (lang.StartsWith("en"))
                {
                    BtnTabCurrent.Content = "Current Alarms";
                    BtnTabHistory.Content = "Historical Alarms";
                    TxtKpiCurrentTitle.Text = "Current Alarm Count";
                    TxtKpiTodayTitle.Text = "Today's Alarm Count";

                    if (TxtRefreshText != null) TxtRefreshText.Text = "Refresh";
                    if (TxtQueryDate != null) TxtQueryDate.Text = "Select Date:";
                    if (TxtQueryHour != null) TxtQueryHour.Text = "Select Hour:";
                    if (CboHourItemAll != null) CboHourItemAll.Content = "All Hours";

                    if (CboItemPage5 != null) CboItemPage5.Content = "5 / page";
                    if (CboItemPage10 != null) CboItemPage10.Content = "10 / page";
                    if (CboItemPage20 != null) CboItemPage20.Content = "20 / page";

                    if (TxtAlarmFreqTitle != null) TxtAlarmFreqTitle.Text = "Alarm Frequency Trend";
                    if (TxtLegendAlarms != null) TxtLegendAlarms.Text = "Alarms";
                    if (TxtLegendAvg != null) TxtLegendAvg.Text = "7-day Average";
                    if (TxtTop10Title != null) TxtTop10Title.Text = "TOP 10 Alarm Codes";
                    if (TxtEmptyStateAlarms != null) TxtEmptyStateAlarms.Text = "No data available";

                    if (GridAlarms != null && GridAlarms.Columns.Count >= 8)
                    {
                        GridAlarms.Columns[0].Header = "No.";
                        GridAlarms.Columns[1].Header = "Equipment ID";
                        GridAlarms.Columns[2].Header = "Alarm Code";
                        GridAlarms.Columns[3].Header = "Alarm Description";
                        GridAlarms.Columns[4].Header = "Start Time";
                        GridAlarms.Columns[5].Header = "Duration";
                        GridAlarms.Columns[6].Header = "Status";
                        GridAlarms.Columns[7].Header = "Action";
                    }
                }
                else
                {
                    BtnTabCurrent.Content = "Cảnh báo hiện tại";
                    BtnTabHistory.Content = "Lịch sử cảnh báo";
                    TxtKpiCurrentTitle.Text = "Số cảnh báo hiện tại";
                    TxtKpiTodayTitle.Text = "Cảnh báo trong ngày";

                    if (TxtRefreshText != null) TxtRefreshText.Text = "Làm mới";
                    if (TxtQueryDate != null) TxtQueryDate.Text = "Chọn ngày:";
                    if (TxtQueryHour != null) TxtQueryHour.Text = "Chọn giờ:";
                    if (CboHourItemAll != null) CboHourItemAll.Content = "Tất cả giờ";

                    if (CboItemPage5 != null) CboItemPage5.Content = "5 / trang";
                    if (CboItemPage10 != null) CboItemPage10.Content = "10 / trang";
                    if (CboItemPage20 != null) CboItemPage20.Content = "20 / trang";

                    if (TxtAlarmFreqTitle != null) TxtAlarmFreqTitle.Text = "Xu hướng tần suất cảnh báo";
                    if (TxtLegendAlarms != null) TxtLegendAlarms.Text = "Cảnh báo";
                    if (TxtLegendAvg != null) TxtLegendAvg.Text = "Trung bình 7 ngày";
                    if (TxtTop10Title != null) TxtTop10Title.Text = "TOP 10 Mã cảnh báo";
                    if (TxtEmptyStateAlarms != null) TxtEmptyStateAlarms.Text = "Không có dữ liệu";

                    if (GridAlarms != null && GridAlarms.Columns.Count >= 8)
                    {
                        GridAlarms.Columns[0].Header = "STT";
                        GridAlarms.Columns[1].Header = "Mã thiết bị";
                        GridAlarms.Columns[2].Header = "Mã cảnh báo";
                        GridAlarms.Columns[3].Header = "Nội dung cảnh báo";
                        GridAlarms.Columns[4].Header = "Thời gian bắt đầu";
                        GridAlarms.Columns[5].Header = "Thời gian lỗi";
                        GridAlarms.Columns[6].Header = "Trạng thái";
                        GridAlarms.Columns[7].Header = "Thao tác";
                    }
                }

                UpdateAlarmView();
            }
            catch (Exception ex)
            {
                Debug.WriteLine("[LiveErrorsView] TranslateUI error: " + ex.Message);
            }
        }

        private void LiveErrorsView_Loaded(object sender, RoutedEventArgs e)
        {
            if (DpDate != null)
            {
                DpDate.SelectedDate = DateTime.Today;
            }
            UpdateAlarmView();
            _timer = new DispatcherTimer();
            _timer.Interval = TimeSpan.FromSeconds(1.0);
            _timer.Tick += (s, ev) => UpdateAlarmView();
            _timer.Start();
        }

        private void LiveErrorsView_Unloaded(object sender, RoutedEventArgs e)
        {
            _timer?.Stop();
            PLC.Service.LanguageManager.LanguageChanged -= OnLanguageChanged;
        }

        private void OnLanguageChanged(object? sender, EventArgs e)
        {
            TranslateUI();
        }

        private DateTime? _filterDate = null;
        private int _filterHour = -1;
        private bool _isFilteredMode = false;

        private void BtnFilter_Click(object sender, RoutedEventArgs e)
        {
            if (DpDate != null)
            {
                _filterDate = DpDate.SelectedDate;
            }
            if (CboHour != null && CboHour.SelectedItem is ComboBoxItem item && item.Tag != null)
            {
                _filterHour = Convert.ToInt32(item.Tag);
            }
            _isFilteredMode = true;
            _currentPage = 1;
            UpdateAlarmView();
        }

        // ==========================================================
        // ALARM DATA LOADING & PROCESSING
        // ==========================================================
        private void UpdateAlarmView()
        {
            try
            {
                bool isDark = PLC.Config.AppSettings.Current.Theme.Equals("dark", StringComparison.OrdinalIgnoreCase);
                string lang = LanguageManager.CurrentLanguageCode.ToLower();
                string lastUpdatedLabel = "Last Updated: ";
                if (lang.StartsWith("zh") || lang.StartsWith("cn")) lastUpdatedLabel = "最后更新: ";
                else if (lang.StartsWith("vi")) lastUpdatedLabel = "Cập nhật cuối: ";
                TxtLastUpdated.Text = $"{lastUpdatedLabel}{DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")}";

                // 1. Fetch PLC Telemetry & Active Statuses
                var plcData = MqttClientService.Instance.LatestPlcData;
                var currentAlarms = new List<AlarmGridItem>();
                int activeCount = 0;

                // Process PLC registers for active alarms
                foreach (var kvp in TAG_MAP)
                {
                    // Skip start trigger
                    if (kvp.Key == "M100") continue;

                    object? val = null;
                    foreach (var pd in plcData)
                    {
                        var parts = pd.Key.Split(':');
                        if (parts[0].Equals(kvp.Key, StringComparison.OrdinalIgnoreCase))
                        {
                            val = pd.Value;
                            break;
                        }
                    }

                    bool isActive = false;
                    if (val is bool b) isActive = b;
                    else if (val != null && double.TryParse(val.ToString(), out double num)) isActive = num != 0;

                    if (isActive)
                    {
                        if (!_errorTimestamps.TryGetValue(kvp.Key, out DateTime triggerTime))
                        {
                            triggerTime = DateTime.Now;
                            _errorTimestamps[kvp.Key] = triggerTime;

                            // Automatically persist to DB error_history
                            string code = "E999";
                            string desc = kvp.Value.desc;
                            string eqId = "GENERIC-PLC";
                            if (ALARM_CODE_MAP.TryGetValue(kvp.Key, out var valMap))
                            {
                                code = valMap.code;
                                desc = valMap.desc;
                                eqId = valMap.eqId;
                            }

                            LocalDbService.Instance.AddOrUpdateErrorHistory(
                                machineId: AppConfig.Current.MachineId ?? "default",
                                machineName: "Line A",
                                errorCode: code,
                                errorName: desc,
                                address: kvp.Key,
                                severity: "High",
                                startedAt: triggerTime,
                                endedAt: null,
                                durationSeconds: null,
                                status: "Active",
                                triggerValue: "true",
                                description: kvp.Value.desc,
                                solution: "Check sensor alignment or register status."
                            );
                        }
                        activeCount++;
                    }
                    else
                    {
                        if (_errorTimestamps.ContainsKey(kvp.Key))
                        {
                            // Clear alarm in DB
                            string code = ALARM_CODE_MAP.TryGetValue(kvp.Key, out var valMap) ? valMap.code : "E999";
                            LocalDbService.Instance.AddOrUpdateErrorHistory(
                                machineId: AppConfig.Current.MachineId ?? "default",
                                machineName: "Line A",
                                errorCode: code,
                                errorName: "",
                                address: kvp.Key,
                                severity: "",
                                startedAt: _errorTimestamps[kvp.Key],
                                endedAt: DateTime.Now,
                                durationSeconds: (int)(DateTime.Now - _errorTimestamps[kvp.Key]).TotalSeconds,
                                status: "Cleared",
                                triggerValue: "false",
                                description: "",
                                solution: ""
                            );
                            _errorTimestamps.Remove(kvp.Key);
                        }
                    }
                }

                // Get Today's Alarm Count from SQLite
                var todayHistory = LocalDbService.Instance.GetErrorHistory(
                    fromDate: DateTime.Today,
                    toDate: DateTime.Today.AddDays(1).AddSeconds(-1)
                );
                int todayCount = todayHistory.Count;
                if (todayCount == 0 && AppSettings.Current.UseMockData)
                {
                    todayCount = 26; // Match mockup count
                }
                TxtKpiTodayVal.Text = todayCount.ToString();

                if (activeCount == 0 && AppSettings.Current.UseMockData)
                {
                    activeCount = 3; // Match mockup active count
                }
                TxtKpiCurrentVal.Text = activeCount.ToString();

                // Load appropriate grid source
                List<AlarmGridItem> allTabItems = new List<AlarmGridItem>();

                if (_activeTab == "Current")
                {
                    int index = 1;
                    foreach (var kvp in _errorTimestamps)
                    {
                        string code = "E999";
                        string desc = TAG_MAP.TryGetValue(kvp.Key, out var tag) ? tag.desc : "PLC Alarm Triggered";
                        string eqId = "PLC-NODE";
                        if (ALARM_CODE_MAP.TryGetValue(kvp.Key, out var valMap))
                        {
                            code = valMap.code;
                            desc = valMap.desc;
                            eqId = valMap.eqId;
                        }

                        allTabItems.Add(new AlarmGridItem
                        {
                            Index = index++,
                            EquipmentId = eqId,
                            AlarmCode = code,
                            AlarmDescription = desc,
                            StartTime = kvp.Value.ToString("yyyy-MM-dd HH:mm:ss"),
                            Duration = FormatDuration((DateTime.Now - kvp.Value).TotalSeconds),
                            StatusText = "Active",
                            StatusColor = "#FF5C6C",
                            StatusBg = isDark ? "#3A1A22" : "#FEE2E2",
                            CodeColor = "#FF5C6C",
                            ActionText = "Acknowledge",
                            ActionFg = "#FFFFFF",
                            ActionBg = "#2F7BFF",
                            ActionBorder = "#2F7BFF",
                            IsActive = true,
                            RawAddress = kvp.Key
                        });
                    }

                    if (allTabItems.Count == 0 && AppSettings.Current.UseMockData)
                    {
                        // Add mock active alarms to current tab as well if DB is empty
                        allTabItems.Add(new AlarmGridItem { Index = 1, EquipmentId = "SCREW-002", AlarmCode = "E101", AlarmDescription = "Main Motor Overload", StartTime = DateTime.Now.AddMinutes(-5).ToString("yyyy-MM-dd HH:mm:ss"), Duration = "00:05:00", StatusText = "Active", StatusColor = "#FF5C6C", StatusBg = isDark ? "#3A1A22" : "#FEE2E2", CodeColor = "#FF5C6C", ActionText = "Acknowledge", ActionFg = "#FFFFFF", ActionBg = "#2F7BFF", ActionBorder = "#2F7BFF", IsActive = true, RawAddress = "M139" });
                        allTabItems.Add(new AlarmGridItem { Index = 2, EquipmentId = "AUTO-SCREW-035", AlarmCode = "E203", AlarmDescription = "Hydraulic Pressure High", StartTime = DateTime.Now.AddMinutes(-12).ToString("yyyy-MM-dd HH:mm:ss"), Duration = "00:12:00", StatusText = "Active", StatusColor = "#FF5C6C", StatusBg = isDark ? "#3A1A22" : "#FEE2E2", CodeColor = "#FF5C6C", ActionText = "Acknowledge", ActionFg = "#FFFFFF", ActionBg = "#2F7BFF", ActionBorder = "#2F7BFF", IsActive = true, RawAddress = "M138" });
                        allTabItems.Add(new AlarmGridItem { Index = 3, EquipmentId = "FCTC-24-SKV-001", AlarmCode = "E305", AlarmDescription = "Cooling Water Temperature High", StartTime = DateTime.Now.AddMinutes(-20).ToString("yyyy-MM-dd HH:mm:ss"), Duration = "00:20:00", StatusText = "Active", StatusColor = "#FF5C6C", StatusBg = isDark ? "#3A1A22" : "#FEE2E2", CodeColor = "#FF5C6C", ActionText = "Acknowledge", ActionFg = "#FFFFFF", ActionBg = "#2F7BFF", ActionBorder = "#2F7BFF", IsActive = true, RawAddress = "M160" });
                    }
                }
                else // History
                {
                    List<Dictionary<string, object>> dbHistory;
                    if (_isFilteredMode)
                    {
                        DateTime? from = null;
                        DateTime? to = null;
                        if (_filterDate.HasValue)
                        {
                            DateTime baseDate = _filterDate.Value.Date;
                            if (_filterHour >= 0 && _filterHour <= 23)
                            {
                                from = baseDate.AddHours(_filterHour);
                                to = baseDate.AddHours(_filterHour + 1).AddSeconds(-1);
                            }
                            else
                            {
                                from = baseDate;
                                to = baseDate.AddDays(1).AddSeconds(-1);
                            }
                        }

                        dbHistory = LocalDbService.Instance.GetErrorHistory(fromDate: from, toDate: to);

                        if (!_filterDate.HasValue && _filterHour >= 0 && _filterHour <= 23)
                        {
                            // Filter in-memory by hour of started_at
                            dbHistory = dbHistory.Where(row =>
                            {
                                string startedStr = row.TryGetValue("StartedAt", out var s) ? s?.ToString() ?? "" : "";
                                if (DateTime.TryParse(startedStr, out DateTime dt))
                                {
                                    return dt.Hour == _filterHour;
                                }
                                return false;
                            }).ToList();
                        }
                    }
                    else
                    {
                        dbHistory = LocalDbService.Instance.GetErrorHistory();
                    }

                    if (dbHistory.Count == 0 && !_isFilteredMode && AppSettings.Current.UseMockData)
                    {
                        dbHistory = new List<Dictionary<string, object>>
                        {
                            new Dictionary<string, object> { ["ErrorCode"] = "E101", ["ErrorName"] = "Main Motor Overload", ["StartedAt"] = DateTime.Now.AddMinutes(-5).ToString("yyyy-MM-dd HH:mm:ss"), ["EndedAt"] = "", ["DurationSeconds"] = 0, ["Status"] = "Active", ["Address"] = "M139" },
                            new Dictionary<string, object> { ["ErrorCode"] = "E203", ["ErrorName"] = "Hydraulic Pressure High", ["StartedAt"] = DateTime.Now.AddMinutes(-12).ToString("yyyy-MM-dd HH:mm:ss"), ["EndedAt"] = "", ["DurationSeconds"] = 0, ["Status"] = "Active", ["Address"] = "M138" },
                            new Dictionary<string, object> { ["ErrorCode"] = "E305", ["ErrorName"] = "Cooling Water Temperature High", ["StartedAt"] = DateTime.Now.AddMinutes(-20).ToString("yyyy-MM-dd HH:mm:ss"), ["EndedAt"] = "", ["DurationSeconds"] = 0, ["Status"] = "Active", ["Address"] = "M160" },
                            new Dictionary<string, object> { ["ErrorCode"] = "E101", ["ErrorName"] = "Main Motor Overload", ["StartedAt"] = DateTime.Now.AddMinutes(-60).ToString("yyyy-MM-dd HH:mm:ss"), ["EndedAt"] = DateTime.Now.AddMinutes(-28).ToString("yyyy-MM-dd HH:mm:ss"), ["DurationSeconds"] = 1920, ["Status"] = "Cleared", ["Address"] = "M139" },
                            new Dictionary<string, object> { ["ErrorCode"] = "E409", ["ErrorName"] = "Vibration Level High", ["StartedAt"] = DateTime.Now.AddMinutes(-90).ToString("yyyy-MM-dd HH:mm:ss"), ["EndedAt"] = DateTime.Now.AddMinutes(-45).ToString("yyyy-MM-dd HH:mm:ss"), ["DurationSeconds"] = 2700, ["Status"] = "Cleared", ["Address"] = "M60" },
                            new Dictionary<string, object> { ["ErrorCode"] = "E203", ["ErrorName"] = "Hydraulic Pressure High", ["StartedAt"] = DateTime.Now.AddMinutes(-120).ToString("yyyy-MM-dd HH:mm:ss"), ["EndedAt"] = DateTime.Now.AddMinutes(-60).ToString("yyyy-MM-dd HH:mm:ss"), ["DurationSeconds"] = 3600, ["Status"] = "Cleared", ["Address"] = "M138" },
                            new Dictionary<string, object> { ["ErrorCode"] = "E501", ["ErrorName"] = "Communication Timeout", ["StartedAt"] = DateTime.Now.AddMinutes(-240).ToString("yyyy-MM-dd HH:mm:ss"), ["EndedAt"] = DateTime.Now.AddMinutes(-140).ToString("yyyy-MM-dd HH:mm:ss"), ["DurationSeconds"] = 6000, ["Status"] = "Cleared", ["Address"] = "M61" },
                            new Dictionary<string, object> { ["ErrorCode"] = "E602", ["ErrorName"] = "Insulation Resistance Low", ["StartedAt"] = DateTime.Now.AddMinutes(-300).ToString("yyyy-MM-dd HH:mm:ss"), ["EndedAt"] = DateTime.Now.AddMinutes(-170).ToString("yyyy-MM-dd HH:mm:ss"), ["DurationSeconds"] = 7800, ["Status"] = "Cleared", ["Address"] = "M62" }
                        };
                    }
                    int index = 1;
                    foreach (var row in dbHistory)
                    {
                        string startedStr = row.TryGetValue("StartedAt", out var s) ? s?.ToString() ?? "" : "";
                        string endedStr = row.TryGetValue("EndedAt", out var eAt) ? eAt?.ToString() ?? "" : "";
                        int duration = row.TryGetValue("DurationSeconds", out var dSec) && dSec != null ? Convert.ToInt32(dSec) : 0;
                        string status = row.TryGetValue("Status", out var st) ? st?.ToString() ?? "Cleared" : "Cleared";

                        string code = row.TryGetValue("ErrorCode", out var ec) ? ec?.ToString() ?? "E999" : "E999";
                        string rawDesc = row.TryGetValue("ErrorName", out var en) ? en?.ToString() : "";
                        string desc = string.IsNullOrWhiteSpace(rawDesc) ? (row.TryGetValue("ErrorCode", out var ecVal) ? ecVal?.ToString() ?? "PLC Register Alarm" : "PLC Register Alarm") : rawDesc;
                        string address = row.TryGetValue("Address", out var addr) ? addr?.ToString() ?? "" : "";

                        string eqId = "PLC-NODE";
                        foreach (var kvp in ALARM_CODE_MAP)
                        {
                            if (kvp.Value.code == code)
                            {
                                eqId = kvp.Value.eqId;
                                break;
                            }
                        }

                        bool isActive = status == "Active";
                        double durationSeconds = duration;
                        if (isActive)
                        {
                            if (DateTime.TryParse(startedStr, out DateTime startedTime))
                            {
                                durationSeconds = (DateTime.Now - startedTime).TotalSeconds;
                            }
                        }

                        allTabItems.Add(new AlarmGridItem
                        {
                            Index = index++,
                            EquipmentId = eqId,
                            AlarmCode = code,
                            AlarmDescription = desc,
                            StartTime = startedStr,
                            Duration = FormatDuration(durationSeconds),
                            StatusText = status,
                            StatusColor = isActive ? "#FF5C6C" : "#38F26B",
                            StatusBg = isActive ? (isDark ? "#3A1A22" : "#FEE2E2") : (isDark ? "#142F24" : "#D1FAE5"),
                            CodeColor = isActive ? "#FF5C6C" : (isDark ? "#FFB020" : "#D97706"),
                            ActionText = isActive ? "Acknowledge" : "View",
                            ActionFg = isActive ? "#FFFFFF" : (isDark ? "#B7C8E8" : "#4B5563"),
                            ActionBg = isActive ? "#2F7BFF" : "Transparent",
                            ActionBorder = isActive ? "#2F7BFF" : (isDark ? "#1E3A8A" : "#D1D5DB"),
                            IsActive = isActive,
                            RawAddress = address,
                            RawHistoryRow = row
                        });
                    }
                }

                // Sort newest alarms first
                allTabItems = allTabItems.OrderByDescending(x => x.StartTime).ToList();

                // Apply search filter
                string filter = TxtErrorSearch?.Text?.Trim()?.ToLower() ?? "";
                if (!string.IsNullOrEmpty(filter))
                {
                    allTabItems = allTabItems.Where(x =>
                        x.AlarmCode.ToLower().Contains(filter) ||
                        x.AlarmDescription.ToLower().Contains(filter) ||
                        x.EquipmentId.ToLower().Contains(filter) ||
                        x.StatusText.ToLower().Contains(filter)
                    ).ToList();
                }

                // Apply pagination
                _totalRecords = allTabItems.Count;
                string paginationPattern = "Total {0} records";
                if (lang.StartsWith("zh") || lang.StartsWith("cn")) paginationPattern = "共 {0} 条记录";
                else if (lang.StartsWith("vi")) paginationPattern = "Tổng số {0} bản ghi";
                TxtPaginationTotal.Text = string.Format(paginationPattern, _totalRecords);

                int totalPages = (int)Math.Ceiling((double)_totalRecords / _pageSize);
                if (totalPages < 1) totalPages = 1;
                if (_currentPage > totalPages) _currentPage = totalPages;

                var pageItems = allTabItems.Skip((_currentPage - 1) * _pageSize).Take(_pageSize).ToList();

                // Update index numbers based on absolute position
                for (int i = 0; i < pageItems.Count; i++)
                {
                    pageItems[i].Index = (_currentPage - 1) * _pageSize + i + 1;
                }

                GridAlarms.ItemsSource = pageItems;
                if (EmptyStateAlarms != null)
                {
                    EmptyStateAlarms.Visibility = (pageItems.Count == 0) ? Visibility.Visible : Visibility.Collapsed;
                }

                UpdatePageButtons(totalPages);
                RenderCharts(todayHistory);
            }
            catch (Exception ex)
            {
                Debug.WriteLine("[LiveErrorsView] UpdateAlarmView error: " + ex.Message);
            }
        }

        private string FormatDuration(double totalSeconds)
        {
            if (totalSeconds < 0) totalSeconds = 0;
            TimeSpan t = TimeSpan.FromSeconds(totalSeconds);
            return string.Format("{0:00}:{1:00}:{2:00}", (int)t.TotalHours, t.Minutes, t.Seconds);
        }

        // ==========================================================
        // PAGINATION & TABS HANDLERS
        // ==========================================================
        private void UpdatePageButtons(int totalPages)
        {
            PnlPageNumbers.Children.Clear();
            bool isDark = AppSettings.Current.Theme.Equals("dark", StringComparison.OrdinalIgnoreCase);
            for (int i = 1; i <= totalPages; i++)
            {
                int pageNum = i;
                Button btn = new Button
                {
                    Content = i.ToString(),
                    Width = 26,
                    Height = 26,
                    Margin = new Thickness(2, 0, 2, 0),
                    Cursor = Cursors.Hand,
                    BorderThickness = new Thickness(0),
                    FontWeight = FontWeights.Bold,
                    FontSize = 11
                };

                if (pageNum == _currentPage)
                {
                    btn.Background = new SolidColorBrush(Color.FromRgb(47, 123, 255)); // Blue selected
                    btn.Foreground = Brushes.White;
                }
                else
                {
                    btn.Background = isDark ? new SolidColorBrush(Color.FromRgb(13, 30, 74)) : new SolidColorBrush(Color.FromRgb(229, 231, 235)); // #E5E7EB
                    btn.Foreground = (Brush)Application.Current.FindResource("TextSecondary");
                }

                btn.Click += (s, e) =>
                {
                    _currentPage = pageNum;
                    UpdateAlarmView();
                };

                PnlPageNumbers.Children.Add(btn);
            }
        }

        private void BtnTabCurrent_Click(object sender, RoutedEventArgs e)
        {
            _activeTab = "Current";
            _currentPage = 1;
            _isFilteredMode = false;
            BtnTabCurrent.BorderBrush = new SolidColorBrush(Color.FromRgb(47, 123, 255));
            BtnTabCurrent.Foreground = (Brush)Application.Current.FindResource("TextPrimary");
            BtnTabHistory.BorderBrush = Brushes.Transparent;
            BtnTabHistory.Foreground = (Brush)Application.Current.FindResource("TextSecondary");

            if (GridKpiCards != null) GridKpiCards.Visibility = Visibility.Visible;
            if (BorderQueryPanel != null) BorderQueryPanel.Visibility = Visibility.Collapsed;
            if (BorderChartRight != null) BorderChartRight.Visibility = Visibility.Visible;
            if (ColChartRight != null) ColChartRight.Width = new GridLength(1, GridUnitType.Star);

            UpdateAlarmView();
        }

        private void BtnTabHistory_Click(object sender, RoutedEventArgs e)
        {
            _activeTab = "History";
            _currentPage = 1;
            BtnTabHistory.BorderBrush = new SolidColorBrush(Color.FromRgb(47, 123, 255));
            BtnTabHistory.Foreground = (Brush)Application.Current.FindResource("TextPrimary");
            BtnTabCurrent.BorderBrush = Brushes.Transparent;
            BtnTabCurrent.Foreground = (Brush)Application.Current.FindResource("TextSecondary");

            if (GridKpiCards != null) GridKpiCards.Visibility = Visibility.Collapsed;
            if (BorderQueryPanel != null) BorderQueryPanel.Visibility = Visibility.Visible;
            if (BorderChartRight != null) BorderChartRight.Visibility = Visibility.Collapsed;
            if (ColChartRight != null) ColChartRight.Width = new GridLength(0);

            UpdateAlarmView();
        }

        private void BtnPrevPage_Click(object sender, RoutedEventArgs e)
        {
            if (_currentPage > 1)
            {
                _currentPage--;
                UpdateAlarmView();
            }
        }

        private void BtnNextPage_Click(object sender, RoutedEventArgs e)
        {
            int totalPages = (int)Math.Ceiling((double)_totalRecords / _pageSize);
            if (_currentPage < totalPages)
            {
                _currentPage++;
                UpdateAlarmView();
            }
        }

        private void CboPageSize_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (CboPageSize.SelectedItem is ComboBoxItem item && item.Tag != null)
            {
                _pageSize = Convert.ToInt32(item.Tag);
                _currentPage = 1;
                UpdateAlarmView();
            }
        }

        private void BtnRefresh_Click(object sender, RoutedEventArgs e)
        {
            UpdateAlarmView();
        }

        private void BtnActionRow_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.Tag is AlarmGridItem item)
            {
                if (item.IsActive)
                {
                    // Acknowledge PLC tag
                    try
                    {
                        var plc = MqttClientService.Instance.PlcInstance;
                        if (plc != null && !string.IsNullOrEmpty(item.RawAddress))
                        {
                            plc.Write(item.RawAddress, false);
                            _errorTimestamps.Remove(item.RawAddress);

                            DateTime startedTime;
                            if (!DateTime.TryParse(item.StartTime, out startedTime))
                            {
                                startedTime = DateTime.Now;
                            }

                            // Update history status in SQLite
                            LocalDbService.Instance.AddOrUpdateErrorHistory(
                                machineId: AppConfig.Current.MachineId ?? "default",
                                machineName: "Line A",
                                errorCode: item.AlarmCode,
                                errorName: "",
                                address: item.RawAddress,
                                severity: "",
                                startedAt: startedTime,
                                endedAt: DateTime.Now,
                                durationSeconds: (int)(DateTime.Now - startedTime).TotalSeconds,
                                status: "Cleared",
                                triggerValue: "false",
                                description: "",
                                solution: ""
                            );

                            UpdateAlarmView();
                            LogManager.AddLog($"Operator acknowledged alarm: {item.AlarmCode} ({item.RawAddress})");
                            CustomMessageBox.Show($"Alarm {item.AlarmCode} has been acknowledged.", "Alarm Manager", MessageBoxButton.OK, MessageBoxImage.Information);
                        }
                    }
                    catch (Exception ex)
                    {
                        Debug.WriteLine("[LiveErrorsView] Ack row error: " + ex.Message);
                    }
                }
                else
                {
                    // View History details
                    string details = $"[Alarm Details]\n\n" +
                                     $"Equipment ID: {item.EquipmentId}\n" +
                                     $"Alarm Code: {item.AlarmCode}\n" +
                                     $"Description: {item.AlarmDescription}\n" +
                                     $"Start Time: {item.StartTime}\n" +
                                     $"Duration: {item.Duration}\n" +
                                     $"Status: {item.StatusText}\n" +
                                     $"PLC Address: {item.RawAddress}";
                    CustomMessageBox.Show(details, "Alarm Traceability Inquiry", MessageBoxButton.OK, MessageBoxImage.Information);
                }
            }
        }

        // ==========================================================
        // CANVAS CHART DRAWINGS
        // ==========================================================
        private void RenderCharts(List<Dictionary<string, object>> todayAlarms)
        {
            DrawLineChart(todayAlarms);
            DrawBarChart(todayAlarms);
        }

        private void CanvasFrequency_SizeChanged(object sender, SizeChangedEventArgs e)
        {
            UpdateAlarmView();
        }

        private void CanvasTopCodes_SizeChanged(object sender, SizeChangedEventArgs e)
        {
            UpdateAlarmView();
        }

        private void DrawLineChart(List<Dictionary<string, object>> todayAlarms)
        {
            if (CanvasFrequency == null) return;
            bool isDark = PLC.Config.AppSettings.Current.Theme.Equals("dark", StringComparison.OrdinalIgnoreCase);
            CanvasFrequency.Children.Clear();
            double w = CanvasFrequency.ActualWidth;
            double h = CanvasFrequency.ActualHeight;
            if (w < 50 || h < 40) return;

            // Chart boundaries
            double padLeft = 32;
            double padRight = 16;
            double padTop = 15;
            double padBottom = 24;

            double graphW = w - padLeft - padRight;
            double graphH = h - padTop - padBottom;

            // X-axis time points (3-hour intervals: 00:00 to 24:00 -> 9 points)
            string[] xLabels = { "00:00", "03:00", "06:00", "09:00", "12:00", "15:00", "18:00", "21:00", "24:00" };
            int[] hourlyCounts = new int[9];
            int[] avgCounts;
            if (AppSettings.Current.UseMockData)
            {
                avgCounts = new int[] { 6, 8, 16, 28, 31, 35, 27, 18, 9 }; // Mock 7-day average data similar to image
            }
            else
            {
                avgCounts = new int[9];
                try
                {
                    DateTime sevenDaysAgo = DateTime.Today.AddDays(-7);
                    DateTime yesterdayEnd = DateTime.Today.AddSeconds(-1);
                    var pastHistory = LocalDbService.Instance.GetErrorHistory(fromDate: sevenDaysAgo, toDate: yesterdayEnd);
                    int[] pastSlotsTotal = new int[9];
                    foreach (var row in pastHistory)
                    {
                        if (row.TryGetValue("StartedAt", out var val) && val != null)
                        {
                            if (DateTime.TryParse(val.ToString(), out DateTime t))
                            {
                                int hour = t.Hour;
                                int idx = hour / 3;
                                if (idx >= 0 && idx < 9)
                                {
                                    pastSlotsTotal[idx]++;
                                }
                            }
                        }
                    }
                    for (int i = 0; i < 9; i++)
                    {
                        avgCounts[i] = (int)Math.Round(pastSlotsTotal[i] / 7.0);
                    }
                }
                catch (Exception ex)
                {
                    System.Diagnostics.Debug.WriteLine("[LiveErrorsView] Error calculating 7-day average: " + ex.Message);
                }
            }

            // Count real alarms in each 3-hour slot for today
            foreach (var row in todayAlarms)
            {
                if (row.TryGetValue("StartedAt", out var val) && val != null)
                {
                    if (DateTime.TryParse(val.ToString(), out DateTime t))
                    {
                        int hour = t.Hour;
                        int idx = hour / 3;
                        if (idx >= 0 && idx < 9)
                        {
                            hourlyCounts[idx]++;
                        }
                    }
                }
            }

            // Let's add mock trend if database has very low alarms to match image aesthetics
            int activeTotal = hourlyCounts.Sum();
            if (activeTotal < 10 && AppSettings.Current.UseMockData)
            {
                hourlyCounts = new int[] { 9, 12, 23, 36, 45, 42, 30, 24, 13 };
            }

            int maxVal = Math.Max(hourlyCounts.Max(), avgCounts.Max());
            maxVal = ((maxVal / 10) + 1) * 10;
            if (maxVal < 20) maxVal = 20;

            // 1. Draw horizontal gridlines & Y-axis labels
            int gridLines = 4;
            for (int i = 0; i <= gridLines; i++)
            {
                double ratio = (double)i / gridLines;
                double y = padTop + graphH * (1 - ratio);

                // Gridline
                Line gridLine = new Line
                {
                    X1 = padLeft,
                    Y1 = y,
                    X2 = w - padRight,
                    Y2 = y,
                    Stroke = isDark ? new SolidColorBrush(Color.FromArgb(20, 255, 255, 255)) : new SolidColorBrush(Color.FromArgb(30, 0, 0, 0)),
                    StrokeThickness = 1
                };
                CanvasFrequency.Children.Add(gridLine);

                // Label
                int valLabel = (int)(ratio * maxVal);
                TextBlock tb = new TextBlock
                {
                    Text = valLabel.ToString(),
                    Foreground = (Brush)Application.Current.FindResource("TextSecondary"),
                    FontSize = 9.5,
                    VerticalAlignment = VerticalAlignment.Center
                };
                Canvas.SetLeft(tb, 4);
                Canvas.SetTop(tb, y - 6);
                CanvasFrequency.Children.Add(tb);
            }

            // 2. Draw X-axis labels
            for (int i = 0; i < xLabels.Length; i++)
            {
                double x = padLeft + ((double)i / (xLabels.Length - 1)) * graphW;

                TextBlock tb = new TextBlock
                {
                    Text = xLabels[i],
                    Foreground = (Brush)Application.Current.FindResource("TextSecondary"),
                    FontSize = 9.5
                };
                Canvas.SetLeft(tb, x - 12);
                Canvas.SetTop(tb, h - padBottom + 4);
                CanvasFrequency.Children.Add(tb);
            }

            // 3. Draw Average Trend Line (Blue dashed)
            PointCollection avgPoints = new PointCollection();
            for (int i = 0; i < avgCounts.Length; i++)
            {
                double x = padLeft + ((double)i / (avgCounts.Length - 1)) * graphW;
                double y = padTop + graphH * (1 - (double)avgCounts[i] / maxVal);
                avgPoints.Add(new Point(x, y));
            }
            Polyline polyAvg = new Polyline
            {
                Points = avgPoints,
                Stroke = new SolidColorBrush(Color.FromRgb(47, 123, 255)),
                StrokeThickness = 1.5,
                StrokeDashArray = new DoubleCollection { 3, 3 }
            };
            CanvasFrequency.Children.Add(polyAvg);

            // Draw Average markers
            foreach (var pt in avgPoints)
            {
                Ellipse el = new Ellipse
                {
                    Width = 4,
                    Height = 4,
                    Fill = new SolidColorBrush(Color.FromRgb(47, 123, 255)),
                    Margin = new Thickness(pt.X - 2, pt.Y - 2, 0, 0)
                };
                CanvasFrequency.Children.Add(el);
            }

            // 4. Draw Current Alarms Line (Red solid)
            PointCollection curPoints = new PointCollection();
            for (int i = 0; i < hourlyCounts.Length; i++)
            {
                double x = padLeft + ((double)i / (hourlyCounts.Length - 1)) * graphW;
                double y = padTop + graphH * (1 - (double)hourlyCounts[i] / maxVal);
                curPoints.Add(new Point(x, y));
            }
            Polyline polyCur = new Polyline
            {
                Points = curPoints,
                Stroke = new SolidColorBrush(Color.FromRgb(255, 92, 108)),
                StrokeThickness = 2
            };
            CanvasFrequency.Children.Add(polyCur);

            // Draw Current markers
            foreach (var pt in curPoints)
            {
                Ellipse el = new Ellipse
                {
                    Width = 6,
                    Height = 6,
                    Fill = new SolidColorBrush(Color.FromRgb(255, 92, 108)),
                    Stroke = Brushes.White,
                    StrokeThickness = 1,
                    Margin = new Thickness(pt.X - 3, pt.Y - 3, 0, 0)
                };
                CanvasFrequency.Children.Add(el);
            }
        }

        private void DrawBarChart(List<Dictionary<string, object>> todayAlarms)
        {
            if (CanvasTopCodes == null) return;
            CanvasTopCodes.Children.Clear();
            double w = CanvasTopCodes.ActualWidth;
            double h = CanvasTopCodes.ActualHeight;
            if (w < 100 || h < 50) return;

            // Set up realistic alarm codes and mock counts if none exist
            Dictionary<string, (string desc, int count)> stats;
            if (AppSettings.Current.UseMockData)
            {
                stats = new Dictionary<string, (string desc, int count)>(StringComparer.OrdinalIgnoreCase)
                {
                    { "E101", ("Main Motor Overload", 68) },
                    { "E203", ("Hydraulic Pressure High", 52) },
                    { "E305", ("Cooling Water Temperature High", 41) },
                    { "E409", ("Vibration Level High", 31) },
                    { "E501", ("Communication Timeout", 23) },
                    { "E602", ("Insulation Resistance Low", 17) },
                    { "E701", ("Door Open", 12) },
                    { "E801", ("Power Supply Abnormal", 9) },
                    { "E901", ("Fan Failure", 6) },
                    { "E999", ("Other Alarm", 4) }
                };
            }
            else
            {
                stats = new Dictionary<string, (string desc, int count)>(StringComparer.OrdinalIgnoreCase);
            }

            // Feed actual counts from database history where possible
            var dbHistory = LocalDbService.Instance.GetErrorHistory();
            foreach (var row in dbHistory)
            {
                string code = row.TryGetValue("ErrorCode", out var val) ? val?.ToString() ?? "" : "";
                if (!string.IsNullOrEmpty(code))
                {
                    if (stats.ContainsKey(code))
                    {
                        var entry = stats[code];
                        stats[code] = (entry.desc, entry.count + 1);
                    }
                    else
                    {
                        string rawName = row.TryGetValue("ErrorName", out var en) ? en?.ToString() : "";
                        string name = string.IsNullOrWhiteSpace(rawName) ? (row.TryGetValue("ErrorCode", out var ecVal) ? ecVal?.ToString() ?? "Unknown" : "Unknown") : rawName;
                        stats[code] = (name, 1);
                    }
                }
            }

            var sortedList = stats.Select(x => new { Code = x.Key, Desc = x.Value.desc, Count = x.Value.count })
                                 .OrderByDescending(x => x.Count)
                                 .Take(6) // Take top 6 to fit nicely in 200px height
                                 .ToList();

            if (sortedList.Count == 0) return;

            double padLeft = 240; // Wide margin for label (E101 Main Motor Overload...)
            double padRight = 32;
            double padTop = 10;
            double padBottom = 15;

            double chartW = w - padLeft - padRight;
            double chartH = h - padTop - padBottom;

            int maxVal = sortedList.Max(x => x.Count);
            if (maxVal < 10) maxVal = 10;

            double rowHeight = chartH / sortedList.Count;

            // Draw bars
            for (int i = 0; i < sortedList.Count; i++)
            {
                var item = sortedList[i];
                double barY = padTop + i * rowHeight + (rowHeight - 12) / 2;
                double barW = ((double)item.Count / maxVal) * chartW;
                if (barW < 2) barW = 2;

                // 1. Draw Label text: "E101  Main Motor Overload"
                TextBlock txtLabel = new TextBlock
                {
                    Text = $"{item.Code}  {item.Desc}",
                    Foreground = (Brush)Application.Current.FindResource("TextPrimary"),
                    FontSize = 10,
                    FontWeight = FontWeights.SemiBold,
                    VerticalAlignment = VerticalAlignment.Center,
                    TextTrimming = TextTrimming.CharacterEllipsis,
                    Width = padLeft - 10
                };
                Canvas.SetLeft(txtLabel, 5);
                Canvas.SetTop(txtLabel, barY - 2);
                CanvasTopCodes.Children.Add(txtLabel);

                // 2. Draw Bar
                Border bar = new Border
                {
                    Height = 11,
                    Width = barW,
                    Background = new LinearGradientBrush
                    {
                        StartPoint = new Point(0, 0),
                        EndPoint = new Point(1, 0),
                        GradientStops = new GradientStopCollection
                        {
                            new GradientStop(Color.FromRgb(47, 123, 255), 0.0),
                            new GradientStop(Color.FromRgb(47, 180, 255), 1.0)
                        }
                    },
                    CornerRadius = new CornerRadius(0, 4, 4, 0)
                };
                Canvas.SetLeft(bar, padLeft);
                Canvas.SetTop(bar, barY);
                CanvasTopCodes.Children.Add(bar);

                // 3. Draw Count value at the end of bar
                TextBlock txtCount = new TextBlock
                {
                    Text = item.Count.ToString(),
                    Foreground = (Brush)Application.Current.FindResource("TextPrimary"),
                    FontSize = 10,
                    FontWeight = FontWeights.Bold
                };
                Canvas.SetLeft(txtCount, padLeft + barW + 6);
                Canvas.SetTop(txtCount, barY - 2);
                CanvasTopCodes.Children.Add(txtCount);
            }
        }

        private void TxtErrorSearch_TextChanged(object sender, TextChangedEventArgs e)
        {
            _currentPage = 1;
            UpdateAlarmView();
        }
    }

    public class AlarmGridItem
    {
        public int Index { get; set; }
        public string EquipmentId { get; set; } = "";
        public string AlarmCode { get; set; } = "";
        public string AlarmDescription { get; set; } = "";
        public string StartTime { get; set; } = "";
        public string Duration { get; set; } = "";
        
        public string StatusText { get; set; } = "";
        public string StatusColor { get; set; } = "";
        public string StatusBg { get; set; } = "";
        public string CodeColor { get; set; } = "";

        public string ActionText { get; set; } = "";
        public string ActionFg { get; set; } = "";
        public string ActionBg { get; set; } = "";
        public string ActionBorder { get; set; } = "";

        public bool IsActive { get; set; }
        public string RawAddress { get; set; } = "";
        public Dictionary<string, object>? RawHistoryRow { get; set; }
    }
}


