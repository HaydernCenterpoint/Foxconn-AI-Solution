using PLC.Views;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using PLC.Config;
using PLC.Service;
using MessageBox = PLC.Views.CustomMessageBox;

namespace PLC.Views
{
    public partial class UiSettingsPage : UserControl
    {
        public UiSettingsPage()
        {
            InitializeComponent();
            this.Loaded += UiSettingsPage_Loaded;
            BtnSave.Click += BtnSave_Click;
        }

        private void UiSettingsPage_Loaded(object sender, RoutedEventArgs e)
        {
            LoadBrands();
        }

        private void LoadBrands()
        {
            PanelBrandsCheckboxes.Children.Clear();
            AppSettings settings = AppSettings.Current;
            foreach (var kvp in settings.BrandVisibility.OrderBy(x => x.Key))
            {
                CheckBox cb = new CheckBox
                {
                    Content = kvp.Key,
                    IsChecked = kvp.Value,
                    Margin = new Thickness(0, 0, 15, 15),
                    Width = 150,
                    Foreground = (System.Windows.Media.Brush)FindResource("TextPrimary")
                };
                PanelBrandsCheckboxes.Children.Add(cb);
            }
        }

        private void BtnSave_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                AppSettings settings = AppSettings.Current;
                foreach (var child in PanelBrandsCheckboxes.Children)
                {
                    if (child is CheckBox cb && cb.Content != null)
                    {
                        string brand = cb.Content.ToString() ?? "";
                        if (!string.IsNullOrEmpty(brand))
                        {
                            settings.BrandVisibility[brand] = cb.IsChecked == true;
                        }
                    }
                }
                settings.Save();
                CustomMessageBox.Show("Đã lưu cài đặt hiển thị giao diện thành công!", "Thông báo", MessageBoxButton.OK, MessageBoxImage.Information);

                if (Application.Current.MainWindow is MainWindow main)
                {
                    main.ClearViewCache();
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


