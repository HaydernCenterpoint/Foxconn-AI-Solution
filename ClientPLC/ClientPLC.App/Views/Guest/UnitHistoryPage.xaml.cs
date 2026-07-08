using PLC.Views;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using PLC.Model;
using PLC.Service;

namespace PLC.Views.Guest
{
	public partial class UnitHistoryPage : UserControl
	{
		private List<UnitRecord> _allUnits = new List<UnitRecord>();

		public UnitHistoryPage()
		{
			InitializeComponent();
			this.Loaded += UnitHistoryPage_Loaded;
			this.Unloaded += UnitHistoryPage_Unloaded;
		}

		private void UnitHistoryPage_Loaded(object sender, RoutedEventArgs e)
		{
			// Set default date range to today
			FromDatePicker.SelectedDate = DateTime.Today;
			ToDatePicker.SelectedDate = DateTime.Today;

			// Subscribe to language changes
			LanguageManager.LanguageChanged += OnLanguageChanged;
			ApplyLanguage();

			LoadData();
		}

		private void UnitHistoryPage_Unloaded(object sender, RoutedEventArgs e)
		{
			LanguageManager.LanguageChanged -= OnLanguageChanged;
		}

		private void OnLanguageChanged(object? sender, EventArgs e)
		{
			ApplyLanguage();
		}

		private void ApplyLanguage()
		{
			// Update DataGrid column headers
			if (UnitsDataGrid?.Columns != null && UnitsDataGrid.Columns.Count >= 8)
			{
				((DataGridTextColumn)UnitsDataGrid.Columns[0]).Header = LanguageManager.GetText("UnitHistory.ColID");
				((DataGridTextColumn)UnitsDataGrid.Columns[1]).Header = LanguageManager.GetText("UnitHistory.ColStartTime");
				((DataGridTextColumn)UnitsDataGrid.Columns[2]).Header = LanguageManager.GetText("UnitHistory.ColEndTime");
				((DataGridTextColumn)UnitsDataGrid.Columns[3]).Header = LanguageManager.GetText("UnitHistory.ColCycleTime");
				((DataGridTextColumn)UnitsDataGrid.Columns[4]).Header = LanguageManager.GetText("UnitHistory.ColErrorCount");
				((DataGridTemplateColumn)UnitsDataGrid.Columns[5]).Header = LanguageManager.GetText("UnitHistory.ColStatus");
				((DataGridTextColumn)UnitsDataGrid.Columns[6]).Header = LanguageManager.GetText("UnitHistory.ColShift");
				((DataGridTextColumn)UnitsDataGrid.Columns[7]).Header = LanguageManager.GetText("UnitHistory.ColDate");
			}

			// Update static text
			if (PageTitle != null)
				PageTitle.Text = LanguageManager.GetText("UnitHistory.Title");
			if (TxtFromDate != null)
				TxtFromDate.Text = LanguageManager.GetText("UnitHistory.FromDate");
			if (TxtToDate != null)
				TxtToDate.Text = LanguageManager.GetText("UnitHistory.ToDate");
			if (SearchButton != null)
				SearchButton.Content = LanguageManager.GetText("UnitHistory.BtnSearch");
			if (TxtStatusLabel != null)
				TxtStatusLabel.Text = LanguageManager.GetText("UnitHistory.Status");

			// Update ComboBox items
			if (StatusComboBox?.Items != null && StatusComboBox.Items.Count >= 4)
			{
				((ComboBoxItem)StatusComboBox.Items[0]).Content = LanguageManager.GetText("UnitHistory.StatusAll");
				((ComboBoxItem)StatusComboBox.Items[1]).Content = LanguageManager.GetText("UnitHistory.StatusOK");
				((ComboBoxItem)StatusComboBox.Items[2]).Content = LanguageManager.GetText("UnitHistory.StatusNG");
			}

			if (DetailSectionTitle != null)
				DetailSectionTitle.Text = LanguageManager.GetText("UnitHistory.DetailTitle");
			if (DetailErrorSectionTitle != null)
				DetailErrorSectionTitle.Text = LanguageManager.GetText("UnitHistory.DetailErrorSection");
			if (DetailRobotSectionTitle != null)
				DetailRobotSectionTitle.Text = LanguageManager.GetText("UnitHistory.DetailRobotSection");

			// Re-apply statistics with current data
			UpdateStatistics();
		}

