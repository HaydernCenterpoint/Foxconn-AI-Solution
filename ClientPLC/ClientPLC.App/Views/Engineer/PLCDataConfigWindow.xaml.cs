using PLC.Views;
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Win32;
using PLC.Config;
using PLC.Network;
using PLC.Service;
using PLC.Model;
using MessageBox = PLC.Views.CustomMessageBox;

namespace PLC.Views
{
    public partial class PLCDataConfigWindow : Window
    {
        public ObservableCollection<StatusItemViewModel> StatusItems { get; } = new ObservableCollection<StatusItemViewModel>();
        public ObservableCollection<ProductItemViewModel> ProductItems { get; } = new ObservableCollection<ProductItemViewModel>();
        public ObservableCollection<ProductItemViewModel> QualityItems { get; } = new ObservableCollection<ProductItemViewModel>();
        public ObservableCollection<AlarmItemViewModel> AlarmItems { get; } = new ObservableCollection<AlarmItemViewModel>();

        private string _currentFilePath = string.Empty;
        private bool _isDirty = false;

        // Current editing config fields (PLC IP, brand, etc.) load/save from memory when saving/loading cplc
        public string PlcBrand { get; set; } = "MelsecMcNet";
        public string PlcIp { get; set; } = "192.168.1.100";
        public int PlcPort { get; set; } = 6000;
        public int ReadIntervalMs { get; set; } = 5000;
        public string ServerHost { get; set; } = "127.0.0.1";
        public int ServerPort { get; set; } = 9999;
        public string ServerToken { get; set; } = "";
        public int TargetSpeed { get; set; } = 60;
        public int LocalWebPort { get; set; } = 8080;

        public PLCDataConfigWindow()
        {
            InitializeComponent();

            // Bind data grids
            GridStatus.ItemsSource = StatusItems;
            GridProducts.ItemsSource = ProductItems;
            GridQuality.ItemsSource = QualityItems;
            GridAlarms.ItemsSource = AlarmItems;

            // Populate combo box column sources
            var types = new List<string> { "Bool", "Int16", "UInt16", "Int32", "UInt32", "Float", "Double", "String" };
            ColStatusType.ItemsSource = types;
            ColProductType.ItemsSource = types;
            ColQualityType.ItemsSource = types;
            ColAlarmType.ItemsSource = types;

            this.Loaded += PLCDataConfigWindow_Loaded;
            this.Closing += PLCDataConfigWindow_Closing;

            PLC.Service.LanguageManager.LanguageChanged += OnLanguageChanged;

            // Menu Bindings
            MnuNew.Click += MnuNew_Click;
            MnuOpen.Click += MnuOpen_Click;
            MnuSave.Click += MnuSave_Click;
            MnuSaveAs.Click += MnuSaveAs_Click;
            MnuImportExcel.Click += MnuImportExcel_Click;
            MnuExportCsv.Click += MnuExportCsv_Click;
            MnuClose.Click += (s, e) => this.Close();

            // Button bindings
            BtnRefresh.Click += BtnRefresh_Click;
            BtnApply.Click += BtnApply_Click;
            BtnTestRead.Click += BtnTestRead_Click;

            // Alarms buttons
            BtnAddAlarm.Click += BtnAddAlarm_Click;
            BtnDeleteAlarm.Click += BtnDeleteAlarm_Click;
            BtnImportAlarm.Click += BtnImportAlarm_Click;
            BtnExportAlarm.Click += BtnExportAlarm_Click;
            BtnDownloadAlarmTemplate.Click += BtnDownloadAlarmTemplate_Click;

            // Quality buttons
            BtnAddQuality.Click += BtnAddQuality_Click;
            BtnDeleteQuality.Click += BtnDeleteQuality_Click;
            BtnImportQuality.Click += BtnImportQuality_Click;
            BtnExportQuality.Click += BtnExportQuality_Click;

            MqttClientService.OnPlcDataRead += MqttClientService_OnPlcDataRead;
        }

        private void PLCDataConfigWindow_Loaded(object sender, RoutedEventArgs e)
        {
            LoadFromAppConfig(AppConfig.Current);
            TranslateUI();
            MqttClientService_OnPlcDataRead(MqttClientService.Instance.LatestPlcData);

            if (RoleManager.CurrentRole == UserRole.Engineer)
            {
                BtnDeleteAlarm.IsEnabled = false;
                BtnDeleteQuality.IsEnabled = false;
            }
            else
            {
                BtnDeleteAlarm.IsEnabled = true;
                BtnDeleteQuality.IsEnabled = true;
            }
        }

        private void PLCDataConfigWindow_Closing(object? sender, CancelEventArgs e)
        {
            if (_isDirty)
            {
                var result = CustomMessageBox.Show(
                    LanguageManager.GetText("UnsavedChangesPrompt") ?? "Cấu hình đã thay đổi. Bạn có muốn lưu trước khi đóng cửa sổ này không?",
                    LanguageManager.GetText("SaveChangesTitle") ?? "Lưu thay đổi",
                    MessageBoxButton.YesNoCancel,
                    MessageBoxImage.Question);

                if (result == MessageBoxResult.Cancel)
                {
                    e.Cancel = true;
                }
                else if (result == MessageBoxResult.Yes)
                {
                    if (!SaveToFile())
                    {
                        e.Cancel = true;
                    }
                }
            }

            if (!e.Cancel)
            {
                PLC.Service.LanguageManager.LanguageChanged -= OnLanguageChanged;
                MqttClientService.OnPlcDataRead -= MqttClientService_OnPlcDataRead;
            }
        }

        private void OnLanguageChanged(object? sender, EventArgs e)
        {
            ApplyLanguage();
        }

        public void ApplyLanguage()
        {
            TranslateUI();
        }

        private void UpdateTitle()
        {
            string defaultNewConfig = LanguageManager.GetText("NewConfig") ?? "Cấu hình mới";
            string fileName = string.IsNullOrEmpty(_currentFilePath) ? defaultNewConfig : Path.GetFileName(_currentFilePath);
            string titleText = LanguageManager.GetText("PlcAddrConfigTitle") ?? "Cấu Hình Địa Chỉ PLC";
            this.Title = $"{titleText} - {fileName}{(_isDirty ? " *" : "")}";
        }

        public void TranslateUI()
        {
            try
            {
                if (TxtStatus != null)
                {
                    TxtStatus.Text = LanguageManager.GetText("ConfigStatusActive") ?? "Trạng thái cấu hình: Đang hoạt động";
                }
                BtnTestRead.Content = LanguageManager.GetText("BtnTestReadText") ?? "⚡ Đọc thử";
                BtnRefresh.Content = LanguageManager.GetText("BtnRefreshText") ?? "Tải Lại Cấu Hình";
                BtnApply.Content = LanguageManager.GetText("BtnApplyText") ?? "🚀 Áp dụng";

                // Menus
                MnuFile.Header = LanguageManager.GetText("CfgMnuFile") ?? "_Tệp";
                MnuNew.Header = LanguageManager.GetText("CfgMnuNew") ?? "_Tạo mới (_N)";
                MnuOpen.Header = LanguageManager.GetText("CfgMnuOpen") ?? "_Mở cấu hình (_O)...";
                MnuSave.Header = LanguageManager.GetText("CfgMnuSave") ?? "_Lưu cấu hình (_S)";
                MnuSaveAs.Header = LanguageManager.GetText("CfgMnuSaveAs") ?? "Lưu cấu hình _dưới tên (_A)...";
                MnuImportExcel.Header = LanguageManager.GetText("CfgMnuImportExcel") ?? "Nhập từ Excel...";
                MnuExportCsv.Header = LanguageManager.GetText("CfgMnuExportCsv") ?? "Xuất Excel/CSV...";
                MnuClose.Header = LanguageManager.GetText("CfgMnuClose") ?? "Đóng cửa sổ";

                // Tabs
                TabItemStatus.Header = LanguageManager.GetText("TabStatusText") ?? "Trạng thái";
                TabItemProducts.Header = LanguageManager.GetText("TabProductsText") ?? "Sản phẩm";
                TabItemQuality.Header = LanguageManager.GetText("TabQualityText") ?? "Chất lượng";
                TabItemAlarms.Header = LanguageManager.GetText("TabAlarmsText") ?? "Thông báo";

                // Help/Labels
                TxtStatusHelp.Text = LanguageManager.GetText("CfgStatusHelp") ?? 
                    "[BẮT BUỘC] Cấu hình 3 địa chỉ trạng thái máy: Start (máy đang chạy), Stop (máy dừng), Error (máy lỗi). " +
                    "Hệ thống dùng 3 địa chỉ này để xác định trạng thái hoạt động của dây chuyền trên dashboard.";
                TxtProductsHelp.Text = LanguageManager.GetText("CfgProductsHelp") ??
                    "[BẮT BUỘC] Địa chỉ sản lượng: Quantity (sản lượng tức thời) và Cycle Time (thời gian chu kỳ). Thiếu các địa chỉ này sẽ khiến biểu đồ OEE và sản lượng không hoạt động.";
                TxtQualityHelp.Text = LanguageManager.GetText("CfgQualityHelp") ??
                    "[BẮT BUỘC] Địa chỉ lỗi chất lượng (bit Bool): OK (đạt) và NG (không đạt). Dùng để tính tỉ lệ FPY và NG trên dashboard.";
                TxtAlarmsHelp.Text = LanguageManager.GetText("CfgAlarmsHelp") ?? "Danh sách các địa chỉ báo động lỗi (có thể thêm/xóa/nhập từ file Excel)";

                // Alarm buttons
                BtnAddAlarm.Content = LanguageManager.GetText("CfgBtnAdd") ?? "➕ Thêm";
                BtnDeleteAlarm.Content = LanguageManager.GetText("CfgBtnDelete") ?? "❌ Xóa";
                BtnImportAlarm.Content = LanguageManager.GetText("CfgBtnImportAlarm") ?? "📥 Nhập Excel";
                BtnExportAlarm.Content = LanguageManager.GetText("CfgBtnExportAlarm") ?? "📤 Xuất CSV";
                BtnDownloadAlarmTemplate.Content = LanguageManager.GetText("CfgBtnDownloadTemplate") ?? "📄 Tải mẫu Excel";

                // Columns
                ColStatusParam.Header = LanguageManager.GetText("ColParamName") ?? "Tham số";
                ColStatusAddr.Header = LanguageManager.GetText("ColPlcAddr") ?? "Địa chỉ PLC";
                ColStatusType.Header = LanguageManager.GetText("ColDataType") ?? "Kiểu dữ liệu";
                ColStatusValue.Header = LanguageManager.GetText("ColCurrentValue") ?? "Giá trị hiện tại";

                ColProductParam.Header = LanguageManager.GetText("ColParamName") ?? "Tham số";
                ColProductAddr.Header = LanguageManager.GetText("ColPlcAddr") ?? "Địa chỉ PLC";
                ColProductType.Header = LanguageManager.GetText("ColDataType") ?? "Kiểu dữ liệu";
                ColProductValue.Header = LanguageManager.GetText("ColCurrentValue") ?? "Giá trị hiện tại";

                ColQualityParam.Header = LanguageManager.GetText("ColParamName") ?? "Tham số";
                ColQualityAddr.Header = LanguageManager.GetText("ColPlcAddr") ?? "Địa chỉ PLC";
                ColQualityType.Header = LanguageManager.GetText("ColDataType") ?? "Kiểu dữ liệu";
                ColQualityValue.Header = LanguageManager.GetText("ColCurrentValue") ?? "Giá trị hiện tại";

                ColAlarmAddr.Header = LanguageManager.GetText("ColPlcAddr") ?? "Địa chỉ PLC";
                ColAlarmType.Header = LanguageManager.GetText("ColDataType") ?? "Kiểu dữ liệu";
                ColAlarmName.Header = LanguageManager.GetText("ColAlarmName") ?? "Tên báo động (Error Name)";
                ColAlarmValue.Header = LanguageManager.GetText("ColCurrentValue") ?? "Giá trị hiện tại";

                UpdateTitle();
            }
            catch (Exception)
            {
            }
        }

