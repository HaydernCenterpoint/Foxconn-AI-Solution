using Mkz.Fusion.Contracts;

namespace backend.Tests;

public sealed class FusionEventContractTests
{
    [Theory]
    [InlineData("ALARM", true)]
    [InlineData("TELEMETRY", true)]
    [InlineData("STATUS_CHANGE", true)]
    [InlineData("MAINTENANCE_DUE", true)]
    [InlineData("THRESHOLD_BREACH", true)]
    [InlineData("PRODUCTION_MILESTONE", true)]
    [InlineData("unknown", false)]
    [InlineData(null, false)]
    public void IsKnownEventType_ClassifiesCorrectly(string? eventType, bool expected)
    {
        Assert.Equal(expected, FusionEventContract.IsKnownEventType(eventType));
    }

    [Theory]
    [InlineData("INFO", true)]
    [InlineData("WARNING", true)]
    [InlineData("CRITICAL", true)]
    [InlineData("EMERGENCY", true)]
    [InlineData("low", false)]
    [InlineData(null, false)]
    public void IsKnownSeverity_ClassifiesCorrectly(string? severity, bool expected)
    {
        Assert.Equal(expected, FusionEventContract.IsKnownSeverity(severity));
    }

    [Fact]
    public void Create_ProducesValidEvent()
    {
        var assetId = Guid.NewGuid();
        var evt = FusionEventContract.Create(assetId, "alarm", "critical", source: "mqtt");

        Assert.Equal(FusionEventContract.CurrentSchemaVersion, evt.SchemaVersion);
        Assert.NotEqual(Guid.Empty, evt.EventId);
        Assert.Equal(assetId, evt.AssetId);
        Assert.Equal("ALARM", evt.EventType);
        Assert.Equal("CRITICAL", evt.Severity);
        Assert.Equal("mqtt", evt.Source);
    }

    [Fact]
    public void SchemaVersion_IsOne()
    {
        Assert.Equal(1, FusionEventContract.CurrentSchemaVersion);
    }
}
