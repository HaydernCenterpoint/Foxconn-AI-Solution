using PLC.Views;
using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using ExcelDataReader;
using Microsoft.Win32;
using PLC.Service;
using PLC.Model;
using MessageBox = PLC.Views.CustomMessageBox;

namespace PLC.Views
{
    public partial class ExcelImportWindow : Window
    {
        private string _filePath = string.Empty;
        private DataSet? _dataSet;
        private string _selectedMachineId;
        private Action _onImportApplied;

        public class TempAddressItem
        {
            public int Stt { get; set; }
            public string Status { get; set; } = "Chưa kiểm tra";
            public string Group { get; set; } = string.Empty;
            public string Code { get; set; } = string.Empty;
            public string RegisterAddress { get; set; } = string.Empty;
            public string AliasName { get; set; } = string.Empty;
            public string DataType { get; set; } = "Int16";
            public string ActiveValue { get; set; } = "true";
            public string Severity { get; set; } = "Medium";
            public string Description { get; set; } = string.Empty;
            public string Solution { get; set; } = string.Empty;
            public bool Enabled { get; set; } = true;
            public string ErrorMessage { get; set; } = string.Empty;
        }

        private List<TempAddressItem> _previewItems = new List<TempAddressItem>();

        public ExcelImportWindow(string selectedMachineId, Action onImportApplied)
        {
            System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance);
            InitializeComponent();
            _selectedMachineId = selectedMachineId;
            _onImportApplied = onImportApplied;

            this.Title = $"Nhập Cấu Hình Excel - Máy: {selectedMachineId}";

            BtnBrowse.Click += BtnBrowse_Click;
            CboSheets.SelectionChanged += CboSheets_SelectionChanged;
            TxtHeaderRow.TextChanged += SettingsChanged;
            ChkHasHeader.Checked += SettingsChanged;
            ChkHasHeader.Unchecked += SettingsChanged;
            ChkSkipEmptyRows.Checked += SettingsChanged;
            ChkSkipEmptyRows.Unchecked += SettingsChanged;
            RadTabularMode.Checked += MappingModeChanged;
            RadPairMode.Checked += MappingModeChanged;

            BtnCancel.Click += (s, e) => this.Close();
            BtnApply.Click += BtnApply_Click;

            // Wire mapping dropdown events
            CboMapAddress.SelectionChanged += MappingDropdownChanged;
            CboMapAlias.SelectionChanged += MappingDropdownChanged;
            CboMapGroup.SelectionChanged += MappingDropdownChanged;
            CboMapType.SelectionChanged += MappingDropdownChanged;
            CboMapActiveValue.SelectionChanged += MappingDropdownChanged;
            CboMapSeverity.SelectionChanged += MappingDropdownChanged;
            CboMapDescription.SelectionChanged += MappingDropdownChanged;
            CboMapSolution.SelectionChanged += MappingDropdownChanged;

            this.Closed += (s, e) => {
                PLC.Service.LanguageManager.LanguageChanged -= OnLanguageChanged;
            };
            PLC.Service.LanguageManager.LanguageChanged += OnLanguageChanged;
            TranslateUI();
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
                this.Title = string.Format(LanguageManager.GetText("ExcelImport.Title") ?? "Nhập Cấu Hình Excel - Máy: {0}", _selectedMachineId);
                TxtHeaderTitle.Text = LanguageManager.GetText("ExcelImport.Header") ?? "NHẬP CẤU HÌNH EXCEL";
                if (string.IsNullOrEmpty(_filePath))
                {
                    TxtFilePath.Text = LanguageManager.GetText("ExcelImport.NoFileSelected") ?? "Chưa chọn file...";
                }
                BtnBrowse.Content = LanguageManager.GetText("ExcelImport.SelectFile") ?? "Chọn file Excel...";
                
                LblSelectSheet.Content = LanguageManager.GetText("ExcelImport.SelectSheet") ?? "Chọn Sheet:";
                LblHeaderRow.Content = LanguageManager.GetText("ExcelImport.HeaderRow") ?? "Dòng tiêu đề (0-indexed):";
                ChkHasHeader.Content = LanguageManager.GetText("ExcelImport.FirstRowHeader") ?? "Dòng đầu tiên là tiêu đề";
                ChkSkipEmptyRows.Content = LanguageManager.GetText("ExcelImport.SkipEmptyRows") ?? "Bỏ qua dòng trống";
                