        private void LoadFromAppConfig(AppConfig config)
        {
            PlcBrand = config.PlcBrand;
            PlcIp = config.PlcIp;
            PlcPort = config.PlcPort;
            ReadIntervalMs = config.ReadIntervalMs;
            ServerHost = config.ServerHost;
            ServerPort = config.ServerPort;
            ServerToken = config.ServerToken;
            TargetSpeed = config.TargetSpeed;
            LocalWebPort = config.LocalWebPort;

            StatusItems.Clear();
            ProductItems.Clear();
            QualityItems.Clear();
            AlarmItems.Clear();

            // Populate fixed status items
            StatusItems.Add(new StatusItemViewModel { Key = "start", Name = "Start", Address = "M20", Type = "Bool" });
            StatusItems.Add(new StatusItemViewModel { Key = "stop", Name = "Stop", Address = "M21", Type = "Bool" });
            StatusItems.Add(new StatusItemViewModel { Key = "error", Name = "Error", Address = "M22", Type = "Bool" });

            ProductItems.Add(new ProductItemViewModel { Key = "count", Name = "Quantity", Address = "D1026", Type = "Int16" });
            ProductItems.Add(new ProductItemViewModel { Key = "time", Name = "Cycle Time", Address = "D1022", Type = "Int16" });
            ProductItems.Add(new ProductItemViewModel { Key = "conveyor_has_product", Name = "Conveyor Has Product", Address = "M1050", Type = "Bool" });
            ProductItems.Add(new ProductItemViewModel { Key = "front_output_complete", Name = "Front Robot Complete", Address = "M1065", Type = "Bool" });
            ProductItems.Add(new ProductItemViewModel { Key = "rear_output_complete", Name = "Rear Robot Complete", Address = "M1068", Type = "Bool" });
            ProductItems.Add(new ProductItemViewModel { Key = "front_robot_count", Name = "Front Robot Count", Address = "R0", Type = "Int16" });
            ProductItems.Add(new ProductItemViewModel { Key = "rear_robot_count", Name = "Rear Robot Count", Address = "R10", Type = "Int16" });

            var items = LocalDbService.Instance.LoadAddressesFromDb();

            // Extract Quality dynamically
            var qualDbItems = items.Where(x => x.Group == "Nhóm chất lượng" || x.Group == "Quality").ToList();
            if (qualDbItems.Count > 0)
            {
                foreach (var item in qualDbItems)
                {
                    QualityItems.Add(new ProductItemViewModel { Key = item.Address.ToLower(), Name = item.Alias, Address = item.Address, Type = item.Type });
                }
            }
            else
            {
                // Fallback default
                QualityItems.Add(new ProductItemViewModel { Key = "ok", Name = "OK (Pass)", Address = "", Type = "Bool" });
                QualityItems.Add(new ProductItemViewModel { Key = "ng", Name = "NG (Fail)", Address = "", Type = "Bool" });
            }

            foreach (var item in items)
            {
                string cleanAlias = (item.Alias ?? "").Trim().ToLower();
                if (cleanAlias == "start")
                {
                    var p = StatusItems.FirstOrDefault(x => x.Key == "start");
                    if (p != null) { p.Address = item.Address; p.Type = item.Type; }
                }
                else if (cleanAlias == "stop")
                {
                    var p = StatusItems.FirstOrDefault(x => x.Key == "stop");
                    if (p != null) { p.Address = item.Address; p.Type = item.Type; }
                }
                else if (cleanAlias == "error")
                {
                    var p = StatusItems.FirstOrDefault(x => x.Key == "error");
                    if (p != null) { p.Address = item.Address; p.Type = item.Type; }
                }
                else if (cleanAlias == "conveyor has product")
                {
                    var p = ProductItems.FirstOrDefault(x => x.Key == "conveyor_has_product");
                    if (p != null) { p.Address = item.Address; p.Type = item.Type; }
                }
                else if (cleanAlias == "front robot complete")
                {
                    var p = ProductItems.FirstOrDefault(x => x.Key == "front_output_complete");
                    if (p != null) { p.Address = item.Address; p.Type = item.Type; }
                }
                else if (cleanAlias == "rear robot complete")
                {
                    var p = ProductItems.FirstOrDefault(x => x.Key == "rear_output_complete");
                    if (p != null) { p.Address = item.Address; p.Type = item.Type; }
                }
                else if (cleanAlias == "quantity")
                {
                    var p = ProductItems.FirstOrDefault(x => x.Key == "count");
                    if (p != null) { p.Address = item.Address; p.Type = item.Type; }
                }
                else if (cleanAlias == "cycle time")
                {
                    var p = ProductItems.FirstOrDefault(x => x.Key == "time");
                    if (p != null) { p.Address = item.Address; p.Type = item.Type; }
                }
                else if (cleanAlias == "front robot count")
                {
                    var p = ProductItems.FirstOrDefault(x => x.Key == "front_robot_count");
                    if (p != null) { p.Address = item.Address; p.Type = item.Type; }
                }
                else if (cleanAlias == "rear robot count")
                {
                    var p = ProductItems.FirstOrDefault(x => x.Key == "rear_robot_count");
                    if (p != null) { p.Address = item.Address; p.Type = item.Type; }
                }
                else if (cleanAlias == "screwdriver count")
                {
                    var p = ProductItems.FirstOrDefault(x => x.Key == "screwdriver_count");
                    if (p != null) { p.Address = item.Address; p.Type = item.Type; }
                }
                else if (cleanAlias == "heatsinks count")
                {
                    var p = ProductItems.FirstOrDefault(x => x.Key == "heatsinks_count");
                    if (p != null) { p.Address = item.Address; p.Type = item.Type; }
                }
                else if (cleanAlias == "current heatsink no")
                {
                    var p = ProductItems.FirstOrDefault(x => x.Key == "current_heatsink_no");
                    if (p != null) { p.Address = item.Address; p.Type = item.Type; }
                }
                else if (cleanAlias == "photo screw count")
                {
                    var p = ProductItems.FirstOrDefault(x => x.Key == "photo_screw_count");
                    if (p != null) { p.Address = item.Address; p.Type = item.Type; }
                }
                else if (cleanAlias == "photo count")
                {
                    var p = ProductItems.FirstOrDefault(x => x.Key == "photo_count");
                    if (p != null) { p.Address = item.Address; p.Type = item.Type; }
                }
                else if (cleanAlias == "robot photo pos")
                {
                    var p = ProductItems.FirstOrDefault(x => x.Key == "robot_photo_pos");
                    if (p != null) { p.Address = item.Address; p.Type = item.Type; }
                }
                else if (cleanAlias == "current screw count")
                {
                    var p = ProductItems.FirstOrDefault(x => x.Key == "current_screw_count");
                    if (p != null) { p.Address = item.Address; p.Type = item.Type; }
                }
                else if (cleanAlias == "current screw no")
                {
                    var p = ProductItems.FirstOrDefault(x => x.Key == "current_screw_no");
                    if (p != null) { p.Address = item.Address; p.Type = item.Type; }
                }
                else if (cleanAlias == "pre-lock count")
                {
                    var p = ProductItems.FirstOrDefault(x => x.Key == "pre_lock_count");
                    if (p != null) { p.Address = item.Address; p.Type = item.Type; }
                }
                else if (item.Group == "Quy trình báo động")
                {
                    AlarmItems.Add(new AlarmItemViewModel { Address = item.Address, Type = item.Type, ErrorName = item.Alias });
                }
            }

            // Setup dirty tracking
            foreach (var item in StatusItems) item.PropertyChanged += (s, e) => _isDirty = true;
            foreach (var item in ProductItems) item.PropertyChanged += (s, e) => _isDirty = true;

            QualityItems.CollectionChanged += (s, e) => {
                _isDirty = true;
                if (e.NewItems != null)
                {
                    foreach (ProductItemViewModel item in e.NewItems)
                        item.PropertyChanged += (s2, e2) => _isDirty = true;
                }
            };
            foreach (var item in QualityItems) item.PropertyChanged += (s, e) => _isDirty = true;

            AlarmItems.CollectionChanged += (s, e) => {
                _isDirty = true;
                if (e.NewItems != null)
                {
                    foreach (AlarmItemViewModel item in e.NewItems)
                        item.PropertyChanged += (s2, e2) => _isDirty = true;
                }
            };
            foreach (var item in AlarmItems) item.PropertyChanged += (s, e) => _isDirty = true;

            _isDirty = false;
            UpdateTitle();
        }

