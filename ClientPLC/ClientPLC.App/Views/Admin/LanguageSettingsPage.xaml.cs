using PLC.Views;
using System;
using System.Windows;
using System.Windows.Controls;
using HslCommunication.Language;
using PLC.Config;
using PLC.Service;
using MessageBox = PLC.Views.CustomMessageBox;

namespace PLC.Views
{
    public partial class LanguageSettingsPage : UserControl
    {
        public LanguageSettingsPage()
        {
            InitializeComponent();
            this.Loaded += LanguageSettingsPage_Loaded;
            this.Unloaded += LanguageSettingsPage_Unloaded;
            BtnSave.Click += BtnSave_Click;
        }

        private void LanguageSettingsPage_Loaded(object sender, RoutedEventArgs e)
        {
            LanguageManager.LanguageChanged += OnLanguageChanged;
            AppSettings settings = AppSettings.Current;
            foreach (ComboBoxItem item in CboLanguage.Items)
            {
                if (item.Tag?.ToString() == settings.Language)
                {
                    CboLanguage.SelectedItem = item;
                    break;
                }
            }
            TranslateUI();
        }

        private void LanguageSettingsPage_Unloaded(object sender, RoutedEventArgs e)
        {
            LanguageManager.LanguageChanged -= OnLanguageChanged;
        }

        private void OnLanguageChanged(object? sender, EventArgs e)
        {
            TranslateUI();
        }

        public void TranslateUI()
        {
            try
            {
                string lang = LanguageManager.CurrentLanguageCode.ToLower();
                if (lang.StartsWith("zh") || lang.StartsWith("cn"))
                {
                    TxtTitle.Text = "语言设置";
                    LblLanguageSelect.Content = "系统界面语言:";
                    BtnSave.Content = "保存设置";
                }
                else if (lang.StartsWith("en"))
                {
                    TxtTitle.Text = "Language Settings";
                    LblLanguageSelect.Content = "System Language:";
                    BtnSave.Content = "Save Settings";
                }
                else
                {
                    TxtTitle.Text = "Cài đặt ngôn ngữ";
                    LblLanguageSelect.Content = "Ngôn ngữ giao diện hệ thống:";
                    BtnSave.Content = "Lưu cài đặt";
                }
            }
            catch { }
        }

        private void BtnSave_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                AppSettings settings = AppSettings.Current;
                if (CboLanguage.SelectedItem is ComboBoxItem langItem)
                {
                    settings.Language = langItem.Tag?.ToString() ?? "vi";
                }
                settings.Save();

                LanguageManager.SetLanguage(settings.Language);
                if (settings.Language.Equals("zh", StringComparison.OrdinalIgnoreCase))
                {
                    Program.Language = 1;
                    HslCommunication.StringResources.Language = new DefaultLanguage();
                }
                else
                {
                    Program.Language = 2;
                    HslCommunication.StringResources.Language = new English();
                }

                string msg = "Cài đặt ngôn ngữ đã được cập nhật thành công!";
                string title = "Thông báo";
                string lang = settings.Language.ToLower();
                if (lang.StartsWith("zh") || lang.StartsWith("cn"))
                {
                    msg = "语言设置已成功更新！";
                    title = "通知";
                }
                else if (lang.StartsWith("en"))
                {
                    msg = "Language settings updated successfully!";
                    title = "Notice";
                }

                CustomMessageBox.Show(msg, title, MessageBoxButton.OK, MessageBoxImage.Information);

                if (Application.Current.MainWindow is MainWindow main)
                {
                    main.TranslateUI();
                }
            }
            catch (Exception ex)
            {
                string errorTitle = "Lỗi";
                string errorMsg = "Lỗi lưu cấu hình ngôn ngữ: ";
                string lang = LanguageManager.CurrentLanguageCode.ToLower();
                if (lang.StartsWith("zh") || lang.StartsWith("cn"))
                {
                    errorTitle = "错误";
                    errorMsg = "保存语言配置时出错: ";
                }
                else if (lang.StartsWith("en"))
                {
                    errorTitle = "Error";
                    errorMsg = "Error saving language configuration: ";
                }
                CustomMessageBox.Show(errorMsg + ex.Message, errorTitle, MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
    }
}


