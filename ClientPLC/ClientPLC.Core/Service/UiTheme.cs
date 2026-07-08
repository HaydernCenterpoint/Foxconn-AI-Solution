using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace PLC.Service;

public static class UiTheme
{
    public static readonly Color AppBackground = Color.FromRgb(32, 39, 49);     // #202731
    public static readonly Color SidebarBackground = Color.FromRgb(18, 24, 32); // #121820
    public static readonly Color PanelBackground = Color.FromRgb(56, 63, 73);   // #383F49
    public static readonly Color ControlBackground = Color.FromRgb(32, 39, 49); // #202731
    public static readonly Color Accent = Color.FromRgb(8, 182, 195);          // #08B6C3
    public static readonly Color PrimaryText = Color.FromRgb(241, 245, 249);    // #F1F5F9
    public static readonly Color SecondaryText = Color.FromRgb(170, 183, 200);  // #AAB7C8
    public static readonly Color BorderColor = Color.FromRgb(80, 91, 105);      // #505B69
    public static readonly Color Danger = Color.FromRgb(244, 67, 70);           // #F44346

    public static readonly Color ControlHover = Color.FromRgb(43, 53, 65);       // #2B3541
    public static readonly Color BorderLight = Color.FromRgb(70, 81, 94);        // #46515E
    public static readonly Color AccentHover = Color.FromRgb(22, 197, 209);      // #16C5D1
    public static readonly Color TextMuted = Color.FromRgb(127, 139, 154);       // #7F8B9A
    public static readonly Color RowOdd = Color.FromRgb(34, 42, 52);             // #222A34
    public static readonly Color RowEven = Color.FromRgb(48, 56, 66);            // #303842
    public static readonly Color RowSelected = Color.FromRgb(22, 78, 99);         // #164E63
    public static readonly Color RowHover = Color.FromRgb(52, 64, 76);           // #34404C

