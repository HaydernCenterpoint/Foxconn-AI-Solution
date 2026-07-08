using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using PLC.ViewModels;
using PLC.Service;

namespace PLC.Views;

public partial class DashboardView : UserControl, ILocalizable
{
    private DashboardViewModel? _viewModel;

    public DashboardView()
    {
        InitializeComponent();
        base.Loaded += DashboardView_Loaded;
        base.Unloaded += DashboardView_Unloaded;
        ProductionChartCanvas.SizeChanged += ChartCanvas_SizeChanged;
        YieldChartCanvas.SizeChanged += ChartCanvas_SizeChanged;
        HourlyOutputCanvas.SizeChanged += ChartCanvas_SizeChanged;
    }

    public void TranslateUI()
    {
        _viewModel?.TranslateUI();
    }

    private void DashboardView_Loaded(object sender, RoutedEventArgs e)
    {
        _viewModel = AppServiceProvider.Services?.GetService(typeof(DashboardViewModel)) as DashboardViewModel ?? new DashboardViewModel();
        _viewModel.OnDataUpdated += OnDataUpdated;
        DataContext = _viewModel;
        
        // Initial drawing
        OnDataUpdated();
    }

    private void DashboardView_Unloaded(object sender, RoutedEventArgs e)
    {
        if (_viewModel != null)
        {
            _viewModel.OnDataUpdated -= OnDataUpdated;
            _viewModel.Dispose();
            _viewModel = null;
        }
    }

    private void OnDataUpdated()
    {
        if (_viewModel == null) return;
        Dispatcher.BeginInvoke(new Action(() =>
        {
            DrawProductionChart(_viewModel.ShiftStart);
            DrawYieldChart(_viewModel.ShiftStart);
            DrawHourlyOutputChart(_viewModel.ShiftStart);
        }));
    }

    private void ChartCanvas_SizeChanged(object sender, SizeChangedEventArgs e)
    {
        OnDataUpdated();
    }

