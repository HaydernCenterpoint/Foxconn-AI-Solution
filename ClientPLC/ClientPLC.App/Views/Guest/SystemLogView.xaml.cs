using PLC.Views;
using System;
using System.CodeDom.Compiler;
using System.ComponentModel;
using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Markup;
using System.Windows.Media;
using PLC.Network;
using PLC.Service;
using PLC.Config;

namespace PLC.Views;

public partial class SystemLogView : UserControl, ILocalizable
{

	public SystemLogView()
	{
		InitializeComponent();
		base.Loaded += SystemLogView_Loaded;
		base.Unloaded += SystemLogView_Unloaded;
		BtnClear.Click += BtnClear_Click;
		
		PLC.Service.LanguageManager.LanguageChanged += OnLanguageChanged;
	}

	private void SystemLogView_Loaded(object sender, RoutedEventArgs e)
	{
		TranslateUI();
		LogDocument.Blocks.Clear();
		var logs = LogManager.GetLogs();
		foreach (var log in logs)
		{
			AddLogSafe(log);
		}
		LogManager.OnLogAdded += AddLogSafe;

		if (RoleManager.CurrentRole == UserRole.Engineer || RoleManager.CurrentRole == UserRole.Guest)
		{
			BtnClear.IsEnabled = false;
		}
		else
		{
			BtnClear.IsEnabled = true;
		}
	}

	private void SystemLogView_Unloaded(object sender, RoutedEventArgs e)
	{
		LogManager.OnLogAdded -= AddLogSafe;
		PLC.Service.LanguageManager.LanguageChanged -= OnLanguageChanged;
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
		try
		{
			TxtTitle.Text = LanguageManager.GetText("LogTitle") ?? "Nhật Ký Hệ Thống (Log)";
			ChkAutoScroll.Content = LanguageManager.GetText("AutoScroll") ?? "Tự động cuộn";
			BtnClear.Content = LanguageManager.GetText("ClearLog") ?? "Xóa Nhật Ký";
		}
		catch
		{
		}
	}

	private void AddLogSafe(string message)
	{
		if (!base.Dispatcher.CheckAccess())
		{
			base.Dispatcher.BeginInvoke(new Action<string>(AddLogSafe), message);
			return;
		}
		try
		{
			if (LogDocument.Blocks.Count > 1000)
			{
				LogDocument.Blocks.Clear();
			}
			Paragraph paragraph = new Paragraph(new Run(message))
			{
				Margin = new Thickness(0.0, 0.0, 0.0, 4.0)
			};
			
			string theme = (AppSettings.Current.Theme ?? "dark").ToLower();
			bool isDark = theme == "dark";
			
			if (message.Contains("Error") || message.Contains("Lỗi"))
			{
				paragraph.Foreground = new SolidColorBrush(isDark ? Color.FromRgb(248, 113, 113) : Color.FromRgb(200, 30, 30));
			}
			else if (message.Contains("Command") || message.Contains("Nhận lệnh"))
			{
				paragraph.Foreground = new SolidColorBrush(isDark ? Color.FromRgb(56, 189, 248) : Color.FromRgb(20, 80, 200));
			}
			else if (message.Contains("Telemetry") || message.Contains("gửi dữ liệu"))
			{
				paragraph.Foreground = new SolidColorBrush(isDark ? Color.FromRgb(74, 222, 128) : Color.FromRgb(20, 120, 40));
			}
			else
			{
				paragraph.SetResourceReference(Paragraph.ForegroundProperty, "TextSecondary");
			}
			LogDocument.Blocks.Add(paragraph);
			if (ChkAutoScroll.IsChecked == true)
			{
				TxtLog.ScrollToEnd();
			}
		}
		catch
		{
		}
	}

	private void BtnClear_Click(object sender, RoutedEventArgs e)
	{
		try
		{
			LogManager.Clear();
			LogDocument.Blocks.Clear();
		}
		catch (Exception ex)
		{
			CustomMessageBox.Show("Lỗi xóa nhật ký: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Hand);
		}
	}
}


