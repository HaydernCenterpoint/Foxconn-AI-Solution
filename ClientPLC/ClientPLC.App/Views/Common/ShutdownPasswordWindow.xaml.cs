using PLC.Views;
using System;
using System.Windows;
using System.Windows.Input;
using PLC.Service;

namespace PLC.Views
{
    public partial class ShutdownPasswordWindow : Window
    {
        public bool IsPasswordCorrect { get; private set; } = false;

        public ShutdownPasswordWindow()
        {
            InitializeComponent();
            
            // Drag support
            this.MouseLeftButtonDown += (s, e) =>
            {
                if (e.ButtonState == MouseButtonState.Pressed)
                {
                    this.DragMove();
                }
            };

            BtnCloseTitle.Click += (s, e) => { this.Close(); };
            BtnCancel.Click += (s, e) => { this.Close(); };
            BtnConfirm.Click += BtnConfirm_Click;

            TranslateUI();

            // Focus on password input box
            TxtPassword.Focus();
        }

        private void BtnConfirm_Click(object sender, RoutedEventArgs e)
        {
            string enteredPassword = TxtPassword.Password;
            if (enteredPassword == "000000")
            {
                IsPasswordCorrect = true;
                this.Close();
            }
            else
            {
                string errorTitle = LanguageManager.GetText("Notice") ?? "Thông báo";
                string errorMessage = LanguageManager.GetText("IncorrectPassword") ?? "Mật khẩu không chính xác!";
                if (LanguageManager.CurrentLanguageCode.ToLower().StartsWith("en"))
                {
                    errorMessage = "Incorrect password!";
                }
                else if (LanguageManager.CurrentLanguageCode.ToLower().StartsWith("zh") || LanguageManager.CurrentLanguageCode.ToLower().StartsWith("cn"))
                {
                    errorMessage = "密码不正确！";
                }
                CustomMessageBox.Show(errorMessage, errorTitle, MessageBoxButton.OK, MessageBoxImage.Error);
                TxtPassword.Clear();
                TxtPassword.Focus();
            }
        }

        private void TranslateUI()
        {
            string lang = LanguageManager.CurrentLanguageCode.ToLower();
            if (lang.StartsWith("zh") || lang.StartsWith("cn"))
            {
                TxtTitle.Text = "确认退出系统";
                TxtPrompt.Text = "请输入确认密码以退出应用程序:";
                BtnConfirm.Content = "确认";
                BtnCancel.Content = "取消";
            }
            else if (lang.StartsWith("en"))
            {
                TxtTitle.Text = "CONFIRM EXIT APPLICATION";
                TxtPrompt.Text = "Please enter the password to confirm shutdown:";
                BtnConfirm.Content = "Confirm";
                BtnCancel.Content = "Cancel";
            }
            else
            {
                TxtTitle.Text = "XÁC NHẬN THOÁT HỆ THỐNG";
                TxtPrompt.Text = "Nhập mật khẩu để xác nhận tắt ứng dụng:";
                BtnConfirm.Content = "Xác nhận";
                BtnCancel.Content = "Hủy";
            }
        }
    }
}



