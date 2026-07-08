using PLC.Views;
using System;
using System.Windows;
using System.Windows.Controls;
using PLC.Config;
using PLC.Network;
using PLC.Service;
using MessageBox = PLC.Views.CustomMessageBox;

namespace PLC.Views
{
    public partial class PlcReadCycleConfigPage : UserControl
    {
        public PlcReadCycleConfigPage()
        {
            InitializeComponent();
            this.Loaded += PlcReadCycleConfigPage_Loaded;
            BtnSave.Click += BtnSave_Click;
        }

        private void PlcReadCycleConfigPage_Loaded(object sender, RoutedEventArgs e)
        {
            LoadConfig();
        }

        private void LoadConfig()
        {
            AppConfig config = AppConfig.Current;
            TxtInterval.Text = config.ReadIntervalMs.ToString();
        }

        private void BtnSave_Click(object sender, RoutedEventArgs e)
        {
            if (!int.TryParse(TxtInterval.Text.Trim(), out int interval) || interval < 50)
            {
                CustomMessageBox.Show("Chu kỳ đọc dữ liệu phải là số nguyên và lớn hơn hoặc bằng 50 ms!", "Lỗi nhập liệu", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            try
            {
                AppConfig config = AppConfig.Current;
                config.ReadIntervalMs = interval;
                config.Save();

                // Re-poll
                MqttClientService.Instance.ReconnectDefaultPlc();

                CustomMessageBox.Show("Lưu chu kỳ đọc dữ liệu PLC thành công!", "Thông báo", MessageBoxButton.OK, MessageBoxImage.Information);

                if (Application.Current.MainWindow is MainWindow main)
                {
                    main.TranslateUI();
                }
            }
            catch (Exception ex)
            {
                CustomMessageBox.Show("Lỗi lưu cấu hình: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
    }
}