    private void DrawProductionChart(DateTime shiftStart)
    {
        ProductionChartCanvas.Children.Clear();
        GridProductionXAxis.Children.Clear();

        double actualWidth = ProductionChartCanvas.ActualWidth;
        double actualHeight = ProductionChartCanvas.ActualHeight;
        if (actualWidth <= 0.0 || actualHeight <= 0.0 || _viewModel == null) return;

        double paddingLeft = 45.0;
        double paddingBottom = 20.0;
        double paddingTop = 15.0;
        double paddingRight = 15.0;
        double width = actualWidth - paddingLeft - paddingRight;
        double height = actualHeight - paddingBottom - paddingTop;

        string[] xLabels = new string[7];
        for (int i = 0; i < 6; i++)
        {
            xLabels[i] = shiftStart.AddHours(i * 2).ToString("HH:mm");
        }
        xLabels[6] = shiftStart.AddHours(11).ToString("HH:mm");
        foreach (var xLabel in xLabels)
        {
            TextBlock label = new TextBlock
            {
                Text = xLabel,
                FontSize = 10.5,
                FontWeight = FontWeights.SemiBold,
                Foreground = Application.Current.TryFindResource("TextMuted") as Brush ?? new SolidColorBrush((Color)ColorConverter.ConvertFromString("#64748B")),
                HorizontalAlignment = HorizontalAlignment.Center
            };
            GridProductionXAxis.Children.Add(label);
        }

        double[] productionData = _viewModel.ProductionTrendData;
        if (productionData.Length == 0) return;
        
        double maxVal = 0;
        foreach (var v in productionData)
        {
            if (v > maxVal) maxVal = v;
        }
        maxVal = Math.Max(maxVal, 80);
        if (maxVal <= 100)
        {
            maxVal = Math.Ceiling(maxVal / 20.0) * 20.0;
        }
        else
        {
            maxVal = Math.Ceiling(maxVal / 100.0) * 100.0;
        }

        bool isDark = Config.AppSettings.Current.Theme?.ToLower() == "dark";
        Brush gridBrush = isDark
            ? new SolidColorBrush(Color.FromArgb(35, 255, 255, 255))
            : new SolidColorBrush(Color.FromArgb(20, 15, 23, 42));
        Brush textBrush = Application.Current.TryFindResource("TextMuted") as Brush
            ?? new SolidColorBrush((Color)ColorConverter.ConvertFromString("#64748B"));

        int divisions = 5;
        for (int i = 0; i <= divisions; i++)
        {
            double yPos = paddingTop + height - height * (double)i / divisions;
            double labelVal = maxVal * i / divisions;

            Line gridLine = new Line
            {
                X1 = paddingLeft, Y1 = yPos,
                X2 = actualWidth - paddingRight, Y2 = yPos,
                Stroke = gridBrush, StrokeThickness = 1.0,
                StrokeDashArray = new DoubleCollection(new double[] { 4.0, 4.0 })
            };
            ProductionChartCanvas.Children.Add(gridLine);

            TextBlock label = new TextBlock
            {
                Text = labelVal.ToString("N0"),
                FontSize = 10.0,
                FontWeight = FontWeights.SemiBold,
                Foreground = textBrush,
                TextAlignment = TextAlignment.Right,
                Width = paddingLeft - 8.0
            };
            Canvas.SetLeft(label, 0.0);
            Canvas.SetTop(label, yPos - 7.0);
            ProductionChartCanvas.Children.Add(label);
        }

        PointCollection points = new PointCollection();
        Brush accentBrush = Application.Current.TryFindResource("AccentColor") as Brush 
            ?? new SolidColorBrush((Color)ColorConverter.ConvertFromString("#0078D4"));
        Color accentColor = (accentBrush as SolidColorBrush)?.Color ?? (Color)ColorConverter.ConvertFromString("#0078D4");

        for (int j = 0; j < productionData.Length; j++)
        {
            double xPos = paddingLeft + (double)j * (width / (productionData.Length - 1));
            double yPos = paddingTop + height - height * (productionData[j] / maxVal);
            points.Add(new Point(xPos, yPos));

            Ellipse marker = new Ellipse
            {
                Width = 6,
                Height = 6,
                Fill = accentBrush,
                Stroke = new SolidColorBrush(Colors.White),
                StrokeThickness = 1.2,
                ToolTip = $"{xLabels[j]}: {productionData[j]:N0}"
            };
            Canvas.SetLeft(marker, xPos - 3);
            Canvas.SetTop(marker, yPos - 3);
            ProductionChartCanvas.Children.Add(marker);
        }

        Polyline polyline = new Polyline
        {
            Points = points,
            Stroke = accentBrush,
            StrokeThickness = 2.5,
            Effect = new System.Windows.Media.Effects.DropShadowEffect
            {
                BlurRadius = 8,
                ShadowDepth = 0,
                Color = accentColor,
                Opacity = 0.5
            }
        };
        ProductionChartCanvas.Children.Add(polyline);
    }

