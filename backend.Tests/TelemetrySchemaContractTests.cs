using System.Text.Json;
using backend.Services;
using Mkz.Fusion.Contracts;

namespace backend.Tests;

public sealed class TelemetrySchemaContractTests
{
    [Theory]
    [InlineData("{}")]
    [InlineData("{\"production\":null}")]
    [InlineData("{\"production\":[]}")]
    [InlineData("{\"production\":\"invalid\"}")]
    public void ParseProductionFields_PreservesMissingOrNonObjectAsNull(string payloadJson)
    {
        using var document = JsonDocument.Parse(payloadJson);

        var fields = TelemetryIngestionService.ParseProductionFields(document.RootElement);

        Assert.Null(fields.ProductionCount);
        Assert.Null(fields.CycleTime);
        Assert.Null(fields.Uph);
        Assert.Null(fields.Oee);
        Assert.Null(fields.YieldRate);

        var input = new TelemetryCaptureInput(
            Guid.NewGuid(), payloadJson, 1, DateTimeOffset.UtcNow, null, null,
            "idle", false, fields.ProductionCount, fields.CycleTime, fields.Uph,
            fields.Oee, fields.YieldRate, null);

        var points = TelemetrySchemaContract.Normalize(input).ToList();

        Assert.DoesNotContain(points, p => p.Metric == TelemetrySchemaContract.Metrics.ProductionQuantity);
        Assert.DoesNotContain(points, p => p.Metric == TelemetrySchemaContract.Metrics.ProductionTime);
    }

    [Fact]
    public void ParseProductionFields_PreservesIndependentMalformedAndPartialValues()
    {
        using var document = JsonDocument.Parse("{\"production\":{\"qty\":\"bad\",\"time\":12.5,\"uph\":null,\"oee\":88.0,\"yieldRate\":\"bad\"}}");

        var fields = TelemetryIngestionService.ParseProductionFields(document.RootElement);

        Assert.Null(fields.ProductionCount);
        Assert.Equal(12.5, fields.CycleTime);
        Assert.Null(fields.Uph);
        Assert.Equal(88.0, fields.Oee);
        Assert.Null(fields.YieldRate);

        var input = new TelemetryCaptureInput(
            Guid.NewGuid(), document.RootElement.GetRawText(), 1, DateTimeOffset.UtcNow, null, null,
            "running", true, fields.ProductionCount, fields.CycleTime, fields.Uph,
            fields.Oee, fields.YieldRate, null);
        var points = TelemetrySchemaContract.Normalize(input).ToList();

        Assert.DoesNotContain(points, p => p.Metric == TelemetrySchemaContract.Metrics.ProductionQuantity);
        Assert.Contains(points, p => p.Metric == TelemetrySchemaContract.Metrics.ProductionTime && p.Value == 12.5);
    }

    [Fact]
    public void ParseProductionFields_RejectsOutOfRangeNumericValues()
    {
        using var document = JsonDocument.Parse("{\"production\":{\"qty\":1e100,\"time\":1e400}}");

        var fields = TelemetryIngestionService.ParseProductionFields(document.RootElement);

        Assert.Null(fields.ProductionCount);
        Assert.Null(fields.CycleTime);
    }

    [Fact]
    public void ParseProductionFields_PreservesExplicitZero()
    {
        using var document = JsonDocument.Parse("{\"production\":{\"qty\":0,\"time\":0.0}}");

        var fields = TelemetryIngestionService.ParseProductionFields(document.RootElement);
        var input = new TelemetryCaptureInput(
            Guid.NewGuid(), document.RootElement.GetRawText(), 1, DateTimeOffset.UtcNow, null, null,
            "running", true, fields.ProductionCount, fields.CycleTime, fields.Uph,
            fields.Oee, fields.YieldRate, null);
        var points = TelemetrySchemaContract.Normalize(input).ToList();

        Assert.Equal(0, fields.ProductionCount);
        Assert.Equal(0.0, fields.CycleTime);
        Assert.Contains(points, p => p.Metric == TelemetrySchemaContract.Metrics.ProductionQuantity && p.Value == 0);
        Assert.Contains(points, p => p.Metric == TelemetrySchemaContract.Metrics.ProductionTime && p.Value == 0);
    }

    [Fact]
    public void ParseProductionFields_ExtractsValidValuesAndNormalizePreservesThem()
    {
        var machineId = Guid.NewGuid();
        using var document = JsonDocument.Parse("{\"production\":{\"qty\":100,\"time\":3600.0,\"uph\":50.5,\"oee\":85.2,\"yieldRate\":99.1}}");

        var fields = TelemetryIngestionService.ParseProductionFields(document.RootElement);
        var input = new TelemetryCaptureInput(
            machineId, document.RootElement.GetRawText(), 1, DateTimeOffset.UtcNow, null, null,
            "running", true, fields.ProductionCount, fields.CycleTime, fields.Uph, fields.Oee, fields.YieldRate, null);
        var points = TelemetrySchemaContract.Normalize(input).ToList();

        Assert.Equal(5, points.Count);
        Assert.Contains(points, p => p.Metric == TelemetrySchemaContract.Metrics.ProductionQuantity && p.Value == 100);
        Assert.Contains(points, p => p.Metric == TelemetrySchemaContract.Metrics.ProductionTime && p.Value == 3600.0);
        Assert.Contains(points, p => p.Metric == TelemetrySchemaContract.Metrics.Uph && p.Value == 50.5);
        Assert.Contains(points, p => p.Metric == TelemetrySchemaContract.Metrics.Oee && p.Value == 85.2);
        Assert.Contains(points, p => p.Metric == TelemetrySchemaContract.Metrics.YieldRate && p.Value == 99.1);
    }

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
