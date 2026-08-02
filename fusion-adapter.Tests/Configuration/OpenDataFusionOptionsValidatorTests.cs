using Fusion.Adapter.Configuration;
using Microsoft.Extensions.Configuration;

namespace Fusion.Adapter.Tests.Configuration;

public sealed class OpenDataFusionOptionsValidatorTests
{
    [Fact]
    public void Validate_DisabledDispatchSucceedsIndependentlyOfCapture()
    {
        var validator = CreateValidator(connectionString: null);

        var captureEnabled = validator.Validate(null, new OpenDataFusionOptions
        {
            CaptureEnabled = true,
            DispatchEnabled = false
        });
        var captureDisabled = validator.Validate(null, new OpenDataFusionOptions
        {
            CaptureEnabled = false,
            DispatchEnabled = false
        });

        Assert.True(captureEnabled.Succeeded);
        Assert.True(captureDisabled.Succeeded);
    }

    [Fact]
    public void Validate_EnabledDispatchAcceptsCompleteHttpsConfiguration()
    {
        var validator = CreateValidator("Host=database;Database=operations;Username=adapter;Password=not-logged");

        var result = validator.Validate(null, ValidOptions());

        Assert.True(result.Succeeded);
    }

    [Theory]
    [InlineData("http://odf.example.test/")]
    [InlineData("not-a-url")]
    public void Validate_EnabledDispatchRequiresAbsoluteHttpsEndpoint(string baseUrl)
    {
        var validator = CreateValidator("Host=database;Database=operations");
        var options = WithBaseUrl(ValidOptions(), baseUrl);

        var result = validator.Validate(null, options);

        Assert.True(result.Failed);
        Assert.Contains(result.Failures, failure => failure.Contains("HTTPS", StringComparison.Ordinal));
    }

    [Fact]
    public void Validate_EnabledDispatchRequiresAuthMaterialReferenceWithoutReportingSecret()
    {
        const string secret = "do-not-include-this-secret-in-validation-output";
        var validator = CreateValidator("Host=database;Database=operations");
        var options = new OpenDataFusionOptions
        {
            DispatchEnabled = true,
            BaseUrl = "https://odf.example.test/",
            TenantId = "tenant-a",
            ProjectId = "project-a",
            Authentication = new OpenDataFusionAuthenticationOptions
            {
                Mode = "factory",
                FactorySecret = secret,
                FactorySubject = "adapter",
                FactoryIssuer = "issuer",
                FactoryAudience = "audience",
                FactoryRole = "ENGINEER"
            }
        };

        var result = validator.Validate(null, options);
        var errors = string.Join(" ", result.Failures ?? []);

        Assert.True(result.Failed);
        Assert.Contains("MaterialReference", errors, StringComparison.Ordinal);
        Assert.DoesNotContain(secret, errors, StringComparison.Ordinal);
    }

    private static OpenDataFusionOptions ValidOptions() => new()
    {
        DispatchEnabled = true,
        BaseUrl = "https://odf.example.test/",
        TenantId = "tenant-a",
        ProjectId = "project-a",
        Authentication = new OpenDataFusionAuthenticationOptions
        {
            Mode = "factory",
            MaterialReference = "environment:ODF_FACTORY_SECRET",
            FactorySecret = "test-factory-secret-that-is-at-least-32-bytes",
            FactorySubject = "adapter",
            FactoryIssuer = "issuer",
            FactoryAudience = "audience",
            FactoryRole = "ENGINEER"
        }
    };

    private static OpenDataFusionOptions WithBaseUrl(OpenDataFusionOptions options, string baseUrl) => new()
    {
        CaptureEnabled = options.CaptureEnabled,
        DispatchEnabled = options.DispatchEnabled,
        BaseUrl = baseUrl,
        TenantId = options.TenantId,
        ProjectId = options.ProjectId,
        Authentication = options.Authentication
    };

    private static OpenDataFusionOptionsValidator CreateValidator(string? connectionString)
    {
        var values = new Dictionary<string, string?>
        {
            ["ConnectionStrings:MkzOperations"] = connectionString
        };
        return new OpenDataFusionOptionsValidator(
            new ConfigurationBuilder().AddInMemoryCollection(values).Build());
    }
}
