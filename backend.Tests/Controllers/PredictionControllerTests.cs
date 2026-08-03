using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;
using backend.Controllers;
using backend.Services;

namespace backend.Tests.Controllers;

/// <summary>
/// Unit tests for PredictionController route and attribute verification.
/// Full integration tests require a running predictive service.
/// </summary>
public class PredictionControllerTests
{
    [Fact]
    public void Controller_HasCorrectRouteAttribute()
    {
        var routes = System.Linq.Enumerable.ToList(
            System.Linq.Enumerable.Select(
                System.Linq.Enumerable.OfType<RouteAttribute>(
                    typeof(PredictionController).GetCustomAttributes(typeof(RouteAttribute), false)),
                r => r.Template));

        Assert.Contains("api/v1/predictions", routes);
    }

    [Fact]
    public void Controller_IsApiController()
    {
        Assert.IsType<ApiControllerAttribute>(Assert.Single(
            typeof(PredictionController).GetCustomAttributes(typeof(ApiControllerAttribute), false)));
    }

    [Fact]
    public void DetectAnomaly_HasHttpPostAttribute()
    {
        var method = typeof(PredictionController).GetMethod("DetectAnomaly");
        Assert.NotNull(method);
        var httpPost = Assert.IsType<HttpPostAttribute>(Assert.Single(
            method!.GetCustomAttributes(typeof(HttpPostAttribute), false)));

        Assert.Equal("anomaly", httpPost.Template);
    }

    [Fact]
    public void GetFailureRisk_HasHttpGetAttribute()
    {
        var method = typeof(PredictionController).GetMethod("GetFailureRisk");
        Assert.NotNull(method);
        var httpGet = Assert.IsType<HttpGetAttribute>(Assert.Single(
            method!.GetCustomAttributes(typeof(HttpGetAttribute), false)));

        Assert.Equal("risk/{assetId}", httpGet.Template);
    }

    [Fact]
    public async Task DetectAnomaly_RejectsNullRequest()
    {
        var controller = new PredictionController(null!, NullLogger<PredictionController>.Instance);

        var result = await controller.DetectAnomaly(null!);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public void PredictionModels_InitializeRequiredResponseValues()
    {
        var anomaly = new AnomalyPrediction();
        var risk = new FailureRiskPrediction();

        Assert.NotNull(anomaly.Reason);
        Assert.Empty(anomaly.ContributingFactors);
        Assert.NotNull(risk.RiskLevel);
        Assert.NotNull(risk.TimeWindow);
        Assert.Empty(risk.ContributingFactors);
    }
}
