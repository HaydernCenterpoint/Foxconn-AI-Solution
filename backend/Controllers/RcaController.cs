using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace backend.Controllers;

[ApiController]
[Route("api/v1/rca")]
[Authorize(Roles = "ADMIN,ENGINEER")]
public sealed class RcaController : ControllerBase
{
    private const int MaxEvidenceBytes = 20 * 1024;
    private const long MaxUpstreamResponseBytes = 1024 * 1024;

    private static readonly HashSet<string> ValidEventTypes =
    [
        "cep_rule_triggered",
        "cep_pattern_match",
        "temperature_high",
        "temperature_low",
        "vibration_anomaly",
        "current_anomaly",
        "pressure_anomaly",
        "output_drop",
        "output_spike",
        "machine_stopped",
        "machine_started",
        "machine_idle",
        "predicted_failure",
        "anomaly_detected",
        "predicted_maintenance",
        "cascading_failure",
        "multi_machine_failure",
        "thermal_drift",
        "vibration_trend",
        "root_cause_identified",
        "correlation_found",
        "sensor_offline",
        "sensor_error",
        "model_drift",
        "raw_alarm",
    ];

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IRcaAlertContextReader _alertContextReader;
    private readonly CepStagingOptions _options;
    private readonly ILogger<RcaController> _logger;

    public RcaController(
        IHttpClientFactory httpClientFactory,
        IRcaAlertContextReader alertContextReader,
        IOptions<CepStagingOptions> options,
        ILogger<RcaController> logger)
    {
        _httpClientFactory = httpClientFactory;
        _alertContextReader = alertContextReader;
        _options = options.Value;
        _logger = logger;
    }

    [HttpPost]
    [RequestSizeLimit(32 * 1024)]
    public async Task<IActionResult> Analyze(
        [FromBody] RcaRequest request,
        CancellationToken cancellationToken)
    {
        if (!_options.Enabled)
        {
            return Problem(
                statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "Root cause analysis is unavailable");
        }

        if (request.AlertId == Guid.Empty)
        {
            return InvalidRequest("alertId must be a non-empty UUID");
        }

        RcaAlertContext? context;
        try
        {
            context = await _alertContextReader.FindAsync(request.AlertId, cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            _logger.LogWarning(exception, "Failed to load RCA context for alert {AlertId}", request.AlertId);
            return Problem(
                statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "Root cause analysis is unavailable");
        }

        if (context is null)
        {
            return Problem(
                statusCode: StatusCodes.Status404NotFound,
                title: "Alert not found");
        }

        if (!HasValidContext(context, request.AlertId))
        {
            _logger.LogWarning("Alert {AlertId} has invalid RCA context", request.AlertId);
            return Problem(
                statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "Root cause analysis is unavailable");
        }

        var severity = MapSeverity(context.Severity);
        if (severity is null)
        {
            return Problem(
                statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "Root cause analysis is unavailable");
        }

        var targetEvent = new
        {
            event_id = context.EventId.ToString(),
            timestamp = context.OccurredAt.UtcDateTime,
            asset_id = context.AssetId.ToString(),
            type = MapEventType(context.EventType, context.RuleId, context.Evidence),
            severity,
            payload = new
            {
                rule_id = context.RuleId,
                rule_name = context.RuleId,
                extra = new
                {
                    alert_id = request.AlertId.ToString(),
                    evidence = context.Evidence,
                },
            },
            source = "backend_alert_rca",
        };

        try
        {
            var client = _httpClientFactory.CreateClient(CepStagingPublisher.HttpClientName);
            using var upstreamRequest = new HttpRequestMessage(HttpMethod.Post, "api/v1/rca")
            {
                Content = JsonContent.Create(new { target_event = targetEvent }),
            };
            using var response = await client.SendAsync(
                upstreamRequest,
                HttpCompletionOption.ResponseHeadersRead,
                cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning(
                    "CEP RCA endpoint returned HTTP {StatusCode}",
                    (int)response.StatusCode);
                return Problem(
                    statusCode: IsUpstreamUnavailable(response.StatusCode)
                        ? StatusCodes.Status503ServiceUnavailable
                        : StatusCodes.Status502BadGateway,
                    title: "Root cause analysis is unavailable");
            }

            try
            {
                await response.Content.LoadIntoBufferAsync(
                    MaxUpstreamResponseBytes,
                    cancellationToken);
            }
            catch (HttpRequestException exception)
            {
                _logger.LogWarning(exception, "CEP RCA endpoint returned an oversized response");
                return Problem(
                    statusCode: StatusCodes.Status502BadGateway,
                    title: "Root cause analysis is unavailable");
            }

            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            try
            {
                using var document = JsonDocument.Parse(json);
                if (!IsValidRcaResponse(document.RootElement))
                {
                    _logger.LogWarning("CEP RCA endpoint returned an invalid response shape");
                    return Problem(
                        statusCode: StatusCodes.Status502BadGateway,
                        title: "Root cause analysis is unavailable");
                }
            }
            catch (JsonException exception)
            {
                _logger.LogWarning(exception, "CEP RCA endpoint returned invalid JSON");
                return Problem(
                    statusCode: StatusCodes.Status502BadGateway,
                    title: "Root cause analysis is unavailable");
            }

            return Content(json, "application/json", Encoding.UTF8);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            _logger.LogWarning(exception, "CEP RCA request failed");
            return Problem(
                statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "Root cause analysis is unavailable");
        }
    }

    private static bool HasValidContext(RcaAlertContext context, Guid requestedAlertId)
    {
        return context.AlertId == requestedAlertId
            && context.EventId != Guid.Empty
            && context.AssetId != Guid.Empty
            && context.OccurredAt != default
            && !string.IsNullOrWhiteSpace(context.EventType)
            && context.EventType.Length <= 128
            && !string.IsNullOrWhiteSpace(context.RuleId)
            && context.RuleId.Length <= 256
            && !string.IsNullOrWhiteSpace(context.Severity)
            && context.Severity.Length <= 32
            && (context.Evidence is null
                || Encoding.UTF8.GetByteCount(context.Evidence) <= MaxEvidenceBytes);
    }

    private ObjectResult InvalidRequest(string detail) => Problem(
        statusCode: StatusCodes.Status400BadRequest,
        title: "Invalid request",
        detail: detail);

    private static bool IsValidRcaResponse(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Object
            || !root.TryGetProperty("rca", out var rca))
        {
            return false;
        }

        if (rca.ValueKind == JsonValueKind.Null)
        {
            return true;
        }

        return rca.ValueKind == JsonValueKind.Object
            && HasString(rca, "rca_id")
            && HasString(rca, "timestamp")
            && HasString(rca, "root_cause_event_id")
            && HasString(rca, "root_cause_type")
            && HasString(rca, "root_cause_asset_id")
            && HasString(rca, "root_cause_description")
            && HasStringArray(rca, "causal_chain")
            && HasObjectArray(rca, "causal_chain_events")
            && HasFiniteNumber(rca, "confidence_score")
            && HasStringArray(rca, "recommended_actions");
    }

