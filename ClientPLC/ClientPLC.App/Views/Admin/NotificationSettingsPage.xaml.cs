using PLC.Views;
using System;
using System.Windows;
using System.Windows.Controls;
using PLC.Service;
using MessageBox = PLC.Views.CustomMessageBox;

namespace PLC.Views;

public partial class NotificationSettingsPage : UserControl, ILocalizable
{
    public NotificationSettingsPage()
    {
        InitializeComponent();
        this.Loaded += NotificationSettingsPage_Loaded;
        BtnSave.Click += BtnSave_Click;
    }

    private void NotificationSettingsPage_Loaded(object sender, RoutedEventArgs e)
    {
        ChkEnableSound.IsChecked = true;
        ChkEnablePopup.IsChecked = true;
        TxtNotifyEmail.Text = "maintenance.engineer@foxconn.com";
        TranslateUI();
    }

    public void TranslateUI()
    {
        string lang = LanguageManager.CurrentLanguageCode.ToLower();
        if (lang.StartsWith("zh"))
        {
            TxtTitle.Text = "通知与警报设置";
            ChkEnableSound.Content = "发生错误时启用警报声";
            ChkEnableEmail.Content = "当机器停机 > 10 分钟时向维护工程师发送电子邮件";
            ChkEnablePopup.Content = "在桌面上显示悬浮通知 (Toast Notification)";
            LblEmail.Content = "错误通知接收邮箱:";
            BtnSave.Content = "保存配置";
        }
        else if (lang.StartsWith("en"))
        {
            TxtTitle.Text = "Notifications & Alarms Settings";
            ChkEnableSound.Content = "Enable alarm sound when error occurs";
            ChkEnableEmail.Content = "Send email to maintenance engineer when machine stops > 10 mins";
            ChkEnablePopup.Content = "Show toast notifications on desktop background";
            LblEmail.Content = "Email recipient for error notifications:";
            BtnSave.Content = "Save Configuration";
        }
        else
        {
            TxtTitle.Text = "Cài đặt thông báo & Cảnh báo";
            ChkEnableSound.Content = "Kích hoạt âm thanh cảnh báo khi có lỗi phát sinh";
            ChkEnableEmail.Content = "Gửi email thông báo cho kỹ sư bảo trì khi máy dừng > 10 phút";
            ChkEnablePopup.Content = "Hiển thị thông báo nổi (Toast Notification) trên màn hình nền";
            LblEmail.Content = "Email người nhận thông báo lỗi:";
            BtnSave.Content = "Lưu cấu hình";
        }
    }

    private void BtnSave_Click(object sender, RoutedEventArgs e)
    {
        string lang = LanguageManager.CurrentLanguageCode.ToLower();
        string msg = lang.StartsWith("zh") ? "成功保存报警通知设置！" :
                     lang.StartsWith("en") ? "Alert settings saved successfully!" :
                                             "Đã lưu cài đặt thông báo cảnh báo thành công!";
        string title = lang.StartsWith("zh") ? "通知" :
                       lang.StartsWith("en") ? "Notification" :
                                               "Thông báo";

        CustomMessageBox.Show(msg, title, MessageBoxButton.OK, MessageBoxImage.Information);
    }
}


