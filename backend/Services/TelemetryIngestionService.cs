using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;
using backend.Hubs;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Options;
using Mkz.Fusion.Contracts;

namespace backend.Services;

public enum TelemetryDeliveryState
{
    Committed,
    Duplicate,
    RetryableFailure,
    Busy,
    Malformed,
    PayloadTooLarge,
    PermanentFailure,
    Conflict,
}

public enum TelemetryApproval
{
    Approved,
    Unapproved,
    Unavailable,
}

public sealed record TelemetryDeliveryResult(TelemetryDeliveryState State, string? Detail = null)
{
    public bool IsSuccess => State is TelemetryDeliveryState.Committed or TelemetryDeliveryState.Duplicate;

    public TelemetryApproval Approval { get; init; } = TelemetryApproval.Unavailable;

    public bool? Approved => Approval switch
    {
        TelemetryApproval.Approved => true,
        TelemetryApproval.Unapproved => false,
        _ => null,
    };

    public static TelemetryDeliveryResult Committed(TelemetryApproval approval = TelemetryApproval.Unavailable) =>
        new(TelemetryDeliveryState.Committed) { Approval = approval };

    public static TelemetryDeliveryResult Duplicate(TelemetryApproval approval = TelemetryApproval.Unavailable) =>
        new(TelemetryDeliveryState.Duplicate) { Approval = approval };
}

public sealed class TelemetryIngressOptions
{
    public const string SectionName = "TelemetryIngress";

    public int QueueItemCapacity { get; init; } = 256;
    public long QueueByteCapacity { get; init; } = 16 * 1024 * 1024;
    public int MaxPayloadBytes { get; init; } = 256 * 1024;
    public int MaxSyncBatchBytes { get; init; } = 8 * 1024 * 1024;
    public int AdmissionTimeoutMilliseconds { get; init; } = 1_000;
    public int MaxAdmissionWaiters { get; init; } = 64;
}

public sealed record TelemetryDeliveryItem(
    string DeviceId,
    string MessageId,
    string PayloadHash,
    TelemetryCaptureInput Input);

public sealed class TelemetryIngestionService : BackgroundService
{
    public const int MaxDeviceIdLength = 100;
    public const int MaxMessageIdLength = 256;

    private readonly Channel<IngressWorkItem> _channel;
    private readonly DatabaseService _dbService;
    private readonly IHubContext<TelemetryHub> _hubContext;
    private readonly ILogger<TelemetryIngestionService> _logger;
    private readonly EventRuleEngine? _eventRuleEngine;
    private readonly long _queueByteCapacity;
    private readonly int _maxPayloadBytes;
    private readonly int _maxSyncBatchBytes;
    private readonly TimeSpan _admissionTimeout;
    private readonly SemaphoreSlim _admissionWaiters;
    private long _reservedBytes;

    public TelemetryIngestionService(
        DatabaseService dbService,
        IHubContext<TelemetryHub> hubContext,
        ILogger<TelemetryIngestionService> logger,
        IOptions<TelemetryIngressOptions> ingressOptions,
        EventRuleEngine? eventRuleEngine = null)
    {
        _dbService = dbService;
        _hubContext = hubContext;
        _logger = logger;
        _eventRuleEngine = eventRuleEngine;

        var configured = ingressOptions.Value;
        var itemCapacity = Math.Clamp(configured.QueueItemCapacity, 1, 4_096);
        _queueByteCapacity = Math.Clamp(configured.QueueByteCapacity, 64 * 1024, 256L * 1024 * 1024);
        _maxPayloadBytes = Math.Clamp(configured.MaxPayloadBytes, 1_024, 16 * 1024 * 1024);
        _maxSyncBatchBytes = Math.Clamp(configured.MaxSyncBatchBytes, 1_024, 256 * 1024 * 1024);
        _admissionTimeout = TimeSpan.FromMilliseconds(
            Math.Clamp(configured.AdmissionTimeoutMilliseconds, 50, 30_000));
        _admissionWaiters = new SemaphoreSlim(
            Math.Clamp(configured.MaxAdmissionWaiters, 1, 1_024));

        _channel = Channel.CreateBounded<IngressWorkItem>(new BoundedChannelOptions(itemCapacity)
        {
            SingleReader = true,
            SingleWriter = false,
            FullMode = BoundedChannelFullMode.Wait,
        });
    }

