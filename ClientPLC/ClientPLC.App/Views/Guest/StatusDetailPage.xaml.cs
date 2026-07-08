using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;
using PLC.Config;
using PLC.Network;
using PLC.Service;
using PLC.Model;

namespace PLC.Views;

public partial class StatusDetailPage : UserControl, ILocalizable
{
    private DispatcherTimer? _timer;

    public StatusDetailPage()
    {
        InitializeComponent();
        TranslateUI();
        base.Loaded += StatusDetailPage_Loaded;
        base.Unloaded += StatusDetailPage_Unloaded;
        PLC.Service.LanguageManager.LanguageChanged += OnLanguageChanged;
    }

    public void TranslateUI()
    {
        try
        {
            if (TxtTitle != null) TxtTitle.Text = LanguageManager.GetText("LiveStatus.Title") ?? "Chi tiết trạng thái thanh ghi PLC";
            if (TxtSubtitle != null) TxtSubtitle.Text = LanguageManager.GetText("LiveStatus.Subtitle") ?? "Giám sát trực quan dữ liệu đọc thời gian thực từ PLC";
            if (ColAlias != null) ColAlias.Header = LanguageManager.GetText("LiveStatus.ColAlias") ?? "Tên / Alias";
            if (ColAddress != null) ColAddress.Header = LanguageManager.GetText("LiveStatus.ColAddress") ?? "Địa chỉ";
            if (ColType != null) ColType.Header = LanguageManager.GetText("LiveStatus.ColType") ?? "Kiểu dữ liệu";
            if (ColValue != null) ColValue.Header = LanguageManager.GetText("LiveStatus.ColValue") ?? "Dữ liệu đọc được";
        }
        catch (Exception ex)
        {
            Debug.WriteLine("[StatusDetailPage] TranslateUI error: " + ex.Message);
        }
    }

    private void StatusDetailPage_Loaded(object sender, RoutedEventArgs e)
    {
        GridLiveStatus.ItemsSource = MqttClientService.Instance.ActiveAddressItems;

        System.ComponentModel.ICollectionView defaultView = System.Windows.Data.CollectionViewSource.GetDefaultView(MqttClientService.Instance.ActiveAddressItems);
        if (defaultView != null)
        {
            defaultView.Filter = FilterLiveStatusItem;
        }

        _timer = new DispatcherTimer();
        _timer.Interval = TimeSpan.FromSeconds(1L);
        _timer.Tick += (s, ev) =>
        {
            System.ComponentModel.ICollectionView view = System.Windows.Data.CollectionViewSource.GetDefaultView(MqttClientService.Instance.ActiveAddressItems);
            view?.Refresh();
        };
        _timer.Start();
    }

    private void StatusDetailPage_Unloaded(object sender, RoutedEventArgs e)
    {
        _timer?.Stop();

        System.ComponentModel.ICollectionView defaultView = System.Windows.Data.CollectionViewSource.GetDefaultView(MqttClientService.Instance.ActiveAddressItems);
        if (defaultView != null)
        {
            defaultView.Filter = null;
        }

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

    private void TxtStatusSearch_TextChanged(object sender, TextChangedEventArgs e)
    {
        System.ComponentModel.ICollectionView defaultView = System.Windows.Data.CollectionViewSource.GetDefaultView(MqttClientService.Instance.ActiveAddressItems);
        defaultView?.Refresh();
    }

    private bool FilterLiveStatusItem(object obj)
    {
        if (obj is not DataAddressItem item) return false;
        if (!item.Enabled) return false;

        string filter = TxtStatusSearch?.Text?.Trim()?.ToLower() ?? "";
        if (string.IsNullOrEmpty(filter)) return true;

        return item.Address.ToLower().Contains(filter) ||
               item.Alias.ToLower().Contains(filter) ||
               (item.Description != null && item.Description.ToLower().Contains(filter));
    }
}

