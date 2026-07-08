using System;

namespace PLC.Model;

public class MachineData
{
	public string MachineId { get; set; }

	public string MachineName { get; set; }

	public string LineId { get; set; }

	public string LineName { get; set; }

	public int LineOrder { get; set; }

	public string Status { get; set; }

	public int RunCount { get; set; }

	public long PlcRunTimeMs { get; set; }

	public int ErrorCode { get; set; }

	public bool IsPlcConnected { get; set; }

	public long SystemUptimeMs { get; set; }

	public float CpuPercent { get; set; }

	public float RamUsedMb { get; set; }

	public float RamTotalMb { get; set; }

	public DateTime SentAt { get; set; }

	public bool IsServerConnected { get; set; }
}
