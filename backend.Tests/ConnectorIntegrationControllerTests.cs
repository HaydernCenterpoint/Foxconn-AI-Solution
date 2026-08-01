using System.Net;
using System.Reflection;
using System.Text;
using backend.Controllers;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

public sealed class ConnectorIntegrationControllerTests
{
    [Fact]
    public void EndpointIsRestrictedToOperationsRoles()
    {
        var authorize = typeof(ConnectorIntegrationController)
            .GetCustomAttribute<AuthorizeAttribute>();

        Assert.Equal("ADMIN,ENGINEER", authorize?.Roles);
    }

    [Fact]
    public async Task ListForwardsServerSideApiKeyAndJson()
    {
        var handler = new RecordingHandler(HttpStatusCode.OK, """[{"name":"erp"}]""");
        var controller = CreateController(handler, "server-side-secret");

        var result = await controller.List(CancellationToken.None);

        var content = Assert.IsType<ContentResult>(result);
        Assert.Equal("""[{"name":"erp"}]""", content.Content);
        Assert.Equal("server-side-secret", handler.ApiKey);
        Assert.Equal("/connectors", handler.Path);
    }

    [Fact]
    public async Task ListFailsClosedWhenApiKeyIsMissing()
    {
        var handler = new RecordingHandler(HttpStatusCode.OK, "[]");
        var controller = CreateController(handler, null);

        var result = await controller.List(CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, problem.StatusCode);
        Assert.Null(handler.Path);
    }

    [Fact]
    public async Task ListMapsUpstreamAuthenticationFailureWithoutLeakingBody()
    {
        var handler = new RecordingHandler(
            HttpStatusCode.Unauthorized,
            """{"detail":"upstream secret detail"}""");
        var controller = CreateController(handler, "server-side-secret");

        var result = await controller.List(CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status502BadGateway, problem.StatusCode);
        Assert.DoesNotContain("upstream secret detail", problem.Value?.ToString());
    }

    private static ConnectorIntegrationController CreateController(
        RecordingHandler handler,
        string? apiKey)
    {
        var client = new HttpClient(handler)
        {
            BaseAddress = new Uri("http://connector-api/")
        };
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectorApi:ApiKey"] = apiKey
            })
            .Build();

        return new ConnectorIntegrationController(
            new SingleClientFactory(client),
            configuration,
            NullLogger<ConnectorIntegrationController>.Instance);
    }

    private sealed class SingleClientFactory(HttpClient client) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => client;
    }

    private sealed class RecordingHandler(
        HttpStatusCode statusCode,
        string content) : HttpMessageHandler
    {
        public string? ApiKey { get; private set; }
        public string? Path { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            Path = request.RequestUri?.AbsolutePath;
            ApiKey = request.Headers.TryGetValues("X-Connector-API-Key", out var values)
                ? values.Single()
                : null;

            return Task.FromResult(new HttpResponseMessage(statusCode)
            {
                Content = new StringContent(content, Encoding.UTF8, "application/json")
            });
        }
    }
}
