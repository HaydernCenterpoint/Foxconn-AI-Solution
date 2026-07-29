using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;

public sealed class BatchPredictionJobTests
{
    private static string ReadSource(string relativePath)
    {
        var path = Path.GetFullPath(Path.Combine(
            AppContext.BaseDirectory, "..", "..", "..", "..", relativePath));
        return File.ReadAllText(path);
    }

    [Fact]
    public void JobUsesConfigurableCadenceAndBoundedActiveAssetQuery()
    {
        var source = ReadSource(Path.Combine("backend", "Services", "BatchPredictionJob.cs"));

        Assert.Contains("BatchPrediction:IntervalMinutes", source, StringComparison.Ordinal);
        Assert.Contains("BatchPrediction:InitialDelaySeconds", source, StringComparison.Ordinal);
        Assert.Contains("BatchPrediction:MaxAssets", source, StringComparison.Ordinal);
        Assert.Contains("WHERE type IN ('machine', 'sensor')", source, StringComparison.Ordinal);
        Assert.Contains("LIMIT @max_assets", source, StringComparison.Ordinal);
    }

    [Fact]
    public void JobRunsBothBaselinePredictionsAndIsRegistered()
    {
        var jobSource = ReadSource(Path.Combine("backend", "Services", "BatchPredictionJob.cs"));
        var programSource = ReadSource(Path.Combine("backend", "Program.cs"));

        Assert.Contains("_predictiveService.DetectAnomalyAsync(assetId)", jobSource, StringComparison.Ordinal);
        Assert.Contains(
            "_predictiveService.PredictFailureRiskAsync(assetId, _failureRiskWindow)",
            jobSource,
            StringComparison.Ordinal);
        Assert.Contains("AddHostedService<BatchPredictionJob>()", programSource, StringComparison.Ordinal);
    }

    [Fact]
    public async Task PredictionDatabaseFailuresPropagateToBatchCaller()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Timescale"] =
                    "Host=127.0.0.1;Port=1;Database=missing;Username=missing;Password=missing;Timeout=1"
            })
            .Build();
        var service = new backend.Services.PredictiveService(
            configuration,
            NullLogger<backend.Services.PredictiveService>.Instance);
        var assetId = Guid.NewGuid();

        await Assert.ThrowsAnyAsync<NpgsqlException>(
            () => service.DetectAnomalyAsync(assetId));
        await Assert.ThrowsAnyAsync<NpgsqlException>(
            () => service.PredictFailureRiskAsync(assetId));
    }
}
