using PLC.Views;
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.IO;
using System.Linq;
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
    public partial class PlcAddressConfigPage : UserControl, ILocalizable
    {
        public ObservableCollection<StatusItemViewModel> StatusItems { get; } = new ObservableCollection<StatusItemViewModel>();
        public ObservableCollection<ProductItemViewModel> ProductItems { get; } = new ObservableCollection<ProductItemViewModel>();
        public ObservableCollection<AlarmItemViewModel> AlarmItems { get; } = new ObservableCollection<AlarmItemViewModel>();

        public string PlcBrand { get; set; } = "MelsecMcNet";
        public string PlcIp { get; set; } = "192.168.1.100";
        public int PlcPort { get; set; } = 6000;
        public int ReadIntervalMs { get; set; } = 5000;
        public string ServerHost { get; set; } = "127.0.0.1";
        public int ServerPort { get; set; } = 9999;
        public string ServerToken { get; set; } = "";
        public int TargetSpeed { get; set; } = 60;
        public int LocalWebPort { get; set; } = 8080;

        public PlcAddressConfigPage()
        {
            InitializeComponent();

            GridStatus.ItemsSource = StatusItems;
            GridProducts.ItemsSource = ProductItems;
            GridAlarms.ItemsSource = AlarmItems;

            var types = new List<string> { "Bool", "Int16", "UInt16", "Int32", "UInt32", "Float", "Double", "String" };
            ColStatusType.ItemsSource = types;
            ColProductType.ItemsSource = types;
            ColAlarmType.ItemsSource = types;

            // Load machine list
            LoadMachineList();

            this.Loaded += PlcAddressConfigPage_Loaded;

            BtnRefresh.Click += BtnRefresh_Click;
            BtnApply.Click += BtnApply_Click;
            BtnTestRead.Click += BtnTestRead_Click;
            BtnImport.Click += BtnImport_Click;

            BtnAddAlarm.Click += BtnAddAlarm_Click;
            BtnDeleteAlarm.Click += BtnDeleteAlarm_Click;
            BtnImportAlarm.Click += BtnImportAlarm_Click;
            BtnExportAlarm.Click += BtnExportAlarm_Click;
            BtnDownloadAlarmTemplate.Click += BtnDownloadAlarmTemplate_Click;



            MqttClientService.OnPlcDataRead += MqttClientService_OnPlcDataRead;
        }

        private void PlcAddressConfigPage_Loaded(object sender, RoutedEventArgs e)
        {
            LoadFromAppConfig(AppConfig.Current);
            TranslateUI();
            MqttClientService_OnPlcDataRead(MqttClientService.Instance.LatestPlcData);

            if (RoleManager.CurrentRole == UserRole.Engineer)
            {
                BtnDeleteAlarm.IsEnabled = false;
            }
            else
            {
                BtnDeleteAlarm.IsEnabled = true;
            }
        }

        private void MqttClientService_OnPlcDataRead(Dictionary<string, object> data)
        {
            if (data == null) return;
            Dispatcher.Invoke(() =>
            {
                try
                {
                    foreach (var item in StatusItems)
                    {
                        if (data.TryGetValue(item.Name, out var val) || data.TryGetValue(item.Key, out val))
                        {
                            item.Value = val?.ToString() ?? "";
                        }
                    }
                    foreach (var item in ProductItems)
                    {
                        if (data.TryGetValue(item.Name, out var val) || data.TryGetValue(item.Key, out val))
                        {
                            item.Value = val?.ToString() ?? "";
                        }
                    }

                    foreach (var item in AlarmItems)
                    {
                        if (data.TryGetValue(item.ErrorName, out var val))
                        {
                            item.Value = val?.ToString() ?? "";
                        }
                    }
                    // No OtherItems update
                }
                catch { }
            });
        }

        private void LoadMachineList()
        {
            try
            {
                CboMachineList.Items.Clear();
                var storage = new MachineStorageService();
                var machines = storage.ListMachines();

                foreach (var m in machines)
                {
                    CboMachineList.Items.Add(new
                    {
                        Id = m.MachineId,
                        Display = $"{m.MachineName} ({m.PlcIp})"
                    });
                }

                // Add "new machine" option at end
                CboMachineList.Items.Add(new { Id = "__new__", Display = "+ Nhập máy mới..." });

                if (CboMachineList.Items.Count > 0)
                {
                    string currentMachineId = AppConfig.Current.MachineId;
                    bool found = false;
                    for (int i = 0; i < CboMachineList.Items.Count; i++)
                    {
                        dynamic item = CboMachineList.Items[i];
                        if (item.Id == currentMachineId)
                        {
                            CboMachineList.SelectedIndex = i;
                            found = true;
                            break;
                        }
                    }
                    if (!found && CboMachineList.Items.Count > 1)
                        CboMachineList.SelectedIndex = 0;
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine("[PlcAddressConfigPage] LoadMachineList: " + ex.Message);
            }
        }

        private void CboMachineList_SelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
        {
            if (CboMachineList.SelectedItem == null) return;
            dynamic selected = CboMachineList.SelectedItem;

            if (selected.Id == "__new__")
            {
                // Open import dialog
                OpenImportDialog();
                return;
            }

            string machineId = selected.Id;
            var storage = new MachineStorageService();
            var config = storage.LoadMachine(machineId);
            if (config == null) return;

            // Apply to AppConfig
            AppConfig.Current.MachineId = config.MachineId;
            AppConfig.Current.MachineName = config.MachineName;
            if (config.Plc != null)
            {
                AppConfig.Current.PlcBrand = config.Plc.Brand;
                AppConfig.Current.PlcIp = config.Plc.Ip;
                AppConfig.Current.PlcPort = config.Plc.Port;
            }
            AppConfig.Current.ReadAddresses = ""; // Will be rebuilt from imported config
            AppConfig.Current.Save();
            AppConfig.Reload();

            LoadFromAppConfig(AppConfig.Current);
        }

        private void BtnImport_Click(object sender, RoutedEventArgs e)
        {
            OpenImportDialog();
        }

        private void OpenImportDialog()
        {
            var dialog = new ConfigImportWindow(AppConfig.Current.MachineId);
            if (Application.Current.MainWindow != null)
                dialog.Owner = Application.Current.MainWindow;

            if (dialog.ShowDialog() == true)
            {
                // Reload machine list and config
                LoadMachineList();
                LoadFromAppConfig(AppConfig.Current);
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
            AlarmItems.Clear();

            // === FIXED: 3 Status items ===
            StatusItems.Add(new StatusItemViewModel { Key = "start", Name = "Running (Start)", Address = "M20", Type = "Bool" });
            StatusItems.Add(new StatusItemViewModel { Key = "stop", Name = "Stopped (Stop)", Address = "M21", Type = "Bool" });
            StatusItems.Add(new StatusItemViewModel { Key = "error", Name = "Error", Address = "M22", Type = "Bool" });

            // === FIXED: 2 Production items ===
            ProductItems.Add(new ProductItemViewModel { Key = "count", Name = "Quantity", Address = "D1026", Type = "Int16" });
            ProductItems.Add(new ProductItemViewModel { Key = "time", Name = "Cycle Time", Address = "D1022", Type = "Int16" });

            // === FIXED: 2 Quality items (default removed) ===

            // === Load alarms từ imported machine config ===
            try
            {
                var storage = new MachineStorageService();
                var machineCfg = storage.LoadMachine(config.MachineId);
                if (machineCfg != null)
                {
                    // Override status addresses từ config
                    if (machineCfg.Status.TryGetValue("start", out var s)) UpdateStatusItem("start", s.Address, s.Type);
                    if (machineCfg.Status.TryGetValue("stop", out var t)) UpdateStatusItem("stop", t.Address, t.Type);
                    if (machineCfg.Status.TryGetValue("error", out var e)) UpdateStatusItem("error", e.Address, e.Type);

                    // Override production addresses
                    if (machineCfg.Production.TryGetValue("quantity", out var q)) UpdateProductItem("count", q.Address, q.Type);
                    if (machineCfg.Production.TryGetValue("cycle_time", out var c)) UpdateProductItem("time", c.Address, c.Type);



                    // Load alarms từ tags
                    foreach (var tag in machineCfg.Tags)
                    {
                        if (!string.IsNullOrEmpty(tag.Address) &&
                            tag.Address.StartsWith("M", StringComparison.OrdinalIgnoreCase))
                        {
                            AlarmItems.Add(new AlarmItemViewModel
                            {
                                Address = tag.Address,
                                Type = tag.Type,
                                ErrorName = string.IsNullOrEmpty(tag.Alias) ? tag.Address : tag.Alias
                            });
                        }
                    }
                }
            }
            catch { }

            // Override từ local data (synced từ AppConfig.ReadAddresses cũ nếu có)
            try { SyncAddressesFromDb(); } catch { }
        }

        private void SyncAddressesFromDb()
        {
            var items = LocalDbService.Instance.LoadAddressesFromDb();



            foreach (var item in items)
            {
                string cleanAlias = (item.Alias ?? "").Trim().ToLower();

                if (cleanAlias == "start" || cleanAlias == "running")
                    UpdateStatusItem("start", item.Address, item.Type);
                else if (cleanAlias == "stop" || cleanAlias == "stopped")
                    UpdateStatusItem("stop", item.Address, item.Type);
                else if (cleanAlias == "error")
                    UpdateStatusItem("error", item.Address, item.Type);
                else if (cleanAlias == "quantity")
                    UpdateProductItem("count", item.Address, item.Type);
                else if (cleanAlias == "cycle time" || cleanAlias == "cycle_time" || cleanAlias == "ct" || cleanAlias == "time")
                    UpdateProductItem("time", item.Address, item.Type);
                else if (item.Group == "Quy trình báo động" || item.Group == "Alarm")
                {
                    if (!AlarmItems.Any(a => a.Address == item.Address))
                        AlarmItems.Add(new AlarmItemViewModel { Address = item.Address, Type = item.Type, ErrorName = item.Alias });
                }
            }
        }

        private void UpdateStatusItem(string key, string address, string type)
        {
            var p = StatusItems.FirstOrDefault(x => x.Key == key);
            if (p != null) { p.Address = address; p.Type = type; }
        }

        private void UpdateProductItem(string key, string address, string type)
        {
            var p = ProductItems.FirstOrDefault(x => x.Key == key);
            if (p != null) { p.Address = address; p.Type = type; }
        }



        private void BtnRefresh_Click(object sender, RoutedEventArgs e)
        {
            LoadFromAppConfig(AppConfig.Current);
            CustomMessageBox.Show("Đã tải lại cấu hình từ cơ sở dữ liệu hiện hành.", "Làm mới", MessageBoxButton.OK, MessageBoxImage.Information);
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
                    allItems.Add(new DataAddressItem { Index = index++, Address = status.Address, Type = status.Type, Alias = status.Name, Group = "Nhóm trạng thái", Enabled = true, ActiveValue = "true", Severity = "Medium" });
                }

                foreach (var product in ProductItems)
                {
                    allItems.Add(new DataAddressItem { Index = index++, Address = product.Address, Type = product.Type, Alias = product.Name, Group = "Nhóm sản phẩm", Enabled = true, ActiveValue = "true", Severity = "Medium" });
                }



                foreach (var alarm in AlarmItems)
                {
                    allItems.Add(new DataAddressItem { Index = index++, Address = alarm.Address, Type = alarm.Type, Alias = alarm.ErrorName, Group = "Quy trình báo động", Enabled = true, ActiveValue = "true", Severity = "Medium" });
                }

                // No OtherItems

                LocalDbService.Instance.SaveAddressesToDb(allItems);

                IEnumerable<string> addressStrings = allItems.Select(x =>
                    $"{x.Address}:{x.Type}:{x.Alias}:{(x.Enabled ? 1 : 0)}:{x.Group}:{x.ActiveValue}:{x.Severity}");
                string readAddressesStr = string.Join(",", addressStrings);

                AppConfig.Current.PlcBrand = PlcBrand;
                AppConfig.Current.PlcIp = PlcIp;
                AppConfig.Current.PlcPort = PlcPort;
                AppConfig.Current.ReadIntervalMs = ReadIntervalMs;
                AppConfig.Current.ServerHost = ServerHost;
                AppConfig.Current.ServerPort = ServerPort;
                AppConfig.Current.ServerToken = ServerToken;
                AppConfig.Current.TargetSpeed = TargetSpeed;
                AppConfig.Current.LocalWebPort = LocalWebPort;
                AppConfig.Current.ReadAddresses = readAddressesStr;
                AppConfig.Current.Save();

                MqttClientService.Instance.UpdateReadAddresses(readAddressesStr);
                MqttClientService.Instance.ReconnectDefaultPlc();
                MqttClientService.Instance.LoadActiveAddressItems();

                CustomMessageBox.Show("Áp dụng cấu hình địa chỉ PLC mới thành công!", "Thành công", MessageBoxButton.OK, MessageBoxImage.Asterisk);
                return true;
            }
            catch (Exception ex)
            {
                CustomMessageBox.Show("Lỗi khi áp dụng cấu hình: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Error);
                return false;
            }
        }

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
                CustomMessageBox.Show("Chọn một dòng báo động để xóa!", "Thông báo", MessageBoxButton.OK, MessageBoxImage.Warning);
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
                        if (Application.Current.MainWindow != null)
                        {
                            importWindow.Owner = Application.Current.MainWindow;
                        }
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
                    Title = "Xuất danh sách báo động"
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
            BtnTestRead.IsEnabled = false;
            try
            {
                string startAddr = StatusItems[0].Address;
                LogManager.AddLog($"AddressConfig: Đang đọc thử địa chỉ {startAddr}...");
                bool success = await Task.Run(() => {
                    try
                    {
                        var dev = new PLCGeneric(PlcBrand, PlcIp, PlcPort);
                        if (dev != null)
                        {
                            var connect = dev.Connect();
                            if (connect.IsSuccess)
                            {
                                var read = dev.ReadBool(startAddr);
                                dev.Disconnect();
                                return read.IsSuccess;
                            }
                        }
                    }
                    catch { }
                    return false;
                });

                if (success)
                {
                    CustomMessageBox.Show($"Đọc thử địa chỉ {startAddr} THÀNH CÔNG!", "Kết quả đọc thử", MessageBoxButton.OK, MessageBoxImage.Asterisk);
                }
                else
                {
                    CustomMessageBox.Show($"Đọc thử địa chỉ {startAddr} THẤT BẠI!", "Kết quả đọc thử", MessageBoxButton.OK, MessageBoxImage.Error);
                }
            }
            catch (Exception ex)
            {
                CustomMessageBox.Show("Lỗi đọc thử: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Error);
            }
            finally
            {
                BtnTestRead.IsEnabled = true;
            }
        }

        public void TranslateUI()
        {
            if (TxtStatus != null)
            {
                TxtStatus.Text = LanguageManager.GetText("ConfigStatusActive") ?? "Trạng thái cấu hình: Đang hoạt động";
            }
            BtnTestRead.Content = LanguageManager.GetText("BtnTestReadText") ?? "⚡ Đọc thử";
            BtnRefresh.Content = LanguageManager.GetText("BtnRefreshText") ?? "Tải Lại Cấu Hình";
            BtnApply.Content = LanguageManager.GetText("BtnApplyText") ?? "🚀 Áp dụng";

            TabItemStatus.Header = LanguageManager.GetText("TabStatusText") ?? "Trạng thái";
            TabItemProducts.Header = LanguageManager.GetText("TabProductsText") ?? "Sản phẩm";
            TabItemAlarms.Header = LanguageManager.GetText("TabAlarmsText") ?? "Thông báo";
            TxtStatusHelp.Text = LanguageManager.GetText("CfgStatusHelp") ?? "Cấu hình địa chỉ trạng thái máy (Cố định 3 tham số, chỉ chỉnh sửa địa chỉ và kiểu dữ liệu)";
            TxtProductsHelp.Text = LanguageManager.GetText("CfgProductsHelp") ?? "Cấu hình địa chỉ sản xuất (Cố định 2 tham số, chỉ chỉnh sửa địa chỉ và kiểu dữ liệu)";
            TxtAlarmsHelp.Text = LanguageManager.GetText("CfgAlarmsHelp") ?? "Danh sách các địa chỉ báo động lỗi";

            BtnAddAlarm.Content = LanguageManager.GetText("CfgBtnAdd") ?? "➕ Thêm";
            BtnDeleteAlarm.Content = LanguageManager.GetText("CfgBtnDelete") ?? "❌ Xóa";
            BtnImportAlarm.Content = LanguageManager.GetText("CfgBtnImportAlarm") ?? "📥 Nhập Excel";
            BtnExportAlarm.Content = LanguageManager.GetText("CfgBtnExportAlarm") ?? "📤 Xuất CSV";
            BtnDownloadAlarmTemplate.Content = LanguageManager.GetText("CfgBtnDownloadTemplate") ?? "📄 Tải mẫu Excel";

            ColStatusParam.Header = LanguageManager.GetText("ColParamName") ?? "Tham số";
            ColStatusAddr.Header = LanguageManager.GetText("ColPlcAddr") ?? "Địa chỉ PLC";
            ColStatusType.Header = LanguageManager.GetText("ColDataType") ?? "Kiểu dữ liệu";
            ColStatusValue.Header = LanguageManager.GetText("ColCurrentValue") ?? "Giá trị hiện tại";

            ColProductParam.Header = LanguageManager.GetText("ColParamName") ?? "Tham số";
            ColProductAddr.Header = LanguageManager.GetText("ColPlcAddr") ?? "Địa chỉ PLC";
            ColProductType.Header = LanguageManager.GetText("ColDataType") ?? "Kiểu dữ liệu";
            ColProductValue.Header = LanguageManager.GetText("ColCurrentValue") ?? "Giá trị hiện tại";



            ColAlarmAddr.Header = LanguageManager.GetText("ColPlcAddr") ?? "Địa chỉ PLC";
            ColAlarmType.Header = LanguageManager.GetText("ColDataType") ?? "Kiểu dữ liệu";
            ColAlarmName.Header = LanguageManager.GetText("ColAlarmName") ?? "Tên báo động (Error Name)";
            ColAlarmValue.Header = LanguageManager.GetText("ColCurrentValue") ?? "Giá trị hiện tại";
        }
    }
}


