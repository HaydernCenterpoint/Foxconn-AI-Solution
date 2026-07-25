using System.Net.Http.Json;
using System.Threading.Channels;
using Microsoft.Extensions.Options;
using Mkz.Fusion.Contracts;

namespace backend.Services;

public sealed class CepStagingOptions
{
    public const string SectionName = "CepStaging";
    public bool Enabled { get; set; }
    public string BaseUrl { get; set; } = "http://localhost:58085";
    public int RequestTimeoutSeconds { get; set; } = 5;
    public int QueueCapacity { get; set; } = 1000;
}

public sealed record CepTelemetryDispatch(long SourceId, TelemetryCaptureInput Input);

public sealed class CepStagingPublisher : BackgroundService
{
    public const string HttpClientName = "cep-staging";

    private readonly Channel<CepTelemetryDispatch> _queue;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly CepStagingOptions _options;
    private readonly ILogger<CepStagingPublisher> _logger;

    public CepStagingPublisher(
        IHttpClientFactory httpClientFactory,
        IOptions<CepStagingOptions> options,
        ILogger<CepStagingPublisher> logger)
    {
        _httpClientFactory = httpClientFactory;
        _options = options.Value;
        _logger = logger;
        _queue = Channel.CreateBounded<CepTelemetryDispatch>(new BoundedChannelOptions(
            Math.Clamp(_options.QueueCapacity, 1, 10_000))
        {
            FullMode = BoundedChannelFullMode.Wait,
            SingleReader = true,
            SingleWriter = false,
        });
    }

    public bool TryPublish(long sourceId, TelemetryCaptureInput input)
    {
        if (!_options.Enabled)
        {
            return true;
        }

        if (_queue.Writer.TryWrite(new CepTelemetryDispatch(sourceId, input)))
        {
            return true;
        }

        _logger.LogWarning("CEP staging queue is full; dropping source telemetry {SourceId}", sourceId);
        return false;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var dispatch in _queue.Reader.ReadAllAsync(stoppingToken))
        {
            await PublishAsync(dispatch, stoppingToken);
        }
    }

    private async Task PublishAsync(CepTelemetryDispatch dispatch, CancellationToken cancellationToken)
    {
        try
        {
            var client = _httpClientFactory.CreateClient(HttpClientName);
            var (eventType, severity) = Classify(dispatch.Input);
            var numericValue = dispatch.Input.Oee
                ?? dispatch.Input.Uph
                ?? dispatch.Input.ProductionQuantity;
            var metric = dispatch.Input.Oee.HasValue
                ? "oee"
                : dispatch.Input.Uph.HasValue
                    ? "uph"
                    : "output_count";
            var unit = dispatch.Input.Oee.HasValue
                ? "percent"
                : dispatch.Input.Uph.HasValue
                    ? "units_per_hour"
                    : "count";
            var eventPayload = new
            {
                event_id = Guid.NewGuid().ToString(),
                timestamp = dispatch.Input.OccurredAt,
                asset_id = dispatch.Input.MachineId.ToString(),
                asset_name = dispatch.Input.ReportedMachineName,
                type = eventType,
                severity,
                payload = new
                {
                    metric,
                    value = numericValue,
                    unit,
                    machine_code = dispatch.Input.MachineId.ToString(),
                    extra = new
                    {
                        source_telemetry_id = dispatch.SourceId,
                        sequence = dispatch.Input.Sequence,
                        status = dispatch.Input.Status,
                        plc_connected = dispatch.Input.PlcConnected,
                        alarm_active = dispatch.Input.AlarmActive,
                        production_quantity = dispatch.Input.ProductionQuantity,
                        production_time = dispatch.Input.ProductionTime,
                        yield_rate = dispatch.Input.YieldRate,
                    },
                },
                source = "backend_telemetry",
                correlation_id = dispatch.Input.MessageId,
                metadata = new
                {
                    schema_version = ContractV1.SchemaVersion,
                    source = "machine_telemetry",
                },
            };

            using var response = await client.PostAsJsonAsync("api/v1/events", new { @event = eventPayload }, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning(
                    "CEP staging rejected source telemetry {SourceId} with HTTP {StatusCode}",
                    dispatch.SourceId,
                    (int)response.StatusCode);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // Normal shutdown: do not turn draining cancellation into an application error.
        }
        catch (Exception exception)
        {
            _logger.LogWarning(exception, "CEP staging publish failed for source telemetry {SourceId}", dispatch.SourceId);
        }
    }

    private static (string EventType, string Severity) Classify(TelemetryCaptureInput input)
    {
        if (input.AlarmActive == true)
        {
            return ("raw_alarm", "critical");
        }

        return input.Status.Trim().ToUpperInvariant() switch
        {
            "STOPPED" => ("machine_stopped", "warning"),
            "RUNNING" => ("machine_started", "info"),
            "IDLE" => ("machine_idle", "warning"),
            "OFFLINE" => ("sensor_offline", "warning"),
            _ => ("raw_alarm", "info"),
        };
    }
}