                RadTabularMode.Content = LanguageManager.GetText("ExcelImport.TabularMode") ?? "Dạng bảng chuẩn (Mỗi cột là 1 thuộc tính)";
                RadPairMode.Content = LanguageManager.GetText("ExcelImport.PairMode") ?? "Dạng ghép cặp nhiều cột (Địa chỉ + Tên)";
                
                TxtPreviewHeader.Text = LanguageManager.GetText("ExcelImport.PreviewHeader") ?? "XEM TRƯỚC DỮ LIỆU EXCEL";
                TxtMappingHeader.Text = LanguageManager.GetText("ExcelImport.MappingHeader") ?? "ÁNH XẠ CỘT DỮ LIỆU";
                
                LblMapAddress.Content = LanguageManager.GetText("PlcAddress") ?? "Địa chỉ PLC:";
                LblMapAlias.Content = LanguageManager.GetText("AliasName") ?? "Tên gợi nhớ (Alias):";
                LblMapGroup.Content = LanguageManager.GetText("GroupName") ?? "Nhóm (Group):";
                LblMapType.Content = LanguageManager.GetText("DataType") ?? "Kiểu dữ liệu:";
                LblMapActiveValue.Content = LanguageManager.GetText("ActiveRead") ?? "Kích hoạt đọc & hiển thị";
                LblMapSeverity.Content = LanguageManager.GetText("Enabled") ?? "Bật"; 
                LblMapDescription.Content = LanguageManager.GetText("ColAlarmName") ?? "Tên báo động (Error Name)";
                LblMapSolution.Content = LanguageManager.GetText("ColOtherParamName") ?? "Tên tham số"; 
                
                LblApplyMode.Text = LanguageManager.GetText("ExcelImport.ApplyMode") ?? "Chế độ áp dụng vào máy:";
                CboApplyModeItemMerge.Content = LanguageManager.GetText("ExcelImport.ApplyMerge") ?? "Thêm mới & Ghi đè dòng trùng";
                CboApplyModeItemReplace.Content = LanguageManager.GetText("ExcelImport.ApplyReplace") ?? "Thay thế toàn bộ cấu hình máy";
                
                BtnCancel.Content = LanguageManager.GetText("BtnCancel") ?? "Hủy";
                BtnApply.Content = LanguageManager.GetText("BtnApplyText") ?? "Áp Dụng Vào Máy";
                
                int total = _previewItems.Count;
                int valid = _previewItems.Count(x => x.Status == "OK");
                int invalid = _previewItems.Count(x => x.Status == "Lỗi");
                int dup = _previewItems.Count(x => x.Status == "Trùng");
                
