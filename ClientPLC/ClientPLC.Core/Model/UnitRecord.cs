using System;

namespace PLC.Model;

public class UnitRecord
{
	public long Id { get; set; }

	public string? SerialNumber { get; set; }

	public DateTime StartTime { get; set; }

	public DateTime? EndTime { get; set; }

	public int ErrorCount { get; set; }

	public bool IsNG { get; set; }

	public double CycleTimeSeconds { get; set; }

	public string MachineId { get; set; } = "default";

	public string? ShiftDate { get; set; }

	public string? ShiftName { get; set; }

	public string Status { get; set; } = "InProgress";

	public int? FrontRobotCount { get; set; }

	public int? RearRobotCount { get; set; }

	public bool HasQualityFail { get; set; }

}
