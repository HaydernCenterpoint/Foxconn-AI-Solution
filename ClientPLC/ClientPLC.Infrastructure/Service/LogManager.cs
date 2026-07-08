using System;
using System.Collections.Generic;
using System.IO;
using PLC.Network;
using Serilog;

namespace PLC.Service;

public static class LogManager
{
    private static readonly List<string> _logs = new List<string>();
    private static readonly object _lock = new object();
    private const int MaxLogs = 1000;

    public static event Action<string>? OnLogAdded;

    static LogManager()
    {
        string logPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ClientPLC", "Logs", "log-.txt");
        
        Log.Logger = new LoggerConfiguration()
            .MinimumLevel.Debug()
            .WriteTo.File(logPath, rollingInterval: RollingInterval.Day, outputTemplate: "{Timestamp:yyyy-MM-dd HH:mm:ss} [{Level:u3}] {Message:lj}{NewLine}{Exception}")
            .CreateLogger();

        MqttClientService.OnLogReceived += AddLog;
    }

    public static void AddLog(string message)
    {
        lock (_lock)
        {
            if (_logs.Count >= MaxLogs)
            {
                _logs.RemoveAt(0);
            }
            _logs.Add(message);
        }
        
        // Log systematically through Serilog structured format
        Log.Information("{LogMessage}", message);
        
        OnLogAdded?.Invoke(message);
    }

    public static List<string> GetLogs()
    {
        lock (_lock)
        {
            return new List<string>(_logs);
        }
    }

    public static void Clear()
    {
        lock (_lock)
        {
            _logs.Clear();
        }
    }
}