    public static void ApplyDarkDataGridViewStyle(DataGrid grid)
    {
        if (grid == null) return;

        var panelBg = Application.Current.TryFindResource("PanelBackground") as Brush ?? new SolidColorBrush(PanelBackground);
        var textPrimary = Application.Current.TryFindResource("TextPrimary") as Brush ?? new SolidColorBrush(PrimaryText);
        var borderBrush = Application.Current.TryFindResource("BorderBrush") as Brush ?? new SolidColorBrush(BorderColor);
        var windowBg = Application.Current.TryFindResource("WindowBackground") as Brush ?? new SolidColorBrush(RowOdd);
        var sidebarBg = Application.Current.TryFindResource("SidebarBackground") as Brush ?? new SolidColorBrush(RowHover);
        var accentColor = Application.Current.TryFindResource("AccentColor") as Brush ?? new SolidColorBrush(RowSelected);

        grid.Background = panelBg;
        grid.RowBackground = windowBg;
        grid.AlternatingRowBackground = panelBg;
        grid.GridLinesVisibility = DataGridGridLinesVisibility.None;
        grid.BorderBrush = borderBrush;
        grid.Foreground = textPrimary;
        grid.RowHeaderWidth = 0;
        grid.IsReadOnly = true;
        grid.SelectionMode = DataGridSelectionMode.Single;
        grid.AutoGenerateColumns = false;
        grid.RowHeight = double.NaN;
        grid.CanUserAddRows = false; 

        // Row style with height and trigger for hover
        var rowStyle = new Style(typeof(DataGridRow));
        rowStyle.Setters.Add(new Setter(DataGridRow.HeightProperty, 30.0));
        rowStyle.Setters.Add(new Setter(DataGridRow.BackgroundProperty, windowBg));
        rowStyle.Setters.Add(new Setter(DataGridRow.ForegroundProperty, textPrimary));
        rowStyle.Setters.Add(new Setter(DataGridRow.BorderThicknessProperty, new Thickness(0, 0, 0, 1)));
        rowStyle.Setters.Add(new Setter(DataGridRow.BorderBrushProperty, borderBrush));

        var alternatingSetter = new Trigger { Property = ItemsControl.AlternationIndexProperty, Value = 1 };
        alternatingSetter.Setters.Add(new Setter(DataGridRow.BackgroundProperty, panelBg));
        rowStyle.Triggers.Add(alternatingSetter);

        // Hover effect: Background light change
        var mouseOverTrigger = new Trigger { Property = DataGridRow.IsMouseOverProperty, Value = true };
        mouseOverTrigger.Setters.Add(new Setter(DataGridRow.BackgroundProperty, sidebarBg));
        rowStyle.Triggers.Add(mouseOverTrigger);

        // Selected state: Background change
        var selectedTrigger = new Trigger { Property = DataGridRow.IsSelectedProperty, Value = true };
        selectedTrigger.Setters.Add(new Setter(DataGridRow.BackgroundProperty, accentColor));
        selectedTrigger.Setters.Add(new Setter(DataGridRow.ForegroundProperty, Brushes.White));
        rowStyle.Triggers.Add(selectedTrigger);

        grid.RowStyle = rowStyle;
        grid.AlternationCount = 2;

        // Cell style to remove border and set padding
        var cellStyle = new Style(typeof(DataGridCell));
        cellStyle.Setters.Add(new Setter(DataGridCell.PaddingProperty, new Thickness(8, 0, 8, 0)));
        cellStyle.Setters.Add(new Setter(DataGridCell.BorderThicknessProperty, new Thickness(0)));
        cellStyle.Setters.Add(new Setter(DataGridCell.BackgroundProperty, Brushes.Transparent));
        cellStyle.Setters.Add(new Setter(DataGridCell.ForegroundProperty, textPrimary));
        
        // Ensure no windows selection colors overwrite cell selection
        var cellSelectedTrigger = new Trigger { Property = DataGridCell.IsSelectedProperty, Value = true };
        cellSelectedTrigger.Setters.Add(new Setter(DataGridCell.BackgroundProperty, Brushes.Transparent));
        cellSelectedTrigger.Setters.Add(new Setter(DataGridCell.ForegroundProperty, new SolidColorBrush(Colors.White)));
        cellStyle.Triggers.Add(cellSelectedTrigger);

        // Add template to center content vertically
        var cellTemplate = new ControlTemplate(typeof(DataGridCell));
        var borderFactory = new FrameworkElementFactory(typeof(Border));
        borderFactory.SetValue(Border.PaddingProperty, new TemplateBindingExtension(DataGridCell.PaddingProperty));
        borderFactory.SetValue(Border.BackgroundProperty, new TemplateBindingExtension(DataGridCell.BackgroundProperty));
        var presenterFactory = new FrameworkElementFactory(typeof(ContentPresenter));
        presenterFactory.SetValue(ContentPresenter.VerticalAlignmentProperty, VerticalAlignment.Center);
        borderFactory.AppendChild(presenterFactory);
        cellTemplate.VisualTree = borderFactory;
        cellStyle.Setters.Add(new Setter(DataGridCell.TemplateProperty, cellTemplate));

        grid.CellStyle = cellStyle;

        // Header Style
        var headerStyle = new Style(typeof(System.Windows.Controls.Primitives.DataGridColumnHeader));
        headerStyle.Setters.Add(new Setter(System.Windows.Controls.Primitives.DataGridColumnHeader.BackgroundProperty, sidebarBg));
        headerStyle.Setters.Add(new Setter(System.Windows.Controls.Primitives.DataGridColumnHeader.ForegroundProperty, textPrimary));
        headerStyle.Setters.Add(new Setter(System.Windows.Controls.Primitives.DataGridColumnHeader.FontWeightProperty, FontWeights.Bold));
        headerStyle.Setters.Add(new Setter(System.Windows.Controls.Primitives.DataGridColumnHeader.HeightProperty, 36.0));
        headerStyle.Setters.Add(new Setter(System.Windows.Controls.Primitives.DataGridColumnHeader.PaddingProperty, new Thickness(10, 0, 4, 0)));
        headerStyle.Setters.Add(new Setter(System.Windows.Controls.Primitives.DataGridColumnHeader.HorizontalContentAlignmentProperty, HorizontalAlignment.Left));
        headerStyle.Setters.Add(new Setter(System.Windows.Controls.Primitives.DataGridColumnHeader.VerticalContentAlignmentProperty, VerticalAlignment.Center));

        // Use standard template to draw bottom border clearly
        var headerTemplate = new ControlTemplate(typeof(System.Windows.Controls.Primitives.DataGridColumnHeader));
        var headerBorder = new FrameworkElementFactory(typeof(Border));
        headerBorder.SetValue(Border.BackgroundProperty, new TemplateBindingExtension(System.Windows.Controls.Primitives.DataGridColumnHeader.BackgroundProperty));
        headerBorder.SetValue(Border.BorderBrushProperty, borderBrush);
        headerBorder.SetValue(Border.BorderThicknessProperty, new Thickness(0, 0, 1, 2)); // Bottom border is thicker (2px) than separators
        headerBorder.SetValue(Border.PaddingProperty, new TemplateBindingExtension(System.Windows.Controls.Primitives.DataGridColumnHeader.PaddingProperty));

        var headerPresenter = new FrameworkElementFactory(typeof(ContentPresenter));
        headerPresenter.SetValue(ContentPresenter.VerticalAlignmentProperty, VerticalAlignment.Center);
        headerPresenter.SetValue(ContentPresenter.HorizontalAlignmentProperty, HorizontalAlignment.Left);
        headerBorder.AppendChild(headerPresenter);
        headerTemplate.VisualTree = headerBorder;
        headerStyle.Setters.Add(new Setter(System.Windows.Controls.Primitives.DataGridColumnHeader.TemplateProperty, headerTemplate));

        grid.ColumnHeaderStyle = headerStyle;
    }