		private void SearchButton_Click(object sender, RoutedEventArgs e)
		{
			LoadData();
		}

		private void StatusComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
		{
			ApplyFilter();
		}

		private void LoadData()
		{
			try
			{
				DateTime? fromDate = FromDatePicker.SelectedDate;
				DateTime? toDate = ToDatePicker.SelectedDate?.AddDays(1).AddSeconds(-1);

				_allUnits = LocalDbService.Instance.GetUnitHistory(
					machineId: "",
					status: "",
					fromDate: fromDate,
					toDate: toDate,
					limit: 500
				);

				ApplyFilter();
				UpdateStatistics();
			}
			catch (Exception ex)
			{
				CustomMessageBox.Show($"L?i t?i d? li?u: {ex.Message}", "L?i", MessageBoxButton.OK, MessageBoxImage.Error);
			}
		}

		private void ApplyFilter()
		{
			if (StatusComboBox?.SelectedItem is ComboBoxItem selectedItem)
			{
				string statusFilter = selectedItem.Tag?.ToString() ?? "";

				var filteredUnits = string.IsNullOrEmpty(statusFilter)
					? _allUnits
					: _allUnits.Where(u => u.Status == statusFilter).ToList();

				if (UnitsDataGrid != null)
				{
					UnitsDataGrid.ItemsSource = filteredUnits;
				}
			}
		}

		private void UpdateStatistics()
		{
			int total = _allUnits.Count;
			int okCount = _allUnits.Count(u => u.Status == "OK");
			int ngCount = _allUnits.Count(u => u.Status == "NG");

			if (TotalCountText != null)
				TotalCountText.Text = LanguageManager.GetText("UnitHistory.StatTotal", total);
			if (OkCountText != null)
				OkCountText.Text = LanguageManager.GetText("UnitHistory.StatOK", okCount);
			if (NgCountText != null)
				NgCountText.Text = LanguageManager.GetText("UnitHistory.StatNG", ngCount);
		}

		private void UnitsDataGrid_MouseDoubleClick(object sender, System.Windows.Input.MouseButtonEventArgs e)
		{
			if (UnitsDataGrid.SelectedItem is UnitRecord unit)
			{
				ShowDetail(unit);
			}
		}

		private void ShowDetail(UnitRecord unit)
		{
			DetailIdText.Text = LanguageManager.GetText("UnitHistory.DetailID", unit.Id);
			DetailTimeText.Text = LanguageManager.GetText("UnitHistory.DetailTime", $"{unit.StartTime:HH:mm:ss} - {unit.EndTime:HH:mm:ss}");
			DetailCycleText.Text = LanguageManager.GetText("UnitHistory.DetailCycle", unit.CycleTimeSeconds.ToString("F1"));

			DetailErrorCountText.Text = LanguageManager.GetText("UnitHistory.DetailErrorCount", unit.ErrorCount);
			DetailQualityOKText.Text = LanguageManager.GetText("UnitHistory.DetailQualityStatus",
				unit.HasQualityFail ? "NG" : "OK");
			DetailQualityNGText.Text = LanguageManager.GetText("UnitHistory.DetailQualityStatus",
				unit.HasQualityFail ? "NG" : "OK");

			DetailFrontRobotText.Text = unit.FrontRobotCount.HasValue
				? LanguageManager.GetText("UnitHistory.DetailFrontRobot", unit.FrontRobotCount)
				: LanguageManager.GetText("UnitHistory.DetailFrontRobot", LanguageManager.GetText("UnitHistory.DetailNA"));
			DetailRearRobotText.Text = unit.RearRobotCount.HasValue
				? LanguageManager.GetText("UnitHistory.DetailRearRobot", unit.RearRobotCount)
				: LanguageManager.GetText("UnitHistory.DetailRearRobot", LanguageManager.GetText("UnitHistory.DetailNA"));

			DetailPanel.Visibility = Visibility.Visible;
		}
	}
}


