using PLC.Views;
using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using PLC.Service;

namespace PLC.Views;

public partial class LoginWindow : Window, ILocalizable
{
    public LoginWindow()
    {
        InitializeComponent();
        
        // Window drag support
        this.MouseLeftButtonDown += (s, e) =>
        {
            if (e.ButtonState == MouseButtonState.Pressed)
            {
                this.DragMove();
            }
        };

        // ComboBox selection changed handler to show/hide password panel
        CboRole.SelectionChanged += CboRole_SelectionChanged;

        BtnLogin.Click += BtnLogin_Click;
        BtnCancel.Click += (s, e) => this.Close();
        BtnCloseTitle.Click += (s, e) => this.Close();

        // Focus role selection combo box on start
        CboRole.Focus();

        TranslateUI();
    }

    public void TranslateUI()
    {
        string lang = LanguageManager.CurrentLanguageCode.ToLower();
        if (lang.StartsWith("zh"))
        {
            TxtTitle.Text = "系统登录";
            LblRole.Content = "访问权限 (Role):";
            CboItemGuest.Content = "访客 (Guest)";
            CboItemEngineer.Content = "工程师 (Engineer)";
            CboItemAdmin.Content = "管理员 (Admin)";
            LblPassword.Content = "密码 (Password):";
            BtnLogin.Content = "登录";
            BtnCancel.Content = "取消";
        }
        else if (lang.StartsWith("en"))
        {
            TxtTitle.Text = "SYSTEM LOGIN";
            LblRole.Content = "Access Role:";
            CboItemGuest.Content = "Guest";
            CboItemEngineer.Content = "Engineer";
            CboItemAdmin.Content = "Administrator";
            LblPassword.Content = "Password:";
            BtnLogin.Content = "Login";
            BtnCancel.Content = "Cancel";
        }
        else
        {
            TxtTitle.Text = "ĐĂNG NHẬP HỆ THỐNG";
            LblRole.Content = "Quyền truy cập (Role):";
            CboItemGuest.Content = "Khách (Guest)";
            CboItemEngineer.Content = "Kỹ sư (Engineer)";
            CboItemAdmin.Content = "Quản trị viên (Admin)";
            LblPassword.Content = "Mật khẩu (Password):";
            BtnLogin.Content = "Đăng nhập";
            BtnCancel.Content = "Hủy";
        }
    }

    private void CboRole_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (PnlPassword == null) return;

        if (CboRole.SelectedIndex == 0) // Guest
        {
            PnlPassword.Visibility = Visibility.Collapsed;
        }
        else // Engineer or Admin
        {
            PnlPassword.Visibility = Visibility.Visible;
            TxtPassword.Clear();
            TxtPassword.Focus();
        }
    }

    private void BtnLogin_Click(object sender, RoutedEventArgs e)
    {
        UserRole targetRole = UserRole.Guest;
        if (CboRole.SelectedIndex == 1) targetRole = UserRole.Engineer;
        else if (CboRole.SelectedIndex == 2) targetRole = UserRole.Admin;

        string password = TxtPassword.Password;

        if (RoleManager.Login(targetRole, password))
        {
            this.DialogResult = true;
            this.Close();
        }
        else
        {
            string lang = LanguageManager.CurrentLanguageCode.ToLower();
            string errMsg = lang.StartsWith("zh") ? "登录密码不正确！" :
                            lang.StartsWith("en") ? "Incorrect password!" :
                                                    "Mật khẩu đăng nhập không chính xác!";
            string errTitle = lang.StartsWith("zh") ? "登录错误" :
                              lang.StartsWith("en") ? "Login Error" :
                                                      "Lỗi đăng nhập";

            CustomMessageBox.Show(errMsg, errTitle, MessageBoxButton.OK, MessageBoxImage.Error);
            TxtPassword.Clear();
            TxtPassword.Focus();
        }
    }
}



