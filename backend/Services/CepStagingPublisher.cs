using System.Net.Http.Json;
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

public sealed class CepStagingPublisher : BackgroundService
{
    public const string HttpClientName = "cep-staging";

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
    }

    public bool IsEnabled => _options.Enabled;

    protected override Task ExecuteAsync(CancellationToken stoppingToken) =>
        Task.Delay(Timeout.Infinite, stoppingToken);

    public async Task<bool> PublishAsync(
        long sourceId,
        string idempotencyKey,
        TelemetryCaptureInput input,
        CancellationToken cancellationToken = default)
    {
        if (!_options.Enabled)
        {
            return false;
        }

        try
        {
            var client = _httpClientFactory.CreateClient(HttpClientName);
            var (eventType, severity) = Classify(input);
            var numericValue = input.Oee
                ?? input.Uph
                ?? input.ProductionQuantity;
            var metric = input.Oee.HasValue
                ? "oee"
                : input.Uph.HasValue
                    ? "uph"
                    : "output_count";
            var unit = input.Oee.HasValue
                ? "percent"
                : input.Uph.HasValue
                    ? "units_per_hour"
                    : "count";
            var eventPayload = new
            {
                event_id = idempotencyKey,
                timestamp = input.OccurredAt,
                asset_id = input.MachineId.ToString(),
                asset_name = input.ReportedMachineName,
                type = eventType,
                severity,
                payload = new
                {
                    metric,
                    value = numericValue,
                    unit,
                    machine_code = input.MachineId.ToString(),
                    extra = new
                    {
                        source_telemetry_id = sourceId,
                        sequence = input.Sequence,
                        status = input.Status,
                        plc_connected = input.PlcConnected,
                        alarm_active = input.AlarmActive,
                        production_quantity = input.ProductionQuantity,
                        production_time = input.ProductionTime,
                        yield_rate = input.YieldRate,
                    },
                },
                source = "backend_telemetry",
                correlation_id = input.MessageId,
                metadata = new
                {
                    schema_version = ContractV1.SchemaVersion,
                    source = "machine_telemetry",
                },
            };

            using var request = new HttpRequestMessage(HttpMethod.Post, "api/v1/events")
            {
                Content = JsonContent.Create(new { @event = eventPayload }),
            };
            request.Headers.TryAddWithoutValidation("Idempotency-Key", idempotencyKey);
            using var response = await client.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning(
                    "CEP staging rejected source telemetry {SourceId} with HTTP {StatusCode}",
                    sourceId,
                    (int)response.StatusCode);
                return false;
            }

            _logger.LogWarning(
                "CEP staging accepted source telemetry {SourceId} but supplied no durable idempotent acknowledgement; delivery remains pending",
                sourceId);
            return false;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            _logger.LogWarning(exception, "CEP staging publish failed for source telemetry {SourceId}", sourceId);
            return false;
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
