using System;
using PLC.Config;

namespace PLC.Service;

public enum UserRole
{
    Guest,      // Khách
    Engineer,   // Kỹ sư
    Admin       // Quản trị viên
}

public static class RoleManager
{
    private static UserRole _currentRole = UserRole.Guest;

    public static UserRole CurrentRole
    {
        get => _currentRole;
        private set
        {
            if (_currentRole != value)
            {
                _currentRole = value;
                RoleChanged?.Invoke();
            }
        }
    }

    public static event Action? RoleChanged;

    private static string GetPassword(UserRole role)
    {
        string key = $"password_{role.ToString().ToLower()}";
        try
        {
            string? value = AppConfig.Storage?.GetConfigValue(key);
            if (!string.IsNullOrEmpty(value))
            {
                return value;
            }
        }
        catch
        {
        }

        // Fallbacks
        if (role == UserRole.Engineer) return "666666";
        if (role == UserRole.Admin) return "888888";
        return "";
    }

    public static bool Login(UserRole targetRole, string password)
    {
        if (targetRole == UserRole.Guest)
        {
            CurrentRole = UserRole.Guest;
            return true;
        }

        string expectedPassword = GetPassword(targetRole);
        if (!string.IsNullOrEmpty(expectedPassword) && password == expectedPassword)
        {
            CurrentRole = targetRole;
            return true;
        }

        return false;
    }

    public static void Logout()
    {
        CurrentRole = UserRole.Guest;
    }
}