    private static bool HasString(JsonElement value, string propertyName) =>
        value.TryGetProperty(propertyName, out var property)
        && property.ValueKind == JsonValueKind.String;

    private static bool HasStringArray(JsonElement value, string propertyName) =>
        value.TryGetProperty(propertyName, out var property)
        && property.ValueKind == JsonValueKind.Array
        && property.EnumerateArray().All(item => item.ValueKind == JsonValueKind.String);

    private static bool HasObjectArray(JsonElement value, string propertyName) =>
        value.TryGetProperty(propertyName, out var property)
        && property.ValueKind == JsonValueKind.Array
        && property.EnumerateArray().All(item =>
            item.ValueKind == JsonValueKind.Object
            && HasString(item, "event_id")
            && HasString(item, "type")
            && HasString(item, "timestamp")
            && HasString(item, "asset_id")
            && HasString(item, "severity")
            && item.TryGetProperty("payload", out var payload)
            && payload.ValueKind == JsonValueKind.Object);

    private static bool HasFiniteNumber(JsonElement value, string propertyName) =>
        value.TryGetProperty(propertyName, out var property)
        && property.ValueKind == JsonValueKind.Number
        && property.TryGetDouble(out var number)
        && double.IsFinite(number);

    private static bool IsUpstreamUnavailable(HttpStatusCode statusCode) =>
        (int)statusCode >= StatusCodes.Status500InternalServerError;

    private static string? MapSeverity(string severity) =>
        severity.Trim().ToLowerInvariant() switch
        {
            "emergency" => "emergency",
            "critical" or "high" => "critical",
            "warning" or "medium" => "warning",
            "info" or "low" => "info",
            _ => null,
        };

    private static string MapEventType(string? eventType, string? rule, string? evidence)
    {
        var normalizedEventType = Normalize(eventType);
        if (ValidEventTypes.Contains(normalizedEventType))
        {
            return normalizedEventType;
        }

        var context = $"{eventType} {rule} {evidence}".ToLowerInvariant();
        if (context.Contains("vibration") && context.Contains("trend"))
        {
            return "vibration_trend";
        }

        if (context.Contains("temperature") || context.Contains("thermal"))
        {
            if (context.Contains("drift"))
            {
                return "thermal_drift";
            }

            return context.Contains("low") ? "temperature_low" : "temperature_high";
        }

        if (context.Contains("vibration"))
        {
            return "vibration_anomaly";
        }

        if (context.Contains("current"))
        {
            return "current_anomaly";
        }

        if (context.Contains("pressure"))
        {
            return "pressure_anomaly";
        }

        if (context.Contains("output"))
        {
            return context.Contains("spike") || context.Contains("high") || context.Contains("increase")
                ? "output_spike"
                : "output_drop";
        }

        if (context.Contains("multi-machine") || context.Contains("multi machine"))
        {
            return "multi_machine_failure";
        }

        if (context.Contains("cascad"))
        {
            return "cascading_failure";
        }

        if (context.Contains("predict") && context.Contains("maintenance"))
        {
            return "predicted_maintenance";
        }

        if (context.Contains("predict") && context.Contains("failure"))
        {
            return "predicted_failure";
        }

        if (context.Contains("stopped") || context.Contains("stop") || context.Contains("downtime"))
        {
            return "machine_stopped";
        }

        if (context.Contains("started") || context.Contains("startup"))
        {
            return "machine_started";
        }

        if (context.Contains("idle"))
        {
            return "machine_idle";
        }

        if (context.Contains("offline"))
        {
            return "sensor_offline";
        }

        if (context.Contains("sensor") && context.Contains("error"))
        {
            return "sensor_error";
        }

        if (context.Contains("model") && context.Contains("drift"))
        {
            return "model_drift";
        }

        if (context.Contains("anomal"))
        {
            return "anomaly_detected";
        }

        return "raw_alarm";
    }

    private static string Normalize(string? value) =>
        (value ?? string.Empty)
            .Trim()
            .ToLowerInvariant()
            .Replace('-', '_')
            .Replace(' ', '_');
}

public sealed record RcaRequest
{
    public Guid AlertId { get; init; }
}
