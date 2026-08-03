using System.Text;
using Microsoft.Extensions.Options;

namespace backend.Services;

public sealed class SyncService
{
    public const int MaxMachineIdLength = TelemetryIngestionService.MaxDeviceIdLength;
    public const int MaxBatchRecords = 500;
    public const int MaxTimestampLength = 100;
    public const int MaxRawJsonLength = 65_536;

    private readonly DatabaseService _dbService;
    private readonly TelemetryIngestionService _telemetryIngestionService;
    private readonly TelemetryIngressOptions _ingressOptions;
    private readonly ILogger<SyncService> _logger;

    public SyncService(
        DatabaseService dbService,
        TelemetryIngestionService telemetryIngestionService,
        IOptions<TelemetryIngressOptions> ingressOptions,
        ILogger<SyncService> logger)
    {
        _dbService = dbService;
        _telemetryIngestionService = telemetryIngestionService;
        _ingressOptions = ingressOptions.Value;
        _logger = logger;
    }

    public Task<long> GetMaxSequenceAsync(string machineId) =>
        _dbService.GetMaxSequenceAsync(machineId);

    public async Task<TelemetryDeliveryResult> ProcessBatchUploadAsync(
        string machineId,
        IReadOnlyList<TelemetryRecordDto> records,
        CancellationToken cancellationToken = default)
    {
        var validation = ValidateAndBuildBatch(
            machineId,
            records,
            _ingressOptions.MaxPayloadBytes,
            _ingressOptions.MaxSyncBatchBytes);
        if (!validation.Result.IsSuccess)
        {
            _logger.LogWarning(
                "Sync batch rejected before transaction for device {DeviceId} with state {DeliveryState}: {Detail}",
                machineId,
                validation.Result.State,
                validation.Result.Detail);
            return validation.Result;
        }

        var result = await _telemetryIngestionService.EnqueueBatchAsync(
            machineId,
            validation.Items!,
            cancellationToken);
        _logger.LogInformation(
            "Sync batch delivery completed for device {DeviceId} with {RecordCount} records and state {DeliveryState}",
            machineId,
            records.Count,
            result.State);
        return result;
    }

    public static string? ValidateMachineId(string? machineId)
    {
        var value = machineId?.Trim();
        if (string.IsNullOrWhiteSpace(value))
        {
            return "machineId is required.";
        }

        if (value.Length > MaxMachineIdLength)
        {
            return $"machineId cannot exceed {MaxMachineIdLength} characters.";
        }

        return null;
    }

    public static string? ValidateBatch(
        string? machineId,
        IReadOnlyList<TelemetryRecordDto>? records) =>
        ValidateBatch(machineId, records, new TelemetryIngressOptions());

    public static string? ValidateBatch(
        string? machineId,
        IReadOnlyList<TelemetryRecordDto>? records,
        TelemetryIngressOptions options)
    {
        var machineError = ValidateMachineId(machineId);
        if (machineError is not null)
        {
            return machineError;
        }
        if (records is null || records.Count == 0)
        {
            return "records must contain at least one item.";
        }
        if (records.Count > MaxBatchRecords)
        {
            return $"records cannot contain more than {MaxBatchRecords} items.";
        }

        long batchBytes = 0;
        for (var index = 0; index < records.Count; index++)
        {
            var record = records[index];
            if (record is null || string.IsNullOrWhiteSpace(record.RawJson))
            {
                return $"records[{index}].rawJson is required.";
            }
            if (record.RawJson.Length > MaxRawJsonLength)
            {
                return $"records[{index}].rawJson cannot exceed {MaxRawJsonLength} characters.";
            }

            var payloadBytes = Encoding.UTF8.GetByteCount(record.RawJson);
            if (payloadBytes > options.MaxPayloadBytes)
            {
                return $"records[{index}].rawJson exceeds the {options.MaxPayloadBytes}-byte payload limit.";
            }

            batchBytes += payloadBytes;
            if (batchBytes > options.MaxSyncBatchBytes)
            {
                return $"records exceed the {options.MaxSyncBatchBytes}-byte batch limit.";
            }
            if (record.Timestamp?.Length > MaxTimestampLength)
            {
                return $"records[{index}].timestamp cannot exceed {MaxTimestampLength} characters.";
            }
        }

        return null;
    }

    public static BatchValidationResult ValidateAndBuildBatch(
        string? machineId,
        IReadOnlyList<TelemetryRecordDto>? records,
        int maxPayloadBytes,
        int maxBatchBytes)
    {
        var options = new TelemetryIngressOptions
        {
            MaxPayloadBytes = Math.Clamp(maxPayloadBytes, 1, 16 * 1024 * 1024),
            MaxSyncBatchBytes = Math.Clamp(maxBatchBytes, 1, 256 * 1024 * 1024),
        };
        var validationError = ValidateBatch(machineId, records, options);
        if (validationError is not null)
        {
            var state = validationError.Contains("byte", StringComparison.OrdinalIgnoreCase)
                ? TelemetryDeliveryState.PayloadTooLarge
                : TelemetryDeliveryState.Malformed;
            return new(new(state, validationError), null, 0);
        }

        var stableMachineId = machineId!.Trim();
        var items = new List<TelemetryDeliveryItem>(records!.Count);
        for (var index = 0; index < records.Count; index++)
        {
            var record = records[index];
            if (!TelemetryIngestionService.TryParseDeliveryItem(
                    stableMachineId,
                    record.RawJson,
                    out var item,
                    out var parseError))
            {
                return new(
                    parseError! with { Detail = $"records[{index}]: {parseError.Detail}" },
                    null,
                    0);
            }

            if (record.Sequence != item!.Input.Sequence)
            {
                return new(
                    new TelemetryDeliveryResult(
                        TelemetryDeliveryState.Conflict,
                        $"records[{index}].sequence does not match payload.sequence."),
                    null,
                    0);
            }

            items.Add(item);
        }

        return new(TelemetryDeliveryResult.Committed(), items, checked((int)items.Sum(
            item => (long)Encoding.UTF8.GetByteCount(item.Input.RawTelemetryJson))));
    }
}

public sealed record BatchValidationResult(
    TelemetryDeliveryResult Result,
    IReadOnlyList<TelemetryDeliveryItem>? Items,
    int PayloadBytes);

public sealed class TelemetryRecordDto
{
    public long Sequence { get; set; }
    public string Timestamp { get; set; } = string.Empty;
    public string RawJson { get; set; } = string.Empty;
}
