namespace Fusion.Adapter.Mapping;

public sealed record OdfSource(string System, string RunId, string Actor);

public sealed record OdfAsset(
    string ExternalId,
    string Name,
    string Type,
    string? ParentExternalId,
    IReadOnlyDictionary<string, object?> Metadata);

public sealed record OdfTimeSeries(
    string ExternalId,
    string AssetExternalId,
    string Name,
    string? Unit);

public sealed record OdfDataPoint(
    string TimeSeriesExternalId,
    string Timestamp,
    double Value,
    string Quality);

public sealed record OpenDataFusionBundle(
    OdfSource Source,
    IReadOnlyList<OdfAsset> Assets,
    IReadOnlyList<OdfTimeSeries> TimeSeries,
    IReadOnlyList<OdfDataPoint> DataPoints,
    IReadOnlyList<object> Documents,
    IReadOnlyList<object> Relations);
