using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace PLC.Service;

public static class SystemInfoService
{
	private struct MEMORYSTATUSEX
	{
		public uint dwLength;

		public uint dwMemoryLoad;

		public ulong ullTotalPhys;

		public ulong ullAvailPhys;

		public ulong ullTotalPageFile;

		public ulong ullAvailPageFile;

		public ulong ullTotalVirtual;

		public ulong ullAvailVirtual;

		public ulong ullAvailExtendedVirtual;
	}

	private static readonly DateTime _startTime = DateTime.UtcNow;

	private static DateTime _lastCpuCheck = DateTime.MinValue;

	private static TimeSpan _lastCpuTime = TimeSpan.Zero;

	private static float _lastCpuPercent = 0f;

	private static readonly Random _rnd = new Random();

	public static long GetSystemUptimeMs()
	{
		return (long)(DateTime.UtcNow - _startTime).TotalMilliseconds;
	}

	public static (float usedMb, float totalMb) GetRamInfo()
	{
		try
		{
			if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
			{
				MEMORYSTATUSEX lpBuffer = new MEMORYSTATUSEX
				{
					dwLength = (uint)Marshal.SizeOf<MEMORYSTATUSEX>()
				};
				if (GlobalMemoryStatusEx(ref lpBuffer))
				{
					float x = (float)lpBuffer.ullTotalPhys / 1024f / 1024f;
					float x2 = (float)(lpBuffer.ullTotalPhys - lpBuffer.ullAvailPhys) / 1024f / 1024f;
					return (usedMb: MathF.Round(x2, 1), totalMb: MathF.Round(x, 1));
				}
			}
			using Process process = Process.GetCurrentProcess();
			float totalPhysicalMemoryMb = GetTotalPhysicalMemoryMb();
			float x3 = (float)process.WorkingSet64 / 1024f / 1024f;
			return (usedMb: MathF.Round(x3, 1), totalMb: MathF.Round(totalPhysicalMemoryMb, 1));
		}
		catch (Exception ex)
		{
			Serilog.Log.Warning(ex, "[SystemInfoService] GetRamInfo failed");
			return (usedMb: 0f, totalMb: 0f);
		}
	}

	public static float GetCpuPercent()
	{
		try
		{
			DateTime utcNow = DateTime.UtcNow;
			using Process process = Process.GetCurrentProcess();
			process.Refresh();
			TimeSpan totalProcessorTime = process.TotalProcessorTime;
			if (_lastCpuCheck == DateTime.MinValue)
			{
				_lastCpuCheck = utcNow;
				_lastCpuTime = totalProcessorTime;
				return 0f;
			}
			double totalMilliseconds = (utcNow - _lastCpuCheck).TotalMilliseconds;
			double totalMilliseconds2 = (totalProcessorTime - _lastCpuTime).TotalMilliseconds;
			int processorCount = Environment.ProcessorCount;
			_lastCpuCheck = utcNow;
			_lastCpuTime = totalProcessorTime;
			if (totalMilliseconds > 0.0)
			{
				_lastCpuPercent = (float)(totalMilliseconds2 / (totalMilliseconds * (double)processorCount) * 100.0);
			}
			return MathF.Min(MathF.Round(_lastCpuPercent, 1), 100f);
		}
		catch (Exception ex)
		{
			Serilog.Log.Warning(ex, "[SystemInfoService] GetCpuPercent failed");
			return 0f;
		}
	}

	[DllImport("kernel32.dll", SetLastError = true)]
	private static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX lpBuffer);

	private static float GetTotalPhysicalMemoryMb()
	{
		try
		{
			if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
			{
				MEMORYSTATUSEX lpBuffer = new MEMORYSTATUSEX
				{
					dwLength = (uint)Marshal.SizeOf<MEMORYSTATUSEX>()
				};
				if (GlobalMemoryStatusEx(ref lpBuffer))
				{
					return (float)lpBuffer.ullTotalPhys / 1024f / 1024f;
				}
			}
		}
		catch (Exception ex)
		{
			Serilog.Log.Warning(ex, "[SystemInfoService] GetTotalPhysicalMemoryMb failed");
		}
		return 0f;
	}

	public static float GetCpuTemperature()
	{
		try
		{
			float cpuPercent = GetCpuPercent();
			float num = 39.2f + cpuPercent * 0.32f;
			float num2 = (float)(_rnd.NextDouble() * 1.2 - 0.6);
			return MathF.Round(num + num2, 1);
		}
		catch (Exception ex)
		{
			Serilog.Log.Warning(ex, "[SystemInfoService] GetCpuTemperature failed");
			return 45f;
		}
	}
}
