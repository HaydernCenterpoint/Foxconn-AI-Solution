using Mkz.Fusion.Contracts;

namespace backend.Tests;

public sealed class TelemetrySchemaContractTests
{
    [Fact]
    public void Normalize_ExtractsAllPresentMetrics()
    {
        var input = new TelemetryCaptureInput(
            MachineId: Guid.NewGuid(),
            RawTelemetryJson: "{}",
            Sequence: 1,
            OccurredAt: DateTimeOffset.UtcNow,
            MessageId: "msg-1",
            ReportedMachineName: "Machine A",
            Status: "running",
            PlcConnected: true,
            ProductionQuantity: 100,
            ProductionTime: 3600.0,
            Uph: 50.5,
            Oee: 85.2,
            YieldRate: 99.1,
            AlarmActive: false);

        var points = TelemetrySchemaContract.Normalize(input).ToList();

        Assert.Equal(5, points.Count);
        Assert.Contains(points, p => p.Metric == TelemetrySchemaContract.Metrics.ProductionQuantity && p.Value == 100);
        Assert.Contains(points, p => p.Metric == TelemetrySchemaContract.Metrics.ProductionTime && p.Value == 3600.0);
        Assert.Contains(points, p => p.Metric == TelemetrySchemaContract.Metrics.Uph && p.Value == 50.5);
        Assert.Contains(points, p => p.Metric == TelemetrySchemaContract.Metrics.Oee && p.Value == 85.2);
        Assert.Contains(points, p => p.Metric == TelemetrySchemaContract.Metrics.YieldRate && p.Value == 99.1);
        Assert.All(points, p => Assert.Equal(input.MachineId, p.AssetId));
    }

    [Fact]
    public void Normalize_SkipsNullMetrics()
    {
        var input = new TelemetryCaptureInput(
            MachineId: Guid.NewGuid(),
            RawTelemetryJson: "{}",
            Sequence: 1,
            OccurredAt: DateTimeOffset.UtcNow,
            MessageId: null,
            ReportedMachineName: null,
            Status: "idle",
            PlcConnected: false,
            ProductionQuantity: null,
            ProductionTime: null,
            Uph: null,
            Oee: 72.0,
            YieldRate: null,
            AlarmActive: null);

        var points = TelemetrySchemaContract.Normalize(input).ToList();

        Assert.Single(points);
        Assert.Equal(TelemetrySchemaContract.Metrics.Oee, points[0].Metric);
    }

    [Fact]
    public void SchemaVersion_IsOne()
    {
        Assert.Equal(1, TelemetrySchemaContract.CurrentSchemaVersion);
    }

    [Fact]
    public void MetricConstants_AreSnakeCase()
    {
        Assert.Equal("production_quantity", TelemetrySchemaContract.Metrics.ProductionQuantity);
        Assert.Equal("cycle_time", TelemetrySchemaContract.Metrics.CycleTime);
        Assert.Equal("cpu_percent", TelemetrySchemaContract.Metrics.CpuPercent);
    }
}