    public static void ApplyDarkButtonStyle(Button button)
    {
        if (button == null) return;
        button.Height = 32;
        button.Cursor = System.Windows.Input.Cursors.Hand;
        
        var borderBrush = Application.Current.TryFindResource("BorderBrush") as Brush ?? new SolidColorBrush(BorderColor);
        var panelBg = Application.Current.TryFindResource("PanelBackground") as Brush ?? new SolidColorBrush(ControlBackground);
        var sidebarBg = Application.Current.TryFindResource("SidebarBackground") as Brush ?? new SolidColorBrush(ControlHover);
        var textSecondary = Application.Current.TryFindResource("TextSecondary") as Brush ?? new SolidColorBrush(SecondaryText);

        var template = new ControlTemplate(typeof(Button));
        var borderFactory = new FrameworkElementFactory(typeof(Border));
        borderFactory.Name = "BtnBorder";
        borderFactory.SetValue(Border.CornerRadiusProperty, new CornerRadius(4));
        borderFactory.SetValue(Border.BorderThicknessProperty, new Thickness(1));
        borderFactory.SetValue(Border.BorderBrushProperty, borderBrush);
        borderFactory.SetValue(Border.BackgroundProperty, panelBg);

        var presenterFactory = new FrameworkElementFactory(typeof(ContentPresenter));
        presenterFactory.SetValue(ContentPresenter.HorizontalAlignmentProperty, HorizontalAlignment.Center);
        presenterFactory.SetValue(ContentPresenter.VerticalAlignmentProperty, VerticalAlignment.Center);
        presenterFactory.SetValue(ContentPresenter.MarginProperty, new Thickness(12, 0, 12, 0));
        borderFactory.AppendChild(presenterFactory);
        template.VisualTree = borderFactory;

        // Hover trigger
        var hoverTrigger = new Trigger { Property = UIElement.IsMouseOverProperty, Value = true };
        hoverTrigger.Setters.Add(new Setter(Border.BackgroundProperty, sidebarBg, "BtnBorder"));
        hoverTrigger.Setters.Add(new Setter(Border.BorderBrushProperty, borderBrush, "BtnBorder"));
        template.Triggers.Add(hoverTrigger);

        button.Template = template;
        button.Foreground = textSecondary;
    }

    public static void ApplyPrimaryButtonStyle(Button button)
    {
        if (button == null) return;
        button.Height = 32;
        button.Cursor = System.Windows.Input.Cursors.Hand;

        var accentColor = Application.Current.TryFindResource("AccentColor") as Brush ?? new SolidColorBrush(Accent);
        var accentHover = Application.Current.TryFindResource("AccentHover") as Brush ?? new SolidColorBrush(AccentHover);

        var template = new ControlTemplate(typeof(Button));
        var borderFactory = new FrameworkElementFactory(typeof(Border));
        borderFactory.Name = "BtnBorder";
        borderFactory.SetValue(Border.CornerRadiusProperty, new CornerRadius(4));
        borderFactory.SetValue(Border.BorderThicknessProperty, new Thickness(0));
        borderFactory.SetValue(Border.BackgroundProperty, accentColor);

        var presenterFactory = new FrameworkElementFactory(typeof(ContentPresenter));
        presenterFactory.SetValue(ContentPresenter.HorizontalAlignmentProperty, HorizontalAlignment.Center);
        presenterFactory.SetValue(ContentPresenter.VerticalAlignmentProperty, VerticalAlignment.Center);
        presenterFactory.SetValue(ContentPresenter.MarginProperty, new Thickness(12, 0, 12, 0));
        borderFactory.AppendChild(presenterFactory);
        template.VisualTree = borderFactory;

        // Hover trigger
        var hoverTrigger = new Trigger { Property = UIElement.IsMouseOverProperty, Value = true };
        hoverTrigger.Setters.Add(new Setter(Border.BackgroundProperty, accentHover, "BtnBorder"));
        template.Triggers.Add(hoverTrigger);

        button.Template = template;
        button.Foreground = Brushes.White;
        button.FontWeight = FontWeights.Bold;
    }

