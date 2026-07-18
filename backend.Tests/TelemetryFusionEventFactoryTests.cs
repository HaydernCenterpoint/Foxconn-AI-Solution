using Mkz.Fusion.Contracts;

namespace backend.Tests;

public sealed class TelemetryFusionEventFactoryTests
{
    [Fact]
    public void Create_UsesEnvelopeMessageIdInsteadOfLineOrderForEventKey()
    {
        var machineId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        var input = new TelemetryCaptureInput(
            machineId, """{"messageId":"message-001"}""", 4,
            DateTimeOffset.Parse("2026-07-13T10:00:00Z"), "message-001",
            "Press A", "ERROR", true, 25, 1.2, 50.0, 88.5, 99.1, true);
        var result = TelemetryFusionEventFactory.Create(
            input, new MachineSnapshot(machineId, "client-a", "PRESS-A", "Press A"), null);

        Assert.Equal($"telemetry:{machineId}:message-001", result.EventKey);
        Assert.Equal("ERROR", result.Telemetry.Status);
        Assert.Equal(25, result.Telemetry.ProductionQuantity);
    }

    [Fact]
    public void Create_HashesRawPayloadWhenMessageIdIsMissing()
    {
        var machineId = Guid.Parse("22222222-2222-2222-2222-222222222222");
        var input = new TelemetryCaptureInput(
            machineId, """{"payload":{"qty":25}}""", 4,
            DateTimeOffset.Parse("2026-07-13T10:00:00Z"), null,
            "Press B", "RUNNING", true, 25, null, null, null, null, false);
        var result = TelemetryFusionEventFactory.Create(
            input, new MachineSnapshot(machineId, null, null, "Press B"), null);

        Assert.StartsWith($"telemetry:{machineId}:", result.EventKey);
        Assert.NotEqual($"telemetry:{machineId}:4", result.EventKey);
    }
}
