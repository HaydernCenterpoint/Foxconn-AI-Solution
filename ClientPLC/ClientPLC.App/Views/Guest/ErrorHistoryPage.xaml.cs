using PLC.Views;
using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Win32;
using PLC.Config;
using PLC.Service;
using MessageBox = PLC.Views.CustomMessageBox;

namespace PLC.Views
{
    public partial class ErrorHistoryPage : UserControl, ILocalizable
    {
        private List<ErrorHistoryDisplayItem> _errorHistoryItems = new List<ErrorHistoryDisplayItem>();

        public ErrorHistoryPage()
        {
            InitializeComponent();
            this.Loaded += ErrorHistoryPage_Loaded;
            BtnQueryErrorHistory.Click += BtnQueryErrorHistory_Click;
            BtnExportErrorHistory.Click += BtnExportErrorHistory_Click;
        }

        private void ErrorHistoryPage_Loaded(object sender, RoutedEventArgs e)
        {
            DpFromDateFilter.SelectedDate = DateTime.Today;
            DpToDateFilter.SelectedDate = DateTime.Today;

            CboMachineFilter.Items.Clear();
            CboMachineFilter.Items.Add(new ComboBoxItem { Content = LanguageManager.GetText("Filter.All") ?? "Tất cả", Tag = "" });
            CboMachineFilter.Items.Add(new ComboBoxItem { Content = "machine-01", Tag = "machine-01" });
            CboMachineFilter.Items.Add(new ComboBoxItem { Content = "machine-02", Tag = "machine-02" });

            string activeMachine = AppConfig.Current.MachineId;
            if (activeMachine != "machine-01" && activeMachine != "machine-02" && !string.IsNullOrEmpty(activeMachine))
            {
                CboMachineFilter.Items.Add(new ComboBoxItem { Content = activeMachine, Tag = activeMachine });
            }
            CboMachineFilter.SelectedIndex = 0;

            try
            {
                UiTheme.ApplyDarkDataGridViewStyle(DgErrorHistory);
                UiTheme.ApplyDarkComboBoxStyle(CboMachineFilter);
                UiTheme.ApplyDarkComboBoxStyle(CboStatusFilter);
                UiTheme.ApplyDarkComboBoxStyle(CboShiftFilter);
                UiTheme.ApplyDarkTextBoxStyle(TxtErrorCodeFilter, "Lọc mã lỗi...");
                UiTheme.ApplyPrimaryButtonStyle(BtnQueryErrorHistory);
                UiTheme.ApplyDarkButtonStyle(BtnExportErrorHistory);
            }
            catch { }

            TranslateUI();
        }

        private void BtnQueryErrorHistory_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                string machineId = (CboMachineFilter.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "";
                string errorCode = TxtErrorCodeFilter.Text.Trim();
                string status = (CboStatusFilter.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "";
                string shift = (CboShiftFilter.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "";

                DateTime? fromDate = DpFromDateFilter.SelectedDate;
                if (fromDate.HasValue) fromDate = fromDate.Value.Date;

                DateTime? toDate = DpToDateFilter.SelectedDate;
                if (toDate.HasValue) toDate = toDate.Value.Date.AddDays(1).AddTicks(-1);

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
            if (_errorHistoryItems.Count == 0)
            {
                CustomMessageBox.Show("Không có dữ liệu để xuất!", "Thông báo", MessageBoxButton.OK, MessageBoxImage.Information);
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
                    CustomMessageBox.Show("Xuất báo cáo lịch sử lỗi thành công!", "Thông báo", MessageBoxButton.OK, MessageBoxImage.Information);
                }
            }
            catch (Exception ex)
            {
                CustomMessageBox.Show("Lỗi xuất file: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        public void TranslateUI()
        {
            try
            {
                LblMachineFilter.Text = LanguageManager.GetText("LabelMachine") ?? "Máy:";
                LblErrorCodeFilter.Text = LanguageManager.GetText("LabelErrorCode") ?? "Mã lỗi:";
                LblStatusFilter.Text = LanguageManager.GetText("LabelStatus") ?? "Trạng thái:";
                CboItemAllStatus.Content = LanguageManager.GetText("Filter.All") ?? "Tất cả";
                CboItemActiveStatus.Content = LanguageManager.GetText("Status.Active") ?? "Hoạt động";
                CboItemResolvedStatus.Content = LanguageManager.GetText("Status.Recovered") ?? "Đã khôi phục";
                LblShiftFilter.Text = LanguageManager.GetText("SelectShiftLabel") ?? (LanguageManager.GetText("Shift") ?? "Ca:");
                CboItemAllShift.Content = LanguageManager.GetText("Filter.All") ?? "Tất cả";
                CboItemDayShift.Content = LanguageManager.GetText("Shift.DayLabel") ?? "Ca sáng";
                CboItemNightShift.Content = LanguageManager.GetText("Shift.NightLabel") ?? "Ca tối";
                LblFromDateFilter.Text = LanguageManager.GetText("LabelFromDate") ?? "Từ ngày:";
                LblToDateFilter.Text = LanguageManager.GetText("LabelToDate") ?? "Đến ngày:";
                TxtBtnQueryErrorHistory.Text = LanguageManager.GetText("QueryBtn") ?? "Tra cứu";
                TxtBtnExportErrorHistory.Text = LanguageManager.GetText("CfgBtnExportAlarm") ?? "Xuất CSV";

                ColIndex.Header = LanguageManager.GetText("ColIndex") ?? "STT";
                ColMachineId.Header = LanguageManager.GetText("ColMachineId") ?? "Mã máy";
                ColErrorCode.Header = LanguageManager.GetText("ColErrorCode") ?? "Mã lỗi";
                ColErrorName.Header = LanguageManager.GetText("ColErrorName") ?? "Tên lỗi";
                ColAddress.Header = LanguageManager.GetText("ColAddress") ?? "Địa chỉ PLC";
                ColSeverity.Header = LanguageManager.GetText("ColSeverity") ?? "Mức độ";
                ColStartedAt.Header = LanguageManager.GetText("ColStartedAt") ?? "Thời gian bắt đầu";
                ColEndedAt.Header = LanguageManager.GetText("ColEndedAt") ?? "Thời gian kết thúc";
                ColDuration.Header = LanguageManager.GetText("ColDuration") ?? "Tổng thời gian lỗi";
                ColStatus.Header = LanguageManager.GetText("ColStatus") ?? "Trạng thái";
            }
            catch { }
        }
    }
}