        private void BtnRefresh_Click(object sender, RoutedEventArgs e)
        {
            LoadFromAppConfig(AppConfig.Current);
            CustomMessageBox.Show(
                LanguageManager.GetText("ReloadedConfig") ?? "Đã tải lại cấu hình từ file hiện hành.",
                LanguageManager.GetText("Reload") ?? "Làm mới",
                MessageBoxButton.OK,
                MessageBoxImage.Information);
        }

        private void BtnApply_Click(object sender, RoutedEventArgs e)
        {
            ApplyConfiguration();
        }

        private bool ApplyConfiguration()
        {
            try
            {
                var allItems = new List<DataAddressItem>();
                int index = 1;

                // Add Status
                foreach (var status in StatusItems)
                {
                    allItems.Add(new DataAddressItem { Index = index++, Address = status.Address, Type = status.Type, Alias = status.Name, Group = "Nhóm trạng thái", Enabled = true });
                }

                // Add Products
                foreach (var product in ProductItems)
                {
                    allItems.Add(new DataAddressItem { Index = index++, Address = product.Address, Type = product.Type, Alias = product.Name, Group = "Nhóm sản phẩm", Enabled = true });
                }

                // Add Quality
                foreach (var quality in QualityItems)
                {
                    allItems.Add(new DataAddressItem { Index = index++, Address = quality.Address, Type = quality.Type, Alias = quality.Name, Group = "Nhóm chất lượng", Enabled = true });
                }

                // Add Alarms
                foreach (var alarm in AlarmItems)
                {
                    allItems.Add(new DataAddressItem { Index = index++, Address = alarm.Address, Type = alarm.Type, Alias = alarm.ErrorName, Group = "Quy trình báo động", Enabled = true });
                }

                // No OtherItems

                // Save to Config directly
                LocalDbService.Instance.SaveAddressesToDb(allItems);

                AppConfig.Current.PlcBrand = PlcBrand;
                AppConfig.Current.PlcIp = PlcIp;
                AppConfig.Current.PlcPort = PlcPort;
                AppConfig.Current.ReadIntervalMs = ReadIntervalMs;
                AppConfig.Current.ServerHost = ServerHost;
                AppConfig.Current.ServerPort = ServerPort;
                AppConfig.Current.ServerToken = ServerToken;
                AppConfig.Current.TargetSpeed = TargetSpeed;
                AppConfig.Current.LocalWebPort = LocalWebPort;
                AppConfig.Current.Save();

                // Re-poll
                IEnumerable<string> addressStrings = allItems.Select(x =>
                    $"{x.Address}:{x.Type}:{x.Alias}:{(x.Enabled ? 1 : 0)}:{x.Group}:{x.ActiveValue}:{x.Severity}");
                string readAddressesStr = string.Join(",", addressStrings);

                MqttClientService.Instance.UpdateReadAddresses(readAddressesStr);
                MqttClientService.Instance.ReconnectDefaultPlc();
                MqttClientService.Instance.LoadActiveAddressItems();

                _isDirty = false;
                UpdateTitle();

                return true;
            }
            catch (Exception ex)
            {
                CustomMessageBox.Show(
                    (LanguageManager.GetText("ApplyError") ?? "Lỗi khi áp dụng cấu hình: ") + ex.Message,
                    LanguageManager.GetText("Notice") ?? "Thông báo",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error);
                return false;
            }
        }

        private void MnuNew_Click(object sender, RoutedEventArgs e)
        {
            if (_isDirty)
            {
                var prompt = CustomMessageBox.Show(
                    LanguageManager.GetText("PromptNewConfig") ?? "Cấu hình hiện hành đã thay đổi. Bạn có muốn lưu trước khi tạo mới?",
                    LanguageManager.GetText("NewConfig") ?? "Tạo cấu hình mới",
                    MessageBoxButton.YesNoCancel,
                    MessageBoxImage.Question);
                if (prompt == MessageBoxResult.Cancel) return;
                if (prompt == MessageBoxResult.Yes)
                {
                    if (!SaveToFile()) return;
                }
            }

            _currentFilePath = string.Empty;
            StatusItems.Clear();
            ProductItems.Clear();
            QualityItems.Clear();
            AlarmItems.Clear();

            StatusItems.Add(new StatusItemViewModel { Key = "start", Name = "Start", Address = "M20", Type = "Bool" });
            StatusItems.Add(new StatusItemViewModel { Key = "stop", Name = "Stop", Address = "M21", Type = "Bool" });
            StatusItems.Add(new StatusItemViewModel { Key = "error", Name = "Error", Address = "M22", Type = "Bool" });

            ProductItems.Add(new ProductItemViewModel { Key = "count", Name = "Quantity", Address = "D1026", Type = "Int16" });
            ProductItems.Add(new ProductItemViewModel { Key = "time", Name = "Cycle Time", Address = "D1022", Type = "Int16" });
            ProductItems.Add(new ProductItemViewModel { Key = "conveyor_has_product", Name = "Conveyor Has Product", Address = "M1050", Type = "Bool" });
            ProductItems.Add(new ProductItemViewModel { Key = "front_output_complete", Name = "Front Robot Complete", Address = "M1065", Type = "Bool" });
            ProductItems.Add(new ProductItemViewModel { Key = "rear_output_complete", Name = "Rear Robot Complete", Address = "M1068", Type = "Bool" });
            ProductItems.Add(new ProductItemViewModel { Key = "front_robot_count", Name = "Front Robot Count", Address = "R0", Type = "Int16" });
            ProductItems.Add(new ProductItemViewModel { Key = "rear_robot_count", Name = "Rear Robot Count", Address = "R10", Type = "Int16" });

            // Populate fixed quality items
            QualityItems.Add(new ProductItemViewModel { Key = "ok", Name = "OK (Pass)", Address = "", Type = "Bool" });
            QualityItems.Add(new ProductItemViewModel { Key = "ng", Name = "NG (Fail)", Address = "", Type = "Bool" });

            foreach (var item in StatusItems) item.PropertyChanged += (s, ev) => _isDirty = true;
            foreach (var item in ProductItems) item.PropertyChanged += (s, ev) => _isDirty = true;

            QualityItems.CollectionChanged += (s, ev) => {
                _isDirty = true;
                if (ev.NewItems != null)
                {
                    foreach (ProductItemViewModel item in ev.NewItems)
                        item.PropertyChanged += (s2, ev2) => _isDirty = true;
                }
            };
            foreach (var item in QualityItems) item.PropertyChanged += (s, ev) => _isDirty = true;

            _isDirty = false;
            UpdateTitle();
        }

        private void MnuOpen_Click(object sender, RoutedEventArgs e)
        {
            if (_isDirty)
            {
                var prompt = CustomMessageBox.Show(
                    LanguageManager.GetText("PromptOpenConfig") ?? "Cấu hình hiện hành đã thay đổi. Bạn có muốn lưu trước khi mở file khác?",
                    LanguageManager.GetText("OpenConfigTitle") ?? "Mở cấu hình",
                    MessageBoxButton.YesNoCancel,
                    MessageBoxImage.Question);
                if (prompt == MessageBoxResult.Cancel) return;
                if (prompt == MessageBoxResult.Yes)
                {
                    if (!SaveToFile()) return;
                }
            }

            var dialog = new OpenFileDialog
            {
                Filter = "CPLC files (*.cplc)|*.cplc|JSON files (*.json)|*.json|All files (*.*)|*.*",
                Title = LanguageManager.GetText("OpenConfigTitle") ?? "Mở file cấu hình .cplc"
            };

            if (dialog.ShowDialog() == true)
            {
                try
                {
                    string json = File.ReadAllText(dialog.FileName);
                    var newConfig = JsonSerializer.Deserialize<CplcFileModel>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                    if (newConfig != null)
                    {
                        _currentFilePath = dialog.FileName;
                        LoadFromCplcModel(newConfig);
                        CustomMessageBox.Show(
                            LanguageManager.GetText("OpenConfigSuccess") ?? "Mở file cấu hình .cplc thành công! Hãy nhấn '🚀 Áp dụng' để nạp vào hệ thống.",
                            LanguageManager.GetText("OpenConfigSuccessTitle") ?? "Mở thành công",
                            MessageBoxButton.OK,
                            MessageBoxImage.Information);
                    }
                }
                catch (Exception ex)
                {
                    CustomMessageBox.Show(
                        (LanguageManager.GetText("ErrorReadConfig") ?? "Lỗi đọc file cấu hình: ") + ex.Message,
                        LanguageManager.GetText("Notice") ?? "Thông báo",
                        MessageBoxButton.OK,
                        MessageBoxImage.Error);
                }
            }
        }

