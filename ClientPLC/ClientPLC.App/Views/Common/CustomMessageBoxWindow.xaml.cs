using System;
using System.Windows;
using System.Windows.Input;
using PLC.Service;

namespace PLC.Views
{
    public partial class CustomMessageBoxWindow : Window
    {
        public MessageBoxResult Result { get; private set; } = MessageBoxResult.None;

        private readonly string _initialTitle;
        public CustomMessageBoxWindow(string message, string title, MessageBoxButton button, MessageBoxImage icon)
        {
            InitializeComponent();
            _initialTitle = title;

            // Set Message
            TxtMessage.Text = message;

            // Set Icon
            int iconVal = (int)icon;
            if (iconVal == 64)
            {
                MsgBoxIconPath.Data = (System.Windows.Media.Geometry)FindResource("IconInfo");
                MsgBoxIconPath.Stroke = System.Windows.Media.Brushes.DodgerBlue;
            }
            else if (iconVal == 48)
            {
                MsgBoxIconPath.Data = (System.Windows.Media.Geometry)FindResource("IconTriangleAlert");
                MsgBoxIconPath.Stroke = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(0xF5, 0x9E, 0x0B));
            }
            else if (iconVal == 16)
            {
                MsgBoxIconPath.Data = (System.Windows.Media.Geometry)FindResource("IconCircleOff");
                MsgBoxIconPath.Stroke = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(0xEF, 0x44, 0x44));
            }
            else if (iconVal == 32)
            {
                MsgBoxIconPath.Data = (System.Windows.Media.Geometry)FindResource("IconInfo");
                MsgBoxIconPath.Stroke = System.Windows.Media.Brushes.MediumPurple;
            }
            else
            {
                MsgBoxIconPath.Data = (System.Windows.Media.Geometry)FindResource("IconInfo");
                MsgBoxIconPath.Stroke = (System.Windows.Media.Brush)FindResource("AccentColor");
            }

            this.Closed += (s, e) => {
                PLC.Service.LanguageManager.LanguageChanged -= OnLanguageChanged;
            };
            PLC.Service.LanguageManager.LanguageChanged += OnLanguageChanged;
            TranslateUI();

            switch (button)
            {
                case MessageBoxButton.OK:
                    BtnOK.Visibility = Visibility.Visible;
                    break;
                case MessageBoxButton.OKCancel:
                    BtnOK.Visibility = Visibility.Visible;
                    BtnCancel.Visibility = Visibility.Visible;
                    break;
                case MessageBoxButton.YesNo:
                    BtnYes.Visibility = Visibility.Visible;
                    BtnNo.Visibility = Visibility.Visible;
                    BtnOK.Visibility = Visibility.Collapsed;
                    break;
                case MessageBoxButton.YesNoCancel:
                    BtnYes.Visibility = Visibility.Visible;
                    BtnNo.Visibility = Visibility.Visible;
                    BtnCancel.Visibility = Visibility.Visible;
                    BtnOK.Visibility = Visibility.Collapsed;
                    break;
            }

            // Drag support
            this.MouseLeftButtonDown += (s, e) =>
            {
                if (e.ButtonState == MouseButtonState.Pressed)
                {
                    this.DragMove();
                }
            };

            // Buttons handlers
            BtnOK.Click += (s, e) => { Result = MessageBoxResult.OK; this.Close(); };
            BtnCancel.Click += (s, e) => { Result = MessageBoxResult.Cancel; this.Close(); };
            BtnYes.Click += (s, e) => { Result = MessageBoxResult.Yes; this.Close(); };
            BtnNo.Click += (s, e) => { Result = MessageBoxResult.No; this.Close(); };
            BtnCloseTitle.Click += (s, e) =>
            {
                if (button == MessageBoxButton.YesNo)
                {
                    Result = MessageBoxResult.No;
                }
                else
                {
                    Result = MessageBoxResult.Cancel;
                }
                this.Close();
            };

            // Center relative to owner if possible
            if (Application.Current.MainWindow != null && Application.Current.MainWindow != this)
            {
                this.Owner = Application.Current.MainWindow;
                this.WindowStartupLocation = WindowStartupLocation.CenterOwner;
            }
        }

        private void OnLanguageChanged(object? sender, EventArgs e)
        {
            ApplyLanguage();
        }

        public void ApplyLanguage()
        {
            TranslateUI();
        }

        public void TranslateUI()
        {
            TxtTitle.Text = (string.IsNullOrEmpty(_initialTitle) || _initialTitle == "Thông báo" || _initialTitle == "Notice") ? (LanguageManager.GetText("Notice") ?? "Thông báo") : _initialTitle;
            BtnYes.Content = LanguageManager.GetText("BtnYes") ?? "Có";
            BtnNo.Content = LanguageManager.GetText("BtnNo") ?? "Không";
            BtnOK.Content = LanguageManager.GetText("BtnOK") ?? "Đồng ý";
            BtnCancel.Content = LanguageManager.GetText("BtnCancel") ?? "Hủy";
        }
    }

    public static class CustomMessageBox
    {
        public static MessageBoxResult Show(string messageBoxText, string caption = "Thông báo", MessageBoxButton button = MessageBoxButton.OK, MessageBoxImage icon = MessageBoxImage.None)
        {
            MessageBoxResult result = MessageBoxResult.None;
            Application.Current.Dispatcher.Invoke(() =>
            {
                var win = new CustomMessageBoxWindow(messageBoxText, caption, button, icon);
                win.ShowDialog();
                result = win.Result;
            });
            return result;
        }
    }
}

