using System.Reflection;
using backend.Controllers;
using Microsoft.AspNetCore.Authorization;

namespace backend.Tests;

public sealed class Phase2AuthorizationTests
{
    [Theory]
    [InlineData(typeof(AlertController))]
    [InlineData(typeof(AssetHealthController))]
    [InlineData(typeof(PredictionController))]
    public void IntelligenceControllersRequireAuthentication(Type controllerType)
    {
        Assert.NotNull(controllerType.GetCustomAttribute<AuthorizeAttribute>());
    }

    [Theory]
    [InlineData(typeof(AlertController), nameof(AlertController.AcknowledgeAlert))]
    [InlineData(typeof(AlertController), nameof(AlertController.ResolveAlert))]
    [InlineData(typeof(AssetHealthController), nameof(AssetHealthController.ComputeHealthScore))]
    public void IntelligenceMutationsRequireOperatorRole(Type controllerType, string methodName)
    {
        var method = controllerType.GetMethod(methodName);

        Assert.NotNull(method);
        Assert.Equal("ADMIN,ENGINEER", method!.GetCustomAttribute<AuthorizeAttribute>()?.Roles);
    }

    [Theory]
    [InlineData(typeof(PredictionController), nameof(PredictionController.DetectAnomaly))]
    [InlineData(typeof(PredictionController), nameof(PredictionController.GetFailureRisk))]
    public void PersistedPredictionsRequireOperatorRole(Type controllerType, string methodName)
    {
        var method = controllerType.GetMethod(methodName);

        Assert.NotNull(method);
        Assert.Equal("ADMIN,ENGINEER", controllerType.GetCustomAttribute<AuthorizeAttribute>()?.Roles);
    }
}