        private void LoadFromCplcModel(CplcFileModel model)
        {
            PlcBrand = model.PlcBrand;
            PlcIp = model.PlcIp;
            PlcPort = model.PlcPort;
            ReadIntervalMs = model.ReadIntervalMs;
            ServerHost = model.ServerHost;
            ServerPort = model.ServerPort;
            ServerToken = model.ServerToken;
            TargetSpeed = model.TargetSpeed;
            LocalWebPort = model.LocalWebPort;

            StatusItems.Clear();
            ProductItems.Clear();
            QualityItems.Clear();
            AlarmItems.Clear();

            // Populate fixed status items
            StatusItems.Add(new StatusItemViewModel { Key = "start", Name = "Start", Address = "M20", Type = "Bool" });
            StatusItems.Add(new StatusItemViewModel { Key = "stop", Name = "Stop", Address = "M21", Type = "Bool" });
            StatusItems.Add(new StatusItemViewModel { Key = "error", Name = "Error", Address = "M22", Type = "Bool" });

            // Populate fixed product items
            ProductItems.Add(new ProductItemViewModel { Key = "count", Name = "Quantity", Address = "D1026", Type = "Int16" });
            ProductItems.Add(new ProductItemViewModel { Key = "time", Name = "Cycle Time", Address = "D1022", Type = "Int16" });
            ProductItems.Add(new ProductItemViewModel { Key = "conveyor_has_product", Name = "Conveyor Has Product", Address = "M1050", Type = "Bool" });
            ProductItems.Add(new ProductItemViewModel { Key = "front_output_complete", Name = "Front Robot Complete", Address = "M1065", Type = "Bool" });
            ProductItems.Add(new ProductItemViewModel { Key = "rear_output_complete", Name = "Rear Robot Complete", Address = "M1068", Type = "Bool" });
            ProductItems.Add(new ProductItemViewModel { Key = "front_robot_count", Name = "Front Robot Count", Address = "R0", Type = "Int16" });
            ProductItems.Add(new ProductItemViewModel { Key = "rear_robot_count", Name = "Rear Robot Count", Address = "R10", Type = "Int16" });

            // Extract status
            if (model.Status != null && model.Status.Count > 0)
            {
                var s = model.Status[0];
                if (s.Start != null && !string.IsNullOrEmpty(s.Start.Address))
                {
                    StatusItems[0].Address = s.Start.Address;
                    StatusItems[0].Type = s.Start.Type ?? "Bool";
                }
                if (s.Stop != null && !string.IsNullOrEmpty(s.Stop.Address))
                {
                    StatusItems[1].Address = s.Stop.Address;
                    StatusItems[1].Type = s.Stop.Type ?? "Bool";
                }
                if (s.Error != null && !string.IsNullOrEmpty(s.Error.Address))
                {
                    StatusItems[2].Address = s.Error.Address;
                    StatusItems[2].Type = s.Error.Type ?? "Bool";
                }
                // Try backward compatibility
                if (s.ConveyorHasProduct != null && !string.IsNullOrEmpty(s.ConveyorHasProduct.Address))
                {
                    var item = ProductItems.FirstOrDefault(x => x.Key == "conveyor_has_product");
                    if (item != null) { item.Address = s.ConveyorHasProduct.Address; item.Type = s.ConveyorHasProduct.Type ?? "Bool"; }
                }
                if (s.FrontOutputComplete != null && !string.IsNullOrEmpty(s.FrontOutputComplete.Address))
                {
                    var item = ProductItems.FirstOrDefault(x => x.Key == "front_output_complete");
                    if (item != null) { item.Address = s.FrontOutputComplete.Address; item.Type = s.FrontOutputComplete.Type ?? "Bool"; }
                }
                if (s.RearOutputComplete != null && !string.IsNullOrEmpty(s.RearOutputComplete.Address))
                {
                    var item = ProductItems.FirstOrDefault(x => x.Key == "rear_output_complete");
                    if (item != null) { item.Address = s.RearOutputComplete.Address; item.Type = s.RearOutputComplete.Type ?? "Bool"; }
                }
            }

            // Extract products
            if (model.Products != null && model.Products.Count > 0)
            {
                var p = model.Products[0];
                if (p.Count != null && !string.IsNullOrEmpty(p.Count.Address))
                {
                    var item = ProductItems.FirstOrDefault(x => x.Key == "count");
                    if (item != null) { item.Address = p.Count.Address; item.Type = p.Count.Type ?? "Int16"; }
                }
                if (p.Time != null && !string.IsNullOrEmpty(p.Time.Address))
                {
                    var item = ProductItems.FirstOrDefault(x => x.Key == "time");
                    if (item != null) { item.Address = p.Time.Address; item.Type = p.Time.Type ?? "Int16"; }
                }
                if (p.ConveyorHasProduct != null && !string.IsNullOrEmpty(p.ConveyorHasProduct.Address))
                {
                    var item = ProductItems.FirstOrDefault(x => x.Key == "conveyor_has_product");
                    if (item != null) { item.Address = p.ConveyorHasProduct.Address; item.Type = p.ConveyorHasProduct.Type ?? "Bool"; }
                }
                if (p.FrontOutputComplete != null && !string.IsNullOrEmpty(p.FrontOutputComplete.Address))
                {
                    var item = ProductItems.FirstOrDefault(x => x.Key == "front_output_complete");
                    if (item != null) { item.Address = p.FrontOutputComplete.Address; item.Type = p.FrontOutputComplete.Type ?? "Bool"; }
                }
                if (p.RearOutputComplete != null && !string.IsNullOrEmpty(p.RearOutputComplete.Address))
                {
                    var item = ProductItems.FirstOrDefault(x => x.Key == "rear_output_complete");
                    if (item != null) { item.Address = p.RearOutputComplete.Address; item.Type = p.RearOutputComplete.Type ?? "Bool"; }
                }
                if (p.FrontRobotCount != null && !string.IsNullOrEmpty(p.FrontRobotCount.Address))
                {
                    var item = ProductItems.FirstOrDefault(x => x.Key == "front_robot_count");
                    if (item != null) { item.Address = p.FrontRobotCount.Address; item.Type = p.FrontRobotCount.Type ?? "Int16"; }
                }
                if (p.RearRobotCount != null && !string.IsNullOrEmpty(p.RearRobotCount.Address))
                {
                    var item = ProductItems.FirstOrDefault(x => x.Key == "rear_robot_count");
                    if (item != null) { item.Address = p.RearRobotCount.Address; item.Type = p.RearRobotCount.Type ?? "Int16"; }
                }
                if (p.ScrewdriverCount != null && !string.IsNullOrEmpty(p.ScrewdriverCount.Address))
                {
                    var item = ProductItems.FirstOrDefault(x => x.Key == "screwdriver_count");
                    if (item != null) { item.Address = p.ScrewdriverCount.Address; item.Type = p.ScrewdriverCount.Type ?? "Int16"; }
                }
                if (p.HeatsinksCount != null && !string.IsNullOrEmpty(p.HeatsinksCount.Address))
                {
                    var item = ProductItems.FirstOrDefault(x => x.Key == "heatsinks_count");
                    if (item != null) { item.Address = p.HeatsinksCount.Address; item.Type = p.HeatsinksCount.Type ?? "Int16"; }
                }
                if (p.CurrentHeatsinkNo != null && !string.IsNullOrEmpty(p.CurrentHeatsinkNo.Address))
                {
                    var item = ProductItems.FirstOrDefault(x => x.Key == "current_heatsink_no");
                    if (item != null) { item.Address = p.CurrentHeatsinkNo.Address; item.Type = p.CurrentHeatsinkNo.Type ?? "Int16"; }
                }
                if (p.PhotoScrewCount != null && !string.IsNullOrEmpty(p.PhotoScrewCount.Address))
                {
                    var item = ProductItems.FirstOrDefault(x => x.Key == "photo_screw_count");
                    if (item != null) { item.Address = p.PhotoScrewCount.Address; item.Type = p.PhotoScrewCount.Type ?? "Int16"; }
                }
                if (p.PhotoCount != null && !string.IsNullOrEmpty(p.PhotoCount.Address))
                {
                    var item = ProductItems.FirstOrDefault(x => x.Key == "photo_count");
                    if (item != null) { item.Address = p.PhotoCount.Address; item.Type = p.PhotoCount.Type ?? "Int16"; }
                }
                if (p.RobotPhotoPos != null && !string.IsNullOrEmpty(p.RobotPhotoPos.Address))
                {
                    var item = ProductItems.FirstOrDefault(x => x.Key == "robot_photo_pos");
                    if (item != null) { item.Address = p.RobotPhotoPos.Address; item.Type = p.RobotPhotoPos.Type ?? "Int16"; }
                }
                if (p.CurrentScrewCount != null && !string.IsNullOrEmpty(p.CurrentScrewCount.Address))
                {
                    var item = ProductItems.FirstOrDefault(x => x.Key == "current_screw_count");
                    if (item != null) { item.Address = p.CurrentScrewCount.Address; item.Type = p.CurrentScrewCount.Type ?? "Int16"; }
                }
                if (p.CurrentScrewNo != null && !string.IsNullOrEmpty(p.CurrentScrewNo.Address))
                {
                    var item = ProductItems.FirstOrDefault(x => x.Key == "current_screw_no");
                    if (item != null) { item.Address = p.CurrentScrewNo.Address; item.Type = p.CurrentScrewNo.Type ?? "Int16"; }
                }
                if (p.PreLockCount != null && !string.IsNullOrEmpty(p.PreLockCount.Address))
                {
                    var item = ProductItems.FirstOrDefault(x => x.Key == "pre_lock_count");
                    if (item != null) { item.Address = p.PreLockCount.Address; item.Type = p.PreLockCount.Type ?? "Int16"; }
                }
            }

            // Extract quality
            if (model.Quality != null)
            {
                foreach (var q in model.Quality)
                {
                    if (q != null)
                    {
                        // Handle legacy model compatibility
                        if (q.StudNg != null && !string.IsNullOrEmpty(q.StudNg.Address))
                        {
                            QualityItems.Add(new ProductItemViewModel { Key = "stud_ng", Name = "OK (Pass)", Address = q.StudNg.Address, Type = q.StudNg.Type ?? "Bool" });
                        }
                        if (q.ScrewNg != null && !string.IsNullOrEmpty(q.ScrewNg.Address))
                        {
                            QualityItems.Add(new ProductItemViewModel { Key = "screw_ng", Name = "NG (Fail)", Address = q.ScrewNg.Address, Type = q.ScrewNg.Type ?? "Bool" });
                        }
                        // Handle new dynamic model compatibility
                        if (!string.IsNullOrEmpty(q.Address))
                        {
                            QualityItems.Add(new ProductItemViewModel { Key = q.Address.ToLower(), Name = q.Name ?? "Quality Check", Address = q.Address, Type = q.Type ?? "Bool" });
                        }
                    }
                }
            }

            if (QualityItems.Count == 0)
            {
                QualityItems.Add(new ProductItemViewModel { Key = "ok", Name = "OK (Pass)", Address = "", Type = "Bool" });
                QualityItems.Add(new ProductItemViewModel { Key = "ng", Name = "NG (Fail)", Address = "", Type = "Bool" });
            }

            // Extract alarms
            if (model.BaoDong != null)
            {
                foreach (var item in model.BaoDong)
                {
                    if (!string.IsNullOrEmpty(item.Address))
                        AlarmItems.Add(new AlarmItemViewModel { Address = item.Address, Type = item.Type ?? "Bool", ErrorName = item.ErrorName ?? "Alarm" });
                }
            }

            // Extract others (for backward compatibility)
            if (model.Khac != null)
            {
                foreach (var item in model.Khac)
                {
                    if (string.IsNullOrEmpty(item.Address)) continue;
                    string nameLower = (item.Name ?? "").Trim().ToLower();
                    string matchedKey = null;
                    if (nameLower.Contains("screwdriver count")) matchedKey = "screwdriver_count";
                    else if (nameLower.Contains("heatsinks count")) matchedKey = "heatsinks_count";
                    else if (nameLower.Contains("current heatsink no")) matchedKey = "current_heatsink_no";
                    else if (nameLower.Contains("photo screw count")) matchedKey = "photo_screw_count";
                    else if (nameLower.Contains("photo count")) matchedKey = "photo_count";
                    else if (nameLower.Contains("robot photo pos")) matchedKey = "robot_photo_pos";
                    else if (nameLower.Contains("current screw count")) matchedKey = "current_screw_count";
                    else if (nameLower.Contains("current screw no")) matchedKey = "current_screw_no";
                    else if (nameLower.Contains("pre-lock count")) matchedKey = "pre_lock_count";
                    
                    if (matchedKey != null)
                    {
                        var p = ProductItems.FirstOrDefault(x => x.Key == matchedKey);
                        if (p != null) { p.Address = item.Address; p.Type = item.Type ?? "Int16"; }
                    }
                }
            }

            // Setup dirty tracking
            foreach (var item in StatusItems) item.PropertyChanged += (s, e) => _isDirty = true;
            foreach (var item in ProductItems) item.PropertyChanged += (s, e) => _isDirty = true;
            foreach (var item in QualityItems) item.PropertyChanged += (s, e) => _isDirty = true;
            foreach (var item in AlarmItems) item.PropertyChanged += (s, e) => _isDirty = true;

            _isDirty = false;
            UpdateTitle();
        }

