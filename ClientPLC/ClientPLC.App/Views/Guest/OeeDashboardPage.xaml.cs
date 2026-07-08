using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using PLC.Model;
using PLC.Service;
using PLC.Config;

namespace PLC.Views
{
    public partial class OeeDashboardPage : UserControl, ILocalizable
    {
        // ── Hourly data (dynamically sized) ──
        private string[] _hourlyLabels = new string[24];
        private int[]    _hourlyOutput = new int[24];
        private double[] _hourlyYield  = new double[24];
        private double[] _hourlyCt     = new double[24];
        private double   _currentOee    = 89.35;

        // ── Station comparison data ──
        private List<StationRow> _stationRows = new List<StationRow>();

        public OeeDashboardPage()
        {
            InitializeComponent();
            Loaded += OeeDashboardPage_Loaded;
            Unloaded += OeeDashboardPage_Unloaded;
            BtnQuery.Click += BtnQuery_Click;
        }

        // ─────────────────────────────────────────────────────────────────────────
        // INIT
        // ─────────────────────────────────────────────────────────────────────────
        private void OeeDashboardPage_Loaded(object sender, RoutedEventArgs e)
        {
            LanguageManager.LanguageChanged += OnLanguageChanged;
            DpDate.SelectedDate = DateTime.Today;
            if (AppSettings.Current.UseMockData)
            {
                LoadMockData();
            }
            else
            {
                QueryOeeData();
            }
            BuildStationTable();
            TranslateUI();
            RedrawAllCharts();
        }

        private void OeeDashboardPage_Unloaded(object sender, RoutedEventArgs e)
        {
            LanguageManager.LanguageChanged -= OnLanguageChanged;
        }

        private void OnLanguageChanged(object? sender, EventArgs e)
        {
            TranslateUI();
        }

        // ─────────────────────────────────────────────────────────────────────────
        // QUERY
        // ─────────────────────────────────────────────────────────────────────────
        private void BtnQuery_Click(object sender, RoutedEventArgs e)
        {
            QueryOeeData();
        }