    private void DrawYieldChart(DateTime shiftStart)
    {
        YieldChartCanvas.Children.Clear();
        GridYieldXAxis.Children.Clear();

        double actualWidth = YieldChartCanvas.ActualWidth;
        double actualHeight = YieldChartCanvas.ActualHeight;
        if (actualWidth <= 0.0 || actualHeight <= 0.0 || _viewModel == null) return;

        double paddingLeft = 45.0;
        double paddingBottom = 20.0;
        double paddingTop = 15.0;
        double paddingRight = 15.0;
        double width = actualWidth - paddingLeft - paddingRight;
        double height = actualHeight - paddingBottom - paddingTop;

        string[] xLabels = new string[7];
        for (int i = 0; i < 6; i++)
        {
            xLabels[i] = shiftStart.AddHours(i * 2).ToString("HH:mm");
        }
        xLabels[6] = shiftStart.AddHours(11).ToString("HH:mm");
        foreach (var xLabel in xLabels)
        {
            TextBlock label = new TextBlock
            {
                Text = xLabel,
                FontSize = 10.5,
                FontWeight = FontWeights.SemiBold,
                Foreground = Application.Current.TryFindResource("TextMuted") as Brush ?? new SolidColorBrush((Color)ColorConverter.ConvertFromString("#64748B")),
                HorizontalAlignment = HorizontalAlignment.Center
            };
            GridYieldXAxis.Children.Add(label);
        }

        double[] yieldData = _viewModel.YieldTrendData;
        if (yieldData.Length == 0) return;
        
        double maxVal = 100.0;

        bool isDark = Config.AppSettings.Current.Theme?.ToLower() == "dark";
        Brush gridBrush = isDark
            ? new SolidColorBrush(Color.FromArgb(35, 255, 255, 255))
            : new SolidColorBrush(Color.FromArgb(20, 15, 23, 42));
        Brush textBrush = Application.Current.TryFindResource("TextMuted") as Brush
            ?? new SolidColorBrush((Color)ColorConverter.ConvertFromString("#64748B"));

        int divisions = 5;
        for (int i = 0; i <= divisions; i++)
        {
            double yPos = paddingTop + height - height * (double)i / divisions;
            double labelVal = 100.0 * i / divisions;

            Line gridLine = new Line
            {
                X1 = paddingLeft, Y1 = yPos,
                X2 = actualWidth - paddingRight, Y2 = yPos,
                Stroke = gridBrush, StrokeThickness = 1.0,
                StrokeDashArray = new DoubleCollection(new double[] { 4.0, 4.0 })
            };
            YieldChartCanvas.Children.Add(gridLine);

            TextBlock label = new TextBlock
            {
                Text = labelVal.ToString("F0"),
                FontSize = 10.0,
                FontWeight = FontWeights.SemiBold,
                Foreground = textBrush,
                TextAlignment = TextAlignment.Right,
                Width = paddingLeft - 8.0
            };
            Canvas.SetLeft(label, 0.0);
            Canvas.SetTop(label, yPos - 7.0);
            YieldChartCanvas.Children.Add(label);
        }

        PointCollection points = new PointCollection();
        Brush accentBrush = Application.Current.TryFindResource("AccentColor") as Brush 
            ?? new SolidColorBrush((Color)ColorConverter.ConvertFromString("#0078D4"));
        Color accentColor = (accentBrush as SolidColorBrush)?.Color ?? (Color)ColorConverter.ConvertFromString("#0078D4");

        for (int j = 0; j < yieldData.Length; j++)
        {
            double xPos = paddingLeft + (double)j * (width / (yieldData.Length - 1));
            double yPos = paddingTop + height - height * (yieldData[j] / maxVal);
            points.Add(new Point(xPos, yPos));

            Ellipse marker = new Ellipse
            {
                Width = 6,
                Height = 6,
                Fill = accentBrush,
                Stroke = new SolidColorBrush(Colors.White),
                StrokeThickness = 1.2,
                ToolTip = $"{xLabels[j]}: {yieldData[j]:F2}%"
            };
            Canvas.SetLeft(marker, xPos - 3);
            Canvas.SetTop(marker, yPos - 3);
            YieldChartCanvas.Children.Add(marker);
        }

        Polyline polyline = new Polyline
        {
            Points = points,
            Stroke = accentBrush,
            StrokeThickness = 2.5,
            Effect = new System.Windows.Media.Effects.DropShadowEffect
            {
                BlurRadius = 8,
                ShadowDepth = 0,
                Color = accentColor,
                Opacity = 0.5
            }
        };
        YieldChartCanvas.Children.Add(polyline);
    }

