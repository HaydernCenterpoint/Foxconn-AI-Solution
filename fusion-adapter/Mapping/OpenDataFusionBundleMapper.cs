using System.Globalization;
using Fusion.Adapter.Configuration;
using Mkz.Fusion.Contracts;

namespace Fusion.Adapter.Mapping;

public sealed class OpenDataFusionBundleMapper
{
    private const string SourceSystem = "mkz-plc-monitoring";
    private const string SourceActor = "mkz-fusion-adapter";
    private readonly OpenDataFusionOptions _options;

    public OpenDataFusionBundleMapper(OpenDataFusionOptions options)
    {
        _options = options;
    }

    public OpenDataFusionBundle Map(TelemetryFusionEvent telemetryEvent)
    {
        var plant = new OdfAsset(
            _options.PlantExternalId,
            _options.PlantName,
            "Plant",
            null,
            new Dictionary<string, object?> { ["sourceSystem"] = SourceSystem });

        var assets = new List<OdfAsset> { plant };
        var machineExternalId = MachineExternalId(telemetryEvent.Machine.Id);
        var parentExternalId = _options.PlantExternalId;

        if (telemetryEvent.Line is not null)
        {
            var lineExternalId = LineExternalId(telemetryEvent.Line.Id);
            assets.Add(new OdfAsset(
                lineExternalId,
                telemetryEvent.Line.Name,
                "Line",
                _options.PlantExternalId,
                new Dictionary<string, object?>
                {
                    ["sourceSystem"] = SourceSystem,
                    ["lineId"] = telemetryEvent.Line.Id.ToString()
                }));
            parentExternalId = lineExternalId;
        }

        assets.Add(new OdfAsset(
            machineExternalId,
            telemetryEvent.Machine.Name,
            "Machine",
            parentExternalId,
            new Dictionary<string, object?>
            {
                ["sourceSystem"] = SourceSystem,
                ["machineId"] = telemetryEvent.Machine.Id.ToString(),
                ["clientId"] = telemetryEvent.Machine.ClientId,
                ["machineCode"] = telemetryEvent.Machine.MachineCode
            }));

        var timestamp = telemetryEvent.OccurredAt.UtcDateTime.ToString("O", CultureInfo.InvariantCulture);
        var quality = telemetryEvent.Telemetry.PlcConnected ? "good" : "uncertain";
        var metrics = CreateMetrics(telemetryEvent);
        var timeSeries = new List<OdfTimeSeries>(metrics.Count);
        var dataPoints = new List<OdfDataPoint>(metrics.Count);

        foreach (var metric in metrics)
        {
            var timeSeriesExternalId = TimeSeriesExternalId(telemetryEvent.Machine.Id, metric.Suffix);
            timeSeries.Add(new OdfTimeSeries(timeSeriesExternalId, machineExternalId, metric.Name, metric.Unit));
            dataPoints.Add(new OdfDataPoint(timeSeriesExternalId, timestamp, metric.Value, quality));
        }

        return new OpenDataFusionBundle(
            new OdfSource(SourceSystem, telemetryEvent.EventId.ToString("D"), SourceActor),
            assets,
            timeSeries,
            dataPoints,
            Array.Empty<object>(),
            Array.Empty<object>());
    }

    private static List<Metric> CreateMetrics(TelemetryFusionEvent telemetryEvent)
    {
        var telemetry = telemetryEvent.Telemetry;
        var metrics = new List<Metric>();

        AddIfPresent(metrics, "production_qty", "Production quantity", telemetry.ProductionQuantity);
        AddIfPresent(metrics, "production_time", "Production time", telemetry.ProductionTime);
        AddIfPresent(metrics, "uph", "Units per hour", telemetry.Uph);
        AddIfPresent(metrics, "oee", "Overall equipment effectiveness", telemetry.Oee);
        AddIfPresent(metrics, "yield_rate", "Yield rate", telemetry.YieldRate);
        metrics.Add(new Metric("plc_connected", "PLC connected", telemetry.PlcConnected ? 1 : 0));
        metrics.Add(new Metric("machine_state_code", "Machine state code", StateCode(telemetry.Status)));
        if (telemetry.AlarmActive is not null)
            metrics.Add(new Metric("alarm_active", "Alarm active", telemetry.AlarmActive.Value ? 1 : 0));

        return metrics;
    }

    private static void AddIfPresent(ICollection<Metric> metrics, string suffix, string name, long? value)
    {
        if (value is not null) metrics.Add(new Metric(suffix, name, value.Value));
    }

    private static void AddIfPresent(ICollection<Metric> metrics, string suffix, string name, double? value)
    {
        if (value is not null) metrics.Add(new Metric(suffix, name, value.Value));
    }

    private static string MachineExternalId(Guid id) => $"mkz:machine:{id}";

    private static string LineExternalId(Guid id) => $"mkz:line:{id}";

    private static string TimeSeriesExternalId(Guid machineId, string metric) => $"mkz:ts:{machineId}:{metric}";

    private static int StateCode(string status) => status.Trim().ToUpperInvariant() switch
    {
        "OFFLINE" => 0,
        "RUNNING" => 1,
        "IDLE" => 2,
        "STOPPED" => 3,
        "ERROR" or "ALARM" => 4,
        _ => 99
    };

    private sealed record Metric(string Suffix, string Name, double Value, string? Unit = null);
}
