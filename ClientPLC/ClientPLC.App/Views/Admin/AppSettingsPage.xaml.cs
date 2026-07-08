using PLC.Views;
using System;
using System.Windows;
using System.Windows.Controls;
using PLC.Config;
using PLC.Service;
using MessageBox = PLC.Views.CustomMessageBox;

namespace PLC.Views
{
    public partial class AppSettingsPage : UserControl, ILocalizable
    {
        public AppSettingsPage()
        {
            InitializeComponent();
            this.Loaded += AppSettingsPage_Loaded;
            BtnSave.Click += BtnSave_Click;
            SldFontSize.ValueChanged += SldFontSize_ValueChanged;
        }

        private void AppSettingsPage_Loaded(object sender, RoutedEventArgs e)
        {
            LoadConfig();
            TranslateUI();
        }

        private void LoadConfig()
        {
            AppSettings settings = AppSettings.Current;
            foreach (ComboBoxItem item in CboTheme.Items)
            {
                if (item.Tag?.ToString() == settings.Theme)
                {
                    CboTheme.SelectedItem = item;
                    break;
                }
            }
            SldFontSize.Value = settings.FontSize;
            TxtFontSizeVal.Text = $"{(int)settings.FontSize} px";

            foreach (ComboBoxItem item in CboLanguage.Items)
            {
                if (item.Tag?.ToString() == settings.Language)
                {
                    CboLanguage.SelectedItem = item;
                    break;
                }
            }
            ChkUseMockData.IsChecked = settings.UseMockData;
        }

        private void SldFontSize_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
        {
            if (TxtFontSizeVal != null)
            {
                TxtFontSizeVal.Text = $"{(int)e.NewValue} px";
            }
        }

        private void BtnSave_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                AppSettings settings = AppSettings.Current;
                if (CboTheme.SelectedItem is ComboBoxItem themeItem)
                {
                    settings.Theme = themeItem.Tag?.ToString() ?? "dark";
                }
                settings.FontSize = (float)SldFontSize.Value;
                if (CboLanguage.SelectedItem is ComboBoxItem langItem)
                {
                    settings.Language = langItem.Tag?.ToString() ?? "vi";
                }
                settings.UseMockData = ChkUseMockData.IsChecked == true;
                settings.Save();

                App.ChangeTheme(settings.Theme);
                App.ChangeFontSize(settings.FontSize);
                LanguageManager.SetLanguage(settings.Language);

                CustomMessageBox.Show(LanguageManager.GetText("SaveSuccess") ?? "Lưu cấu hình thành công!", "Thông báo", MessageBoxButton.OK, MessageBoxImage.Information);

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

        public void TranslateUI()
        {
            BtnSave.Content = LanguageManager.GetText("SaveConfig") ?? "Lưu cấu hình";
            ChkUseMockData.Content = LanguageManager.GetText("UseMockDataText") ?? "Sử dụng dữ liệu ảo (Demo Mode)";
        }
    }
}


