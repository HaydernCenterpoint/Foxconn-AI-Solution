using System;
using System.Windows;
using WinForms = System.Windows.Forms;

namespace PLC;

public partial class MainWindow
{
	private void InitializeTrayIcon()
	{
		try
		{
			_notifyIcon = new WinForms.NotifyIcon();
			_notifyIcon.Text = "Client PLC Dashboard";

			try
			{
				string exePath = Environment.ProcessPath ?? "";
				if (System.IO.File.Exists(exePath))
				{
					_notifyIcon.Icon = System.Drawing.Icon.ExtractAssociatedIcon(exePath);
				}
			}
			catch
			{
				_notifyIcon.Icon = System.Drawing.SystemIcons.Application;
			}

			if (_notifyIcon.Icon == null)
			{
				_notifyIcon.Icon = System.Drawing.SystemIcons.Application;
			}

			var contextMenu = new WinForms.ContextMenuStrip();

			var showItem = new WinForms.ToolStripMenuItem();
			showItem.Text = "Hiện giao diện";
			showItem.Click += (s, e) => RestoreWindow();

			var exitItem = new WinForms.ToolStripMenuItem();
			exitItem.Text = "Thoát hệ thống";
			exitItem.Click += (s, e) => ExitApplication();

			contextMenu.Items.Add(showItem);
			contextMenu.Items.Add(new WinForms.ToolStripSeparator());
			contextMenu.Items.Add(exitItem);

			_notifyIcon.ContextMenuStrip = contextMenu;
			_notifyIcon.Visible = true;

			_notifyIcon.DoubleClick += (s, e) => RestoreWindow();
		}
		catch (Exception ex)
		{
			System.Diagnostics.Debug.WriteLine("[MainWindow] Error initializing tray icon: " + ex.Message);
		}
	}

	private void RestoreWindow()
	{
		this.Show();
		if (this.WindowState == WindowState.Minimized)
		{
			this.WindowState = WindowState.Normal;
		}
		this.Activate();
	}

	private void ExitApplication()
	{
		var pwWin = new PLC.Views.ShutdownPasswordWindow();
		if (this.IsVisible)
		{
			pwWin.Owner = this;
		}
		pwWin.ShowDialog();
		if (pwWin.IsPasswordCorrect)
		{
			_isExplicitClose = true;
			this.Close();
		}
	}
}
