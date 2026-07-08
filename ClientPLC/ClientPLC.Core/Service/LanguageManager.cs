using System;
using System.Collections.Generic;
using System.Globalization;
using System.Reflection;
using System.Resources;
using PLC.Config;
using PLC.Resources;

namespace PLC.Service;

public static class LanguageManager
{
    private const string DefaultLanguage = "en-US";

    private static readonly Dictionary<string, CultureInfo> SupportedCultures =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["vi"] = CultureInfo.GetCultureInfo("vi-VN"),
            ["vi-VN"] = CultureInfo.GetCultureInfo("vi-VN"),
            ["en"] = CultureInfo.GetCultureInfo("en-US"),
            ["en-US"] = CultureInfo.GetCultureInfo("en-US"),
            ["zh"] = CultureInfo.GetCultureInfo("zh-CN"),
            ["zh-CN"] = CultureInfo.GetCultureInfo("zh-CN"),
            ["cn"] = CultureInfo.GetCultureInfo("zh-CN")
        };

    private static CultureInfo _currentCulture = CultureInfo.GetCultureInfo("vi-VN");

    public static event EventHandler? LanguageChanged;

    public static CultureInfo CurrentCulture => _currentCulture;

    public static string CurrentLanguageCode => _currentCulture.Name;

    /// <summary>
    /// Khởi tạo ngôn ngữ khi ứng dụng bắt đầu.
    /// </summary>
    public static void Initialize()
    {
        string? savedLang = AppSettings.Current?.Language;
        SetLanguage(savedLang, saveSetting: false, notify: false);
    }

    /// <summary>
    /// Thay đổi ngôn ngữ ứng dụng.
    /// </summary>
    public static bool SetLanguage(
        string? languageCode,
        bool saveSetting = true,
        bool notify = true)
    {
        CultureInfo newCulture = ResolveCulture(languageCode);

        if (string.Equals(_currentCulture.Name, newCulture.Name, StringComparison.OrdinalIgnoreCase))
        {
            // Just ensure thread cultures are applied
            ApplyThreadCultures(newCulture);
            return false;
        }

        _currentCulture = newCulture;
        ApplyThreadCultures(newCulture);

        if (saveSetting && AppSettings.Current != null)
        {
            AppSettings.Current.Language = newCulture.Name;
            AppSettings.Current.Save();
        }

        if (notify)
        {
            LanguageChanged?.Invoke(null, EventArgs.Empty);
        }

        return true;
    }

    private static void ApplyThreadCultures(CultureInfo culture)
    {
        CultureInfo.CurrentCulture = culture;
        CultureInfo.CurrentUICulture = culture;
        CultureInfo.DefaultThreadCurrentCulture = culture;
        CultureInfo.DefaultThreadCurrentUICulture = culture;
        
        // Also update generated Strings culture
        Strings.Culture = culture;
    }

    /// <summary>
    /// Lấy chuỗi dịch không có tham số.
    /// </summary>
    public static string GetText(string key)
    {
        return GetText(key, Array.Empty<object>());
    }

    /// <summary>
    /// Lấy chuỗi dịch và chèn tham số {0}, {1}...
    /// </summary>
    public static string GetText(string key, params object?[] args)
    {
        if (string.IsNullOrWhiteSpace(key))
        {
            return string.Empty;
        }

        string? text = Strings.ResourceManager.GetString(key, _currentCulture);
        if (text == null)
        {
            // Fallback to English
            text = Strings.ResourceManager.GetString(key, CultureInfo.GetCultureInfo("en-US"));
            
            if (text == null)
            {
                string logMsg = $"[LanguageManager] Missing translation key: '{key}' for culture '{_currentCulture.Name}'";
                System.Diagnostics.Debug.WriteLine(logMsg);

#if DEBUG
                text = $"⟦{key}⟧";
#else
                text = key;
#endif
            }
        }

        if (args.Length == 0)
        {
            return text;
        }

        try
        {
            return string.Format(_currentCulture, text, args);
        }
        catch (FormatException)
        {
            System.Diagnostics.Debug.WriteLine($"[LanguageManager] Invalid translation format: key={key}, value={text}");
            return text;
        }
    }

    public static bool HasTranslation(string key)
    {
        return Strings.ResourceManager.GetString(key, _currentCulture) is not null;
    }

    private static CultureInfo ResolveCulture(string? languageCode)
    {
        if (string.IsNullOrWhiteSpace(languageCode))
        {
            return SupportedCultures["vi-VN"]; // Default is vi-VN as in the app settings default
        }

        string normalized = languageCode.Trim();
        if (SupportedCultures.TryGetValue(normalized, out CultureInfo? culture))
        {
            return culture;
        }

        string shortCode = normalized
            .Split('-', StringSplitOptions.RemoveEmptyEntries)
            .FirstOrDefault()
            ?.ToLowerInvariant()
            ?? "vi";

        return SupportedCultures.TryGetValue(shortCode, out culture)
            ? culture
            : SupportedCultures["vi-VN"];
    }
}