        public void QueryOeeData(DateTime? specifiedDate = null, string? specifiedShift = null)
        {
            DateTime date  = specifiedDate  ?? DpDate.SelectedDate ?? DateTime.Today;
            string   shift = specifiedShift ?? (CboShift.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "All";
            string dateStr = date.ToString("yyyy-MM-dd");
            int outputQty = 0;
            double oee = 0.0;
            double yield = 0.0;

            try
            {
                int numSlots = (shift == "Day" || shift == "Night") ? 12 : 24;
                _hourlyLabels = new string[numSlots];
                _hourlyOutput = new int[numSlots];
                _hourlyYield = new double[numSlots];
                _hourlyCt = new double[numSlots];

                bool isMock = AppSettings.Current.UseMockData;

                if (isMock)
                {
                    LoadMockData(shift);
                }
                else
                {
                    bool hasRealData = false;
                    double availability = 0;
                    double performance = 0;

                    if (shift == "Day" || shift == "Night")
                    {
                        ShiftSummary summary = LocalDbService.Instance.GetShiftSummary(dateStr, shift);
                        hasRealData = summary.RecordCount > 0;
                        if (hasRealData)
                        {
                            outputQty = summary.ProductionQty;
                            oee = summary.Oee;
                            yield = summary.Quality;
                            availability = summary.Availability;
                            performance = summary.Performance;
                        }
                        else
                        {
                            outputQty = 0;
                            oee = 0.0;
                            yield = 0.0;
                            availability = 0.0;
                            performance = 0.0;
                        }

                        // Fetch hourly output
                        List<int> dbHourly = summary.HourlyProduction;
                        List<double> dbYield = summary.HourlyYield;
                        List<double> dbCt = summary.HourlyCycleTime;
                        for (int i = 0; i < 12; i++)
                        {
                            int hr = (shift == "Day" ? 7 : 19) + i;
                            if (hr >= 24) hr -= 24;
                            _hourlyLabels[i] = $"{hr:D2}:30";
                            _hourlyOutput[i] = (hasRealData && dbHourly != null && i < dbHourly.Count) ? dbHourly[i] : 0;
                            _hourlyYield[i]  = (hasRealData && dbYield != null && i < dbYield.Count) ? dbYield[i] : 0.0;
                            _hourlyCt[i]     = (hasRealData && dbCt != null && i < dbCt.Count) ? dbCt[i] : 0.0;
                        }
                    }
                    else // All shifts
                    {
                        ShiftSummary daySummary = LocalDbService.Instance.GetShiftSummary(dateStr, "Day");
                        ShiftSummary nightSummary = LocalDbService.Instance.GetShiftSummary(dateStr, "Night");
                        hasRealData = daySummary.RecordCount > 0 || nightSummary.RecordCount > 0;

                        if (hasRealData)
                        {
                            outputQty = daySummary.ProductionQty + nightSummary.ProductionQty;
                            oee = (daySummary.Oee + nightSummary.Oee) / 2.0;
                            yield = outputQty > 0 ? (daySummary.ProductionQty - daySummary.DefectQty + nightSummary.ProductionQty - nightSummary.DefectQty) * 100.0 / outputQty : 0.0;
                            availability = (daySummary.Availability + nightSummary.Availability) / 2.0;
                            performance = (daySummary.Performance + nightSummary.Performance) / 2.0;
                        }
                        else
                        {
                            outputQty = 0;
                            oee = 0.0;
                            yield = 0.0;
                            availability = 0.0;
                            performance = 0.0;
                        }

                        // day shift hours
                        List<int> dayHourly = daySummary.HourlyProduction;
                        List<double> dayYield = daySummary.HourlyYield;
                        List<double> dayCt = daySummary.HourlyCycleTime;
                        for (int i = 0; i < 12; i++)
                        {
                            _hourlyLabels[i] = $"{7 + i:D2}:30";
                            _hourlyOutput[i] = (hasRealData && dayHourly != null && i < dayHourly.Count) ? dayHourly[i] : 0;
                            _hourlyYield[i]  = (hasRealData && dayYield != null && i < dayYield.Count) ? dayYield[i] : 0.0;
                            _hourlyCt[i]     = (hasRealData && dayCt != null && i < dayCt.Count) ? dayCt[i] : 0.0;
                        }

                        // night shift hours
                        List<int> nightHourly = nightSummary.HourlyProduction;
                        List<double> nightYield = nightSummary.HourlyYield;
                        List<double> nightCt = nightSummary.HourlyCycleTime;
                        for (int i = 0; i < 12; i++)
                        {
                            int hr = 19 + i;
                            if (hr >= 24) hr -= 24;
                            _hourlyLabels[12 + i] = $"{hr:D2}:30";
                            _hourlyOutput[12 + i] = (hasRealData && nightHourly != null && i < nightHourly.Count) ? nightHourly[i] : 0;
                            _hourlyYield[12 + i]  = (hasRealData && nightYield != null && i < nightYield.Count) ? nightYield[i] : 0.0;
                            _hourlyCt[12 + i]     = (hasRealData && nightCt != null && i < nightCt.Count) ? nightCt[i] : 0.0;
                        }
                    }

                    int inputQty;
                    int passQty;
                    if (shift == "Day" || shift == "Night")
                    {
                        ShiftSummary summary = LocalDbService.Instance.GetShiftSummary(dateStr, shift);
                        inputQty = summary.ProductionQty;
                        passQty = Math.Max(0, summary.ProductionQty - summary.DefectQty);
                    }
                    else
                    {
                        ShiftSummary daySummary = LocalDbService.Instance.GetShiftSummary(dateStr, "Day");
                        ShiftSummary nightSummary = LocalDbService.Instance.GetShiftSummary(dateStr, "Night");
                        inputQty = daySummary.ProductionQty + nightSummary.ProductionQty;
                        passQty = Math.Max(0, daySummary.ProductionQty - daySummary.DefectQty) +
                                  Math.Max(0, nightSummary.ProductionQty - nightSummary.DefectQty);
                    }
                    TxtInputQty.Text  = $"{inputQty:N0}";
                    TxtYield.Text     = $"{yield:F2}%";
                    TxtUph.Text       = $"{(shift == "All" ? (outputQty / 22.0) : (outputQty / 11.0)):F1}";
                    TxtOeeVal.Text    = $"{oee:F2}%";
                    _currentOee       = oee;
                    UpdateOeeFactors(oee, availability, performance, yield);
                }

                BuildStationTable();
                RedrawAllCharts();
            }
            catch (Exception ex)
            {
                try { PLC.Service.LogManager.AddLog($"Error querying OEE data: {ex.Message}"); } catch {}
                if (AppSettings.Current.UseMockData)
                {
                    LoadMockData(shift);
                }
                else
                {
                    // Clear all outputs / set to empty/zero
                    int numSlots = (shift == "Day" || shift == "Night") ? 12 : 24;
                    _hourlyLabels = new string[numSlots];
                    _hourlyOutput = new int[numSlots];
                    _hourlyYield = new double[numSlots];
                    _hourlyCt = new double[numSlots];
                    for (int i = 0; i < numSlots; i++)
                    {
                        int hr = (shift == "Day" ? 7 : (shift == "Night" ? 19 : 7)) + i;
                        if (hr >= 24) hr -= 24;
                        _hourlyLabels[i] = $"{hr:D2}:30";
                    }
                    _currentOee = 0.0;
                    if (TxtInputQty != null) TxtInputQty.Text = "0";
                    if (TxtYield != null) TxtYield.Text = "0.00%";
                    if (TxtUph != null) TxtUph.Text = "0.0";
                    if (TxtOeeVal != null) TxtOeeVal.Text = "0.00%";
                    UpdateOeeFactors(0, 0, 0, 0);
                }
                BuildStationTable();
                RedrawAllCharts();
            }
        }

        // ─────────────────────────────────────────────────────────────────────────
        // MOCK DATA
        // ─────────────────────────────────────────────────────────────────────────
        private void LoadMockData(string shift = "All")
        {
            int numSlots = (shift == "Day" || shift == "Night") ? 12 : 24;
            _hourlyLabels = new string[numSlots];
            _hourlyOutput = new int[numSlots];
            _hourlyYield = new double[numSlots];
            _hourlyCt = new double[numSlots];

            if (shift == "Day")
            {
                int[] dayMock = { 3, 3, 3, 3, 3, 2, 3, 3, 3, 3, 2, 2 };
                for (int i = 0; i < 12; i++)
                {
                    _hourlyLabels[i] = $"{7 + i:D2}:30";
                    _hourlyOutput[i] = dayMock[i];
                }
            }
            else if (shift == "Night")
            {
                int[] nightMock = { 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 3 };
                for (int i = 0; i < 12; i++)
                {
                    int hr = 19 + i;
                    if (hr >= 24) hr -= 24;
                    _hourlyLabels[i] = $"{hr:D2}:30";
                    _hourlyOutput[i] = nightMock[i];
                }
            }
            else // All (7:30 to 06:30 tomorrow)
            {
                int[] dayMock = { 3, 3, 3, 3, 3, 2, 3, 3, 3, 3, 2, 2 };
                int[] nightMock = { 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 3 };
                for (int i = 0; i < 12; i++)
                {
                    _hourlyLabels[i] = $"{7 + i:D2}:30";
                    _hourlyOutput[i] = dayMock[i];
                }
                for (int i = 0; i < 12; i++)
                {
                    int hr = 19 + i;
                    if (hr >= 24) hr -= 24;
                    _hourlyLabels[12 + i] = $"{hr:D2}:30";
                    _hourlyOutput[12 + i] = nightMock[i];
                }
            }

            for (int i = 0; i < numSlots; i++)
            {
                _hourlyYield[i] = _hourlyOutput[i] > 0 ? (98.2 + new Random(i).NextDouble() * 1.5) : 0;
                _hourlyCt[i] = _hourlyOutput[i] > 0 ? (1.1 + new Random(i + 5).NextDouble() * 0.3) : 0;
            }

            _stationRows = new List<StationRow>
            {
                new StationRow { Name = "S01 - Loader",   Output = shift == "Day" ? 33 : (shift == "Night" ? 28 : 61), Ct = 0.48, Downtime = 12, Yield = 100.00, IsTotal = false },
                new StationRow { Name = "S02 - Buffer",   Output = shift == "Day" ? 33 : (shift == "Night" ? 28 : 61), Ct = 0.42, Downtime = 8,  Yield = 99.58,  IsTotal = false },
                new StationRow { Name = "S03 - Printer",  Output = shift == "Day" ? 33 : (shift == "Night" ? 28 : 61), Ct = 0.67, Downtime = 15, Yield = 99.16,  IsTotal = false },
                new StationRow { Name = "S04 - AOI",      Output = shift == "Day" ? 32 : (shift == "Night" ? 27 : 60), Ct = 1.10, Downtime = 20, Yield = 99.24,  IsTotal = false },
                new StationRow { Name = "S05 - Reflow",   Output = shift == "Day" ? 32 : (shift == "Night" ? 27 : 60), Ct = 0.95, Downtime = 18, Yield = 99.24,  IsTotal = false },
                new StationRow { Name = "S06 - SPI",      Output = shift == "Day" ? 32 : (shift == "Night" ? 27 : 60), Ct = 0.80, Downtime = 10, Yield = 99.24,  IsTotal = false },
                new StationRow { Name = "S07 - Unloader", Output = shift == "Day" ? 32 : (shift == "Night" ? 27 : 60), Ct = 0.45, Downtime = 6,  Yield = 99.24,  IsTotal = false },
                new StationRow { Name = "Total / Average",Output = shift == "Day" ? 32 : (shift == "Night" ? 27 : 60), Ct = 0.70, Downtime = 89, Yield = 99.24,  IsTotal = true  },
            };

            double mockOee = shift == "Day" ? 82.54 : (shift == "Night" ? 80.12 : 89.35);
            double mockYield = shift == "Day" ? 98.78 : (shift == "Night" ? 98.24 : 99.24);
            UpdateOeeFactors(mockOee, 92.5, 97.2, mockYield);

            int outputQty = shift == "Day" ? 33 : (shift == "Night" ? 28 : 61);
            int inputQty = outputQty + 2;
            double uph = shift == "All" ? (outputQty / 22.0) : (outputQty / 11.0);

            if (TxtInputQty != null) TxtInputQty.Text = $"{inputQty:N0}";
            if (TxtYield != null) TxtYield.Text = $"{mockYield:F2}%";
            if (TxtUph != null) TxtUph.Text = $"{uph:F1}";
            if (TxtOeeVal != null) TxtOeeVal.Text = $"{mockOee:F2}%";
            _currentOee = mockOee;
        }

        // ─────────────────────────────────────────────────────────────────────────
        // STATION TABLE
        // ─────────────────────────────────────────────────────────────────────────
        private void BuildStationTable()
        {
            // Station Table has been replaced with OEE Circular Chart
        }

        private static void AddTableCell(Grid parent, int col, string text, string hexColor, string weight, TextAlignment align, Thickness padding)
        {
            var tb = new TextBlock
            {
                Text                = text,
                Foreground          = new SolidColorBrush((Color)ColorConverter.ConvertFromString(hexColor)),
                FontSize            = 11.5,
                FontWeight          = weight == "Bold" ? FontWeights.Bold : FontWeights.Normal,
                TextAlignment       = align,
                VerticalAlignment   = VerticalAlignment.Center,
                Padding             = padding
            };
            Grid.SetColumn(tb, col);
            parent.Children.Add(tb);
        }

        private static string ColorToHex(Color c) => $"#{c.R:X2}{c.G:X2}{c.B:X2}";

        // ─────────────────────────────────────────────────────────────────────────
        // CANVAS EVENTS
        // ─────────────────────────────────────────────────────────────────────────
        private void ChartCanvas_SizeChanged(object sender, SizeChangedEventArgs e) => DrawHourlyOutputChart();
        private void YieldCanvas_SizeChanged(object sender, SizeChangedEventArgs e) => DrawYieldTrendChart();
        private void CtCanvas_SizeChanged(object sender, SizeChangedEventArgs e)    => DrawCtTrendChart();
        private void OeeCanvas_SizeChanged(object sender, SizeChangedEventArgs e)   => DrawOeeDonutChart(_currentOee);

        private void RedrawAllCharts()
        {
            DrawHourlyOutputChart();
            DrawYieldTrendChart();
            DrawCtTrendChart();
            DrawOeeDonutChart(_currentOee);
        }

        // ─────────────────────────────────────────────────────────────────────────
        // CHART: HOURLY OUTPUT BAR CHART
        // ─────────────────────────────────────────────────────────────────────────
        private void DrawHourlyOutputChart()
        {
            if (ChartCanvas == null) return;
            ChartCanvas.Children.Clear();
            double w = ChartCanvas.ActualWidth, h = ChartCanvas.ActualHeight;
            if (w < 50 || h < 40) return;

            double padL = 32, padR = 10, padT = 10, padB = 8;
            double graphW = w - padL - padR, graphH = h - padT - padB;

            int numSlots = _hourlyOutput.Length;
            if (numSlots == 0) return;

            int maxVal = Math.Max(_hourlyOutput.Max(), 5);
            maxVal = ((maxVal / 5) + 1) * 5;

            // Y gridlines
            for (int i = 0; i <= 4; i++)
            {
                double ratio = (double)i / 4;
                double y = padT + graphH * (1 - ratio);
                bool isDark = PLC.Config.AppSettings.Current.Theme.Equals("dark", StringComparison.OrdinalIgnoreCase);
                ChartCanvas.Children.Add(new Line { X1 = padL, Y1 = y, X2 = w - padR, Y2 = y, Stroke = isDark ? new SolidColorBrush(Color.FromArgb(20, 255, 255, 255)) : new SolidColorBrush(Color.FromArgb(30, 0, 0, 0)), StrokeThickness = 1 });
                ChartCanvas.Children.Add(new TextBlock { Text = ((int)(ratio * maxVal)).ToString(), Foreground = new SolidColorBrush(Color.FromRgb(100, 116, 139)), FontSize = 9, Width = padL - 4 });
                Canvas.SetLeft(ChartCanvas.Children[^1], 2);
                Canvas.SetTop(ChartCanvas.Children[^1], y - 7);
            }

            // Bars
            double barW   = graphW / numSlots * 0.7;
            double barGap = graphW / numSlots;
            for (int i = 0; i < numSlots; i++)
            {
                if (_hourlyOutput[i] <= 0) continue;
                double barH = graphH * (double)_hourlyOutput[i] / maxVal;
                double x    = padL + i * barGap + (barGap - barW) / 2;
                double y    = padT + graphH - barH;

                var bar = new Border
                {
                    Width  = barW,
                    Height = barH,
                    CornerRadius = new CornerRadius(2, 2, 0, 0),
                    Background = new LinearGradientBrush
                    {
                        StartPoint = new Point(0, 0), EndPoint = new Point(0, 1),
                        GradientStops = new GradientStopCollection
                        {
                            new GradientStop(Color.FromRgb(47, 170, 255), 0),
                            new GradientStop(Color.FromRgb(47, 123, 255), 1)
                        }
                    },
                    ToolTip = $"{_hourlyLabels[i]}: {_hourlyOutput[i]} pcs"
                };
                Canvas.SetLeft(bar, x);
                Canvas.SetTop(bar, y);
                ChartCanvas.Children.Add(bar);
            }

            // Dynamically populate X-axis labels
            if (GridHourlyXAxis != null)
            {
                GridHourlyXAxis.Children.Clear();
                GridHourlyXAxis.ColumnDefinitions.Clear();
                for (int i = 0; i < numSlots; i++)
                {
                    GridHourlyXAxis.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                }
                int labelStep = numSlots == 24 ? 2 : 1;
                for (int i = 0; i < numSlots; i += labelStep)
                {
                    var tb = new TextBlock
                    {
                        Text = _hourlyLabels[i],
                        Foreground = new SolidColorBrush(Color.FromRgb(100, 116, 139)),
                        FontSize = 9,
                        HorizontalAlignment = HorizontalAlignment.Center
                    };
                    Grid.SetColumn(tb, i);
                    GridHourlyXAxis.Children.Add(tb);
                }
            }
        }

        // ─────────────────────────────────────────────────────────────────────────
        // CHART: YIELD TREND LINE CHART
        // ─────────────────────────────────────────────────────────────────────────
        private void DrawYieldTrendChart()
        {
            if (YieldCanvas == null) return;
            YieldCanvas.Children.Clear();
            double w = YieldCanvas.ActualWidth, h = YieldCanvas.ActualHeight;
            if (w < 50 || h < 40) return;

            double padL = 36, padR = 10, padT = 10, padB = 8;
            double graphW = w - padL - padR, graphH = h - padT - padB;

            int numSlots = _hourlyYield.Length;
            if (numSlots == 0) return;

            double minY = _hourlyYield.Min() - 0.5;
            double maxY = _hourlyYield.Max() + 0.5;
            minY = Math.Floor(minY * 2) / 2;
            maxY = Math.Ceiling(maxY * 2) / 2;
            if (maxY - minY < 1) { minY = 96; maxY = 100.5; }

            // Y gridlines
            int steps = 5;
            for (int i = 0; i <= steps; i++)
            {
                double ratio = (double)i / steps;
                double y = padT + graphH * (1 - ratio);
                double val = minY + (maxY - minY) * ratio;
                ChartCanvas_AddGridLine(YieldCanvas, padL, y, w - padR, y);
                var tb = new TextBlock { Text = $"{val:F0}", Foreground = new SolidColorBrush(Color.FromRgb(100, 116, 139)), FontSize = 9, Width = padL - 4 };
                Canvas.SetLeft(tb, 2); Canvas.SetTop(tb, y - 7);
                YieldCanvas.Children.Add(tb);
            }

            // Line
            DrawLineOnCanvas(YieldCanvas, _hourlyYield, minY, maxY, padL, padR, padT, padB, graphW, graphH, Color.FromRgb(47, 123, 255), 2.0, true);

            // Dynamically populate X-axis labels
            if (GridYieldXAxis != null)
            {
                GridYieldXAxis.Children.Clear();
                GridYieldXAxis.ColumnDefinitions.Clear();
                for (int i = 0; i < numSlots; i++)
                {
                    GridYieldXAxis.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                }
                int labelStep = numSlots == 24 ? 4 : 2;
                for (int i = 0; i < numSlots; i += labelStep)
                {
                    var tb = new TextBlock
                    {
                        Text = _hourlyLabels[i],
                        Foreground = new SolidColorBrush(Color.FromRgb(100, 116, 139)),
                        FontSize = 9,
                        HorizontalAlignment = HorizontalAlignment.Center
                    };
                    Grid.SetColumn(tb, i);
                    GridYieldXAxis.Children.Add(tb);
                }
            }
        }

        // ─────────────────────────────────────────────────────────────────────────
        // CHART: CT TREND LINE CHART
        // ─────────────────────────────────────────────────────────────────────────
        private void DrawCtTrendChart()
        {
            if (CtCanvas == null) return;
            CtCanvas.Children.Clear();
            double w = CtCanvas.ActualWidth, h = CtCanvas.ActualHeight;
            if (w < 50 || h < 40) return;

            double padL = 36, padR = 10, padT = 10, padB = 8;
            double graphW = w - padL - padR, graphH = h - padT - padB;

            int numSlots = _hourlyCt.Length;
            if (numSlots == 0) return;

            double minY = 0.0;
            double maxY = Math.Ceiling(_hourlyCt.Max() * 4) / 4 + 0.25;
            if (maxY < 2.0) maxY = 2.5;

            // Y gridlines
            for (int i = 0; i <= 4; i++)
            {
                double ratio = (double)i / 4;
                double y   = padT + graphH * (1 - ratio);
                double val = minY + (maxY - minY) * ratio;
                ChartCanvas_AddGridLine(CtCanvas, padL, y, w - padR, y);
                var tb = new TextBlock { Text = $"{val:F1}", Foreground = new SolidColorBrush(Color.FromRgb(100, 116, 139)), FontSize = 9, Width = padL - 4 };
                Canvas.SetLeft(tb, 2); Canvas.SetTop(tb, y - 7);
                CtCanvas.Children.Add(tb);
            }

            // Line
            DrawLineOnCanvas(CtCanvas, _hourlyCt, minY, maxY, padL, padR, padT, padB, graphW, graphH, Color.FromRgb(47, 123, 255), 2.0, true);

            // Dynamically populate X-axis labels
            if (GridCtXAxis != null)
            {
                GridCtXAxis.Children.Clear();
                GridCtXAxis.ColumnDefinitions.Clear();
                for (int i = 0; i < numSlots; i++)
                {
                    GridCtXAxis.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                }
                int labelStep = numSlots == 24 ? 4 : 2;
                for (int i = 0; i < numSlots; i += labelStep)
                {
                    var tb = new TextBlock
                    {
                        Text = _hourlyLabels[i],
                        Foreground = new SolidColorBrush(Color.FromRgb(100, 116, 139)),
                        FontSize = 9,
                        HorizontalAlignment = HorizontalAlignment.Center
                    };
                    Grid.SetColumn(tb, i);
                    GridCtXAxis.Children.Add(tb);
                }
            }
        }

        // ─────────────────────────────────────────────────────────────────────────
        // CHART: OEE CIRCULAR DONUT CHART
        // ─────────────────────────────────────────────────────────────────────────
        private void DrawOeeDonutChart(double oeePercentage)
        {
            if (OeeCanvas == null) return;
            OeeCanvas.Children.Clear();

            double w = OeeCanvas.ActualWidth;
            double h = OeeCanvas.ActualHeight;
            if (w < 40 || h < 40) return;

            double cx = w / 2;
            double cy = h / 2;
            double radius = Math.Min(w, h) / 2 - 25;
            if (radius < 10) radius = 10;
            double strokeThickness = 12;

            // 1. Background ring
            var bgRing = new Ellipse
            {
                Width = radius * 2,
                Height = radius * 2,
                Stroke = (Brush)Application.Current.FindResource("BorderBrush"),
                StrokeThickness = strokeThickness
            };
            Canvas.SetLeft(bgRing, cx - radius);
            Canvas.SetTop(bgRing, cy - radius);
            OeeCanvas.Children.Add(bgRing);

            // 2. Active arc segment (progress)
            if (oeePercentage > 0)
            {
                double angle = Math.Min(oeePercentage, 99.99) * 360.0 / 100.0;
                double angleRad = (angle - 90) * Math.PI / 180.0;
                
                double startX = cx;
                double startY = cy - radius;
                double endX = cx + radius * Math.Cos(angleRad);
                double endY = cy + radius * Math.Sin(angleRad);

                bool isLargeArc = angle > 180.0;

                var pathGeometry = new PathGeometry();
                var pathFigure = new PathFigure
                {
                    StartPoint = new Point(startX, startY),
                    IsClosed = false
                };
                var arcSegment = new ArcSegment
                {
                    Point = new Point(endX, endY),
                    Size = new Size(radius, radius),
                    SweepDirection = SweepDirection.Clockwise,
                    IsLargeArc = isLargeArc
                };
                pathFigure.Segments.Add(arcSegment);
                pathGeometry.Figures.Add(pathFigure);

                var activePath = new Path
                {
                    Stroke = new SolidColorBrush(Color.FromRgb(47, 123, 255)), // #2F7BFF
                    StrokeThickness = strokeThickness,
                    StrokeStartLineCap = PenLineCap.Round,
                    StrokeEndLineCap = PenLineCap.Round,
                    Data = pathGeometry
                };
                OeeCanvas.Children.Add(activePath);
            }

            // 3. Center Text (Value + Label)
            var sp = new StackPanel
            {
                Orientation = Orientation.Vertical
            };

            var textBlockVal = new TextBlock
            {
                Text = $"{oeePercentage:F2}%",
                Foreground = (Brush)Application.Current.FindResource("TextPrimary"),
                FontSize = 20,
                FontWeight = FontWeights.Bold,
                HorizontalAlignment = HorizontalAlignment.Center,
                TextAlignment = TextAlignment.Center
            };
            sp.Children.Add(textBlockVal);

            string labelText = "OEE INDEX";
            var lang = LanguageManager.CurrentLanguageCode?.ToLower() ?? "vi";
            if (lang.StartsWith("zh") || lang.StartsWith("cn"))
            {
                labelText = "OEE 指数";
            }
            else if (lang.StartsWith("vi"))
            {
                labelText = "CHỈ SỐ OEE";
            }

            var textBlockLabel = new TextBlock
            {
                Text = labelText,
                Foreground = (Brush)Application.Current.FindResource("TextSecondary"),
                FontSize = 9,
                FontWeight = FontWeights.SemiBold,
                HorizontalAlignment = HorizontalAlignment.Center,
                TextAlignment = TextAlignment.Center,
                Margin = new Thickness(0, 2, 0, 0)
            };
            sp.Children.Add(textBlockLabel);

            // To center the stackpanel perfectly in the Canvas
            sp.Measure(new Size(double.PositiveInfinity, double.PositiveInfinity));
            Canvas.SetLeft(sp, cx - sp.DesiredSize.Width / 2);
            Canvas.SetTop(sp, cy - sp.DesiredSize.Height / 2);
            OeeCanvas.Children.Add(sp);
        }

        private void UpdateOeeFactors(double oee, double availability, double performance, double quality)
        {
            if (TxtOeeAvailVal == null) return;

            TxtOeeAvailVal.Text = $"{availability:F2}%";
            TxtOeePerfVal.Text  = $"{performance:F2}%";
            TxtOeeQualVal.Text  = $"{quality:F2}%";

            ColOeeAvailFilled.Width = new GridLength(availability, GridUnitType.Star);
            ColOeeAvailEmpty.Width  = new GridLength(Math.Max(0.1, 100.0 - availability), GridUnitType.Star);

            ColOeePerfFilled.Width  = new GridLength(performance, GridUnitType.Star);
            ColOeePerfEmpty.Width   = new GridLength(Math.Max(0.1, 100.0 - performance), GridUnitType.Star);

            ColOeeQualFilled.Width  = new GridLength(quality, GridUnitType.Star);
            ColOeeQualEmpty.Width   = new GridLength(Math.Max(0.1, 100.0 - quality), GridUnitType.Star);
        }

        // ─────────────────────────────────────────────────────────────────────────
        // SHARED HELPERS
        // ─────────────────────────────────────────────────────────────────────────
        private static void ChartCanvas_AddGridLine(Canvas canvas, double x1, double y1, double x2, double y2)
        {
            bool isDark = PLC.Config.AppSettings.Current.Theme.Equals("dark", StringComparison.OrdinalIgnoreCase);
            canvas.Children.Add(new Line
            {
                X1 = x1, Y1 = y1, X2 = x2, Y2 = y2,
                Stroke = isDark ? new SolidColorBrush(Color.FromArgb(20, 255, 255, 255)) : new SolidColorBrush(Color.FromArgb(30, 0, 0, 0)),
                StrokeThickness = 1
            });
        }

        private static void DrawLineOnCanvas(Canvas canvas, double[] values, double minY, double maxY,
            double padL, double padR, double padT, double padB,
            double graphW, double graphH, Color lineColor, double thickness, bool drawDots)
        {
            int n = values.Length;
            if (n < 2 || maxY <= minY) return;

            var pts = new PointCollection();
            for (int i = 0; i < n; i++)
            {
                double x = padL + (double)i / (n - 1) * graphW;
                double y = padT + graphH * (1 - (values[i] - minY) / (maxY - minY));
                pts.Add(new Point(x, y));
            }

            canvas.Children.Add(new Polyline
            {
                Points = pts,
                Stroke = new SolidColorBrush(lineColor),
                StrokeThickness = thickness,
                StrokeLineJoin = PenLineJoin.Round
            });

            if (drawDots)
            {
                foreach (var pt in pts)
                {
                    var dot = new Ellipse { Width = 4, Height = 4, Fill = new SolidColorBrush(lineColor) };
                    Canvas.SetLeft(dot, pt.X - 2);
                    Canvas.SetTop(dot, pt.Y - 2);
                    canvas.Children.Add(dot);
                }
            }
        }

        private static string GetHourLabel(int hour) => $"{hour:00}:00";

        // ─────────────────────────────────────────────────────────────────────────
        // COMPATIBILITY METHODS (called by MainWindow if needed)
        // ─────────────────────────────────────────────────────────────────────────
        public void HideQueryPanel() { /* kept for back-compat */ }

        public void TranslateUI()
        {
            try
            {
                var lang = LanguageManager.CurrentLanguageCode?.ToLower() ?? "vi";
                if (lang.StartsWith("zh") || lang.StartsWith("cn"))
                {
                    if (TxtQueryDate != null) TxtQueryDate.Text = "日期";
                    if (TxtQueryShift != null) TxtQueryShift.Text = "班次";
                    if (TxtQueryProdLine != null) TxtQueryProdLine.Text = "生产线";
                    if (TxtSearchBtn != null) TxtSearchBtn.Text = "查询";

                    if (CboItemAll != null) CboItemAll.Content = "所有班次";
                    if (CboItemDay != null) CboItemDay.Content = "白班 (07:30 - 18:30)";
                    if (CboItemNight != null) CboItemNight.Content = "晚班 (19:30 - 06:30)";

                    if (TxtCardInputQtyTitle != null) TxtCardInputQtyTitle.Text = "投入量";
                    if (TxtCardYieldTitle != null) TxtCardYieldTitle.Text = "良率 (%)";
                    if (TxtCardUphTitle != null) TxtCardUphTitle.Text = "UPH";
                    if (TxtCardOeeTitle != null) TxtCardOeeTitle.Text = "OEE";

                    if (TxtInputTrendLabel != null) TxtInputTrendLabel.Text = "比昨日";
                    if (TxtYieldTrendLabel != null) TxtYieldTrendLabel.Text = "比昨日";
                    if (TxtUphTrendLabel != null) TxtUphTrendLabel.Text = "比昨日";
                    if (TxtOeeTrendLabel != null) TxtOeeTrendLabel.Text = "比昨日";

                    if (TxtHourlyOutputTitle != null) TxtHourlyOutputTitle.Text = "每小时产量";
                    if (TxtHourlyOutputLegend != null) TxtHourlyOutputLegend.Text = "产量 (件)";
                    if (TxtYieldTrendTitle != null) TxtYieldTrendTitle.Text = "合格率趋势";
                    if (TxtYieldTrendLegend != null) TxtYieldTrendLegend.Text = "良率 (%)";

                    if (TxtCtTrendTitle != null) TxtCtTrendTitle.Text = "CT 周期时间趋势";
                    if (TxtCtTrendLegend != null) TxtCtTrendLegend.Text = "CT (秒)";
                    if (TxtOeeAnalysisTitle != null) TxtOeeAnalysisTitle.Text = "OEE 分析";
                    if (TxtOeeAnalysisLegend != null) TxtOeeAnalysisLegend.Text = "OEE (%)";

                    if (TxtAvailabilityFactor != null) TxtAvailabilityFactor.Text = "稼动率 (Availability)";
                    if (TxtPerformanceFactor != null) TxtPerformanceFactor.Text = "表现性 (Performance)";
                    if (TxtQualityFactor != null) TxtQualityFactor.Text = "质量率 (Quality)";
                }
                else if (lang.StartsWith("en"))
                {
                    if (TxtQueryDate != null) TxtQueryDate.Text = "Date";
                    if (TxtQueryShift != null) TxtQueryShift.Text = "Shift";
                    if (TxtQueryProdLine != null) TxtQueryProdLine.Text = "Prod Line";
                    if (TxtSearchBtn != null) TxtSearchBtn.Text = "Search";

                    if (CboItemAll != null) CboItemAll.Content = "All Shifts";
                    if (CboItemDay != null) CboItemDay.Content = "Day Shift (07:30 - 18:30)";
                    if (CboItemNight != null) CboItemNight.Content = "Night Shift (19:30 - 06:30)";

                    if (TxtCardInputQtyTitle != null) TxtCardInputQtyTitle.Text = "Input Qty";
                    if (TxtCardYieldTitle != null) TxtCardYieldTitle.Text = "Yield (%)";
                    if (TxtCardUphTitle != null) TxtCardUphTitle.Text = "UPH";
                    if (TxtCardOeeTitle != null) TxtCardOeeTitle.Text = "OEE";

                    if (TxtInputTrendLabel != null) TxtInputTrendLabel.Text = "vs Yesterday";
                    if (TxtYieldTrendLabel != null) TxtYieldTrendLabel.Text = "vs Yesterday";
                    if (TxtUphTrendLabel != null) TxtUphTrendLabel.Text = "vs Yesterday";
                    if (TxtOeeTrendLabel != null) TxtOeeTrendLabel.Text = "vs Yesterday";

                    if (TxtHourlyOutputTitle != null) TxtHourlyOutputTitle.Text = "Hourly Output";
                    if (TxtHourlyOutputLegend != null) TxtHourlyOutputLegend.Text = "Output (pcs)";
                    if (TxtYieldTrendTitle != null) TxtYieldTrendTitle.Text = "Yield Trend";
                    if (TxtYieldTrendLegend != null) TxtYieldTrendLegend.Text = "Yield (%)";

                    if (TxtCtTrendTitle != null) TxtCtTrendTitle.Text = "CT Cycle Time Trend";
                    if (TxtCtTrendLegend != null) TxtCtTrendLegend.Text = "CT (s)";
                    if (TxtOeeAnalysisTitle != null) TxtOeeAnalysisTitle.Text = "OEE Analysis";
                    if (TxtOeeAnalysisLegend != null) TxtOeeAnalysisLegend.Text = "OEE (%)";

                    if (TxtAvailabilityFactor != null) TxtAvailabilityFactor.Text = "Availability";
                    if (TxtPerformanceFactor != null) TxtPerformanceFactor.Text = "Performance";
                    if (TxtQualityFactor != null) TxtQualityFactor.Text = "Quality";
                }
                else
                {
                    // Vietnamese
                    if (TxtQueryDate != null) TxtQueryDate.Text = "Ngày";
                    if (TxtQueryShift != null) TxtQueryShift.Text = "Ca làm việc";
                    if (TxtQueryProdLine != null) TxtQueryProdLine.Text = "Dây chuyền";
                    if (TxtSearchBtn != null) TxtSearchBtn.Text = "Tìm kiếm";

                    if (CboItemAll != null) CboItemAll.Content = "Tất cả ca";
                    if (CboItemDay != null) CboItemDay.Content = "Ca sáng (07:30 - 18:30)";
                    if (CboItemNight != null) CboItemNight.Content = "Ca tối (19:30 - 06:30)";

                    if (TxtCardInputQtyTitle != null) TxtCardInputQtyTitle.Text = "Lượng đầu vào";
                    if (TxtCardYieldTitle != null) TxtCardYieldTitle.Text = "Tỷ lệ đạt (%)";
                    if (TxtCardUphTitle != null) TxtCardUphTitle.Text = "UPH";
                    if (TxtCardOeeTitle != null) TxtCardOeeTitle.Text = "OEE";

                    if (TxtInputTrendLabel != null) TxtInputTrendLabel.Text = "so với hôm qua";
                    if (TxtYieldTrendLabel != null) TxtYieldTrendLabel.Text = "so với hôm qua";
                    if (TxtUphTrendLabel != null) TxtUphTrendLabel.Text = "so với hôm qua";
                    if (TxtOeeTrendLabel != null) TxtOeeTrendLabel.Text = "so với hôm qua";

                    if (TxtHourlyOutputTitle != null) TxtHourlyOutputTitle.Text = "Sản lượng theo giờ";
                    if (TxtHourlyOutputLegend != null) TxtHourlyOutputLegend.Text = "Sản lượng (sp)";
                    if (TxtYieldTrendTitle != null) TxtYieldTrendTitle.Text = "Xu hướng tỷ lệ đạt";
                    if (TxtYieldTrendLegend != null) TxtYieldTrendLegend.Text = "Tỷ lệ đạt (%)";

                    if (TxtCtTrendTitle != null) TxtCtTrendTitle.Text = "Xu hướng nhịp sản xuất (CT)";
                    if (TxtCtTrendLegend != null) TxtCtTrendLegend.Text = "CT (s)";
                    if (TxtOeeAnalysisTitle != null) TxtOeeAnalysisTitle.Text = "Phân tích OEE";
                    if (TxtOeeAnalysisLegend != null) TxtOeeAnalysisLegend.Text = "OEE (%)";

                    if (TxtAvailabilityFactor != null) TxtAvailabilityFactor.Text = "Độ sẵn sàng (Availability)";
                    if (TxtPerformanceFactor != null) TxtPerformanceFactor.Text = "Hiệu suất (Performance)";
                    if (TxtQualityFactor != null) TxtQualityFactor.Text = "Chất lượng (Quality)";
                }
            }
            catch { }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DATA MODEL
    // ─────────────────────────────────────────────────────────────────────────
    internal class StationRow
    {
        public string Name     { get; set; } = "";
        public int    Output   { get; set; }
        public double Ct       { get; set; }
        public int    Downtime { get; set; }
        public double Yield    { get; set; }
        public bool   IsTotal  { get; set; }
    }
}