    public static void ApplyDangerButtonStyle(Button button)
    {
        if (button == null) return;
        button.Height = 32;
        button.Cursor = System.Windows.Input.Cursors.Hand;

        var template = new ControlTemplate(typeof(Button));
        var borderFactory = new FrameworkElementFactory(typeof(Border));
        borderFactory.Name = "BtnBorder";
        borderFactory.SetValue(Border.CornerRadiusProperty, new CornerRadius(4));
        borderFactory.SetValue(Border.BorderThicknessProperty, new Thickness(0));
        borderFactory.SetValue(Border.BackgroundProperty, new SolidColorBrush(Danger));

        var presenterFactory = new FrameworkElementFactory(typeof(ContentPresenter));
        presenterFactory.SetValue(ContentPresenter.HorizontalAlignmentProperty, HorizontalAlignment.Center);
        presenterFactory.SetValue(ContentPresenter.VerticalAlignmentProperty, VerticalAlignment.Center);
        presenterFactory.SetValue(ContentPresenter.MarginProperty, new Thickness(12, 0, 12, 0));
        borderFactory.AppendChild(presenterFactory);
        template.VisualTree = borderFactory;

        // Hover trigger
        var hoverTrigger = new Trigger { Property = UIElement.IsMouseOverProperty, Value = true };
        hoverTrigger.Setters.Add(new Setter(Border.BackgroundProperty, new SolidColorBrush(Color.FromRgb(248, 113, 113)), "BtnBorder"));
        template.Triggers.Add(hoverTrigger);

        button.Template = template;
        button.Foreground = Brushes.White;
        button.FontWeight = FontWeights.Bold;
    }

    public static void ApplyDarkTextBoxStyle(TextBox textBox, string placeholder = "")
    {
        if (textBox == null) return;
        textBox.Height = 30;

        var inputBg = Application.Current.TryFindResource("InputBackground") as Brush ?? new SolidColorBrush(ControlBackground);
        var inputFg = Application.Current.TryFindResource("InputForeground") as Brush ?? new SolidColorBrush(PrimaryText);
        var inputBorder = Application.Current.TryFindResource("InputBorder") as Brush ?? new SolidColorBrush(BorderColor);
        var textMuted = Application.Current.TryFindResource("TextMuted") as Brush ?? new SolidColorBrush(TextMuted);
        var accentColor = Application.Current.TryFindResource("AccentColor") as Brush ?? new SolidColorBrush(Accent);

        textBox.Background = inputBg;
        textBox.Foreground = inputFg;
        textBox.BorderBrush = inputBorder;
        textBox.BorderThickness = new Thickness(1);
        textBox.Padding = new Thickness(10, 0, 10, 0);
        textBox.VerticalContentAlignment = VerticalAlignment.Center;

        var template = new ControlTemplate(typeof(TextBox));
        var grid = new FrameworkElementFactory(typeof(Grid));

        var border = new FrameworkElementFactory(typeof(Border));
        border.Name = "Border";
        border.SetValue(Border.CornerRadiusProperty, new CornerRadius(4));
        border.SetValue(Border.BorderThicknessProperty, new TemplateBindingExtension(TextBox.BorderThicknessProperty));
        border.SetValue(Border.BorderBrushProperty, new TemplateBindingExtension(TextBox.BorderBrushProperty));
        border.SetValue(Border.BackgroundProperty, new TemplateBindingExtension(TextBox.BackgroundProperty));
        grid.AppendChild(border);

        var scrollViewer = new FrameworkElementFactory(typeof(ScrollViewer));
        scrollViewer.Name = "PART_ContentHost";
        scrollViewer.SetValue(FrameworkElement.MarginProperty, new Thickness(0));
        scrollViewer.SetValue(ScrollViewer.VerticalScrollBarVisibilityProperty, ScrollBarVisibility.Disabled);
        scrollViewer.SetValue(ScrollViewer.HorizontalScrollBarVisibilityProperty, ScrollBarVisibility.Disabled);
        border.AppendChild(scrollViewer);

        if (!string.IsNullOrEmpty(placeholder))
        {
            var txtPlaceholder = new FrameworkElementFactory(typeof(TextBlock));
            txtPlaceholder.Name = "PlaceholderText";
            txtPlaceholder.SetValue(TextBlock.TextProperty, placeholder);
            txtPlaceholder.SetValue(TextBlock.ForegroundProperty, textMuted);
            txtPlaceholder.SetValue(TextBlock.VerticalAlignmentProperty, VerticalAlignment.Center);
            txtPlaceholder.SetValue(FrameworkElement.MarginProperty, new Thickness(10, 0, 10, 0));
            txtPlaceholder.SetValue(UIElement.IsHitTestVisibleProperty, false);
            grid.AppendChild(txtPlaceholder);
        }

        template.VisualTree = grid;

        // Focus & Hover triggers
        var hoverTrigger = new Trigger { Property = UIElement.IsMouseOverProperty, Value = true };
        hoverTrigger.Setters.Add(new Setter(TextBox.BorderBrushProperty, accentColor));
        template.Triggers.Add(hoverTrigger);

        var focusTrigger = new Trigger { Property = UIElement.IsKeyboardFocusedProperty, Value = true };
        focusTrigger.Setters.Add(new Setter(TextBox.BorderBrushProperty, accentColor));
        focusTrigger.Setters.Add(new Setter(TextBox.BorderThicknessProperty, new Thickness(1.5)));
        template.Triggers.Add(focusTrigger);

        textBox.Template = template;
    }

