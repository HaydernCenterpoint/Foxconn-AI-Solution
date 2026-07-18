using System.Security.Cryptography;
using System.Text;

namespace Mkz.Fusion.Contracts;

public sealed record MachineSnapshot(Guid Id, string? ClientId, string? MachineCode, string Name);

public sealed record LineSnapshot(Guid Id, string Name);

public sealed record MachineContext(MachineSnapshot Machine, LineSnapshot? Line);

public sealed record TelemetryCaptureInput(
    Guid MachineId,
    string RawTelemetryJson,
    long Sequence,
    DateTimeOffset OccurredAt,
    string? MessageId,
    string? ReportedMachineName,
    string Status,
    bool PlcConnected,
    long? ProductionQuantity,
    double? ProductionTime,
    double? Uph,
    double? Oee,
    double? YieldRate,
    bool? AlarmActive);

public sealed record TelemetryValues(
    string? MessageId,
    string Status,
    bool PlcConnected,
    long? ProductionQuantity,
    double? ProductionTime,
    double? Uph,
    double? Oee,
    double? YieldRate,
    bool? AlarmActive);

public sealed record TelemetryFusionEvent(
    int SchemaVersion,
    Guid EventId,
    string EventKey,
    DateTimeOffset OccurredAt,
    MachineSnapshot Machine,
    LineSnapshot? Line,
    TelemetryValues Telemetry,
    string RawTelemetryJson);

public static class TelemetryFusionEventFactory
{
    public static TelemetryFusionEvent Create(
        TelemetryCaptureInput input,
        MachineSnapshot machine,
        LineSnapshot? line)
    {
        var suffix = string.IsNullOrWhiteSpace(input.MessageId)
            ? Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(input.RawTelemetryJson))).ToLowerInvariant()
            : input.MessageId.Trim();

        return new TelemetryFusionEvent(
            SchemaVersion: 1,
            EventId: Guid.NewGuid(),
            EventKey: $"telemetry:{input.MachineId}:{suffix}",
            OccurredAt: input.OccurredAt,
            Machine: machine,
            Line: line,
            Telemetry: new TelemetryValues(
                input.MessageId,
                input.Status,
                input.PlcConnected,
                input.ProductionQuantity,
                input.ProductionTime,
                input.Uph,
                input.Oee,
                input.YieldRate,
                input.AlarmActive),
            RawTelemetryJson: input.RawTelemetryJson);
    }
}
