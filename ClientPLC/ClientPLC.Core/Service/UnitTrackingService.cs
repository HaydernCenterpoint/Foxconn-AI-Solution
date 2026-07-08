using System;
using System.Diagnostics;
using PLC.Model;

namespace PLC.Service;

public class UnitTrackingService
{
	private static UnitTrackingService? _instance;
	private static readonly object _lock = new object();

	private UnitRecord? _currentUnit;
	private bool _isTracking;
	private DateTime _lastTrackTime;
	private Action<UnitRecord>? _onUnitCompleted;

	public static UnitTrackingService Instance
	{
		get
		{
			lock (_lock)
			{
				if (_instance == null)
				{
					_instance = new UnitTrackingService();
				}
				return _instance;
			}
		}
	}

	private UnitTrackingService()
	{
		_isTracking = false;
	}

	public void SetCompletionCallback(Action<UnitRecord> callback)
	{
		_onUnitCompleted = callback;
	}

	public void ProcessPLCData(
		bool conveyorHasProduct,    // M1050
		bool frontOutputComplete,   // M1065
		bool rearOutputComplete,    // M1068
		bool hasQualityFail,        // NG quality
		bool _unused2,              // reserved
		int? frontRobotCount,       // R0
		int? rearRobotCount,        // R10
		double cycleTime,           // D1022
		string machineId)
	{
		try
		{
			// Start tracking khi có sản phẩm mới
			if (conveyorHasProduct && !_isTracking)
			{
				StartTracking(machineId);
			}

			// Update error count trong quá trình
			if (_isTracking && _currentUnit != null)
			{
				if (hasQualityFail && !_currentUnit.HasQualityFail)
				{
					_currentUnit.HasQualityFail = true;
					_currentUnit.ErrorCount++;
					_currentUnit.IsNG = true;
				}

				_currentUnit.FrontRobotCount = frontRobotCount;
				_currentUnit.RearRobotCount = rearRobotCount;
			}

			// End tracking khi xuất liệu hoàn thành
			if (_isTracking && (frontOutputComplete || rearOutputComplete))
			{
				EndTracking(cycleTime);
			}
		}
		catch (Exception ex)
		{
			Debug.WriteLine($"[UnitTrackingService] ProcessPLCData error: {ex.Message}");
		}
	}

	private void StartTracking(string machineId)
	{
		var now = DateTime.Now;
		var shiftInfo = GetShiftInfo(now);

		_currentUnit = new UnitRecord
		{
			StartTime = now,
			MachineId = machineId,
			ShiftDate = shiftInfo.ShiftDate,
			ShiftName = shiftInfo.ShiftName,
			Status = "InProgress",
			ErrorCount = 0,
			IsNG = false,
		};

		_isTracking = true;
		_lastTrackTime = now;

		Debug.WriteLine($"[UnitTrackingService] Started tracking unit at {now:HH:mm:ss}");
	}

	private void EndTracking(double cycleTime)
	{
		if (_currentUnit == null) return;

		var now = DateTime.Now;
		_currentUnit.EndTime = now;
		_currentUnit.CycleTimeSeconds = (now - _currentUnit.StartTime).TotalSeconds;
		_currentUnit.Status = _currentUnit.IsNG ? "NG" : "OK";

		Debug.WriteLine($"[UnitTrackingService] Completed unit: {_currentUnit.Status}, Errors: {_currentUnit.ErrorCount}, Cycle: {_currentUnit.CycleTimeSeconds:F1}s");

		// Callback to Infrastructure layer for DB insert
		_onUnitCompleted?.Invoke(_currentUnit);

		// Reset
		_currentUnit = null;
		_isTracking = false;
	}

	private static (string ShiftName, string ShiftDate) GetShiftInfo(DateTime dt)
	{
		TimeSpan timeOfDay = dt.TimeOfDay;
		TimeSpan dayShiftStart = new TimeSpan(7, 30, 0);
		TimeSpan nightShiftStart = new TimeSpan(19, 30, 0);

		string shiftName;
		DateTime shiftDate;

		if (timeOfDay < dayShiftStart)
		{
			shiftName = "Night";
			shiftDate = dt.AddDays(-1).Date;
		}
		else if (timeOfDay < nightShiftStart)
		{
			shiftName = "Day";
			shiftDate = dt.Date;
		}
		else
		{
			shiftName = "Night";
			shiftDate = dt.Date;
		}

		return (shiftName, shiftDate.ToString("yyyy-MM-dd"));
	}

	public UnitRecord? GetCurrentUnit()
	{
		return _currentUnit;
	}

	public bool IsTracking()
	{
		return _isTracking;
	}
}
