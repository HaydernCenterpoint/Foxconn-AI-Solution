using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Fusion.Adapter.Configuration;
using Fusion.Adapter.Mapping;
using Fusion.Adapter.Transport;

namespace Fusion.Adapter.Tests.Transport;

public sealed class OpenDataFusionClientTests
{
    [Fact]
    public async Task SendAsync_PostsBundleWithDevelopmentScopeHeaders()
    {
        var handler = new CapturingHandler(HttpStatusCode.Accepted);
        using var httpClient = new HttpClient(handler);
        var options = new OpenDataFusionOptions
        {
            BaseUrl = "http://localhost:54310/",
            TenantId = "tenant-a",
            ProjectId = "project-a",
            Authentication = new OpenDataFusionAuthenticationOptions
            {
                Mode = "development",
                DevelopmentUser = "local-user"
            }
        };
        var client = new OpenDataFusionClient(httpClient, options, new FakeAccessTokenProvider());

        var result = await client.SendAsync(TestBundle, CancellationToken.None);

        Assert.Equal(DeliveryKind.Delivered, result.Kind);
        Assert.NotNull(handler.Request);
        Assert.Equal(HttpMethod.Post, handler.Request!.Method);
        Assert.Equal("http://localhost:54310/api/v1/ingest/bundle", handler.Request.RequestUri!.ToString());
        Assert.Equal("tenant-a", handler.Request.Headers.GetValues("x-odf-tenant-id").Single());
        Assert.Equal("project-a", handler.Request.Headers.GetValues("x-odf-project-id").Single());
        Assert.Equal("local-user", handler.Request.Headers.GetValues("x-odf-user").Single());
    }

    [Fact]
    public async Task SendAsync_ReturnsPermanentFailureForValidationError()
    {
        var handler = new CapturingHandler(HttpStatusCode.UnprocessableEntity);
        using var httpClient = new HttpClient(handler);
        var options = new OpenDataFusionOptions
        {
            BaseUrl = "http://localhost:54310/",
            TenantId = "tenant-a",
            ProjectId = "project-a"
        };
        var client = new OpenDataFusionClient(httpClient, options, new FakeAccessTokenProvider());

        var result = await client.SendAsync(TestBundle, CancellationToken.None);

        Assert.Equal(DeliveryKind.PermanentFailure, result.Kind);
    }

    [Fact]
    public async Task FactoryTokenProvider_SignsTheConfiguredServiceIdentity()
    {
        const string secret = "test-factory-secret-that-is-at-least-32-bytes";
        using var httpClient = new HttpClient();
        using var provider = new ClientCredentialsAccessTokenProvider(httpClient, new OpenDataFusionAuthenticationOptions
        {
            Mode = "factory",
            FactorySecret = secret,
            FactoryIssuer = "MKZ_PLC_Server",
            FactoryAudience = "MKZ_PLC_Client",
            FactorySubject = "service-account-open-data-fusion-connector",
            FactoryRole = "ENGINEER"
        });

        var token = await provider.GetAccessTokenAsync(CancellationToken.None);
        var parts = token.Split('.');
        Assert.Equal(3, parts.Length);
        using var payload = JsonDocument.Parse(DecodeBase64Url(parts[1]));
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var expectedSignature = EncodeBase64Url(hmac.ComputeHash(Encoding.UTF8.GetBytes($"{parts[0]}.{parts[1]}")));

        Assert.Equal("service-account-open-data-fusion-connector", payload.RootElement.GetProperty("sub").GetString());
        Assert.Equal("ENGINEER", payload.RootElement.GetProperty("role").GetString());
        Assert.Equal("MKZ_PLC_Server", payload.RootElement.GetProperty("iss").GetString());
        Assert.Equal("MKZ_PLC_Client", payload.RootElement.GetProperty("aud").GetString());
        Assert.Equal(expectedSignature, parts[2]);
    }

    [Fact]
    public async Task FactoryTokenProvider_RejectsAWeakSecret()
    {
        using var httpClient = new HttpClient();
        using var provider = new ClientCredentialsAccessTokenProvider(httpClient, new OpenDataFusionAuthenticationOptions
        {
            Mode = "factory",
            FactorySecret = "too-short",
            FactorySubject = "service-account-open-data-fusion-connector"
        });

        await Assert.ThrowsAsync<InvalidOperationException>(() => provider.GetAccessTokenAsync(CancellationToken.None));
    }

    private static OpenDataFusionBundle TestBundle => new(
        new OdfSource("mkz-plc-monitoring", "run-1", "mkz-fusion-adapter"),
        Array.Empty<OdfAsset>(),
        Array.Empty<OdfTimeSeries>(),
        Array.Empty<OdfDataPoint>(),
        Array.Empty<object>(),
        Array.Empty<object>());

    private static byte[] DecodeBase64Url(string value)
    {
        var padded = value.Replace('-', '+').Replace('_', '/').PadRight((value.Length + 3) / 4 * 4, '=');
        return Convert.FromBase64String(padded);
    }

    private static string EncodeBase64Url(byte[] value) =>
        Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private sealed class FakeAccessTokenProvider : IAccessTokenProvider
    {
        public Task<string> GetAccessTokenAsync(CancellationToken cancellationToken) =>
            Task.FromResult("test-token");
    }

    private sealed class CapturingHandler : HttpMessageHandler
    {
        private readonly HttpStatusCode _statusCode;

        public CapturingHandler(HttpStatusCode statusCode)
        {
            _statusCode = statusCode;
        }

        public HttpRequestMessage? Request { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Request = request;
            return Task.FromResult(new HttpResponseMessage(_statusCode));
        }
    }
}
