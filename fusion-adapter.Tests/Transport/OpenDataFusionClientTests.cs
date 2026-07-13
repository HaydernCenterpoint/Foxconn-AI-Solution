using System.Net;
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

    private static OpenDataFusionBundle TestBundle => new(
        new OdfSource("mkz-plc-monitoring", "run-1", "mkz-fusion-adapter"),
        Array.Empty<OdfAsset>(),
        Array.Empty<OdfTimeSeries>(),
        Array.Empty<OdfDataPoint>(),
        Array.Empty<object>(),
        Array.Empty<object>());

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
