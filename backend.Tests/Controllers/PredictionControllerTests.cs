using Microsoft.AspNetCore.Mvc;
using Xunit;
using backend.Controllers;

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
}
