using System;
using System.Windows;
using System.Windows.Controls;
using PLC.Service;

namespace PLC.Views
{
    public partial class HistorySearchPage : UserControl, ILocalizable
    {
        private OeeDashboardPage? _oeePage;
        private ErrorHistoryPage? _errorPage;

        public HistorySearchPage()
        {
            InitializeComponent();
            this.Loaded += HistorySearchPage_Loaded;
            BtnSearch.Click += BtnSearch_Click;
            PLC.Service.LanguageManager.LanguageChanged += OnLanguageChanged;
            this.Unloaded += (s, e) => {
                PLC.Service.LanguageManager.LanguageChanged -= OnLanguageChanged;
            };
        }

        private void HistorySearchPage_Loaded(object sender, RoutedEventArgs e)
        {
            DpOeeDate.SelectedDate = DateTime.Today;
            DpErrorFrom.SelectedDate = DateTime.Today;
            DpErrorTo.SelectedDate = DateTime.Today;

            CboErrorMachine.Items.Clear();
            CboErrorMachine.Items.Add(new ComboBoxItem { Content = "Tất cả", Tag = "" });
            CboErrorMachine.Items.Add(new ComboBoxItem { Content = "machine-01", Tag = "machine-01" });
            CboErrorMachine.Items.Add(new ComboBoxItem { Content = "machine-02", Tag = "machine-02" });
            CboErrorMachine.SelectedIndex = 0;

            UpdateFiltersVisibility();
            TranslateUI();
        }

        private void CboDataType_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            UpdateFiltersVisibility();
        }

        private void UpdateFiltersVisibility()
        {
            if (PanelOeeFilters == null || PanelErrorFilters == null || ContainerGrid == null) return;

            if (CboDataType.SelectedItem is ComboBoxItem selectedItem)
            {
                string tag = selectedItem.Tag?.ToString() ?? "OEE";
                if (tag == "OEE")
                {
                    PanelOeeFilters.Visibility = Visibility.Visible;
                    PanelErrorFilters.Visibility = Visibility.Collapsed;

                    if (_oeePage == null)
                    {
                        _oeePage = new OeeDashboardPage();
                        _oeePage.HideQueryPanel();
                    }
                    ContainerGrid.Content = _oeePage;
                }
                else
                {
                    PanelOeeFilters.Visibility = Visibility.Collapsed;
                    PanelErrorFilters.Visibility = Visibility.Visible;

                    if (_errorPage == null)
                    {
                        _errorPage = new ErrorHistoryPage();
                    }
                    ContainerGrid.Content = _errorPage;
                }
            }
        }

