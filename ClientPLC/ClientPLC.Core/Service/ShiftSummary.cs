using System;
using System.Collections.Generic;

namespace PLC.Service;

public class ShiftSummary
{
	public string ShiftDate { get; set; } = string.Empty;

	public string ShiftName { get; set; } = string.Empty;

	public int RecordCount { get; set; } = 0;

	public DateTime FirstTimestamp { get; set; }

	public DateTime LastTimestamp { get; set; }

	public int ProductionQty { get; set; } = 0;

	public int DefectQty { get; set; } = 0;

	public int PlcRuntimeSeconds { get; set; } = 0;

	public double Availability { get; set; } = 0.0;

	public double Performance { get; set; } = 0.0;

	public double Quality { get; set; } = 0.0;

	public double Oee { get; set; } = 0.0;

	public double AvgSpeedPerHour { get; set; } = 0.0;

	public List<int> HourlyProduction { get; set; } = new List<int>();

	public List<double> HourlyYield { get; set; } = new List<double>();

	public List<double> HourlyCycleTime { get; set; } = new List<double>();
}