    public async Task<TelemetryDeliveryResult> EnqueueAsync(
        string deviceId,
        string rawJson,
        CancellationToken cancellationToken = default)
    {
        var payloadBytes = Encoding.UTF8.GetByteCount(rawJson);
        if (payloadBytes > _maxPayloadBytes)
        {
            return new(
                TelemetryDeliveryState.PayloadTooLarge,
                $"Payload is {payloadBytes} bytes; maximum is {_maxPayloadBytes} bytes.");
        }

        return await EnqueueWorkAsync(
            new IngressWorkItem(
                deviceId,
                rawJson,
                null,
                payloadBytes,
                new TaskCompletionSource<TelemetryDeliveryResult>(
                    TaskCreationOptions.RunContinuationsAsynchronously)),
            cancellationToken);
    }

    public Task<TelemetryDeliveryResult> EnqueueBatchAsync(
        string deviceId,
        IReadOnlyList<TelemetryDeliveryItem> items,
        CancellationToken cancellationToken = default)
    {
        if (items.Count == 0)
        {
            return Task.FromResult(
                new TelemetryDeliveryResult(TelemetryDeliveryState.Malformed, "Telemetry batch is empty."));
        }

        var payloadBytes = 0L;
        foreach (var item in items)
        {
            var itemPayloadBytes = Encoding.UTF8.GetByteCount(item.Input.RawTelemetryJson);
            if (itemPayloadBytes > _maxPayloadBytes)
            {
                return Task.FromResult(new TelemetryDeliveryResult(
                    TelemetryDeliveryState.PayloadTooLarge,
                    $"Telemetry batch item is {itemPayloadBytes} bytes; maximum is {_maxPayloadBytes} bytes."));
            }

            payloadBytes += itemPayloadBytes;
            if (payloadBytes > _maxSyncBatchBytes)
            {
                return Task.FromResult(new TelemetryDeliveryResult(
                    TelemetryDeliveryState.PayloadTooLarge,
                    $"Telemetry batch is {payloadBytes} bytes; maximum is {_maxSyncBatchBytes} bytes."));
            }
        }

        return EnqueueWorkAsync(
            new IngressWorkItem(
                deviceId,
                null,
                items,
                (int)payloadBytes,
                new TaskCompletionSource<TelemetryDeliveryResult>(
                    TaskCreationOptions.RunContinuationsAsynchronously)),
            cancellationToken);
    }

