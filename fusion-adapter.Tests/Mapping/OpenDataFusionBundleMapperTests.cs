using Fusion.Adapter.Configuration;
using Fusion.Adapter.Mapping;
using Mkz.Fusion.Contracts;

namespace Fusion.Adapter.Tests.Mapping;

public sealed class OpenDataFusionBundleMapperTests
{
    [Fact]
    public void Map_CreatesPlantLineMachineAndNumericTelemetry()
    {
        var machineId = Guid.Parse("33333333-3333-3333-3333-333333333333");
        var lineId = Guid.Parse("44444444-4444-4444-4444-444444444444");
        var eventToMap = new TelemetryFusionEvent(
            1,
            Guid.Parse("55555555-5555-5555-5555-555555555555"),
            "telemetry:33333333-3333-3333-3333-333333333333:message-1",
            DateTimeOffset.Parse("2026-07-13T10:00:00Z"),
            new MachineSnapshot(machineId, "client-a", "PRESS-A", "Press A"),
            new LineSnapshot(lineId, "Line A"),
            new TelemetryValues("message-1", "ERROR", true, 42, 1.5, 55, 88.5, 99.1, true),
            "{}");
        var options = new OpenDataFusionOptions
        {
            TenantId = "tenant-a",
            ProjectId = "project-a",
            PlantExternalId = "mkz:plant:site-a",
            PlantName = "Site A"
        };

        var bundle = new OpenDataFusionBundleMapper(options).Map(eventToMap);

        Assert.Equal("mkz-plc-monitoring", bundle.Source.System);
        Assert.Equal(3, bundle.Assets.Count);
        Assert.Contains(bundle.DataPoints, point =>
            point.TimeSeriesExternalId.EndsWith(":machine_state_code") && point.Value == 4);
        Assert.Contains(bundle.DataPoints, point =>
            point.TimeSeriesExternalId.EndsWith(":plc_connected") && point.Value == 1);
        Assert.All(bundle.DataPoints, point => Assert.Equal("good", point.Quality));
    }
}