        private void MnuSave_Click(object sender, RoutedEventArgs e)
        {
            SaveToFile();
        }

        private void MnuSaveAs_Click(object sender, RoutedEventArgs e)
        {
            SaveToFile(true);
        }

        private bool SaveToFile(bool forceSaveAs = false)
        {
            if (string.IsNullOrEmpty(_currentFilePath) || forceSaveAs)
            {
                var dialog = new SaveFileDialog
                {
                    Filter = "CPLC files (*.cplc)|*.cplc|JSON files (*.json)|*.json",
                    FileName = "Config.cplc",
                    Title = "Lưu cấu hình .cplc"
                };

                if (dialog.ShowDialog() != true) return false;
                _currentFilePath = dialog.FileName;
            }

            try
            {
                var fileModel = new CplcFileModel
                {
                    MachineId = AppConfig.Current.MachineId,
                    MachineName = AppConfig.Current.MachineName,
                    LineId = AppConfig.Current.LineId,
                    LineName = AppConfig.Current.LineName,
                    LineOrder = AppConfig.Current.LineOrder,
                    PlcBrand = PlcBrand,
                    PlcIp = PlcIp,
                    PlcPort = PlcPort,
                    ReadIntervalMs = ReadIntervalMs,
                    ServerHost = ServerHost,
                    ServerPort = ServerPort,
                    ServerToken = ServerToken,
                    TargetSpeed = TargetSpeed,
                    LocalWebPort = LocalWebPort,
                    Status = new List<CplcStatusModel>(),
                    Products = new List<CplcProductsModel>(),
                    Quality = new List<CplcQualityModel>(),
                    BaoDong = new List<CplcBaoDongModel>(),
                    Khac = new List<CplcKhacModel>()
                };

                // Populate status
                var statusObj = new CplcStatusModel
                {
                    Start = new CplcAddressDetail { Address = StatusItems[0].Address, Type = StatusItems[0].Type },
                    Stop = new CplcAddressDetail { Address = StatusItems[1].Address, Type = StatusItems[1].Type },
                    Error = new CplcAddressDetail { Address = StatusItems[2].Address, Type = StatusItems[2].Type }
                };
                fileModel.Status.Add(statusObj);

                // Populate products
                var prodObj = new CplcProductsModel
                {
                    Count = new CplcAddressDetail { Address = ProductItems.FirstOrDefault(x => x.Key == "count")?.Address ?? "", Type = ProductItems.FirstOrDefault(x => x.Key == "count")?.Type ?? "Int16" },
                    Time = new CplcAddressDetail { Address = ProductItems.FirstOrDefault(x => x.Key == "time")?.Address ?? "", Type = ProductItems.FirstOrDefault(x => x.Key == "time")?.Type ?? "Int16" },
                    ConveyorHasProduct = new CplcAddressDetail { Address = ProductItems.FirstOrDefault(x => x.Key == "conveyor_has_product")?.Address ?? "", Type = ProductItems.FirstOrDefault(x => x.Key == "conveyor_has_product")?.Type ?? "Bool" },
                    FrontOutputComplete = new CplcAddressDetail { Address = ProductItems.FirstOrDefault(x => x.Key == "front_output_complete")?.Address ?? "", Type = ProductItems.FirstOrDefault(x => x.Key == "front_output_complete")?.Type ?? "Bool" },
                    RearOutputComplete = new CplcAddressDetail { Address = ProductItems.FirstOrDefault(x => x.Key == "rear_output_complete")?.Address ?? "", Type = ProductItems.FirstOrDefault(x => x.Key == "rear_output_complete")?.Type ?? "Bool" },
                    FrontRobotCount = new CplcAddressDetail { Address = ProductItems.FirstOrDefault(x => x.Key == "front_robot_count")?.Address ?? "", Type = ProductItems.FirstOrDefault(x => x.Key == "front_robot_count")?.Type ?? "Int16" },
                    RearRobotCount = new CplcAddressDetail { Address = ProductItems.FirstOrDefault(x => x.Key == "rear_robot_count")?.Address ?? "", Type = ProductItems.FirstOrDefault(x => x.Key == "rear_robot_count")?.Type ?? "Int16" },
                    ScrewdriverCount = new CplcAddressDetail { Address = ProductItems.FirstOrDefault(x => x.Key == "screwdriver_count")?.Address ?? "", Type = ProductItems.FirstOrDefault(x => x.Key == "screwdriver_count")?.Type ?? "Int16" },
                    HeatsinksCount = new CplcAddressDetail { Address = ProductItems.FirstOrDefault(x => x.Key == "heatsinks_count")?.Address ?? "", Type = ProductItems.FirstOrDefault(x => x.Key == "heatsinks_count")?.Type ?? "Int16" },
                    CurrentHeatsinkNo = new CplcAddressDetail { Address = ProductItems.FirstOrDefault(x => x.Key == "current_heatsink_no")?.Address ?? "", Type = ProductItems.FirstOrDefault(x => x.Key == "current_heatsink_no")?.Type ?? "Int16" },
                    PhotoScrewCount = new CplcAddressDetail { Address = ProductItems.FirstOrDefault(x => x.Key == "photo_screw_count")?.Address ?? "", Type = ProductItems.FirstOrDefault(x => x.Key == "photo_screw_count")?.Type ?? "Int16" },
                    PhotoCount = new CplcAddressDetail { Address = ProductItems.FirstOrDefault(x => x.Key == "photo_count")?.Address ?? "", Type = ProductItems.FirstOrDefault(x => x.Key == "photo_count")?.Type ?? "Int16" },
                    RobotPhotoPos = new CplcAddressDetail { Address = ProductItems.FirstOrDefault(x => x.Key == "robot_photo_pos")?.Address ?? "", Type = ProductItems.FirstOrDefault(x => x.Key == "robot_photo_pos")?.Type ?? "Int16" },
                    CurrentScrewCount = new CplcAddressDetail { Address = ProductItems.FirstOrDefault(x => x.Key == "current_screw_count")?.Address ?? "", Type = ProductItems.FirstOrDefault(x => x.Key == "current_screw_count")?.Type ?? "Int16" },
                    CurrentScrewNo = new CplcAddressDetail { Address = ProductItems.FirstOrDefault(x => x.Key == "current_screw_no")?.Address ?? "", Type = ProductItems.FirstOrDefault(x => x.Key == "current_screw_no")?.Type ?? "Int16" },
                    PreLockCount = new CplcAddressDetail { Address = ProductItems.FirstOrDefault(x => x.Key == "pre_lock_count")?.Address ?? "", Type = ProductItems.FirstOrDefault(x => x.Key == "pre_lock_count")?.Type ?? "Int16" }
                };
                fileModel.Products.Add(prodObj);

                // Populate quality
                foreach (var item in QualityItems)
                {
                    if (!string.IsNullOrEmpty(item.Address))
                    {
                        fileModel.Quality.Add(new CplcQualityModel
                        {
                            Name = item.Name,
                            Address = item.Address,
                            Type = item.Type
                        });
                    }
                }

                // Populate alarms
                foreach (var item in AlarmItems)
                {
                    fileModel.BaoDong.Add(new CplcBaoDongModel { Address = item.Address, Type = item.Type, ErrorName = item.ErrorName });
                }

                // Populate other (no longer needed, list is kept empty)

                var jsonOptions = new JsonSerializerOptions { WriteIndented = true };
                string json = JsonSerializer.Serialize(fileModel, jsonOptions);
                File.WriteAllText(_currentFilePath, json, System.Text.Encoding.UTF8);

                _isDirty = false;
                UpdateTitle();
                return true;
            }
            catch (Exception ex)
            {
                CustomMessageBox.Show(
                    (LanguageManager.GetText("SaveFileError") ?? "Lỗi khi ghi file: ") + ex.Message,
                    LanguageManager.GetText("Notice") ?? "Thông báo",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error);
                return false;
            }
        }