                TxtSummaryRows.Text = string.Format(LanguageManager.GetText("ExcelImport.SummaryTotal") ?? "Tổng số dòng: {0}", total);
                TxtSummaryValid.Text = string.Format(LanguageManager.GetText("ExcelImport.SummaryValid") ?? "Hợp lệ: {0}", valid);
                TxtSummaryInvalid.Text = string.Format(LanguageManager.GetText("ExcelImport.SummaryInvalid") ?? "Không hợp lệ: {0}", invalid);
                TxtSummaryDuplicate.Text = string.Format(LanguageManager.GetText("ExcelImport.SummaryDuplicate") ?? "Trùng lặp: {0}", dup);
            }
            catch {}
        }

        private void BtnBrowse_Click(object sender, RoutedEventArgs e)
        {
            var openFileDialog = new OpenFileDialog
            {
                Filter = "Excel or CSV Files (*.xlsx;*.xls;*.csv)|*.xlsx;*.xls;*.csv|All files (*.*)|*.*"
            };

            if (openFileDialog.ShowDialog() == true)
            {
                _filePath = openFileDialog.FileName;
                TxtFilePath.Text = _filePath;
                LoadExcelFile();
            }
        }

        private void LoadExcelFile()
        {
            try
            {
                string ext = Path.GetExtension(_filePath).ToLower();
                using (var stream = File.Open(_filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                {
                    IExcelDataReader reader;
                    if (ext == ".csv")
                    {
                        var config = new ExcelReaderConfiguration
                        {
                            FallbackEncoding = System.Text.Encoding.UTF8
                        };
                        reader = ExcelReaderFactory.CreateCsvReader(stream, config);
                    }
                    else
                    {
                        reader = ExcelReaderFactory.CreateReader(stream);
                    }

                    using (reader)
                    {
                        _dataSet = reader.AsDataSet();
                    }
                }

                CboSheets.SelectionChanged -= CboSheets_SelectionChanged;
                CboSheets.Items.Clear();
                if (_dataSet != null)
                {
                    foreach (DataTable table in _dataSet.Tables)
                    {
                        CboSheets.Items.Add(table.TableName);
                    }
                    if (CboSheets.Items.Count > 0)
                    {
                        CboSheets.SelectedIndex = 0;
                    }
                }
                CboSheets.SelectionChanged += CboSheets_SelectionChanged;

                ProcessExcelData();
            }
            catch (Exception ex)
            {
                CustomMessageBox.Show("Lỗi khi mở file Excel: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void CboSheets_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            ProcessExcelData();
        }

        private void SettingsChanged(object sender, TextChangedEventArgs e) => ProcessExcelData();
        private void SettingsChanged(object sender, RoutedEventArgs e) => ProcessExcelData();

        private void MappingModeChanged(object sender, RoutedEventArgs e)
        {
            if (PnlTabularMapping == null || PnlPairMapping == null) return;
            if (RadTabularMode.IsChecked == true)
            {
                PnlTabularMapping.Visibility = Visibility.Visible;
                PnlPairMapping.Visibility = Visibility.Collapsed;
            }
            else
            {
                PnlTabularMapping.Visibility = Visibility.Collapsed;
                PnlPairMapping.Visibility = Visibility.Visible;
            }
            ProcessExcelData();
        }

        private void MappingDropdownChanged(object sender, SelectionChangedEventArgs e)
        {
            AnalyzeAndValidateData();
        }

        private void ProcessExcelData()
        {
            if (_dataSet == null || CboSheets.SelectedItem == null) return;

            string sheetName = CboSheets.SelectedItem.ToString()!;
            DataTable table = _dataSet.Tables[sheetName]!;

            int headerRowIndex = 0;
            int.TryParse(TxtHeaderRow.Text, out headerRowIndex);
            if (headerRowIndex < 0 || headerRowIndex >= table.Rows.Count) headerRowIndex = 0;

            // Populate columns mapping dropdowns
            var cols = new List<string> { "[Bỏ qua]" };
            for (int i = 0; i < table.Columns.Count; i++)
            {
                string colHeader = $"Cột {i + 1}";
                if (ChkHasHeader.IsChecked == true && headerRowIndex < table.Rows.Count)
                {
                    var val = table.Rows[headerRowIndex][i]?.ToString();
                    if (!string.IsNullOrWhiteSpace(val))
                    {
                        colHeader += $" ({val.Trim()})";
                    }
                }
                cols.Add(colHeader);
            }

            // Temporarily un-hook events to avoid re-triggering
            UnbindMappingEvents();

            PopulateDropdown(CboMapAddress, cols, "address");
            PopulateDropdown(CboMapAlias, cols, "alias");
            PopulateDropdown(CboMapGroup, cols, "group");
            PopulateDropdown(CboMapType, cols, "type");
            PopulateDropdown(CboMapActiveValue, cols, "active");
            PopulateDropdown(CboMapSeverity, cols, "severity");
            PopulateDropdown(CboMapDescription, cols, "desc");
            PopulateDropdown(CboMapSolution, cols, "sol");

            // Build Pair Mapping Containers if Pair Mode is selected
            PnlPairsContainer.Children.Clear();
            if (RadPairMode.IsChecked == true && headerRowIndex < table.Rows.Count)
            {
                // Create checkboxes for column pairs: (0,1), (2,3), (4,5), (6,7), (8,9), (10,11)
                for (int i = 0; i < table.Columns.Count - 1; i += 2)
                {
                    string col1Name = table.Rows[headerRowIndex][i]?.ToString() ?? "";
                    string col2Name = table.Rows[headerRowIndex][i + 1]?.ToString() ?? "";
                    string label = $"Cột {i + 1} & {i + 2}";
                    if (!string.IsNullOrWhiteSpace(col1Name) || !string.IsNullOrWhiteSpace(col2Name))
                    {
                        label += $" ({col1Name} | {col2Name})";
                    }

                    var chk = new CheckBox
                    {
                        Content = label,
                        IsChecked = true,
                        Tag = i,
                        Margin = new Thickness(0, 0, 0, 6),
                        Foreground = this.FindResource("TextPrimary") as System.Windows.Media.Brush
                    };
                    chk.Checked += (s, ev) => AnalyzeAndValidateData();
                    chk.Unchecked += (s, ev) => AnalyzeAndValidateData();
                    PnlPairsContainer.Children.Add(chk);
                }
            }

            BindMappingEvents();

            AnalyzeAndValidateData();
        }

        private void UnbindMappingEvents()
        {
            CboMapAddress.SelectionChanged -= MappingDropdownChanged;
            CboMapAlias.SelectionChanged -= MappingDropdownChanged;
            CboMapGroup.SelectionChanged -= MappingDropdownChanged;
            CboMapType.SelectionChanged -= MappingDropdownChanged;
            CboMapActiveValue.SelectionChanged -= MappingDropdownChanged;
            CboMapSeverity.SelectionChanged -= MappingDropdownChanged;
            CboMapDescription.SelectionChanged -= MappingDropdownChanged;
            CboMapSolution.SelectionChanged -= MappingDropdownChanged;
        }

        private void BindMappingEvents()
        {
            CboMapAddress.SelectionChanged += MappingDropdownChanged;
            CboMapAlias.SelectionChanged += MappingDropdownChanged;
            CboMapGroup.SelectionChanged += MappingDropdownChanged;
            CboMapType.SelectionChanged += MappingDropdownChanged;
            CboMapActiveValue.SelectionChanged += MappingDropdownChanged;
            CboMapSeverity.SelectionChanged += MappingDropdownChanged;
            CboMapDescription.SelectionChanged += MappingDropdownChanged;
            CboMapSolution.SelectionChanged += MappingDropdownChanged;
        }

        private void PopulateDropdown(ComboBox cbo, List<string> items, string typeKeyword)
        {
            cbo.Items.Clear();
            foreach (var item in items) cbo.Items.Add(item);

            // Auto-detect index based on keyword
            int matchIndex = 0; // Default to [Bỏ qua]
            for (int i = 1; i < items.Count; i++)
            {
                string lower = items[i].ToLower();
                if (typeKeyword == "address" && (lower.Contains("địa chỉ") || lower.Contains("address") || lower.Contains("register") || lower.Contains("plc")))
                {
                    matchIndex = i;
                    break;
                }
                if (typeKeyword == "alias" && (lower.Contains("tên") || lower.Contains("alias") || lower.Contains("tag") || lower.Contains("biến")))
                {
                    matchIndex = i;
                    break;
                }
                if (typeKeyword == "group" && (lower.Contains("nhóm") || lower.Contains("group")))
                {
                    matchIndex = i;
                    break;
                }
                if (typeKeyword == "type" && (lower.Contains("kiểu") || lower.Contains("type")))
                {
                    matchIndex = i;
                    break;
                }
                if (typeKeyword == "active" && (lower.Contains("kích hoạt") || lower.Contains("active")))
                {
                    matchIndex = i;
                    break;
                }
                if (typeKeyword == "severity" && (lower.Contains("mức độ") || lower.Contains("severity") || lower.Contains("cấp")))
                {
                    matchIndex = i;
                    break;
                }
                if (typeKeyword == "desc" && (lower.Contains("mô tả") || lower.Contains("description") || lower.Contains("nội dung")))
                {
                    matchIndex = i;
                    break;
                }
                if (typeKeyword == "sol" && (lower.Contains("xử lý") || lower.Contains("solution") || lower.Contains("biện pháp")))
                {
                    matchIndex = i;
                    break;
                }
            }

            cbo.SelectedIndex = matchIndex;
        }

        private void AnalyzeAndValidateData()
        {
            if (_dataSet == null || CboSheets.SelectedItem == null) return;

            string sheetName = CboSheets.SelectedItem.ToString()!;
            DataTable table = _dataSet.Tables[sheetName]!;

            int headerRowIndex = 0;
            int.TryParse(TxtHeaderRow.Text, out headerRowIndex);
            bool hasHeader = ChkHasHeader.IsChecked == true;
            bool skipEmpty = ChkSkipEmptyRows.IsChecked == true;

            int startRow = hasHeader ? headerRowIndex + 1 : headerRowIndex;
            _previewItems.Clear();

            int addressColIdx = CboMapAddress.SelectedIndex - 1;
            int aliasColIdx = CboMapAlias.SelectedIndex - 1;
            int groupColIdx = CboMapGroup.SelectedIndex - 1;
            int typeColIdx = CboMapType.SelectedIndex - 1;
            int activeColIdx = CboMapActiveValue.SelectedIndex - 1;
            int severityColIdx = CboMapSeverity.SelectedIndex - 1;
            int descColIdx = CboMapDescription.SelectedIndex - 1;
            int solColIdx = CboMapSolution.SelectedIndex - 1;

            int sttCounter = 1;
            var seenAddresses = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            if (RadTabularMode.IsChecked == true)
            {
                for (int i = startRow; i < table.Rows.Count; i++)
                {
                    var row = table.Rows[i];
                    string addr = addressColIdx >= 0 && addressColIdx < table.Columns.Count ? row[addressColIdx]?.ToString()?.Trim() ?? "" : "";
                    string alias = aliasColIdx >= 0 && aliasColIdx < table.Columns.Count ? row[aliasColIdx]?.ToString()?.Trim() ?? "" : "";
                    
                    if (skipEmpty && string.IsNullOrEmpty(addr) && string.IsNullOrEmpty(alias)) continue;

                    var temp = new TempAddressItem
                    {
                        Stt = sttCounter++,
                        RegisterAddress = addr,
                        AliasName = alias,
                        Group = groupColIdx >= 0 && groupColIdx < table.Columns.Count ? row[groupColIdx]?.ToString()?.Trim() ?? "" : "",
                        DataType = typeColIdx >= 0 && typeColIdx < table.Columns.Count ? row[typeColIdx]?.ToString()?.Trim() ?? "" : "",
                        ActiveValue = activeColIdx >= 0 && activeColIdx < table.Columns.Count ? row[activeColIdx]?.ToString()?.Trim() ?? "" : "",
                        Severity = severityColIdx >= 0 && severityColIdx < table.Columns.Count ? row[severityColIdx]?.ToString()?.Trim() ?? "" : "",
                        Description = descColIdx >= 0 && descColIdx < table.Columns.Count ? row[descColIdx]?.ToString()?.Trim() ?? "" : "",
                        Solution = solColIdx >= 0 && solColIdx < table.Columns.Count ? row[solColIdx]?.ToString()?.Trim() ?? "" : ""
                    };

                    ValidateRow(temp, seenAddresses);
                    _previewItems.Add(temp);
                }
            }
            else
            {
                // Multi-column pair mapping (Pair mode)
                var enabledPairs = new List<int>();
                foreach (var child in PnlPairsContainer.Children)
                {
                    if (child is CheckBox chk && chk.IsChecked == true && chk.Tag is int startCol)
                    {
                        enabledPairs.Add(startCol);
                    }
                }

                for (int i = startRow; i < table.Rows.Count; i++)
                {
                    var row = table.Rows[i];
                    foreach (int startCol in enabledPairs)
                    {
                        if (startCol + 1 >= table.Columns.Count) continue;
                        string addr = row[startCol]?.ToString()?.Trim() ?? "";
                        string alias = row[startCol + 1]?.ToString()?.Trim() ?? "";

                        if (string.IsNullOrEmpty(addr) && string.IsNullOrEmpty(alias)) continue;

                        var temp = new TempAddressItem
                        {
                            Stt = sttCounter++,
                            RegisterAddress = addr,
                            AliasName = alias
                        };

                        // Auto-assign groups based on address patterns
                        string lowerAddr = addr.ToLower();
                        if (lowerAddr.StartsWith("m") || lowerAddr.StartsWith("x") || lowerAddr.StartsWith("y"))
                        {
                            temp.DataType = "Bool";
                            temp.ActiveValue = "true";
                            
                            // Check if alarm/error register
                            if (lowerAddr.StartsWith("m"))
                            {
                                int.TryParse(new string(lowerAddr.Where(char.IsDigit).ToArray()), out int mNum);
                                if (mNum >= 60)
                                {
                                    temp.Group = "Quy trình báo động";
                                    temp.Severity = "High";
                                }
                                else
                                {
                                    temp.Group = "Nhóm trạng thái";
                                    temp.Severity = "Medium";
                                }
                            }
                            else
                            {
                                temp.Group = "Nhóm trạng thái";
                                temp.Severity = "Medium";
                            }
                        }
                        else if (lowerAddr.StartsWith("d") || lowerAddr.StartsWith("w") || lowerAddr.StartsWith("r"))
                        {
                            temp.DataType = "Int16";
                            temp.Group = "Nhóm sản phẩm";
                            temp.Severity = "Low";
                        }
                        else
                        {
                            temp.DataType = "Int16";
                            temp.Group = "Khác";
                            temp.Severity = "Medium";
                        }

                        ValidateRow(temp, seenAddresses);
                        _previewItems.Add(temp);
                    }
                }
            }

            // Update stats
            int total = _previewItems.Count;
            int valid = _previewItems.Count(x => x.Status == "OK");
            int invalid = _previewItems.Count(x => x.Status == "Lỗi");
            int dup = _previewItems.Count(x => x.Status == "Trùng");

            TxtSummaryRows.Text = $"Tổng số dòng: {total}";
            TxtSummaryValid.Text = $"Hợp lệ: {valid}";
            TxtSummaryInvalid.Text = $"Không hợp lệ: {invalid}";
            TxtSummaryDuplicate.Text = $"Trùng lặp: {dup}";

            DgPreview.ItemsSource = null;
            DgPreview.ItemsSource = _previewItems;
        }

        private void ValidateRow(TempAddressItem item, HashSet<string> seenAddresses)
        {
            if (string.IsNullOrEmpty(item.RegisterAddress))
            {
                item.Status = "Lỗi";
                item.ErrorMessage = "Địa chỉ PLC không được trống";
                return;
            }
            if (string.IsNullOrEmpty(item.AliasName))
            {
                item.Status = "Lỗi";
                item.ErrorMessage = "Tên gợi nhớ không được trống";
                return;
            }

            // Standardize DataType
            if (string.IsNullOrWhiteSpace(item.DataType))
            {
                item.DataType = "Int16";
            }
            string dtLower = item.DataType.ToLower();
            if (dtLower.Contains("bool") || dtLower.Contains("bit") || dtLower.Contains("binary")) item.DataType = "Bool";
            else if (dtLower.Contains("float") || dtLower.Contains("real")) item.DataType = "Float";
            else if (dtLower.Contains("double") || dtLower.Contains("dreal")) item.DataType = "Double";
            else if (dtLower.Contains("int32") || dtLower.Contains("dint") || dtLower.Contains("dword")) item.DataType = "Int32";
            else if (dtLower.Contains("uint32")) item.DataType = "UInt32";
            else if (dtLower.Contains("uint16") || dtLower.Contains("word")) item.DataType = "UInt16";
            else item.DataType = "Int16";

            // Standardize Group
            if (string.IsNullOrWhiteSpace(item.Group))
            {
                string al = item.AliasName.ToLower();
                if (al.Contains("status") || al.Contains("start") || al.Contains("stop") || al.Contains("plc runtime"))
                {
                    item.Group = "Nhóm trạng thái";
                }
                else if (al.Contains("qty") || al.Contains("count") || al.Contains("sản lượng") || al.Contains("số lượng") || al.Contains("ct") || al.Contains("sản phẩm"))
                {
                    item.Group = "Nhóm sản phẩm";
                }
                else if (al.Contains("alarm") || al.Contains("error") || al.Contains("fault") || al.Contains("lỗi") || al.Contains("báo động") || al.Contains("cảnh báo") || item.RegisterAddress.ToLower().StartsWith("m"))
                {
                    item.Group = "Quy trình báo động";
                }
                else
                {
                    item.Group = "Khác";
                }
            }

            // Standardize Severity
            if (string.IsNullOrWhiteSpace(item.Severity))
            {
                item.Severity = "Medium";
            }

            if (seenAddresses.Contains(item.RegisterAddress))
            {
                item.Status = "Trùng";
                item.ErrorMessage = "Địa chỉ PLC bị trùng lặp trong file";
            }
            else
            {
                seenAddresses.Add(item.RegisterAddress);
                item.Status = "OK";
            }
        }

        private void BtnApply_Click(object sender, RoutedEventArgs e)
        {
            var validItems = _previewItems.Where(x => x.Status == "OK").ToList();
            if (validItems.Count == 0)
            {
                CustomMessageBox.Show("Không có dòng dữ liệu hợp lệ nào để nhập!", "Thông báo", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            string applyMode = (CboApplyMode.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "Merge";

            if (applyMode == "Replace")
            {
                var confirm = CustomMessageBox.Show(
                    "CẢNH BÁO: Chế độ 'Thay thế toàn bộ cấu hình máy' sẽ xóa toàn bộ địa chỉ hiện tại của máy đang chọn trước khi nhập.\nBạn có chắc chắn muốn tiếp tục không?",
                    "Xác nhận thay thế cấu hình",
                    MessageBoxButton.YesNo,
                    MessageBoxImage.Warning);
                if (confirm != MessageBoxResult.Yes) return;
            }

            try
            {
                // Load existing configuration to merge or replace
                var existingItems = applyMode == "Replace" 
                    ? new List<DataAddressItem>()
                    : LocalDbService.Instance.LoadAddressProfileForMachine("default", _selectedMachineId);

                int nextIndex = existingItems.Count + 1;

                foreach (var item in validItems)
                {
                    // Check duplicate in existing items
                    var dupItem = existingItems.FirstOrDefault(x => x.Address.Equals(item.RegisterAddress, StringComparison.OrdinalIgnoreCase));
                    if (dupItem != null)
                    {
                        if (applyMode == "Merge")
                        {
                            // Overwrite details
                            dupItem.Alias = item.AliasName;
                            dupItem.Group = item.Group;
                            dupItem.Type = item.DataType;
                            dupItem.ActiveValue = item.ActiveValue;
                            dupItem.Severity = item.Severity;
                            dupItem.Description = item.Description;
                            dupItem.Solution = item.Solution;
                            dupItem.Enabled = item.Enabled;
                        }
                    }
                    else
                    {
                        existingItems.Add(new DataAddressItem
                        {
                            Index = nextIndex++,
                            Address = item.RegisterAddress,
                            Alias = item.AliasName,
                            Group = item.Group,
                            Type = item.DataType,
                            ActiveValue = item.ActiveValue,
                            Severity = item.Severity,
                            Description = item.Description,
                            Solution = item.Solution,
                            Enabled = item.Enabled,
                            Value = "Chờ đọc...",
                            LastUpdate = "Never"
                        });
                    }
                }

                // Save back to DB
                LocalDbService.Instance.SaveAddressProfileForMachine("default", _selectedMachineId, existingItems);

                CustomMessageBox.Show($"Nhập thành công {validItems.Count} địa chỉ vào máy {_selectedMachineId}!", "Thành công", MessageBoxButton.OK, MessageBoxImage.Information);
                
                // Fire action to update parent views
                _onImportApplied?.Invoke();
                this.Close();
            }
            catch (Exception ex)
            {
                CustomMessageBox.Show("Có lỗi xảy ra khi lưu vào cơ sở dữ liệu: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
    }
}


