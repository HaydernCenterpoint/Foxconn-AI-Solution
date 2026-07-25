using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using backend.Hubs;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Mkz.Fusion.Contracts;

namespace backend.Services
{
    /// <summary>
    /// In-process CEP engine. Subscribes to a telemetry channel, evaluates threshold rules
    /// from event-rules.json, writes matched events to event_log, and pushes CRITICAL/EMERGENCY
    /// alerts to SignalR.
    /// </summary>
    public sealed class EventRuleEngine : BackgroundService
    {
        private readonly Channel<TelemetryCaptureInput> _channel;
        private readonly DatabaseService _dbService;
        private readonly IHubContext<TelemetryHub> _hubContext;
        private readonly ILogger<EventRuleEngine> _logger;
        private readonly ConcurrentDictionary<string, DateTimeOffset> _cooldowns = new();
        private List<EventRule> _rules = new();

        public ChannelWriter<TelemetryCaptureInput> Writer => _channel.Writer;

        public EventRuleEngine(
            DatabaseService dbService,
            IHubContext<TelemetryHub> hubContext,
            ILogger<EventRuleEngine> logger)
        {
            _dbService = dbService;
            _hubContext = hubContext;
            _logger = logger;
            _channel = Channel.CreateUnbounded<TelemetryCaptureInput>(
                new UnboundedChannelOptions { SingleReader = true, SingleWriter = false });
        }

        /// <summary>Enqueue a telemetry capture for rule evaluation.</summary>
        public void Enqueue(TelemetryCaptureInput input)
        {
            if (!_channel.Writer.TryWrite(input))
                _logger.LogWarning("EventRuleEngine: failed to enqueue input.");
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            LoadRules();
            _logger.LogInformation("EventRuleEngine started with {Count} rules.", _rules.Count);

            try
            {
                await foreach (var input in _channel.Reader.ReadAllAsync(stoppingToken))
                {
                    try
                    {
                        await EvaluateAsync(input);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "EventRuleEngine: error evaluating rules.");
                    }
                }
            }
            catch (OperationCanceledException)
            {
                _logger.LogInformation("EventRuleEngine is stopping.");
            }
        }

        public void ReloadRules()
        {
            LoadRules();
            _logger.LogInformation("EventRuleEngine reloaded {Count} rules.", _rules.Count);
        }

        public IReadOnlyList<EventRule> GetRules() => _rules.AsReadOnly();