    public static void ApplyDarkComboBoxStyle(ComboBox comboBox)
    {
        if (comboBox == null) return;
        comboBox.Height = 32;

        var inputBg = Application.Current.TryFindResource("InputBackground") as Brush ?? new SolidColorBrush(ControlBackground);
        var inputFg = Application.Current.TryFindResource("InputForeground") as Brush ?? new SolidColorBrush(PrimaryText);
        var inputBorder = Application.Current.TryFindResource("InputBorder") as Brush ?? new SolidColorBrush(BorderColor);

        comboBox.Background = inputBg;
        comboBox.Foreground = inputFg;
        comboBox.BorderBrush = inputBorder;
        comboBox.BorderThickness = new Thickness(1);
    }

    public static void SetFilterButtonActive(RadioButton button, bool isActive)
    {
        if (button == null) return;
        button.Cursor = System.Windows.Input.Cursors.Hand;
        button.Height = 30;

        var template = new ControlTemplate(typeof(RadioButton));
        var border = new FrameworkElementFactory(typeof(Border));
        border.Name = "RadioBorder";
        border.SetValue(Border.CornerRadiusProperty, new CornerRadius(4));
        border.SetValue(Border.BorderThicknessProperty, new Thickness(1));

        if (isActive)
        {
            border.SetValue(Border.BackgroundProperty, new SolidColorBrush(Accent));
            border.SetValue(Border.BorderBrushProperty, new SolidColorBrush(Accent));
        }
        else
        {
            border.SetValue(Border.BackgroundProperty, new SolidColorBrush(ControlBackground));
            border.SetValue(Border.BorderBrushProperty, new SolidColorBrush(BorderColor));
        }

        var presenter = new FrameworkElementFactory(typeof(ContentPresenter));
        presenter.SetValue(ContentPresenter.HorizontalAlignmentProperty, HorizontalAlignment.Center);
        presenter.SetValue(ContentPresenter.VerticalAlignmentProperty, VerticalAlignment.Center);
        presenter.SetValue(ContentPresenter.MarginProperty, new Thickness(14, 0, 14, 0));
        border.AppendChild(presenter);
        template.VisualTree = border;

        // Add mouse hover trigger
        if (!isActive)
        {
            var hoverTrigger = new Trigger { Property = UIElement.IsMouseOverProperty, Value = true };
            hoverTrigger.Setters.Add(new Setter(Border.BackgroundProperty, new SolidColorBrush(ControlHover), "RadioBorder"));
            hoverTrigger.Setters.Add(new Setter(Border.BorderBrushProperty, new SolidColorBrush(BorderColor), "RadioBorder"));
            template.Triggers.Add(hoverTrigger);
        }

        button.Template = template;
        button.Foreground = isActive ? Brushes.White : new SolidColorBrush(SecondaryText);
        button.FontWeight = isActive ? FontWeights.Bold : FontWeights.Normal;
    }
}
