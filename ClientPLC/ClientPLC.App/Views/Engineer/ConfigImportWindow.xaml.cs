using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Win32;
using PLC.Config;
using PLC.Model;
using PLC.Network;
using PLC.Service;
using MessageBox = PLC.Views.CustomMessageBox;

namespace PLC.Views;

public partial class ConfigImportWindow : Window
{
    private ImportedMachineConfig? _importedConfig;
    private ImportSummary? _importSummary;
    private readonly string? _targetMachineId;

    /// <param name="targetMachineId">Null = chỉ cho phép tạo mới, có giá trị = cho phép apply vào máy đó</param>
    public ConfigImportWindow(string? targetMachineId = null)
    {
        System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance);
        InitializeComponent();

        _targetMachineId = targetMachineId;

        BtnBrowse.Click += BtnBrowse_Click;
        BtnCreateNew.Click += BtnCreateNew_Click;
        BtnApply.Click += BtnApply_Click;
        BtnCancel.Click += (s, e) => this.Close();

        if (targetMachineId == null)
        {
            BtnApply.IsEnabled = false;
            BtnApply.Opacity = 0.5;
        }

        TranslateUI();
    }

    private void TranslateUI()
    {
        Func<string, string?> lm = LanguageManager.GetText;
        this.Title = lm("ConfigImport.Title") ?? "Import cấu hình máy";
        BtnBrowse.Content = lm("ConfigImport.Browse") ?? "Chọn file...";
        BtnCreateNew.Content = lm("ConfigImport.CreateNew") ?? "+ Tạo máy mới từ file này";
        BtnApply.Content = lm("ConfigImport.Apply") ?? "Áp dụng vào máy hiện tại";
        BtnCancel.Content = lm("BtnCancel") ?? "Hủy";
        TxtPreviewTitle.Text = lm("ConfigImport.Preview") ?? "XEM TRƯỚC DỮ LIỆU";
    }

    private void BtnBrowse_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new OpenFileDialog
        {
            Filter = "Config files (*.csv;*.json)|*.csv;*.json|CSV files (*.csv)|*.csv|JSON files (*.json)|*.json",
            Title = "Chọn file cấu hình máy"
        };

        if (dialog.ShowDialog() == true)
        {
            ProcessFile(dialog.FileName);
        }
    }

    private void ProcessFile(string filePath)
    {
        try
        {
            TxtFilePath.Text = filePath;
            TxtFileFormat.Text = Path.GetExtension(filePath).ToUpper() + " — " + File.GetCreationTime(filePath).ToString("g");

            var importer = new ConfigImporterService();
            var result = importer.ImportFile(filePath, _targetMachineId);

            if (!result.Success || result.Config == null)
            {
                CustomMessageBox.Show("Lỗi import: " + result.Error, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            _importedConfig = result.Config;
            _importSummary = result.Summary;

            // Update summary
            TxtTotal.Text = $"Tổng: {result.Summary?.TotalAddresses ?? 0}";
            TxtStatus.Text = $"Status: {result.Summary?.StatusCount ?? 0}";
            TxtProduction.Text = $"Production: {result.Summary?.ProductionCount ?? 0}";
            TxtAlarms.Text = $"Alarms: {result.Summary?.AlarmsCount ?? 0}";

            // Preview data
            var previewItems = new List<PreviewItem>();

            // Status
            foreach (var kvp in result.Config.Status)
                previewItems.Add(new PreviewItem { Group = "Status", Key = kvp.Key, Address = kvp.Value.Address, Type = kvp.Value.Type });

            // Production
            foreach (var kvp in result.Config.Production)
                previewItems.Add(new PreviewItem { Group = "Production", Key = kvp.Key, Address = kvp.Value.Address, Type = kvp.Value.Type });

            // Quality
            foreach (var kvp in result.Config.Quality)
                previewItems.Add(new PreviewItem { Group = "Quality", Key = kvp.Key, Address = kvp.Value.Address, Type = kvp.Value.Type });

            // Tags (alarms)
            foreach (var tag in result.Config.Tags.Take(200))
                previewItems.Add(new PreviewItem { Group = tag.Group, Key = tag.Alias, Address = tag.Address, Type = tag.Type, Description = tag.Description });

            DgPreview.ItemsSource = null;
            DgPreview.ItemsSource = previewItems;

            // Enable buttons
            BtnCreateNew.IsEnabled = true;
            if (_targetMachineId != null)
                BtnApply.IsEnabled = true;
        }
        catch (Exception ex)
        {
            CustomMessageBox.Show("Lỗi xử lý file: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private void BtnCreateNew_Click(object sender, RoutedEventArgs e)
    {
        if (_importedConfig == null) return;

        try
        {
            var storage = new MachineStorageService();

            // Check duplicate machineId
            var existing = storage.ListMachines();
            if (existing.Any(m => m.MachineId.Equals(_importedConfig.MachineId, StringComparison.OrdinalIgnoreCase)))
            {
                var overwrite = CustomMessageBox.Show(
                    $"Máy '{_importedConfig.MachineId}' đã tồn tại. Ghi đè?",
                    "Xác nhận", MessageBoxButton.YesNo, MessageBoxImage.Warning);
                if (overwrite != MessageBoxResult.Yes) return;
            }

            storage.SaveMachine(_importedConfig);

            // Auto-populate AppConfig và ReadAddresses để PLC đọc được ngay
            ApplyConfigToApp(_importedConfig);

            CustomMessageBox.Show(
                $"Đã tạo máy mới: {_importedConfig.MachineName} ({_importedConfig.MachineId})\n" +
                $"- Status: {_importedConfig.Status.Count}\n" +
                $"- Production: {_importedConfig.Production.Count}\n" +
                $"- Quality: {_importedConfig.Quality.Count}\n" +
                $"- Tags/Alarms: {_importedConfig.Tags.Count}",
                "Import thành công", MessageBoxButton.OK, MessageBoxImage.Information);

            this.DialogResult = true;
            this.Close();
        }
        catch (Exception ex)
        {
            CustomMessageBox.Show("Lỗi lưu cấu hình: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private void BtnApply_Click(object sender, RoutedEventArgs e)
    {
        if (_importedConfig == null || _targetMachineId == null) return;

        try
        {
            // Merge với config hiện tại (giữ machineId, PLC connection)
            var storage = new MachineStorageService();
            var existing = storage.LoadMachine(_targetMachineId);

            if (existing != null)
            {
                _importedConfig.Plc = existing.Plc;
                _importedConfig.LineId = existing.LineId;
                _importedConfig.LineName = existing.LineName;
                _importedConfig.LineOrder = existing.LineOrder;
            }
            _importedConfig.MachineId = _targetMachineId;

            storage.SaveMachine(_importedConfig);

            // Auto-populate AppConfig để PLC đọc được ngay
            ApplyConfigToApp(_importedConfig);

            CustomMessageBox.Show(
                $"Đã áp dụng cấu hình vào máy {_targetMachineId}",
                "Thành công", MessageBoxButton.OK, MessageBoxImage.Information);

            this.DialogResult = true;
            this.Close();
        }
        catch (Exception ex)
        {
            CustomMessageBox.Show("Lỗi áp dụng: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    /// <summary>
    /// Chuyển imported config → AppConfig.ReadAddresses + PLC connection
    /// để PlcAddressReader và polling service dùng được ngay.
    /// </summary>
    private void ApplyConfigToApp(ImportedMachineConfig cfg)
    {
        // 1. Cập nhật thông tin máy
        AppConfig.Current.MachineId = cfg.MachineId;
        AppConfig.Current.MachineName = cfg.MachineName;
        if (cfg.Plc != null)
        {
            AppConfig.Current.PlcBrand = cfg.Plc.Brand;
            AppConfig.Current.PlcIp = cfg.Plc.Ip;
            AppConfig.Current.PlcPort = cfg.Plc.Port;
        }

        // 2. Build ReadAddresses string từ config
        var items = new List<string>();
        
        // Status
        foreach (var kvp in cfg.Status)
        {
            items.Add($"{kvp.Value.Address}:{kvp.Value.Type}:{kvp.Key}:1:Nhóm trạng thái:true:Medium");
        }
        // Production
        foreach (var kvp in cfg.Production)
        {
            items.Add($"{kvp.Value.Address}:{kvp.Value.Type}:{kvp.Key}:1:Nhóm sản phẩm:true:Medium");
        }
        // Quality
        foreach (var kvp in cfg.Quality)
        {
            items.Add($"{kvp.Value.Address}:{kvp.Value.Type}:{kvp.Key}:1:Nhóm chất lượng:true:Medium");
        }
        // Tags/Alarms
        foreach (var tag in cfg.Tags)
        {
            string alias = string.IsNullOrWhiteSpace(tag.Alias) ? tag.Address : tag.Alias;
            items.Add($"{tag.Address}:{tag.Type}:{alias}:1:{tag.Group}:true:{tag.Severity}");
        }

        AppConfig.Current.ReadAddresses = string.Join(",", items);
        AppConfig.Current.Save();
        AppConfig.Reload();

        // 3. Thông báo cho polling service cập nhật địa chỉ đọc
        try
        {
            MqttClientService.Instance.UpdateReadAddresses(AppConfig.Current.ReadAddresses);
            MqttClientService.Instance.ReconnectDefaultPlc();
        }
        catch { /* polling service có thể chưa start */ }
    }
}

public class PreviewItem
{
    public string Group { get; set; } = "";
    public string Key { get; set; } = "";
    public string Address { get; set; } = "";
    public string Type { get; set; } = "";
    public string Description { get; set; } = "";
}
