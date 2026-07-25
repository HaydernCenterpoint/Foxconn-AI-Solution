using System.Reflection;
using System.Text.Json;
using backend.Controllers;
using backend.Middleware;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using Mkz.Fusion.Contracts;

namespace backend.Tests;

public sealed class ContractV1Tests
{
    [Fact]
    public void VersionedContracts_ExposeOneV1SourceOfTruth()
    {
        Assert.Equal("v1", ContractV1.Version);
        Assert.Equal(1, ContractV1.SchemaVersion);
        Assert.Equal(ContractV1.SchemaVersion, AssetCatalogContract.SchemaVersion);

        var machineId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        var telemetry = TelemetryFusionEventFactory.Create(
            new TelemetryCaptureInput(machineId, "{}", 1, DateTimeOffset.UnixEpoch, null, null, "RUNNING", true, null, null, null, null, null, null),
            new MachineSnapshot(machineId, null, null, "Press A"),
            null);

        Assert.Equal(ContractV1.SchemaVersion, telemetry.SchemaVersion);
        Assert.Equal(machineId, telemetry.Machine.Id);
    }

    [Theory]
    [InlineData("asset.schema.json", "asset", "id", "type", "name", "code", "metadata", "createdAt", "updatedAt")]
    [InlineData("telemetry.schema.json", "telemetry", "time", "assetId", "metric", "value")]
    [InlineData("event.schema.json", "event", "eventId", "timestamp", "assetId", "type", "severity", "payload")]
    public void PublishedSchemas_AreVersionedAndContainTheirRequiredFields(string fileName, string name, params string[] requiredFields)
    {
        using var document = JsonDocument.Parse(File.ReadAllText(ContractPath(fileName)));
        var root = document.RootElement;

        Assert.Equal($"urn:mkz:contracts:{ContractV1.Version}:{name}", root.GetProperty("$id").GetString());
        Assert.Equal(ContractV1.Version, root.GetProperty("x-contract-version").GetString());
        Assert.Equal(ContractV1.SchemaVersion, root.GetProperty("x-schema-version").GetInt32());

        var required = root.GetProperty("required").EnumerateArray().Select(field => field.GetString()).ToHashSet();
        Assert.All(requiredFields, field => Assert.Contains(field, required));
    }

    [Fact]
    public void ApiConvention_IsVersionedAndExposedByAssetAndTelemetryRoutes()
    {
        using var document = JsonDocument.Parse(File.ReadAllText(ContractPath("api-convention.json")));
        var root = document.RootElement;

        Assert.Equal(ContractV1.Version, root.GetProperty("contractVersion").GetString());
        Assert.Equal(ContractV1.SchemaVersion, root.GetProperty("schemaVersion").GetInt32());
        Assert.Equal(ApiConventionV1.BasePath, root.GetProperty("basePath").GetString());
        Assert.Equal(ApiConventionV1.AuthenticationScheme, root.GetProperty("authentication").GetProperty("scheme").GetString());
        Assert.Equal(ApiConventionV1.ProblemMediaType, root.GetProperty("errors").GetProperty("mediaType").GetString());
        Assert.Contains(ApiConventionV1.RoutePrefix + "/assets", Routes(typeof(AssetController)));
        Assert.Contains(ApiConventionV1.RoutePrefix + "/telemetry", Routes(typeof(TelemetryController)));
    }

    [Fact]
    public async Task AssetContractErrors_UseProblemDetails()
    {
        var controller = new AssetController(null!, null!);

        var response = await controller.List(null, "not-a-real-type", null);

        var result = Assert.IsType<ObjectResult>(response);
        var problem = Assert.IsType<ProblemDetails>(result.Value);
        Assert.Equal(StatusCodes.Status400BadRequest, problem.Status);
    }

    [Fact]
    public async Task UnhandledApiErrors_UseProblemJson()
    {
        var context = new DefaultHttpContext();
        context.Response.Body = new MemoryStream();
        var middleware = new ExceptionHandlingMiddleware(
            _ => throw new InvalidOperationException("test failure"),
            NullLogger<ExceptionHandlingMiddleware>.Instance);

        await middleware.InvokeAsync(context);

        Assert.Equal(StatusCodes.Status500InternalServerError, context.Response.StatusCode);
        Assert.Equal(ApiConventionV1.ProblemMediaType, context.Response.ContentType);
        context.Response.Body.Position = 0;
        using var document = await JsonDocument.ParseAsync(context.Response.Body);
        Assert.Equal(StatusCodes.Status500InternalServerError, document.RootElement.GetProperty("status").GetInt32());
        Assert.Equal("Internal server error", document.RootElement.GetProperty("title").GetString());
    }

    private static IEnumerable<string?> Routes(Type controller) => controller
        .GetCustomAttributes<RouteAttribute>()
        .Select(route => route.Template);

    private static string ContractPath(string fileName) => Path.Combine(AppContext.BaseDirectory, "contracts", "v1", fileName);
}
