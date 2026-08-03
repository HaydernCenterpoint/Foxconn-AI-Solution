using backend.Services;

namespace backend.Tests.Services;

public class HealthScoringModelTests
{
    [Fact]
    public void HealthScoreBreakdown_DefaultsToUnknownColor()
    {
        var breakdown = new HealthScoreBreakdown();

        Assert.Equal("gray", breakdown.ColorCode);
    }

    [Fact]
    public void HealthScoreHistory_AllowsMissingMetadata()
    {
        var history = new HealthScoreHistory();

        Assert.Null(history.Metadata);
    }
}
