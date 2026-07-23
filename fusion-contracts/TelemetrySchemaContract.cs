namespace Mkz.Fusion.Contracts;

/// <summary>
/// Canonical telemetry data point contract: (time, asset_id, metric, value).
/// All agents reference this to produce and consume telemetry consistently.
/// TelemetryFusionEvent carries the rich MQTT payload; TelemetryDataPoint
/// is the normalized form for TimescaleDB storage and cross-service queries.
/// </summary>
public sealed record TelemetryDataPoint(
    DateTimeOffset Time,
    Guid AssetId,
    string Metric,
    double Value,
    string? Unit,
    string? Source);

public static class TelemetrySchemaContract
{
    public const int CurrentSchemaVersion = 1;

    public static class Metrics
    {
        public const string ProductionQuantity = "production_quantity";
        public const string ProductionTime = "production_time";
        public const string Uph = "uph";
        public const string Oee = "oee";
        public const string YieldRate = "yield_rate";
        public const string CpuPercent = "cpu_percent";
        public const string RamPercent = "ram_percent";
        public const string Temperature = "temperature";
        public const string Pressure = "pressure";
        public const string Speed = "speed";
        public const string CycleTime = "cycle_time";
        public const string Vibration = "vibration";
    }

    public static class Units
    {
        public const string Pieces = "pcs";
        public const string Seconds = "s";
        public const string Percent = "%";
        public const string Celsius = "°C";
        public const string Bar = "bar";
        public const string Rpm = "rpm";
        public const string Milliseconds = "ms";
        public const string Hz = "Hz";
    }

    /// <summary>
    /// Extract normalized TelemetryDataPoints from a TelemetryCaptureInput.
    /// This is the canonical mapping from MQTT payload to the (time, asset_id, metric, value) schema.
    /// </summary>
    public static IEnumerable<TelemetryDataPoint> Normalize(TelemetryCaptureInput input)
    {
        var time = input.OccurredAt;
        var assetId = input.MachineId;

        if (input.ProductionQuantity.HasValue)
            yield return new(time, assetId, Metrics.ProductionQuantity, input.ProductionQuantity.Value, Units.Pieces, input.MessageId);
        if (input.ProductionTime.HasValue)
            yield return new(time, assetId, Metrics.ProductionTime, input.ProductionTime.Value, Units.Seconds, input.MessageId);
        if (input.Uph.HasValue)
            yield return new(time, assetId, Metrics.Uph, input.Uph.Value, Units.Pieces, input.MessageId);
        if (input.Oee.HasValue)
            yield return new(time, assetId, Metrics.Oee, input.Oee.Value, Units.Percent, input.MessageId);
        if (input.YieldRate.HasValue)
            yield return new(time, assetId, Metrics.YieldRate, input.YieldRate.Value, Units.Percent, input.MessageId);
    }
}