    private async Task<TelemetryDeliveryResult> EnqueueWorkAsync(
        IngressWorkItem workItem,
        CancellationToken cancellationToken)
    {
        if (!_admissionWaiters.Wait(0))
        {
            return new(TelemetryDeliveryState.Busy, "Telemetry ingress admission is saturated.");
        }

        using var admissionCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        admissionCts.CancelAfter(_admissionTimeout);

        try
        {
            while (!TryReserveBytes(workItem.PayloadBytes))
            {
                await Task.Delay(10, admissionCts.Token);
            }

            try
            {
                await _channel.Writer.WriteAsync(workItem, admissionCts.Token);
            }
            catch
            {
                Interlocked.Add(ref _reservedBytes, -workItem.PayloadBytes);
                throw;
            }

            return await workItem.Completion.Task.WaitAsync(cancellationToken);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning(
                "Telemetry ingress admission timed out for device {DeviceId} after {TimeoutMs} ms",
                workItem.DeviceId,
                _admissionTimeout.TotalMilliseconds);
            return new(TelemetryDeliveryState.Busy, "Telemetry ingress is at capacity.");
        }
        finally
        {
            _admissionWaiters.Release();
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "Telemetry ingestion started with byte capacity {QueueByteCapacity} and payload limit {MaxPayloadBytes}",
            _queueByteCapacity,
            _maxPayloadBytes);

        var projectionRetryTask = RetryPendingProjectionsAsync(stoppingToken);
        try
        {
            await foreach (var workItem in _channel.Reader.ReadAllAsync(stoppingToken))
            {
                try
                {
                    IReadOnlyList<TelemetryDeliveryItem> deliveryItems;
                    if (workItem.Items is not null)
                    {
                        deliveryItems = workItem.Items;
                    }
                    else if (!TryParseDeliveryItem(
                        workItem.DeviceId,
                        workItem.RawJson,
                        out var deliveryItem,
                        out var parseError))
                    {
                        workItem.Completion.TrySetResult(parseError!);
                        continue;
                    }
                    else
                    {
                        deliveryItems = [deliveryItem!];
                    }

                    var result = await _dbService.PersistTelemetryBatchAndFusionOutboxAsync(
                        deliveryItems,
                        stoppingToken);
                    workItem.Completion.TrySetResult(result);

                    if (result.State == TelemetryDeliveryState.Committed)
                    {
                        foreach (var item in deliveryItems)
                        {
                            await RunRealtimeDeliveryAsync(item.Input, stoppingToken);
                        }
                    }
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    workItem.Completion.TrySetResult(
                        new(TelemetryDeliveryState.RetryableFailure, "Server is stopping."));
                }
                catch (Exception ex)
                {
                    _logger.LogError(
                        ex,
                        "Unhandled telemetry ingress failure for device {DeviceId}",
                        workItem.DeviceId);
                    workItem.Completion.TrySetResult(
                        new(TelemetryDeliveryState.RetryableFailure, "Telemetry processing failed."));
                }
                finally
                {
                    Interlocked.Add(ref _reservedBytes, -workItem.PayloadBytes);
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            _logger.LogInformation("Telemetry ingestion is stopping");
        }
        finally
        {
            _channel.Writer.TryComplete();
            try
            {
                await projectionRetryTask;
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                // Expected during hosted-service shutdown.
            }
        }
    }

    private async Task RetryPendingProjectionsAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(5));
        do
        {
            try
            {
                await _dbService.RetryPendingSecondaryDeliveriesAsync(32, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Durable secondary telemetry delivery retry scan failed");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    public static bool TryParseDeliveryItem(
        string? deviceId,
        string? rawJson,
        out TelemetryDeliveryItem? deliveryItem,
        out TelemetryDeliveryResult? error)
    {
        deliveryItem = null;
        error = null;
        var stableDeviceId = deviceId?.Trim();
        if (string.IsNullOrWhiteSpace(stableDeviceId) || stableDeviceId.Length > MaxDeviceIdLength ||
            !Guid.TryParse(stableDeviceId, out var machineId))
        {
            error = new(TelemetryDeliveryState.Malformed, "A valid device identifier is required.");
            return false;
        }

        if (string.IsNullOrWhiteSpace(rawJson))
        {
            error = new(TelemetryDeliveryState.Malformed, "Telemetry payload is required.");
            return false;
        }

        try
        {
            using var document = JsonDocument.Parse(rawJson);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object ||
                !root.TryGetProperty("messageId", out var messageIdProperty) ||
                messageIdProperty.ValueKind != JsonValueKind.String)
            {
                error = new(TelemetryDeliveryState.Malformed, "messageId is required.");
                return false;
            }

            var messageId = messageIdProperty.GetString()?.Trim();
            if (string.IsNullOrWhiteSpace(messageId) || messageId.Length > MaxMessageIdLength)
            {
                error = new(TelemetryDeliveryState.Malformed, $"messageId must be 1-{MaxMessageIdLength} characters.");
                return false;
            }

            if (!root.TryGetProperty("payload", out var payload) || payload.ValueKind != JsonValueKind.Object)
            {
                error = new(TelemetryDeliveryState.Malformed, "payload must be an object.");
                return false;
            }

            if (!payload.TryGetProperty("machineId", out var machineIdProperty) ||
                machineIdProperty.ValueKind != JsonValueKind.String ||
                !Guid.TryParse(machineIdProperty.GetString(), out var payloadMachineId) ||
                payloadMachineId != machineId)
            {
                error = new(TelemetryDeliveryState.Conflict, "payload.machineId does not match the authenticated device.");
                return false;
            }

            if (!payload.TryGetProperty("sequence", out var sequenceProperty) ||
                sequenceProperty.ValueKind != JsonValueKind.Number ||
                !sequenceProperty.TryGetInt64(out var sequence) ||
                sequence <= 0)
            {
                error = new(TelemetryDeliveryState.Malformed, "payload.sequence must be a positive integer.");
                return false;
            }

            var occurredAt = DateTimeOffset.UtcNow;
            if (root.TryGetProperty("sentAt", out var sentAtProperty))
            {
                if (sentAtProperty.ValueKind != JsonValueKind.String ||
                    !DateTimeOffset.TryParse(sentAtProperty.GetString(), out occurredAt))
                {
                    error = new(TelemetryDeliveryState.Malformed, "sentAt must be a valid timestamp.");
                    return false;
                }
            }

            var status = payload.TryGetProperty("status", out var statusProperty) &&
                statusProperty.ValueKind == JsonValueKind.String
                    ? statusProperty.GetString() ?? "OFFLINE"
                    : "OFFLINE";
            var plcConnected = payload.TryGetProperty("plcConnected", out var plcProperty) &&
                plcProperty.ValueKind is JsonValueKind.True or JsonValueKind.False &&
                plcProperty.GetBoolean();
            var (productionCount, cycleTime, uph, oee, yieldRate) = ParseProductionFields(payload);

            bool? alarmActive = null;
            if (payload.TryGetProperty("alarm", out var alarmProperty) &&
                alarmProperty.ValueKind == JsonValueKind.Object &&
                alarmProperty.TryGetProperty("active", out var alarmActiveProperty) &&
                alarmActiveProperty.ValueKind is JsonValueKind.True or JsonValueKind.False)
            {
                alarmActive = alarmActiveProperty.GetBoolean();
            }

            var input = new TelemetryCaptureInput(
                machineId,
                rawJson,
                sequence,
                occurredAt,
                messageId,
                payload.TryGetProperty("machineName", out var machineNameProperty) &&
                    machineNameProperty.ValueKind == JsonValueKind.String
                        ? machineNameProperty.GetString()
                        : null,
                status,
                plcConnected,
                productionCount,
                cycleTime,
                uph,
                oee,
                yieldRate,
                alarmActive);

            deliveryItem = new TelemetryDeliveryItem(
                machineId.ToString("D"),
                messageId,
                ComputePayloadHash(rawJson),
                input);
            return true;
        }
        catch (JsonException)
        {
            error = new(TelemetryDeliveryState.Malformed, "Telemetry payload is not valid JSON.");
            return false;
        }
    }

    public static string ComputePayloadHash(string rawJson) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawJson))).ToLowerInvariant();

    public static (long? ProductionCount, double? CycleTime, double? Uph, double? Oee, double? YieldRate)
        ParseProductionFields(JsonElement payload)
    {
        long? productionCount = null;
        double? cycleTime = null;
        double? uph = null;
        double? oee = null;
        double? yieldRate = null;

        if (!payload.TryGetProperty("production", out var production) || production.ValueKind != JsonValueKind.Object)
        {
            return (productionCount, cycleTime, uph, oee, yieldRate);
        }

        if (production.TryGetProperty("qty", out var qty) && qty.ValueKind == JsonValueKind.Number && qty.TryGetInt64(out var parsedQuantity))
            productionCount = parsedQuantity;
        if (production.TryGetProperty("time", out var time) && time.ValueKind == JsonValueKind.Number && time.TryGetDouble(out var parsedCycleTime) && double.IsFinite(parsedCycleTime))
            cycleTime = parsedCycleTime;
        if (production.TryGetProperty("uph", out var uphValue) && uphValue.ValueKind == JsonValueKind.Number && uphValue.TryGetDouble(out var parsedUph) && double.IsFinite(parsedUph))
            uph = parsedUph;
        if (production.TryGetProperty("oee", out var oeeValue) && oeeValue.ValueKind == JsonValueKind.Number && oeeValue.TryGetDouble(out var parsedOee) && double.IsFinite(parsedOee))
            oee = parsedOee;
        if (production.TryGetProperty("yieldRate", out var yieldValue) && yieldValue.ValueKind == JsonValueKind.Number && yieldValue.TryGetDouble(out var parsedYieldRate) && double.IsFinite(parsedYieldRate))
            yieldRate = parsedYieldRate;

        return (productionCount, cycleTime, uph, oee, yieldRate);
    }

    private bool TryReserveBytes(int payloadBytes)
    {
        while (true)
        {
            var current = Interlocked.Read(ref _reservedBytes);
            if (payloadBytes > _queueByteCapacity - current)
            {
                return false;
            }

            if (Interlocked.CompareExchange(ref _reservedBytes, current + payloadBytes, current) == current)
            {
                return true;
            }
        }
    }

    private async Task RunRealtimeDeliveryAsync(
        TelemetryCaptureInput input,
        CancellationToken cancellationToken)
    {
        try
        {
            _eventRuleEngine?.Enqueue(input);
            await _hubContext.Clients.Group($"machine_{input.MachineId}")
                .SendAsync("TelemetryUpdate", input.RawTelemetryJson, cancellationToken);
            await _hubContext.Clients.Group("all_clients")
                .SendAsync("TelemetryUpdate", input.RawTelemetryJson, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "Realtime telemetry notification failed after durable Operations projection for device {DeviceId} and message {MessageId}",
                input.MachineId,
                input.MessageId);
        }
    }

    private sealed record IngressWorkItem(
        string DeviceId,
        string? RawJson,
        IReadOnlyList<TelemetryDeliveryItem>? Items,
        int PayloadBytes,
        TaskCompletionSource<TelemetryDeliveryResult> Completion);
}
