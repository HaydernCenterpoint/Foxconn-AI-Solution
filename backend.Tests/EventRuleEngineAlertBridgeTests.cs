using System.Text.Json;
using backend.Services;
using Mkz.Fusion.Contracts;

namespace backend.Tests;

public class EventRuleEngineAlertBridgeTests
{
    [Theory]
    [InlineData("EMERGENCY", "critical")]
    [InlineData("CRITICAL", "high")]
    [InlineData("WARNING", "medium")]
    [InlineData("INFO", "info")]
    [InlineData("LOW", "low")]
    [InlineData("unknown", "low")]
    [InlineData(null, "low")]
    public void MapToTimescaleSeverity_UsesAlertCheckConstraintValues(string? cepSeverity, string expected)
    {
        Assert.Equal(expected, EventRuleEngine.MapToTimescaleSeverity(cepSeverity));
    }

    [Theory]
    [InlineData(90, ">", 85, true)]
    [InlineData(85, ">", 85, false)]
    [InlineData(0.5, "<", 1.0, true)]
    [InlineData(1.0, "<", 1.0, false)]
    [InlineData(65, "<=", 65, true)]
    [InlineData(66, "<=", 65, false)]
    [InlineData(90, "==", 90, true)]
    [InlineData(91, "!=", 90, true)]
    [InlineData(90, "bogus", 90, false)]
    public void EvaluateThreshold_MatchesOperators(double actual, string op, double threshold, bool expected)
    {
        Assert.Equal(expected, EventRuleEngine.EvaluateThreshold(actual, op, threshold));
    }

    [Fact]
    public void BuildAlertEvidence_IncludesRuleAndMetricContext()
    {
        var rule = new EventRule
        {
            Id = "rule-temp-critical",
            Name = "Temperature Critical Threshold",
            Description = "Fires when machine temperature exceeds 85°C",
            Severity = "CRITICAL",
            Condition = new EventRuleCondition
            {
                Type = "threshold",
                Metric = "temperature",
                Operator = ">",
                Value = 85,
                Unit = "°C"
            }
        };

        var evidence = EventRuleEngine.BuildAlertEvidence(rule, "temperature", 92.5);

        Assert.Equal("rule-temp-critical", evidence["rule_id"]);
        Assert.Equal("Temperature Critical Threshold", evidence["rule_name"]);
        Assert.Equal("temperature", evidence["metric"]);
        Assert.Equal(92.5, evidence["actual_value"]);
        Assert.Equal(85d, evidence["threshold"]);
        Assert.Equal(">", evidence["operator"]);
        Assert.Equal("°C", evidence["unit"]);
    }

    [Fact]
    public void EventRulesJson_EnabledThresholdMetricsAreEmittedByTelemetryContract()
    {
        var path = Path.GetFullPath(Path.Combine(
            AppContext.BaseDirectory,
            "..", "..", "..", "..",
            "backend", "Configuration", "event-rules.json"));

        Assert.True(File.Exists(path), $"Expected event-rules.json at {path}");

        var input = new TelemetryCaptureInput(
            Guid.NewGuid(),
            "{}",
            1,
            DateTimeOffset.UnixEpoch,
            "message-1",
            null,
            "RUNNING",
            true,
            100,
            10,
            600,
            60,
            95,
            false);
        var emittedMetrics = TelemetrySchemaContract.Normalize(input)
            .Select(point => point.Metric)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        using var doc = JsonDocument.Parse(File.ReadAllText(path));
        var rules = doc.RootElement.GetProperty("rules").EnumerateArray().ToList();
        var enabledThresholdRules = rules
            .Where(rule => rule.GetProperty("enabled").GetBoolean())
            .Where(rule => string.Equals(
                rule.GetProperty("condition").GetProperty("type").GetString(),
                "threshold",
                StringComparison.OrdinalIgnoreCase))
            .ToList();

        Assert.NotEmpty(enabledThresholdRules);
        Assert.All(enabledThresholdRules, rule =>
            Assert.Contains(
                rule.GetProperty("condition").GetProperty("metric").GetString()!,
                emittedMetrics,
                StringComparer.OrdinalIgnoreCase));

        foreach (var deferredRuleId in new[]
        {
            "rule-temp-critical",
            "rule-temp-warning",
            "rule-vibration-high",
            "rule-pressure-low",
            "rule-cpu-high",
        })
        {
            var rule = rules.Single(candidate => candidate.GetProperty("id").GetString() == deferredRuleId);
            Assert.False(rule.GetProperty("enabled").GetBoolean(), deferredRuleId);
            Assert.StartsWith(
                "DEFERRED:",
                rule.GetProperty("description").GetString(),
                StringComparison.Ordinal);
        }

        // Non-threshold rule types remain declared but deferred for engine support.
        var deferredTypes = rules
            .Select(rule => rule.GetProperty("condition").GetProperty("type").GetString())
            .Where(type => !string.Equals(type, "threshold", StringComparison.OrdinalIgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        Assert.Contains("correlation", deferredTypes);
        Assert.Contains("comparison", deferredTypes);
        Assert.Contains("runtime_threshold", deferredTypes);
        Assert.All(
            rules.Where(rule => !string.Equals(
                rule.GetProperty("condition").GetProperty("type").GetString(),
                "threshold",
                StringComparison.OrdinalIgnoreCase)),
            rule =>
            {
                Assert.False(rule.GetProperty("enabled").GetBoolean());
                Assert.StartsWith(
                    "DEFERRED:",
                    rule.GetProperty("description").GetString(),
                    StringComparison.Ordinal);
            });
    }
}
