using PLC.Views;
using System;
using System.CodeDom.Compiler;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Markup;
using System.Windows.Media;
using System.Windows.Shapes;
using Microsoft.Win32;
using PLC.Service;
using PLC.Config;

namespace PLC.Views;

public partial class HistoryQueryView : UserControl, ILocalizable
{
	private List<int> _hourlyProduction = new List<int>(new int[12]);
	private List<ErrorHistoryDisplayItem> _errorHistoryItems = new List<ErrorHistoryDisplayItem>();

	public HistoryQueryView()
	{
		InitializeComponent();
		base.Loaded += HistoryQueryView_Loaded;
		base.Unloaded += HistoryQueryView_Unloaded;
		BtnQuery.Click += BtnQuery_Click;
		ChartCanvas.SizeChanged += ChartCanvas_SizeChanged;

		BtnQueryErrorHistory.Click += BtnQueryErrorHistory_Click;
		BtnExportErrorHistory.Click += BtnExportErrorHistory_Click;

		PLC.Service.LanguageManager.LanguageChanged += OnLanguageChanged;
	}

	private void HistoryQueryView_Unloaded(object sender, RoutedEventArgs e)
	{
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

	private void HistoryQueryView_Loaded(object sender, RoutedEventArgs e)
	{
		DpDate.SelectedDate = DateTime.Today;
		
		// Set filter default values
		DpFromDateFilter.SelectedDate = DateTime.Today;
		DpToDateFilter.SelectedDate = DateTime.Today;

		// Populate machine filter combobox
		CboMachineFilter.Items.Clear();
		CboMachineFilter.Items.Add(new ComboBoxItem { Content = LanguageManager.GetText("Filter.All") ?? "Tất cả", Tag = "" });
		
		var m1 = new ComboBoxItem { Content = "machine-01", Tag = "machine-01" };
		var m2 = new ComboBoxItem { Content = "machine-02", Tag = "machine-02" };
		CboMachineFilter.Items.Add(m1);
		CboMachineFilter.Items.Add(m2);

		string activeMachine = AppConfig.Current.MachineId;
		if (activeMachine != "machine-01" && activeMachine != "machine-02" && !string.IsNullOrEmpty(activeMachine))
		{
			CboMachineFilter.Items.Add(new ComboBoxItem { Content = activeMachine, Tag = activeMachine });
		}
		CboMachineFilter.SelectedIndex = 0;

		// Apply Dark Industrial theme style
		ApplyThemeStyles();

		TranslateUI();
	}

	private void ApplyThemeStyles()
	{
		try
		{
			UiTheme.ApplyDarkDataGridViewStyle(DgErrorHistory);
			
			UiTheme.ApplyDarkComboBoxStyle(CboShift);
			UiTheme.ApplyDarkComboBoxStyle(CboMachineFilter);
			UiTheme.ApplyDarkComboBoxStyle(CboStatusFilter);
			UiTheme.ApplyDarkComboBoxStyle(CboErrorShiftFilter);

			UiTheme.ApplyDarkTextBoxStyle(TxtErrorCodeFilter, "Lọc mã lỗi...");

			UiTheme.ApplyPrimaryButtonStyle(BtnQuery);
			UiTheme.ApplyPrimaryButtonStyle(BtnQueryErrorHistory);
			UiTheme.ApplyDarkButtonStyle(BtnExportErrorHistory);
		}
		catch (Exception ex)
		{
			Debug.WriteLine("[HistoryQueryView] Error applying theme styles: " + ex.Message);
		}
	}

	private void BtnQuery_Click(object sender, RoutedEventArgs e)
	{
		if (!DpDate.SelectedDate.HasValue)
		{
			CustomMessageBox.Show(LanguageManager.GetText("SelectDateError") ?? "Vui lòng chọn ngày để tra cứu!", LanguageManager.GetText("Notice") ?? "Thông báo", MessageBoxButton.OK, MessageBoxImage.Exclamation);
			return;
		}
		string text = DpDate.SelectedDate.Value.ToString("yyyy-MM-dd");
		string text2 = (CboShift.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "Day";
		try
		{
			ShiftSummary shiftSummary = LocalDbService.Instance.GetShiftSummary(text, text2);
			_hourlyProduction = shiftSummary.HourlyProduction ?? new List<int>(new int[12]);
			TxtShiftDate.Text = ((shiftSummary.RecordCount > 0) ? shiftSummary.ShiftDate : text);
			TxtShiftName.Text = ((shiftSummary.RecordCount <= 0) ? text2 : ((shiftSummary.ShiftName == "Day") ? (LanguageManager.GetText("CboItemDay") ?? "Ca Sáng") : (LanguageManager.GetText("CboItemNight") ?? "Ca Tối")));
			TxtTotalQty.Text = $"{shiftSummary.ProductionQty} sp";
			TxtOeeVal.Text = $"{shiftSummary.Oee:F1}%";
			TimeSpan timeSpan = TimeSpan.FromSeconds(shiftSummary.PlcRuntimeSeconds);
			if (timeSpan.TotalHours >= 1.0)
			{
				TxtPlcUptime.Text = $"{(int)timeSpan.TotalHours}h {timeSpan.Minutes}m";
			}
			else
			{
				TxtPlcUptime.Text = $"{(int)timeSpan.TotalMinutes}m {timeSpan.Seconds}s";
			}
			TxtAvgSpeed.Text = $"{shiftSummary.AvgSpeedPerHour:F1} sp/giờ";
			SetGaugeValue(GaugeAvailability, shiftSummary.Availability);
			SetGaugeValue(GaugePerformance, shiftSummary.Performance);
			GridResults.Visibility = Visibility.Visible;
			DrawChart();
			PLC.Service.LogManager.AddLog($"HistoryQuery: Tra cứu thành công ngày {text}, {text2}. Kết quả: OEE={shiftSummary.Oee:F1}%, Sản lượng={shiftSummary.ProductionQty} sp, Thời gian chạy={shiftSummary.PlcRuntimeSeconds}s.");
		}
		catch (Exception ex)
		{
			PLC.Service.LogManager.AddLog($"HistoryQuery Error: Lỗi tra cứu dữ liệu ngày {text}, {text2} - {ex.Message}");
			CustomMessageBox.Show("Lỗi tra cứu dữ liệu: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Hand);
		}
	}

	private void BtnQueryErrorHistory_Click(object sender, RoutedEventArgs e)
	{
		try
		{
			string machineId = (CboMachineFilter.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "";
			string errorCode = TxtErrorCodeFilter.Text.Trim();
			string status = (CboStatusFilter.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "";
			string shift = (CboErrorShiftFilter.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "";
			
			DateTime? fromDate = DpFromDateFilter.SelectedDate;
			if (fromDate.HasValue)
			{
				fromDate = fromDate.Value.Date; // Start of day
			}
			
			DateTime? toDate = DpToDateFilter.SelectedDate;
			if (toDate.HasValue)
			{
				toDate = toDate.Value.Date.AddDays(1).AddTicks(-1); // End of day
			}

			var rawHistory = LocalDbService.Instance.GetErrorHistory(machineId, errorCode, status, fromDate, toDate, shift);
			_errorHistoryItems.Clear();

			int index = 1;
			foreach (var row in rawHistory)
			{
				_errorHistoryItems.Add(new ErrorHistoryDisplayItem
				{
					Index = index++,
					MachineId = row.ContainsKey("MachineId") ? row["MachineId"]?.ToString() ?? "" : "",
					ErrorCode = row.ContainsKey("ErrorCode") ? row["ErrorCode"]?.ToString() ?? "" : "",
					ErrorName = row.ContainsKey("ErrorName") && !string.IsNullOrWhiteSpace(row["ErrorName"]?.ToString())
						? row["ErrorName"].ToString()
						: (row.ContainsKey("ErrorCode") ? row["ErrorCode"]?.ToString() ?? "" : ""),
					Address = row.ContainsKey("Address") ? row["Address"]?.ToString() ?? "" : "",
					Severity = row.ContainsKey("Severity") ? row["Severity"]?.ToString() ?? "" : "",
					StartedAt = row.ContainsKey("StartedAt") ? row["StartedAt"]?.ToString() ?? "" : "",
					EndedAt = row.ContainsKey("EndedAt") ? row["EndedAt"]?.ToString() ?? "" : "",
					DurationSeconds = row.ContainsKey("DurationSeconds") ? Convert.ToInt32(row["DurationSeconds"]) : 0,
					Status = row.ContainsKey("Status") ? row["Status"]?.ToString() ?? "" : ""
				});
			}

			DgErrorHistory.ItemsSource = null;
			DgErrorHistory.ItemsSource = _errorHistoryItems;
		}
		catch (Exception ex)
		{
			CustomMessageBox.Show("Lỗi tra cứu lịch sử lỗi: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Error);
		}
	}

	private void BtnExportErrorHistory_Click(object sender, RoutedEventArgs e)
	{
		if (_errorHistoryItems == null || _errorHistoryItems.Count == 0)
		{
			CustomMessageBox.Show(LanguageManager.GetText("Error.NoDataToExport") ?? "Không có dữ liệu để xuất!", LanguageManager.GetText("Notice") ?? "Thông báo", MessageBoxButton.OK, MessageBoxImage.Information);
			return;
		}

		try
		{
			SaveFileDialog saveFileDialog = new SaveFileDialog();
			saveFileDialog.Filter = "CSV File (*.csv)|*.csv";
			saveFileDialog.FileName = $"ErrorHistory_{DateTime.Now:yyyyMMdd_HHmmss}.csv";
			
			if (saveFileDialog.ShowDialog() == true)
			{
				StringBuilder stringBuilder = new StringBuilder();
				stringBuilder.AppendLine("STT,Ma may,Ma loi,Ten loi,Dia chi PLC,Muc do,Bat dau,Ket thuc,Tong thoi gian (giay),Trang thai");
				
				foreach (var item in _errorHistoryItems)
				{
					stringBuilder.AppendLine($"{item.Index},\"{item.MachineId}\",\"{item.ErrorCode}\",\"{item.ErrorName}\",\"{item.Address}\",\"{item.Severity}\",\"{item.StartedAt}\",\"{item.EndedAt}\",{item.DurationSeconds},\"{item.StatusText}\"");
				}

				File.WriteAllText(saveFileDialog.FileName, stringBuilder.ToString(), Encoding.UTF8);
				CustomMessageBox.Show(LanguageManager.GetText("ExportSuccess") ?? "Xuất báo cáo lịch sử lỗi thành công!", LanguageManager.GetText("Notice") ?? "Thông báo", MessageBoxButton.OK, MessageBoxImage.Information);
			}
		}
		catch (Exception ex)
		{
			CustomMessageBox.Show("Lỗi xuất file: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Error);
		}
	}

	private void SetGaugeValue(Ellipse ellipse, double percent)
	{
		try
		{
			double strokeThickness = ellipse.StrokeThickness;
			double num = ellipse.Width - strokeThickness;
			double num2 = Math.PI * num;
			double num3 = num2 / strokeThickness;
			double num4 = Math.Min(100.0, Math.Max(0.0, percent));
			double num5 = num3 * (num4 / 100.0);
			double num6 = num3 * (1.0 - num4 / 100.0);
			ellipse.StrokeDashArray = new DoubleCollection(new double[2] { num5, num6 });
		}
		catch
		{
		}
	}

	private void DrawChart()
	{
		if (GridResults.Visibility != Visibility.Visible)
		{
			return;
		}
		ChartCanvas.Children.Clear();
		double actualWidth = ChartCanvas.ActualWidth;
		double actualHeight = ChartCanvas.ActualHeight;
		if (actualWidth <= 0.0 || actualHeight <= 0.0)
		{
			return;
		}
		double num = 30.0;
		double num2 = 20.0;
		double num3 = 10.0;
		double num4 = 10.0;
		double num5 = actualWidth - num - num3;
		double num6 = actualHeight - num2 - num4;
		int num7 = 10;
		foreach (int item in _hourlyProduction)
		{
			if (item > num7)
			{
				num7 = item;
			}
		}
		num7 = (num7 + 9) / 10 * 10;
		Brush stroke = new SolidColorBrush(Color.FromArgb(15, 128, 128, 128));
		Brush foreground = (Brush)FindResource("TextSecondary");
		for (int i = 0; i <= 4; i++)
		{
			double num8 = num2 + num6 - num6 * (double)i / 4.0;
			int num9 = num7 * i / 4;
			Line element = new Line
			{
				X1 = num,
				Y1 = num8,
				X2 = actualWidth - num3,
				Y2 = num8,
				Stroke = stroke,
				StrokeThickness = 1.0
			};
			ChartCanvas.Children.Add(element);
			TextBlock element2 = new TextBlock
			{
				Text = num9.ToString(),
				FontSize = 9.0,
				Foreground = foreground,
				TextAlignment = TextAlignment.Right,
				Width = num - 5.0
			};
			Canvas.SetLeft(element2, 0.0);
			Canvas.SetTop(element2, num8 - 6.0);
			ChartCanvas.Children.Add(element2);
		}
		double num10 = 6.0;
		double val = num5 / 12.0 - num10;
		Brush accentBrush = (Brush)FindResource("AccentColor");
		Brush hoverBrush = (Brush)FindResource("AccentHover");
		for (int j = 0; j < 12; j++)
		{
			int num11 = _hourlyProduction[j];
			double num12 = ((num7 > 0) ? (num6 * (double)num11 / (double)num7) : 0.0);
			double length = num + (double)j * (num5 / 12.0) + num10 / 2.0;
			double length2 = num2 + num6 - num12;
			if (num12 > 0.0)
			{
				Rectangle rect = new Rectangle
				{
					Width = Math.Max(2.0, val),
					Height = num12,
					Fill = accentBrush,
					RadiusX = 3.0,
					RadiusY = 3.0,
					ToolTip = $"{LanguageManager.GetText("Value") ?? "Sản lượng"}: {num11} sp"
				};
				rect.MouseEnter += delegate
				{
					rect.Fill = hoverBrush;
				};
				rect.MouseLeave += delegate
				{
					rect.Fill = accentBrush;
				};
				Canvas.SetLeft(rect, length);
				Canvas.SetTop(rect, length2);
				ChartCanvas.Children.Add(rect);
			}
		}
	}

	private void ChartCanvas_SizeChanged(object sender, SizeChangedEventArgs e)
	{
		DrawChart();
	}

	public void TranslateUI()
	{
		try
		{
			TxtTitle.Text = LanguageManager.GetText("SysHistoryQuery") ?? "\ud83d\udd0d TRA CỨU LỊCH SỬ HIỆU SUẤT";
			LblSelectDate.Text = LanguageManager.GetText("SelectDateLabel") ?? "Chọn ngày:";
			LblSelectShift.Text = LanguageManager.GetText("SelectShiftLabel") ?? "Chọn ca:";
			BtnQuery.Content = LanguageManager.GetText("QueryBtn") ?? "\ud83d\udd0d Tra Cứu";
			CboItemDay.Content = LanguageManager.GetText("CboItemDay") ?? "Ca Sáng (07:30 - 19:30)";
			CboItemNight.Content = LanguageManager.GetText("CboItemNight") ?? "Ca Tối (19:30 - 07:30)";
			TxtSummaryTitle.Text = LanguageManager.GetText("SummaryTitle") ?? "\ud83d\udccb BÁO CÁO CHI TIẾT CA";
			LblAvailability.Text = LanguageManager.GetText("AvailabilityLabel") ?? "Sẵn sàng (A)";
			LblPerformance.Text = LanguageManager.GetText("PerformanceLabel") ?? "Hiệu suất (P)";
			LblShiftDateLabel.Text = LanguageManager.GetText("ShiftDateLabel") ?? "Ngày làm việc:";
			LblShiftNameLabel.Text = LanguageManager.GetText("ShiftNameLabel") ?? "Ca làm việc:";
			LblTotalQtyLabel.Text = LanguageManager.GetText("TotalQtyLabel") ?? "Tổng sản lượng ca:";
			LblOeeLabel.Text = LanguageManager.GetText("OeeLabel") ?? "Hiệu suất OEE đạt:";
			LblPlcUptimeLabel.Text = LanguageManager.GetText("PlcUptimeLabel") ?? "Thời gian chạy máy:";
			LblAvgSpeedLabel.Text = LanguageManager.GetText("AvgSpeedLabel") ?? "Vận tốc trung bình ca:";
			TxtChartTitle.Text = LanguageManager.GetText("hourlyChartTitle") ?? "\ud83d\udcca BIỂU ĐỒ VẬN HÀNH THEO GIỜ";

			if (TxtTabOeePerformance != null)
				TxtTabOeePerformance.Text = LanguageManager.GetText("TabOeePerformance") ?? "Hiệu suất OEE";
			if (TxtTabErrorHistory != null)
				TxtTabErrorHistory.Text = LanguageManager.GetText("TabErrorHistory") ?? "Lịch sử lỗi";
			if (LblMachineFilter != null)
				LblMachineFilter.Text = LanguageManager.GetText("LabelMachine") ?? "Máy:";
			if (LblErrorCodeFilter != null)
				LblErrorCodeFilter.Text = LanguageManager.GetText("LabelErrorCode") ?? "Mã lỗi:";
			if (LblStatusFilter != null)
				LblStatusFilter.Text = LanguageManager.GetText("LabelStatus") ?? "Trạng thái:";
			if (CboItemAllStatus != null)
				CboItemAllStatus.Content = LanguageManager.GetText("Filter.All") ?? "Tất cả";
			if (CboItemActiveStatus != null)
				CboItemActiveStatus.Content = LanguageManager.GetText("Status.Active") ?? "Hoạt động";
			if (CboItemResolvedStatus != null)
				CboItemResolvedStatus.Content = LanguageManager.GetText("Status.Recovered") ?? "Đã khôi phục";
			if (LblErrorShiftFilter != null)
				LblErrorShiftFilter.Text = LanguageManager.GetText("SelectShiftLabel") ?? (LanguageManager.GetText("Shift") ?? "Ca:");
			if (CboItemAllErrorShift != null)
				CboItemAllErrorShift.Content = LanguageManager.GetText("Filter.All") ?? "Tất cả";
			if (CboItemDayErrorShift != null)
				CboItemDayErrorShift.Content = LanguageManager.GetText("Shift.DayLabel") ?? "Ca sáng";
			if (CboItemNightErrorShift != null)
				CboItemNightErrorShift.Content = LanguageManager.GetText("Shift.NightLabel") ?? "Ca tối";
			if (LblFromDateFilter != null)
				LblFromDateFilter.Text = LanguageManager.GetText("LabelFromDate") ?? "Từ ngày:";
			if (LblToDateFilter != null)
				LblToDateFilter.Text = LanguageManager.GetText("LabelToDate") ?? "Đến ngày:";
			if (TxtBtnQueryErrorHistory != null)
				TxtBtnQueryErrorHistory.Text = LanguageManager.GetText("QueryBtn") ?? "Tra cứu";
			if (TxtBtnExportErrorHistory != null)
				TxtBtnExportErrorHistory.Text = LanguageManager.GetText("CfgBtnExportAlarm") ?? "Xuất CSV";

			// DataGrid columns
			if (ColIndex != null) ColIndex.Header = LanguageManager.GetText("ColIndex") ?? "STT";
			if (ColMachineId != null) ColMachineId.Header = LanguageManager.GetText("ColMachineId") ?? "Mã máy";
			if (ColErrorCode != null) ColErrorCode.Header = LanguageManager.GetText("ColErrorCode") ?? "Mã lỗi";
			if (ColErrorName != null) ColErrorName.Header = LanguageManager.GetText("ColErrorName") ?? "Tên lỗi";
			if (ColAddress != null) ColAddress.Header = LanguageManager.GetText("ColAddress") ?? "Địa chỉ PLC";
			if (ColSeverity != null) ColSeverity.Header = LanguageManager.GetText("ColSeverity") ?? "Mức độ";
			if (ColStartedAt != null) ColStartedAt.Header = LanguageManager.GetText("ColStartedAt") ?? "Thời gian bắt đầu";
			if (ColEndedAt != null) ColEndedAt.Header = LanguageManager.GetText("ColEndedAt") ?? "Thời gian kết thúc";
			if (ColDuration != null) ColDuration.Header = LanguageManager.GetText("ColDuration") ?? "Tổng thời gian lỗi";
			if (ColStatus != null) ColStatus.Header = LanguageManager.GetText("ColStatus") ?? "Trạng thái";
		}
		catch
		{
		}
	}
}

public class ErrorHistoryDisplayItem
{
	public int Index { get; set; }
	public string MachineId { get; set; }
	public string ErrorCode { get; set; }
	public string ErrorName { get; set; }
	public string Address { get; set; }
	public string Severity { get; set; }
	public string StartedAt { get; set; }
	public string EndedAt { get; set; }
	public int DurationSeconds { get; set; }
	public string DurationText => DurationSeconds > 0 ? $"{DurationSeconds}s" : "";
	public string Status { get; set; }
	public string StatusText => Status == "Active" ? (LanguageManager.GetText("Status.Active") ?? "Hoạt động") : (LanguageManager.GetText("Status.Recovered") ?? "Đã khôi phục");
}