        private void MnuImportExcel_Click(object sender, RoutedEventArgs e)
        {
            BtnImportAlarm_Click(sender, e);
        }

        private void MnuExportCsv_Click(object sender, RoutedEventArgs e)
        {
            BtnExportAlarm_Click(sender, e);
        }

        // Alarm Items Management
        private void BtnAddAlarm_Click(object sender, RoutedEventArgs e)
        {
            AlarmItems.Add(new AlarmItemViewModel { Address = "M100", Type = "Bool", ErrorName = "New Alarm" });
        }

        private void BtnDeleteAlarm_Click(object sender, RoutedEventArgs e)
        {
            if (GridAlarms.SelectedItem is AlarmItemViewModel selected)
            {
                AlarmItems.Remove(selected);
            }
            else
            {
                CustomMessageBox.Show(
                    LanguageManager.GetText("SelectAlarmDelete") ?? "Chọn một dòng báo động để xóa!",
                    LanguageManager.GetText("Notice") ?? "Thông báo",
                    MessageBoxButton.OK,
                    MessageBoxImage.Information);
            }
        }

        // Quality Items Management
        private void BtnAddQuality_Click(object sender, RoutedEventArgs e)
        {
            QualityItems.Add(new ProductItemViewModel { Key = Guid.NewGuid().ToString("N")[..8], Name = "NG (Lỗi)", Address = "M100", Type = "Bool" });
        }

        private void BtnDeleteQuality_Click(object sender, RoutedEventArgs e)
        {
            if (GridQuality.SelectedItem is ProductItemViewModel selected)
            {
                QualityItems.Remove(selected);
            }
            else
            {
                CustomMessageBox.Show(
                    LanguageManager.GetText("SelectQualityDelete") ?? "Chọn một dòng chất lượng để xóa!",
                    LanguageManager.GetText("Notice") ?? "Thông báo",
                    MessageBoxButton.OK,
                    MessageBoxImage.Information);
            }
        }

        private void BtnImportAlarm_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var openDialog = new OpenFileDialog
                {
                    Filter = "CSV and Excel files (*.csv, *.xlsx, *.xls)|*.csv;*.xlsx;*.xls|CSV files (*.csv)|*.csv|Excel files (*.xlsx, *.xls)|*.xlsx;*.xls",
                    Title = "Nhập danh sách báo động"
                };