        private void LoadRules()
        {
            var path = Path.Combine(AppContext.BaseDirectory, "Configuration", "event-rules.json");
            if (!File.Exists(path))
            {
                // Try relative path for development
                path = Path.Combine(Directory.GetCurrentDirectory(), "Configuration", "event-rules.json");
            }
            if (!File.Exists(path))
            {
                _logger.LogWarning("event-rules.json not found at {Path}", path);
                _rules = new List<EventRule>();
                return;
            }

            var json = File.ReadAllText(path);
            var doc = JsonSerializer.Deserialize<EventRulesDocument>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });
            _rules = doc?.Rules ?? new List<EventRule>();
        }

        private async Task EvaluateAsync(TelemetryCaptureInput input)
        {
            var dataPoints = TelemetrySchemaContract.Normalize(input).ToList();
            if (dataPoints.Count == 0) return;

            foreach (var rule in _rules)
            {
                if (!rule.Enabled) continue;
                if (rule.Condition?.Type != "threshold") continue;

                var metric = rule.Condition.Metric;
                if (string.IsNullOrEmpty(metric)) continue;

                var matchingPoint = dataPoints.FirstOrDefault(p =>
                    string.Equals(p.Metric, metric, StringComparison.OrdinalIgnoreCase));
                if (matchingPoint is null) continue;

                if (!EvaluateThreshold(matchingPoint.Value, rule.Condition.Operator, rule.Condition.Value))
                    continue;

                // Check cooldown
                var cooldownKey = $"{rule.Id}:{input.MachineId}";
                if (_cooldowns.TryGetValue(cooldownKey, out var lastFired))
                {
                    if ((DateTimeOffset.UtcNow - lastFired).TotalSeconds < rule.CooldownSeconds)
                        continue;
                }
                _cooldowns[cooldownKey] = DateTimeOffset.UtcNow;

                var fusionEvent = FusionEventContract.Create(
                    input.MachineId,
                    rule.EventType ?? FusionEventContract.EventTypes.ThresholdBreach,
                    rule.Severity ?? FusionEventContract.Severities.Warning,
                    source: $"EventRuleEngine:{rule.Id}",
                    payload: new Dictionary<string, object?>
                    {
                        ["rule_id"] = rule.Id,
                        ["rule_name"] = rule.Name,
                        ["metric"] = metric,
                        ["actual_value"] = matchingPoint.Value,
                        ["threshold"] = rule.Condition.Value,
                        ["operator"] = rule.Condition.Operator,
                        ["unit"] = rule.Condition.Unit
                    });

                await _dbService.InsertEventLogAsync(fusionEvent);
                _logger.LogInformation("CEP rule fired: {RuleId} for asset {AssetId} (metric={Metric}, value={Value})",
                    rule.Id, input.MachineId, metric, matchingPoint.Value);

                // Push CRITICAL/EMERGENCY alerts via SignalR
                if (fusionEvent.Severity is "CRITICAL" or "EMERGENCY")
                {
                    await _hubContext.Clients.Group("all_clients").SendAsync("CepAlert", new
                    {
                        eventId = fusionEvent.EventId,
                        assetId = fusionEvent.AssetId,
                        eventType = fusionEvent.EventType,
                        severity = fusionEvent.Severity,
                        timestamp = fusionEvent.Timestamp,
                        ruleName = rule.Name,
                        metric,
                        actualValue = matchingPoint.Value,
                        threshold = rule.Condition.Value
                    });
                }
            }
        }

        private static bool EvaluateThreshold(double actual, string? op, double threshold) =>
            op switch
            {
                ">" => actual > threshold,
                ">=" => actual >= threshold,
                "<" => actual < threshold,
                "<=" => actual <= threshold,
                "==" => Math.Abs(actual - threshold) < 0.0001,
                "!=" => Math.Abs(actual - threshold) >= 0.0001,
                _ => false
            };
    }

    // ── Rule document models ──────────────────────────────────────────────

    public sealed class EventRulesDocument
    {
        [JsonPropertyName("rules")]
        public List<EventRule> Rules { get; set; } = new();

        [JsonPropertyName("version")]
        public int Version { get; set; }

        [JsonPropertyName("description")]
        public string? Description { get; set; }
    }

    public sealed class EventRule
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = "";

        [JsonPropertyName("name")]
        public string? Name { get; set; }

        [JsonPropertyName("description")]
        public string? Description { get; set; }

        [JsonPropertyName("enabled")]
        public bool Enabled { get; set; } = true;

        [JsonPropertyName("eventType")]
        public string? EventType { get; set; }

        [JsonPropertyName("severity")]
        public string? Severity { get; set; }

        [JsonPropertyName("condition")]
        public EventRuleCondition? Condition { get; set; }

        [JsonPropertyName("cooldownSeconds")]
        public int CooldownSeconds { get; set; } = 300;
    }

    public sealed class EventRuleCondition
    {
        [JsonPropertyName("type")]
        public string? Type { get; set; }

        [JsonPropertyName("metric")]
        public string? Metric { get; set; }

        [JsonPropertyName("operator")]
        public string? Operator { get; set; }

        [JsonPropertyName("value")]
        public double Value { get; set; }

        [JsonPropertyName("unit")]
        public string? Unit { get; set; }

        [JsonPropertyName("scope")]
        public string? Scope { get; set; }

        [JsonPropertyName("event")]
        public string? Event { get; set; }

        [JsonPropertyName("threshold")]
        public int Threshold { get; set; }

        [JsonPropertyName("windowSeconds")]
        public int WindowSeconds { get; set; }

        [JsonPropertyName("compareWith")]
        public string? CompareWith { get; set; }

        [JsonPropertyName("note")]
        public string? Note { get; set; }
    }
}
