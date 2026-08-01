using System.Net;
using System.Reflection;
using System.Text;
using System.Text.Json;
using backend.Controllers;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Metadata;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

public sealed class RcaControllerTests
{
    private const string ValidUpstreamJson = """
        {
          "rca": {
            "rca_id": "33333333-3333-3333-3333-333333333333",
            "timestamp": "2026-07-28T14:31:00Z",
            "root_cause_event_id": "44444444-4444-4444-4444-444444444444",
            "root_cause_type": "vibration_anomaly",
            "root_cause_asset_id": "22222222-2222-2222-2222-222222222222",
            "root_cause_description": "Bearing vibration increased",
            "causal_chain": ["44444444-4444-4444-4444-444444444444"],
            "causal_chain_events": [],
            "confidence_score": 0.92,
            "recommended_actions": ["Inspect the bearing"]
          }
        }
        """;

    [Fact]
    public void EndpointRequiresOperatorRoles()
    {
        var authorize = typeof(RcaController).GetCustomAttribute<AuthorizeAttribute>();

        Assert.Equal("ADMIN,ENGINEER", authorize?.Roles);
    }

    [Fact]
    public void EndpointLimitsRequestBodySize()
    {
        var method = typeof(RcaController).GetMethod(nameof(RcaController.Analyze));
        var requestSizeLimit = method?.GetCustomAttribute<RequestSizeLimitAttribute>();
        var metadata = Assert.IsAssignableFrom<IRequestSizeLimitMetadata>(requestSizeLimit);

        Assert.Equal(32 * 1024, metadata.MaxRequestBodySize);
    }

    [Fact]
    public void RequestAcceptsOnlyAlertId()
    {
        var property = Assert.Single(typeof(RcaRequest).GetProperties());

        Assert.Equal(nameof(RcaRequest.AlertId), property.Name);
        Assert.Equal(typeof(Guid), property.PropertyType);
    }

    [Fact]
    public async Task AnalyzeFailsClosedBeforeReadingAlertWhenCepStagingIsDisabled()
    {
        var handler = new RecordingHandler(HttpStatusCode.OK, """{"rca":null}""");
        var reader = new FakeAlertContextReader(CreateContext());
        var controller = CreateController(handler, reader, enabled: false);

        var result = await controller.Analyze(CreateRequest(), CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, problem.StatusCode);
        Assert.Equal(0, reader.CallCount);
        Assert.Equal(0, handler.CallCount);
    }

    [Fact]
    public async Task AnalyzeLoadsAndForwardsAuthoritativeAlertEventContext()
    {
        var handler = new RecordingHandler(HttpStatusCode.OK, ValidUpstreamJson);
        var context = CreateContext() with
        {
            EventType = "custom-threshold-alert",
            RuleId = "Bearing vibration trend",
            Severity = "HIGH",
            Evidence = """{"metric":"vibration","trend":"increasing"}""",
        };
        var reader = new FakeAlertContextReader(context);
        var controller = CreateController(handler, reader, enabled: true);
        var request = CreateRequest();

        var result = await controller.Analyze(request, CancellationToken.None);

        var content = Assert.IsType<ContentResult>(result);
        Assert.Equal(ValidUpstreamJson, content.Content);
        Assert.Equal("application/json; charset=utf-8", content.ContentType);
        Assert.Equal(request.AlertId, reader.RequestedAlertId);
        Assert.Equal("/api/v1/rca", handler.Path);

        using var body = JsonDocument.Parse(Assert.IsType<string>(handler.Body));
        var targetEvent = body.RootElement.GetProperty("target_event");
        Assert.Equal(context.EventId.ToString(), targetEvent.GetProperty("event_id").GetString());
        Assert.Equal(context.AssetId.ToString(), targetEvent.GetProperty("asset_id").GetString());
        Assert.Equal(context.OccurredAt.UtcDateTime, targetEvent.GetProperty("timestamp").GetDateTime());
        Assert.Equal("vibration_trend", targetEvent.GetProperty("type").GetString());
        Assert.Equal("critical", targetEvent.GetProperty("severity").GetString());
        Assert.Equal("backend_alert_rca", targetEvent.GetProperty("source").GetString());
        Assert.Equal(
            context.Evidence,
            targetEvent.GetProperty("payload").GetProperty("extra").GetProperty("evidence").GetString());
    }

    [Fact]
    public async Task AnalyzeReturnsNotFoundWithoutCallingUpstreamForUnknownAlert()
    {
        var handler = new RecordingHandler(HttpStatusCode.OK, ValidUpstreamJson);
        var controller = CreateController(
            handler,
            new FakeAlertContextReader(context: null),
            enabled: true);

        var result = await controller.Analyze(CreateRequest(), CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status404NotFound, problem.StatusCode);
        Assert.Equal(0, handler.CallCount);
    }

    [Fact]
    public async Task AnalyzeDoesNotLeakUpstreamErrorBody()
    {
        var handler = new RecordingHandler(
            HttpStatusCode.UnprocessableEntity,
            """{"detail":"sensitive upstream validation internals"}""");
        var controller = CreateController(
            handler,
            new FakeAlertContextReader(CreateContext()),
            enabled: true);

        var result = await controller.Analyze(CreateRequest(), CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status502BadGateway, problem.StatusCode);
        Assert.DoesNotContain("sensitive upstream validation internals", problem.Value?.ToString());
    }

