namespace Mkz.Fusion.Contracts;

/// <summary>
/// Shared event schema contract for CEP and cross-service event processing.
/// All agents reference this contract to produce and consume events consistently.
/// </summary>
public sealed record FusionEvent(
    int SchemaVersion,
    Guid EventId,
    DateTimeOffset Timestamp,
    Guid AssetId,
    string EventType,
    string Severity,
    string? Source,
    Dictionary<string, object?>? Payload,
    string? CorrelationId);

public static class FusionEventContract
{
    public const int CurrentSchemaVersion = 1;

    public static class EventTypes
    {
        public const string Alarm = "ALARM";
        public const string Telemetry = "TELEMETRY";
        public const string StatusChange = "STATUS_CHANGE";
        public const string MaintenanceDue = "MAINTENANCE_DUE";
        public const string ThresholdBreach = "THRESHOLD_BREACH";
        public const string ProductionMilestone = "PRODUCTION_MILESTONE";
    }

    public static class Severities
    {
        public const string Info = "INFO";
        public const string Warning = "WARNING";
        public const string Critical = "CRITICAL";
        public const string Emergency = "EMERGENCY";
    }

    public static bool IsKnownSeverity(string? severity) =>
        severity?.Trim().ToUpperInvariant() is "INFO" or "WARNING" or "CRITICAL" or "EMERGENCY";

    public static bool IsKnownEventType(string? eventType) =>
        eventType?.Trim().ToUpperInvariant() is "ALARM" or "TELEMETRY" or "STATUS_CHANGE"
            or "MAINTENANCE_DUE" or "THRESHOLD_BREACH" or "PRODUCTION_MILESTONE";

    public static FusionEvent Create(
        Guid assetId,
        string eventType,
        string severity,
        string? source = null,
        Dictionary<string, object?>? payload = null,
        string? correlationId = null) =>
        new(
            SchemaVersion: CurrentSchemaVersion,
            EventId: Guid.NewGuid(),
            Timestamp: DateTimeOffset.UtcNow,
            AssetId: assetId,
            EventType: eventType.Trim().ToUpperInvariant(),
            Severity: severity.Trim().ToUpperInvariant(),
            Source: source,
            Payload: payload,
            CorrelationId: correlationId);
}