    private void DrawHourlyOutputChart(DateTime shiftStart)
    {
        try
        {
            HourlyOutputCanvas.Children.Clear();
            GridHourlyOutputXAxis.Children.Clear();

            double actualWidth = HourlyOutputCanvas.ActualWidth;
            double actualHeight = HourlyOutputCanvas.ActualHeight;
            if (actualWidth <= 0.0 || actualHeight <= 0.0 || _viewModel == null) return;

            double paddingLeft = 45.0;
            double paddingBottom = 20.0;
            double paddingTop = 20.0;
            double paddingRight = 15.0;
            double w = actualWidth - paddingLeft - paddingRight;
            double h = actualHeight - paddingBottom - paddingTop;

            List<int> hourlyData = _viewModel.HourlyOutputData;
            if (hourlyData.Count == 0) return;

            double maxVal = 0;
            foreach (var val in hourlyData)
            {
                if (val > maxVal) maxVal = val;
            }
            if (maxVal <= 0) maxVal = 10;
            else if (maxVal <= 10) maxVal = 10;
            else if (maxVal <= 50) maxVal = ((int)(maxVal / 5) + 1) * 5;
            else if (maxVal <= 100) maxVal = ((int)(maxVal / 10) + 1) * 10;
            else
            {
                double roundFactor = maxVal > 2000 ? 500.0 : (maxVal > 500 ? 100.0 : 50.0);
                maxVal = Math.Ceiling(maxVal / roundFactor) * roundFactor;
            }

            bool isDark = Config.AppSettings.Current.Theme?.ToLower() == "dark";
            Brush gridBrush = isDark
                ? new SolidColorBrush(Color.FromArgb(35, 255, 255, 255))
                : new SolidColorBrush(Color.FromArgb(20, 15, 23, 42));
            Brush textBrush = Application.Current.TryFindResource("TextMuted") as Brush
                ?? new SolidColorBrush((Color)ColorConverter.ConvertFromString("#64748B"));
            Brush valueTextBrush = Application.Current.TryFindResource("TextPrimary") as Brush
                ?? new SolidColorBrush(Colors.White);

            int divisions = 4;
            for (int i = 0; i <= divisions; i++)
            {
                double yPos = paddingTop + h - h * (double)i / divisions;
                double labelVal = maxVal * i / divisions;

                Line gridLine = new Line
                {
                    X1 = paddingLeft, Y1 = yPos,
                    X2 = actualWidth - paddingRight, Y2 = yPos,
                    Stroke = gridBrush, StrokeThickness = 1.0,
                    StrokeDashArray = new DoubleCollection(new double[] { 4.0, 4.0 })
                };
                HourlyOutputCanvas.Children.Add(gridLine);

                TextBlock label = new TextBlock
                {
                    Text = labelVal.ToString("N0"),
                    FontSize = 10.0,
                    FontWeight = FontWeights.SemiBold,
                    Foreground = textBrush,
                    TextAlignment = TextAlignment.Right,
                    Width = paddingLeft - 8.0
                };
                Canvas.SetLeft(label, 0.0);
                Canvas.SetTop(label, yPos - 7.0);
                HourlyOutputCanvas.Children.Add(label);
            }

            double colWidth = w / 12.0;
            double barW = colWidth * 0.65;

            for (int j = 0; j < 12; j++)
            {
                if (j >= hourlyData.Count) break;

                double xCenter = paddingLeft + j * colWidth + colWidth / 2.0;
                double barH = h * (hourlyData[j] / maxVal);
                double barY = paddingTop + h - barH;

                Brush successBrush = Application.Current.TryFindResource("SuccessColor") as Brush 
                    ?? new SolidColorBrush((Color)ColorConverter.ConvertFromString("#107C10"));
                Color successColor = (successBrush as SolidColorBrush)?.Color ?? (Color)ColorConverter.ConvertFromString("#107C10");

                Rectangle rect = new Rectangle
                {
                    Width = barW,
                    Height = Math.Max(2.0, barH),
                    Fill = successBrush,
                    RadiusX = 2.0,
                    RadiusY = 2.0,
                    ToolTip = $"H{j + 1}: {hourlyData[j]:N0} sp",
                    Effect = new System.Windows.Media.Effects.DropShadowEffect
                    {
                        BlurRadius = 5,
                        ShadowDepth = 0,
                        Color = successColor,
                        Opacity = 0.35
                    }
                };
                Canvas.SetLeft(rect, xCenter - barW / 2.0);
                Canvas.SetTop(rect, barY);
                HourlyOutputCanvas.Children.Add(rect);

                TextBlock valLabel = new TextBlock
                {
                    Text = hourlyData[j].ToString("N0"),
                    FontSize = 9.0,
                    FontWeight = FontWeights.Bold,
                    Foreground = valueTextBrush,
                    TextAlignment = TextAlignment.Center,
                    Width = colWidth
                };
                Canvas.SetLeft(valLabel, paddingLeft + j * colWidth);
                Canvas.SetTop(valLabel, barY - 14.0);
                HourlyOutputCanvas.Children.Add(valLabel);

                string xLabelText = shiftStart.AddHours(j).ToString("HH:mm");
                TextBlock xLabel = new TextBlock
                {
                    Text = xLabelText,
                    FontSize = 9.5,
                    FontWeight = FontWeights.SemiBold,
                    Foreground = textBrush,
                    HorizontalAlignment = HorizontalAlignment.Center
                };
                GridHourlyOutputXAxis.Children.Add(xLabel);
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine("[DashboardView] DrawHourlyOutputChart error: " + ex.Message);
        }
    }
}