    [Fact]
    public async Task AnalyzeRejectsOversizedStoredEvidenceWithoutCallingUpstream()
    {
        var handler = new RecordingHandler(HttpStatusCode.OK, ValidUpstreamJson);
        var context = CreateContext() with { Evidence = new string('é', 10_241) };
        var controller = CreateController(
            handler,
            new FakeAlertContextReader(context),
            enabled: true);

        var result = await controller.Analyze(CreateRequest(), CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, problem.StatusCode);
        Assert.Equal(0, handler.CallCount);
    }

    [Fact]
    public async Task AnalyzeRejectsOversizedSuccessfulUpstreamResponse()
    {
        var oversizedJson = $$"""{"rca":"{{new string('x', (1024 * 1024) + 1)}}"}""";
        var handler = new RecordingHandler(HttpStatusCode.OK, oversizedJson);
        var controller = CreateController(
            handler,
            new FakeAlertContextReader(CreateContext()),
            enabled: true);

        var result = await controller.Analyze(CreateRequest(), CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status502BadGateway, problem.StatusCode);
    }

    [Theory]
    [InlineData("""{"unexpected":{}}""")]
    [InlineData("""{"rca":[]}""")]
    [InlineData("""{"rca":{"root_cause_event_id":"root-1","confidence_score":"high"}}""")]
    [InlineData("""
        {
          "rca": {
            "rca_id": "id",
            "timestamp": "2026-07-28T14:31:00Z",
            "root_cause_event_id": "root-1",
            "root_cause_type": "raw_alarm",
            "root_cause_asset_id": "asset-1",
            "root_cause_description": "description",
            "causal_chain": {},
            "causal_chain_events": [],
            "confidence_score": 0.5,
            "recommended_actions": []
          }
        }
        """)]
    [InlineData("""
        {
          "rca": {
            "rca_id": "id",
            "timestamp": "2026-07-28T14:31:00Z",
            "root_cause_event_id": "root-1",
            "root_cause_type": "raw_alarm",
            "root_cause_asset_id": "asset-1",
            "root_cause_description": "description",
            "causal_chain": ["root-1"],
            "causal_chain_events": [{}],
            "confidence_score": 0.5,
            "recommended_actions": []
          }
        }
        """)]
    public async Task AnalyzeRejectsValidJsonWithWrongRcaShape(string upstreamJson)
    {
        var handler = new RecordingHandler(HttpStatusCode.OK, upstreamJson);
        var controller = CreateController(
            handler,
            new FakeAlertContextReader(CreateContext()),
            enabled: true);

        var result = await controller.Analyze(CreateRequest(), CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status502BadGateway, problem.StatusCode);
    }

    [Fact]
    public async Task AnalyzeAcceptsExplicitNullRcaResult()
    {
        const string upstreamJson = """{"rca":null}""";
        var handler = new RecordingHandler(HttpStatusCode.OK, upstreamJson);
        var controller = CreateController(
            handler,
            new FakeAlertContextReader(CreateContext()),
            enabled: true);

        var result = await controller.Analyze(CreateRequest(), CancellationToken.None);

        var content = Assert.IsType<ContentResult>(result);
        Assert.Equal(upstreamJson, content.Content);
    }

    private static RcaController CreateController(
        RecordingHandler handler,
        IRcaAlertContextReader alertContextReader,
        bool enabled)
    {
        var client = new HttpClient(handler)
        {
            BaseAddress = new Uri("http://cep-staging/"),
        };

        return new RcaController(
            new SingleClientFactory(client),
            alertContextReader,
            Options.Create(new CepStagingOptions { Enabled = enabled }),
            NullLogger<RcaController>.Instance);
    }

    private static RcaRequest CreateRequest() => new()
    {
        AlertId = Guid.Parse("11111111-1111-1111-1111-111111111111"),
    };

    private static RcaAlertContext CreateContext() => new(
        AlertId: Guid.Parse("11111111-1111-1111-1111-111111111111"),
        EventId: Guid.Parse("55555555-5555-5555-5555-555555555555"),
        AssetId: Guid.Parse("22222222-2222-2222-2222-222222222222"),
        OccurredAt: DateTimeOffset.Parse("2026-07-28T14:30:00Z"),
        EventType: "raw_alarm",
        RuleId: "generic-alarm",
        Severity: "warning",
        Evidence: """{"alarmCode":"E-42"}""");

    private sealed class FakeAlertContextReader(RcaAlertContext? context) : IRcaAlertContextReader
    {
        public int CallCount { get; private set; }
        public Guid? RequestedAlertId { get; private set; }

        public Task<RcaAlertContext?> FindAsync(
            Guid alertId,
            CancellationToken cancellationToken)
        {
            CallCount++;
            RequestedAlertId = alertId;
            return Task.FromResult(context);
        }
    }

    private sealed class SingleClientFactory(HttpClient client) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name)
        {
            Assert.Equal(CepStagingPublisher.HttpClientName, name);
            return client;
        }
    }

    private sealed class RecordingHandler(
        HttpStatusCode statusCode,
        string content) : HttpMessageHandler
    {
        public int CallCount { get; private set; }
        public string? Path { get; private set; }
        public string? Body { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            CallCount++;
            Path = request.RequestUri?.AbsolutePath;
            Body = request.Content is null
                ? null
                : await request.Content.ReadAsStringAsync(cancellationToken);

            var responseContent = new StreamContent(
                new MemoryStream(Encoding.UTF8.GetBytes(content), writable: false));
            responseContent.Headers.ContentType =
                new System.Net.Http.Headers.MediaTypeHeaderValue("application/json");

            return new HttpResponseMessage(statusCode) { Content = responseContent };
        }
    }
}
