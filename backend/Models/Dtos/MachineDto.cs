using System;

namespace backend.Models.Dtos
{
    public class MachineDto
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? MachineCode { get; set; }
        public string? Ip { get; set; }
        public string Status { get; set; } = string.Empty;
        public bool PlcConnected { get; set; }
        public string? ClientId { get; set; }
        public string ApprovalStatus { get; set; } = string.Empty;
        public double CpuPercent { get; set; }
        public double RamPercent { get; set; }
        public long UptimeSeconds { get; set; }
        public DateTime? LastHeartbeat { get; set; }
        public DateTime CreatedAt { get; set; }
        public string LineNames { get; set; } = string.Empty;
        public object? LastPlcData { get; set; }
        public int? SequenceOrder { get; set; }
        public string? LineId { get; set; }
    }
}
