using System;

namespace PLC.Service;

public class TelemetryRecord
{
	public long Id { get; set; }

	public DateTime Timestamp { get; set; }

	public string? Status { get; set; }

	public int PlcRuntime { get; set; }

	public int ProductionQty { get; set; }

	public int DefectQty { get; set; }
}