                if (openDialog.ShowDialog() == true)
                {
                    string filePath = openDialog.FileName;
                    string ext = System.IO.Path.GetExtension(filePath).ToLower();
                    if (ext == ".csv")
                    {
                        var lines = File.ReadAllLines(filePath);
                        if (lines.Length <= 1) return;

                        AlarmItems.Clear();
                        for (int i = 1; i < lines.Length; i++)
                        {
                            var line = lines[i];
                            if (string.IsNullOrWhiteSpace(line)) continue;

                            var parts = ParseCsvLine(line);
                            if (parts.Count >= 3)
                            {
                                var addr = parts[0];
                                var type = parts[1];
                                var errorName = parts[2];

                                // Filter out unused / blank description placeholders (where alias is equal to the address name or empty)
                                string cleanName = errorName.Trim().ToLower();
                                string cleanAddr = addr.Trim().ToLower();
                                if (string.IsNullOrEmpty(cleanName) || cleanName == cleanAddr)
                                    continue;

                                AlarmItems.Add(new AlarmItemViewModel
                                {
                                    Address = addr,
                                    Type = type,
                                    ErrorName = errorName
                                });
                            }
                        }
                        CustomMessageBox.Show("Nhập danh sách báo động thành công!", "Nhập file", MessageBoxButton.OK, MessageBoxImage.Information);
                    }
                    else
                    {
                        // Excel import
                        string activeMachine = AppConfig.Current.MachineId;
                        var importWindow = new ExcelImportWindow(activeMachine, () =>
                        {
                            LoadFromAppConfig(AppConfig.Current);
                        });
                        importWindow.Owner = this;
                        importWindow.ShowDialog();
                    }
                }
            }
            catch (Exception ex)
            {
                CustomMessageBox.Show("Lỗi nhập file: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void BtnExportAlarm_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var dialog = new SaveFileDialog
                {
                    Filter = "CSV files (*.csv)|*.csv",
                    FileName = "Alarm_Export.csv",
                    Title = LanguageManager.GetText("CfgBtnExportAlarm") ?? "Xuất danh sách báo động"
                };

                if (dialog.ShowDialog() == true)
                {
                    var lines = new List<string> { "address,type,error_name" };
                    foreach (var item in AlarmItems)
                    {
                        lines.Add(string.Format("\"{0}\",\"{1}\",\"{2}\"", item.Address, item.Type, item.ErrorName));
                    }
                    File.WriteAllLines(dialog.FileName, lines, System.Text.Encoding.UTF8);
                    CustomMessageBox.Show("Xuất danh sách báo động thành công!", "Xuất file", MessageBoxButton.OK, MessageBoxImage.Information);
                }
            }
            catch (Exception ex)
            {
                CustomMessageBox.Show("Lỗi xuất file: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void BtnImportQuality_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var dialog = new OpenFileDialog
                {
                    Filter = "CSV files (*.csv)|*.csv",
                    Title = "Nhập danh sách chất lượng"
                };

                if (dialog.ShowDialog() == true)
                {
                    var lines = File.ReadAllLines(dialog.FileName);
                    if (lines.Length <= 1) return;

                    QualityItems.Clear();
                    for (int i = 1; i < lines.Length; i++)
                    {
                        var line = lines[i];
                        if (string.IsNullOrWhiteSpace(line)) continue;

                        var parts = ParseCsvLine(line);
                        if (parts.Count >= 3)
                        {
                            var addr = parts[0];
                            var type = parts[1];
                            var name = parts[2];

                            // Filter out unused / blank description placeholders (where alias is equal to the address name or empty)
                            string cleanName = name.Trim().ToLower();
                            string cleanAddr = addr.Trim().ToLower();
                            if (string.IsNullOrEmpty(cleanName) || cleanName == cleanAddr)
                                continue;

                            QualityItems.Add(new ProductItemViewModel
                            {
                                Key = Guid.NewGuid().ToString("N")[..8],
                                Address = addr,
                                Type = type,
                                Name = name
                            });
                        }
                    }
                    CustomMessageBox.Show("Nhập danh sách chất lượng thành công!", "Nhập file", MessageBoxButton.OK, MessageBoxImage.Information);
                }
            }
            catch (Exception ex)
            {
                CustomMessageBox.Show("Lỗi nhập file: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void BtnExportQuality_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var dialog = new SaveFileDialog
                {
                    Filter = "CSV files (*.csv)|*.csv",
                    FileName = "Quality_Export.csv",
                    Title = "Xuất danh sách chất lượng"
                };

                if (dialog.ShowDialog() == true)
                {
                    var lines = new List<string> { "address,type,name" };
                    foreach (var item in QualityItems)
                    {
                        lines.Add(string.Format("\"{0}\",\"{1}\",\"{2}\"", item.Address, item.Type, item.Name));
                    }
                    File.WriteAllLines(dialog.FileName, lines, System.Text.Encoding.UTF8);
                    CustomMessageBox.Show("Xuất danh sách chất lượng thành công!", "Xuất file", MessageBoxButton.OK, MessageBoxImage.Information);
                }
            }
            catch (Exception ex)
            {
                CustomMessageBox.Show("Lỗi xuất file: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private List<string> ParseCsvLine(string line)
        {
            var parts = new List<string>();
            bool inQuotes = false;
            var current = new System.Text.StringBuilder();
            for (int i = 0; i < line.Length; i++)
            {
                char c = line[i];
                if (c == '\"')
                {
                    inQuotes = !inQuotes;
                }
                else if (c == ',' && !inQuotes)
                {
                    parts.Add(current.ToString().Trim('\"', ' '));
                    current.Clear();
                }
                else
                {
                    current.Append(c);
                }
            }
            parts.Add(current.ToString().Trim('\"', ' '));
            return parts;
        }

        private void BtnDownloadAlarmTemplate_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var dialog = new SaveFileDialog
                {
                    Filter = "CSV files (*.csv)|*.csv",
                    FileName = "Alarm_Template.csv",
                    Title = "Tải mẫu Excel/CSV báo động"
                };

                if (dialog.ShowDialog() == true)
                {
                    var lines = new List<string> {
                        "address,type,error_name",
                        "M60,Bool,Lỗi kẹt hàng (Jam Alarm)",
                        "M61,Bool,Hết thời gian băng tải (Conveyor Timeout)"
                    };
                    File.WriteAllLines(dialog.FileName, lines, System.Text.Encoding.UTF8);
                    CustomMessageBox.Show("Đã tải mẫu CSV thành công!", "Tải mẫu", MessageBoxButton.OK, MessageBoxImage.Information);
                }
            }
            catch (Exception ex)
            {
                CustomMessageBox.Show("Lỗi tải mẫu: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        // Other Items Management (Removed)

        private async void BtnTestRead_Click(object sender, RoutedEventArgs e)
        {
            // Try to test read status start address
            string address = StatusItems[0].Address;
            string type = StatusItems[0].Type;

            BtnTestRead.IsEnabled = false;
            TxtStatus.Text = $"Đang đọc thử {address}...";

            try
            {
                var plc = MqttClientService.Instance.PlcInstance;
                if (plc == null)
                {
                    CustomMessageBox.Show("PLC chưa kết nối!", "Lỗi", MessageBoxButton.OK, MessageBoxImage.Error);
                    TxtStatus.Text = "Lỗi: PLC chưa kết nối";
                    BtnTestRead.IsEnabled = true;
                    return;
                }

                object? val = null;
                bool success = false;
                string error = "";

                await System.Threading.Tasks.Task.Run(() =>
                {
                    switch (type.ToLower())
                    {
                        case "bool":
                            var r1 = plc.ReadBool(address);
                            success = r1.IsSuccess;
                            val = r1.Content;
                            error = r1.Message;
                            break;
                        case "int16":
                            var r2 = plc.ReadInt16(address);
                            success = r2.IsSuccess;
                            val = r2.Content;
                            error = r2.Message;
                            break;
                        case "uint16":
                            var r3 = plc.ReadUInt16(address);
                            success = r3.IsSuccess;
                            val = r3.Content;
                            error = r3.Message;
                            break;
                        case "int32":
                            var r4 = plc.ReadInt32(address);
                            success = r4.IsSuccess;
                            val = r4.Content;
                            error = r4.Message;
                            break;
                        case "uint32":
                            var r5 = plc.ReadUInt32(address);
                            success = r5.IsSuccess;
                            val = r5.Content;
                            error = r5.Message;
                            break;
                        case "float":
                            var r6 = plc.ReadFloat(address);
                            success = r6.IsSuccess;
                            val = r6.Content;
                            error = r6.Message;
                            break;
                        case "double":
                            var r7 = plc.ReadDouble(address);
                            success = r7.IsSuccess;
                            val = r7.Content;
                            error = r7.Message;
                            break;
                        case "string":
                            var r8 = plc.ReadString(address, 10);
                            success = r8.IsSuccess;
                            val = r8.Content;
                            error = r8.Message;
                            break;
                    }
                });

                if (success)
                {
                    CustomMessageBox.Show($"Đọc thành công địa chỉ {address}!\nGiá trị: {val}", "Đọc thử", MessageBoxButton.OK, MessageBoxImage.Information);
                    TxtStatus.Text = "Đọc thử thành công.";
                }
                else
                {
                    CustomMessageBox.Show($"Đọc địa chỉ {address} thất bại!\nChi tiết: {error}", "Lỗi đọc thử", MessageBoxButton.OK, MessageBoxImage.Warning);
                    TxtStatus.Text = "Đọc thử thất bại.";
                }
            }
            catch (Exception ex)
            {
                CustomMessageBox.Show("Lỗi khi đọc thử: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Error);
                TxtStatus.Text = "Lỗi ngoại lệ đọc thử.";
            }
            finally
            {
                BtnTestRead.IsEnabled = true;
            }
        }

        private void MqttClientService_OnPlcDataRead(Dictionary<string, object> plcData)
        {
            Dispatcher.BeginInvoke(new Action(() =>
            {
                try
                {
                    bool isPlcConnected = MqttClientService.Instance.IsPlcConnected;
                    var latestErrors = MqttClientService.Instance.LatestPlcErrors;

                    foreach (var item in StatusItems)
                        UpdateViewModelValue(item, plcData, isPlcConnected, latestErrors);

                    foreach (var item in ProductItems)
                        UpdateViewModelValue(item, plcData, isPlcConnected, latestErrors);

                    foreach (var item in QualityItems)
                        UpdateViewModelValue(item, plcData, isPlcConnected, latestErrors);

                    foreach (var item in AlarmItems)
                        UpdateViewModelValue(item, plcData, isPlcConnected, latestErrors);

                    // No OtherItems update
                }
                catch { }
            }));
        }

        private void UpdateViewModelValue(StatusItemViewModel item, Dictionary<string, object> plcData, bool isPlcConnected, Dictionary<string, string> latestErrors)
        {
            if (item == null) return;
            string addr = item.Address ?? "";
            string type = item.Type ?? "";
            string key = (addr + ":" + type).ToLower();
            if (plcData != null && plcData.TryGetValue(key, out var val))
            {
                item.Value = val is bool b ? (b ? "ON (True)" : "OFF (False)") : (val?.ToString() ?? "null");
            }
            else if (!isPlcConnected)
            {
                item.Value = "Mất kết nối";
            }
            else
            {
                item.Value = (latestErrors != null && latestErrors.TryGetValue(key, out var err)) ? $"Lỗi: {err}" : "Lỗi đọc";
            }
        }

        private void UpdateViewModelValue(ProductItemViewModel item, Dictionary<string, object> plcData, bool isPlcConnected, Dictionary<string, string> latestErrors)
        {
            if (item == null) return;
            string addr = item.Address ?? "";
            string type = item.Type ?? "";
            string key = (addr + ":" + type).ToLower();
            if (plcData != null && plcData.TryGetValue(key, out var val))
            {
                item.Value = val is bool b ? (b ? "ON (True)" : "OFF (False)") : (val?.ToString() ?? "null");
            }
            else if (!isPlcConnected)
            {
                item.Value = "Mất kết nối";
            }
            else
            {
                item.Value = (latestErrors != null && latestErrors.TryGetValue(key, out var err)) ? $"Lỗi: {err}" : "Lỗi đọc";
            }
        }

        private void UpdateViewModelValue(AlarmItemViewModel item, Dictionary<string, object> plcData, bool isPlcConnected, Dictionary<string, string> latestErrors)
        {
            if (item == null) return;
            string addr = item.Address ?? "";
            string type = item.Type ?? "";
            string key = (addr + ":" + type).ToLower();
            if (plcData != null && plcData.TryGetValue(key, out var val))
            {
                item.Value = val is bool b ? (b ? "ON (True)" : "OFF (False)") : (val?.ToString() ?? "null");
            }
            else if (!isPlcConnected)
            {
                item.Value = "Mất kết nối";
            }
            else
            {
                item.Value = (latestErrors != null && latestErrors.TryGetValue(key, out var err)) ? $"Lỗi: {err}" : "Lỗi đọc";
            }
        }

        private void UpdateViewModelValue(OtherItemViewModel item, Dictionary<string, object> plcData, bool isPlcConnected, Dictionary<string, string> latestErrors)
        {
            if (item == null) return;
            string addr = item.Address ?? "";
            string type = item.Type ?? "";
            string key = (addr + ":" + type).ToLower();
            if (plcData != null && plcData.TryGetValue(key, out var val))
            {
                item.Value = val is bool b ? (b ? "ON (True)" : "OFF (False)") : (val?.ToString() ?? "null");
            }
            else if (!isPlcConnected)
            {
                item.Value = "Mất kết nối";
            }
            else
            {
                item.Value = (latestErrors != null && latestErrors.TryGetValue(key, out var err)) ? $"Lỗi: {err}" : "Lỗi đọc";
            }
        }
    }

    // ViewModel classes for the 4 tabs configuration grids
    public class StatusItemViewModel : INotifyPropertyChanged
    {
        private string _address = string.Empty;
        private string _type = "Bool";
        private string _value = "Chờ đọc...";

        public string Key { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;

        public string Address
        {
            get => _address;
            set { _address = value; OnPropertyChanged(); }
        }

        public string Type
        {
            get => _type;
            set { _type = value; OnPropertyChanged(); }
        }

        public string Value
        {
            get => _value;
            set { _value = value; OnPropertyChanged(); }
        }

        public event PropertyChangedEventHandler? PropertyChanged;
        protected void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }
    }

    public class ProductItemViewModel : INotifyPropertyChanged
    {
        private string _address = string.Empty;
        private string _type = "Int16";
        private string _value = "Chờ đọc...";

        public string Key { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;

        public string Address
        {
            get => _address;
            set { _address = value; OnPropertyChanged(); }
        }

        public string Type
        {
            get => _type;
            set { _type = value; OnPropertyChanged(); }
        }

        public string Value
        {
            get => _value;
            set { _value = value; OnPropertyChanged(); }
        }

        public event PropertyChangedEventHandler? PropertyChanged;
        protected void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }
    }

    public class AlarmItemViewModel : INotifyPropertyChanged
    {
        private string _address = string.Empty;
        private string _type = "Bool";
        private string _errorName = string.Empty;
        private string _value = "Chờ đọc...";

        public string Address
        {
            get => _address;
            set { _address = value; OnPropertyChanged(); }
        }

        public string Type
        {
            get => _type;
            set { _type = value; OnPropertyChanged(); }
        }

        public string ErrorName
        {
            get => _errorName;
            set { _errorName = value; OnPropertyChanged(); }
        }

        public string Value
        {
            get => _value;
            set { _value = value; OnPropertyChanged(); }
        }

        public event PropertyChangedEventHandler? PropertyChanged;
        protected void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }
    }

    public class OtherItemViewModel : INotifyPropertyChanged
    {
        private string _name = string.Empty;
        private string _address = string.Empty;
        private string _type = "Int16";
        private string _value = "Chờ đọc...";

        public string Name
        {
            get => _name;
            set { _name = value; OnPropertyChanged(); }
        }

        public string Address
        {
            get => _address;
            set { _address = value; OnPropertyChanged(); }
        }

        public string Type
        {
            get => _type;
            set { _type = value; OnPropertyChanged(); }
        }

        public string Value
        {
            get => _value;
            set { _value = value; OnPropertyChanged(); }
        }

        public event PropertyChangedEventHandler? PropertyChanged;
        protected void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }
    }

    // JSON file serialization models
    public class CplcFileModel
    {
        [System.Text.Json.Serialization.JsonPropertyName("machine_id")]
        public string MachineId { get; set; } = string.Empty;

        [System.Text.Json.Serialization.JsonPropertyName("machine_name")]
        public string MachineName { get; set; } = string.Empty;

        [System.Text.Json.Serialization.JsonPropertyName("line_id")]
        public string LineId { get; set; } = string.Empty;

        [System.Text.Json.Serialization.JsonPropertyName("line_name")]
        public string LineName { get; set; } = string.Empty;

        [System.Text.Json.Serialization.JsonPropertyName("line_order")]
        public int LineOrder { get; set; }

        [System.Text.Json.Serialization.JsonPropertyName("plc_brand")]
        public string PlcBrand { get; set; } = string.Empty;

        [System.Text.Json.Serialization.JsonPropertyName("plc_ip")]
        public string PlcIp { get; set; } = string.Empty;

        [System.Text.Json.Serialization.JsonPropertyName("plc_port")]
        public int PlcPort { get; set; }

        [System.Text.Json.Serialization.JsonPropertyName("read_interval_ms")]
        public int ReadIntervalMs { get; set; }

        [System.Text.Json.Serialization.JsonPropertyName("server_host")]
        public string ServerHost { get; set; } = string.Empty;

        [System.Text.Json.Serialization.JsonPropertyName("server_port")]
        public int ServerPort { get; set; }

        [System.Text.Json.Serialization.JsonPropertyName("server_token")]
        public string ServerToken { get; set; } = string.Empty;

        [System.Text.Json.Serialization.JsonPropertyName("target_speed")]
        public int TargetSpeed { get; set; }

        [System.Text.Json.Serialization.JsonPropertyName("local_web_port")]
        public int LocalWebPort { get; set; }

        [System.Text.Json.Serialization.JsonPropertyName("status")]
        public List<CplcStatusModel> Status { get; set; } = new List<CplcStatusModel>();

        [System.Text.Json.Serialization.JsonPropertyName("products")]
        public List<CplcProductsModel> Products { get; set; } = new List<CplcProductsModel>();

        [System.Text.Json.Serialization.JsonPropertyName("quality")]
        public List<CplcQualityModel> Quality { get; set; } = new List<CplcQualityModel>();

        [System.Text.Json.Serialization.JsonPropertyName("bao_dong")]
        public List<CplcBaoDongModel> BaoDong { get; set; } = new List<CplcBaoDongModel>();

        [System.Text.Json.Serialization.JsonPropertyName("khac")]
        public List<CplcKhacModel> Khac { get; set; } = new List<CplcKhacModel>();
    }

    public class CplcStatusModel
    {
        [System.Text.Json.Serialization.JsonPropertyName("start")]
        public CplcAddressDetail Start { get; set; } = new CplcAddressDetail();

        [System.Text.Json.Serialization.JsonPropertyName("stop")]
        public CplcAddressDetail Stop { get; set; } = new CplcAddressDetail();

        [System.Text.Json.Serialization.JsonPropertyName("error")]
        public CplcAddressDetail Error { get; set; } = new CplcAddressDetail();

        [System.Text.Json.Serialization.JsonPropertyName("conveyor_has_product")]
        public CplcAddressDetail? ConveyorHasProduct { get; set; }

        [System.Text.Json.Serialization.JsonPropertyName("front_output_complete")]
        public CplcAddressDetail? FrontOutputComplete { get; set; }

        [System.Text.Json.Serialization.JsonPropertyName("rear_output_complete")]
        public CplcAddressDetail? RearOutputComplete { get; set; }
    }

    public class CplcAddressDetail
    {
        [System.Text.Json.Serialization.JsonPropertyName("address")]
        public string Address { get; set; } = string.Empty;

        [System.Text.Json.Serialization.JsonPropertyName("type")]
        public string Type { get; set; } = string.Empty;
    }

    public class CplcProductsModel
    {
        [System.Text.Json.Serialization.JsonPropertyName("count")]
        public CplcAddressDetail Count { get; set; } = new CplcAddressDetail();

        [System.Text.Json.Serialization.JsonPropertyName("time")]
        public CplcAddressDetail Time { get; set; } = new CplcAddressDetail();

        [System.Text.Json.Serialization.JsonPropertyName("conveyor_has_product")]
        public CplcAddressDetail? ConveyorHasProduct { get; set; }

        [System.Text.Json.Serialization.JsonPropertyName("front_output_complete")]
        public CplcAddressDetail? FrontOutputComplete { get; set; }

        [System.Text.Json.Serialization.JsonPropertyName("rear_output_complete")]
        public CplcAddressDetail? RearOutputComplete { get; set; }

        [System.Text.Json.Serialization.JsonPropertyName("front_robot_count")]
        public CplcAddressDetail FrontRobotCount { get; set; } = new CplcAddressDetail();

        [System.Text.Json.Serialization.JsonPropertyName("rear_robot_count")]
        public CplcAddressDetail RearRobotCount { get; set; } = new CplcAddressDetail();

        [System.Text.Json.Serialization.JsonPropertyName("screwdriver_count")]
        public CplcAddressDetail? ScrewdriverCount { get; set; }

        [System.Text.Json.Serialization.JsonPropertyName("heatsinks_count")]
        public CplcAddressDetail? HeatsinksCount { get; set; }

        [System.Text.Json.Serialization.JsonPropertyName("current_heatsink_no")]
        public CplcAddressDetail? CurrentHeatsinkNo { get; set; }

        [System.Text.Json.Serialization.JsonPropertyName("photo_screw_count")]
        public CplcAddressDetail? PhotoScrewCount { get; set; }

        [System.Text.Json.Serialization.JsonPropertyName("photo_count")]
        public CplcAddressDetail? PhotoCount { get; set; }

        [System.Text.Json.Serialization.JsonPropertyName("robot_photo_pos")]
        public CplcAddressDetail? RobotPhotoPos { get; set; }

        [System.Text.Json.Serialization.JsonPropertyName("current_screw_count")]
        public CplcAddressDetail? CurrentScrewCount { get; set; }

        [System.Text.Json.Serialization.JsonPropertyName("current_screw_no")]
        public CplcAddressDetail? CurrentScrewNo { get; set; }

        [System.Text.Json.Serialization.JsonPropertyName("pre_lock_count")]
        public CplcAddressDetail? PreLockCount { get; set; }
    }

    public class CplcQualityModel
    {
        [System.Text.Json.Serialization.JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [System.Text.Json.Serialization.JsonPropertyName("address")]
        public string Address { get; set; } = string.Empty;

        [System.Text.Json.Serialization.JsonPropertyName("type")]
        public string Type { get; set; } = string.Empty;

        [System.Text.Json.Serialization.JsonPropertyName("stud_ng")]
        public CplcAddressDetail? StudNg { get; set; }

        [System.Text.Json.Serialization.JsonPropertyName("screw_ng")]
        public CplcAddressDetail? ScrewNg { get; set; }
    }

    public class CplcBaoDongModel
    {
        [System.Text.Json.Serialization.JsonPropertyName("address")]
        public string Address { get; set; } = string.Empty;

        [System.Text.Json.Serialization.JsonPropertyName("type")]
        public string Type { get; set; } = string.Empty;

        [System.Text.Json.Serialization.JsonPropertyName("error_name")]
        public string ErrorName { get; set; } = string.Empty;
    }

    public class CplcKhacModel
    {
        [System.Text.Json.Serialization.JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [System.Text.Json.Serialization.JsonPropertyName("address")]
        public string Address { get; set; } = string.Empty;

        [System.Text.Json.Serialization.JsonPropertyName("type")]
        public string Type { get; set; } = string.Empty;
    }
}


