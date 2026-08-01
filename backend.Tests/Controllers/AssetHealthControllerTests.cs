using Microsoft.AspNetCore.Mvc;
using Xunit;
using backend.Controllers;

namespace backend.Tests.Controllers;

/// <summary>
/// Unit tests for AssetHealthController.
/// Because HealthScoringService requires a real TimescaleDB connection (no interface/mock),
/// these tests verify controller route configuration.
/// Full integration tests require a running TimescaleDB instance.
/// </summary>
public class AssetHealthControllerTests
{
    [Fact]
    public void Controller_HasCorrectRouteAttribute()
    {
        var routes = System.Linq.Enumerable.ToList(
            System.Linq.Enumerable.Select(
                System.Linq.Enumerable.OfType<RouteAttribute>(
                    typeof(AssetHealthController).GetCustomAttributes(typeof(RouteAttribute), false)),
                r => r.Template));

        Assert.Contains("api/v1/assets/{assetId}/health", routes);
    }

    [Fact]
    public void Controller_IsApiController()
    {
        Assert.IsType<ApiControllerAttribute>(Assert.Single(
            typeof(AssetHealthController).GetCustomAttributes(typeof(ApiControllerAttribute), false)));
    }

    [Fact]
    public void GetHealthScore_HasHttpGetAttribute()
    {
        var method = typeof(AssetHealthController).GetMethod("GetHealthScore");
        Assert.NotNull(method);

        Assert.IsType<HttpGetAttribute>(Assert.Single(
            method!.GetCustomAttributes(typeof(HttpGetAttribute), false)));
    }

    [Fact]
    public void GetHealthHistory_HasHttpGetHistoryAttribute()
    {
        var method = typeof(AssetHealthController).GetMethod("GetHealthHistory");
        Assert.NotNull(method);
        var httpGet = Assert.IsType<HttpGetAttribute>(Assert.Single(
            method!.GetCustomAttributes(typeof(HttpGetAttribute), false)));

        Assert.Equal("history", httpGet.Template);
    }

    [Fact]
    public void ComputeHealthScore_HasHttpPostComputeAttribute()
    {
        var method = typeof(AssetHealthController).GetMethod("ComputeHealthScore");
        Assert.NotNull(method);
        var httpPost = Assert.IsType<HttpPostAttribute>(Assert.Single(
            method!.GetCustomAttributes(typeof(HttpPostAttribute), false)));

        Assert.Equal("compute", httpPost.Template);
    }
}