        private void BtnSearch_Click(object sender, RoutedEventArgs e)
        {
            if (CboDataType.SelectedItem is ComboBoxItem selectedItem)
            {
                string tag = selectedItem.Tag?.ToString() ?? "OEE";
                if (tag == "OEE" && _oeePage != null)
                {
                    DateTime date = DpOeeDate.SelectedDate ?? DateTime.Today;
                    string shift = (CboOeeShift.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "Day";
                    _oeePage.QueryOeeData(date, shift);
                }
                else if (tag == "ERROR" && _errorPage != null)
                {
                    if (CboErrorMachine.SelectedItem is ComboBoxItem machineItem)
                    {
                        if (_errorPage.CboMachineFilter != null)
                        {
                            foreach (ComboBoxItem item in _errorPage.CboMachineFilter.Items)
                            {
                                if (item.Tag?.ToString() == machineItem.Tag?.ToString())
                                {
                                    _errorPage.CboMachineFilter.SelectedItem = item;
                                    break;
                                }
                            }
                        }
                    }

                    if (CboErrorShift.SelectedItem is ComboBoxItem shiftItem)
                    {
                        if (_errorPage.CboShiftFilter != null)
                        {
                            foreach (ComboBoxItem item in _errorPage.CboShiftFilter.Items)
                            {
                                if (item.Tag?.ToString() == shiftItem.Tag?.ToString())
                                {
                                    _errorPage.CboShiftFilter.SelectedItem = item;
                                    break;
                                }
                            }
                        }
                    }

                    if (_errorPage.DpFromDateFilter != null)
                    {
                        _errorPage.DpFromDateFilter.SelectedDate = DpErrorFrom.SelectedDate;
                    }
                    if (_errorPage.DpToDateFilter != null)
                    {
                        _errorPage.DpToDateFilter.SelectedDate = DpErrorTo.SelectedDate;
                    }

                    _errorPage.BtnQueryErrorHistory.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                }
            }
        }

        private void OnLanguageChanged(object? sender, EventArgs e)
        {
            TranslateUI();
        }

        public void TranslateUI()
        {
            try
            {
                string lang = LanguageManager.CurrentLanguageCode.ToLower();
                if (lang.StartsWith("zh") || lang.StartsWith("cn"))
                {
                    TxtDataTypeLabel.Text = "数据类型:";
                    CboItemOeeData.Content = "OEE 效率数据";
                    CboItemErrorData.Content = "历史告警数据";
                    TxtOeeSelectDateLabel.Text = "选择日期:";
                    TxtSelectShiftLabel.Text = "选择班次:";
                    CboItemDayShift.Content = "白班 (07:30 - 19:30)";
                    CboItemNightShift.Content = "晚班 (19:30 - 07:30)";
                     TxtErrorFromDateLabel.Text = "开始日期:";
                    TxtErrorToDateLabel.Text = "结束日期:";
                    TxtErrorMachineLabel.Text = "设备:";
                    TxtErrorShiftLabel.Text = "班次:";
                    CboItemAllErrorShift.Content = "所有";
                    CboItemDayErrorShift.Content = "白班 (07:30 - 19:30)";
                    CboItemNightErrorShift.Content = "晚班 (19:30 - 07:30)";
                    BtnSearch.Content = "⚡ 查询";

                    if (CboErrorMachine.Items.Count > 0 && CboErrorMachine.Items[0] is ComboBoxItem firstItem)
                    {
                        firstItem.Content = "所有";
                    }
                }
                else if (lang.StartsWith("en"))
                {
                    TxtDataTypeLabel.Text = "Data Type:";
                    CboItemOeeData.Content = "OEE Performance Data";
                    CboItemErrorData.Content = "Error History Data";
                    TxtOeeSelectDateLabel.Text = "Select Date:";
                    TxtSelectShiftLabel.Text = "Select Shift:";
                    CboItemDayShift.Content = "Day Shift (07:30 - 19:30)";
                    CboItemNightShift.Content = "Night Shift (19:30 - 07:30)";
                     TxtErrorFromDateLabel.Text = "From Date:";
                    TxtErrorToDateLabel.Text = "To Date:";
                    TxtErrorMachineLabel.Text = "Machine:";
                    TxtErrorShiftLabel.Text = "Shift:";
                    CboItemAllErrorShift.Content = "All";
                    CboItemDayErrorShift.Content = "Day Shift (07:30 - 19:30)";
                    CboItemNightErrorShift.Content = "Night Shift (19:30 - 07:30)";
                    BtnSearch.Content = "⚡ Search";

                    if (CboErrorMachine.Items.Count > 0 && CboErrorMachine.Items[0] is ComboBoxItem firstItem)
                    {
                        firstItem.Content = "All";
                    }
                }
                else
                {
                    TxtDataTypeLabel.Text = "Loại dữ liệu:";
                    CboItemOeeData.Content = "Dữ liệu hiệu suất OEE";
                    CboItemErrorData.Content = "Dữ liệu lịch sử lỗi";
                    TxtOeeSelectDateLabel.Text = "Chọn ngày:";
                    TxtSelectShiftLabel.Text = "Chọn ca:";
                    CboItemDayShift.Content = "Ca Sáng (07:30 - 19:30)";
                    CboItemNightShift.Content = "Ca Tối (19:30 - 07:30)";
                     TxtErrorFromDateLabel.Text = "Từ ngày:";
                    TxtErrorToDateLabel.Text = "Đến ngày:";
                    TxtErrorMachineLabel.Text = "Máy:";
                    TxtErrorShiftLabel.Text = "Ca:";
                    CboItemAllErrorShift.Content = "Tất cả";
                    CboItemDayErrorShift.Content = "Ca Sáng (07:30 - 19:30)";
                    CboItemNightErrorShift.Content = "Ca Tối (19:30 - 07:30)";
                    BtnSearch.Content = "⚡ Tìm kiếm";

                    if (CboErrorMachine.Items.Count > 0 && CboErrorMachine.Items[0] is ComboBoxItem firstItem)
                    {
                        firstItem.Content = "Tất cả";
                    }
                }

                // Also translate sub-pages if instantiated
                _oeePage?.TranslateUI();
                _errorPage?.TranslateUI();
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine("[HistorySearchPage] TranslateUI error: " + ex.Message);
            }
        }
    }
}

