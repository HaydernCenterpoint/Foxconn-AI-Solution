public sealed class TimescaleMigrationSafetyTests
{
    [Fact]
    public void PhaseTwoMigrationsUseValidHypertableConstraints()
    {
        var root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "infrastructure", "timescaledb"));
        var alerts = File.ReadAllText(Path.Combine(root, "003_phase2_cep_alerts.sql"));
        var predictions = File.ReadAllText(Path.Combine(root, "004_phase2_health_predictions.sql"));

        Assert.DoesNotContain("create_hypertable(\n    'events'", alerts, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("PRIMARY KEY (alert_id, opened_at)", alerts, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("REFERENCES events(event_id)", alerts, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("DROP CONSTRAINT IF EXISTS alerts_event_id_fkey", alerts, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("add_retention_policy('events'", alerts, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("PRIMARY KEY (prediction_id, predicted_at)", predictions, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("WHERE valid_until > CURRENT_TIMESTAMP", predictions, StringComparison.OrdinalIgnoreCase);
    }
}
