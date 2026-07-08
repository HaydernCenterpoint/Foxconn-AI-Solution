using System;
using System.Windows;
using PLC.Config;
using PLC.Service;
using PLC.Network;

namespace PLC;

public partial class MainWindow
{
	private void BtnLogin_Click(object sender, RoutedEventArgs e)
	{
		var loginWin = new PLC.Views.LoginWindow();
		loginWin.Owner = this;
		loginWin.ShowDialog();
	}

	private void ApplyRoleRestrictions()
	{
		UserRole role = RoleManager.CurrentRole;

		// Update menu bar visibilities
		if (role == UserRole.Guest)
		{
			MnuGuestHome.Visibility = Visibility.Visible;
			MnuGuestAlerts.Visibility = Visibility.Visible;
			MnuGuestProdAnalysis.Visibility = Visibility.Visible;
			MnuGuestDataTable.Visibility = Visibility.Visible;

			MnuMonitor.Visibility = Visibility.Collapsed;
			MnuPlc.Visibility = Visibility.Collapsed;
			MnuErrorsLogs.Visibility = Visibility.Collapsed;
			MnuTools.Visibility = Visibility.Collapsed;
			MnuSettings.Visibility = Visibility.Collapsed;

			if (ChkServerToggle != null)
			{
				ChkServerToggle.IsChecked = MqttClientService.Instance.ServerCommEnabled;
				ChkServerToggle.IsEnabled = false;
			}

			// If current view is restricted, redirect to public dashboard
			if (!IsViewAccessibleForRole(_activeViewName, role))
			{
				ShowView("dashboard.performance");
			}
		}
		else if (role == UserRole.Engineer)
		{
			MnuGuestHome.Visibility = Visibility.Collapsed;
			MnuGuestAlerts.Visibility = Visibility.Collapsed;
			MnuGuestProdAnalysis.Visibility = Visibility.Collapsed;
			MnuGuestDataTable.Visibility = Visibility.Collapsed;

			MnuMonitor.Visibility = Visibility.Visible;
			MnuPlc.Visibility = Visibility.Visible;
			MnuErrorsLogs.Visibility = Visibility.Visible;
			MnuTools.Visibility = Visibility.Collapsed;
			MnuSettings.Visibility = Visibility.Collapsed;

			if (ChkServerToggle != null)
			{
				ChkServerToggle.IsEnabled = true;
			}

			// If current view is restricted, redirect to public dashboard
			if (!IsViewAccessibleForRole(_activeViewName, role))
			{
				ShowView("dashboard.performance");
			}
		}
		else // Admin
		{
			MnuGuestHome.Visibility = Visibility.Collapsed;
			MnuGuestAlerts.Visibility = Visibility.Collapsed;
			MnuGuestProdAnalysis.Visibility = Visibility.Collapsed;
			MnuGuestDataTable.Visibility = Visibility.Collapsed;

			MnuMonitor.Visibility = Visibility.Visible;
			MnuPlc.Visibility = Visibility.Visible;
			MnuErrorsLogs.Visibility = Visibility.Visible;
			MnuTools.Visibility = Visibility.Collapsed;
			MnuSettings.Visibility = Visibility.Visible;

			if (ChkServerToggle != null)
			{
				ChkServerToggle.IsEnabled = true;
			}
		}

		UpdateRoleDisplay();
	}

	private bool IsViewAccessibleForRole(string viewName, UserRole role)
	{
		if (role == UserRole.Guest)
		{
			return viewName.StartsWith("dashboard.") ||
			       viewName == "Dashboard" ||
			       viewName == "LiveStatus" ||
			       viewName == "logs.errorList" ||
			       viewName == "LiveErrors" ||
			       viewName == "logs.systemLog" ||
			       viewName == "logs.errorHistory" ||
			       viewName == "plc.dataTable" ||
			       viewName == "DataTable";
		}
		else if (role == UserRole.Engineer)
		{
			return !viewName.StartsWith("settings.") && viewName != "Settings";
		}
		return true;
	}

	private void UpdateRoleDisplay()
	{
		UserRole role = RoleManager.CurrentRole;
		string lang = LanguageManager.CurrentLanguageCode.ToLower();
		string roleName = "";
		if (lang.StartsWith("zh") || lang.StartsWith("cn"))
		{
			roleName = role switch
			{
				UserRole.Guest => "访客",
				UserRole.Engineer => "工程师",
				UserRole.Admin => "管理员",
				_ => "访客"
			};
		}
		else if (lang.StartsWith("en"))
		{
			roleName = role switch
			{
				UserRole.Guest => "Guest",
				UserRole.Engineer => "Engineer",
				UserRole.Admin => "Admin",
				_ => "Guest"
			};
		}
		else
		{
			roleName = role switch
			{
				UserRole.Guest => "Khách",
				UserRole.Engineer => "Kỹ sư",
				UserRole.Admin => "Admin",
				_ => "Khách"
			};
		}
		TxtRoleDisplay.Text = roleName;
	}
}
