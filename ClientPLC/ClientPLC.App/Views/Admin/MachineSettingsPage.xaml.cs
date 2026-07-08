using PLC.Views;
using System;
using System.Windows;
using System.Windows.Controls;
using PLC.Config;
using PLC.Service;
using MessageBox = PLC.Views.CustomMessageBox;

namespace PLC.Views
{
    public partial class MachineSettingsPage : UserControl
    {
        public MachineSettingsPage()
        {
            InitializeComponent();
            this.Loaded += MachineSettingsPage_Loaded;
            BtnSave.Click += BtnSave_Click;
        }

        private void MachineSettingsPage_Loaded(object sender, RoutedEventArgs e)
        {
            LoadConfig();
        }

        private void LoadConfig()
        {
            AppConfig config = AppConfig.Current;
            TxtMachineId.Text = config.MachineId;
            TxtMachineName.Text = config.MachineName;
            TxtLineId.Text = config.LineId;
            TxtLineName.Text = config.LineName;
            TxtLineOrder.Text = config.LineOrder.ToString();
        }

        private void BtnSave_Click(object sender, RoutedEventArgs e)
        {
            if (string.IsNullOrWhiteSpace(TxtMachineName.Text))
            {
                CustomMessageBox.Show("Tên máy không được để trống!", "Lỗi nhập liệu", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            try
            {
                AppConfig config = AppConfig.Current;
                config.MachineName = TxtMachineName.Text.Trim();
                config.LineId = TxtLineId.Text.Trim();
                config.LineName = TxtLineName.Text.Trim();
                if (int.TryParse(TxtLineOrder.Text.Trim(), out int order))
                {
                    config.LineOrder = order;
                }
                config.Save();

                CustomMessageBox.Show("Lưu cấu hình trạm máy thành công!", "Thông báo", MessageBoxButton.OK, MessageBoxImage.Information);

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


