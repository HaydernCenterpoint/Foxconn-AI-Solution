using System.Net;
using System.Net.Http.Headers;
using System.ComponentModel.DataAnnotations;
using System.Reflection;
using System.Text;
using System.Text.Json;
using backend.Controllers;
using backend.Middleware;
using backend.Security;
using backend.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Mvc.Routing;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.IdentityModel.Tokens;
using Mkz.Fusion.Contracts;

namespace backend.Tests;

public sealed class ApiSecurityContractTests
{
    private const string Secret = "api-security-contract-secret-that-is-at-least-32-bytes";

    [Fact]
    public void OnlyAuthenticationEntryPoints_AllowAnonymousControllerAccess()
    {
        var anonymousEndpoints = typeof(AuthController).Assembly
            .GetTypes()
            .Where(type => !type.IsAbstract && typeof(ControllerBase).IsAssignableFrom(type))
            .SelectMany(type =>
            {
                var endpoints = new List<string>();
                if (type.GetCustomAttribute<AllowAnonymousAttribute>() is not null)
                {
                    endpoints.Add($"{type.Name}.*");
                }
                endpoints.AddRange(type
                    .GetMethods(BindingFlags.Instance | BindingFlags.Public | BindingFlags.DeclaredOnly)
                    .Where(method => method.GetCustomAttribute<AllowAnonymousAttribute>() is not null)
                    .Select(method => $"{type.Name}.{method.Name}"));
                return endpoints;
            })
            .OrderBy(endpoint => endpoint)
            .ToArray();

        Assert.Equal(
            new[] { "AuthController.Login", "AuthController.Logout" },
            anonymousEndpoints);
    }

    [Fact]
    public void NonAuthenticationMutations_RequireOperatorRoles()
    {
        var operatorRoles = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "ADMIN",
            "ENGINEER",
        };
        var authenticationEntries = new HashSet<string>(StringComparer.Ordinal)
        {
            $"{nameof(AuthController)}.{nameof(AuthController.Login)}",
            $"{nameof(AuthController)}.{nameof(AuthController.Logout)}",
        };
        var failures = typeof(AuthController).Assembly
            .GetTypes()
            .Where(type => !type.IsAbstract && typeof(ControllerBase).IsAssignableFrom(type))
            .SelectMany(type => type
                .GetMethods(BindingFlags.Instance | BindingFlags.Public | BindingFlags.DeclaredOnly)
                .Select(method => (Controller: type, Method: method)))
            .Where(endpoint => endpoint.Method
                .GetCustomAttributes(inherit: true)
                .OfType<IActionHttpMethodProvider>()
                .SelectMany(attribute => attribute.HttpMethods)
                .Any(verb => verb is "POST" or "PUT" or "PATCH" or "DELETE"))
            .Where(endpoint => !authenticationEntries.Contains(
                $"{endpoint.Controller.Name}.{endpoint.Method.Name}"))
            .Where(endpoint =>
            {
                var allowsAnonymous = endpoint.Controller
                    .GetCustomAttributes<AllowAnonymousAttribute>(inherit: true)
                    .Any()
                    || endpoint.Method
                        .GetCustomAttributes<AllowAnonymousAttribute>(inherit: true)
                        .Any();
                var roleSets = endpoint.Controller
                    .GetCustomAttributes<AuthorizeAttribute>(inherit: true)
                    .Concat(endpoint.Method.GetCustomAttributes<AuthorizeAttribute>(inherit: true))
                    .Where(attribute => !string.IsNullOrWhiteSpace(attribute.Roles))
                    .Select(attribute => attribute.Roles!.Split(
                        ',',
                        StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries));
                return allowsAnonymous
                    || !roleSets.Any(roles =>
                        roles.Length > 0 && roles.All(operatorRoles.Contains));
            })
            .Select(endpoint => $"{endpoint.Controller.Name}.{endpoint.Method.Name}")
            .OrderBy(endpoint => endpoint)
            .ToArray();

        Assert.True(
            failures.Length == 0,
            $"Mutation actions without operator-role authorization: {string.Join(", ", failures)}");
    }

    [Fact]
    public async Task ResultFilter_NormalizesErrorsAndHidesServerDetails()
    {
        var result = await ApplyResultFilter(
            new ObjectResult(new { error = "database password leaked" })
            {
                StatusCode = StatusCodes.Status500InternalServerError,
            });
        var problem = Assert.IsType<ProblemDetails>(result.Value);
        Assert.Equal(StatusCodes.Status500InternalServerError, problem.Status);
        Assert.Equal("Please try again later.", problem.Detail);
        Assert.DoesNotContain("password", JsonSerializer.Serialize(problem), StringComparison.OrdinalIgnoreCase);
        Assert.Contains(ApiConventionV1.ProblemMediaType, result.ContentTypes);
    }

    [Fact]
    public async Task ResultFilter_NormalizesExistingProblemDetails()
    {
        var validation = new ValidationProblemDetails(
            new Dictionary<string, string[]>
            {
                ["limit"] = ["The field limit must be between 1 and 1000."],
            })
        {
            Status = StatusCodes.Status400BadRequest,
            Detail = "Validation failed.",
        };

        var result = await ApplyResultFilter(new ObjectResult(validation)
        {
            StatusCode = StatusCodes.Status400BadRequest,
        });

        var problem = Assert.IsType<ValidationProblemDetails>(result.Value);
        Assert.Same(validation, problem);
        Assert.Equal("Validation failed.", problem.Extensions["error"]);
        Assert.True(problem.Extensions.ContainsKey("traceId"));
        Assert.True(problem.Errors.ContainsKey("limit"));
        Assert.Contains(ApiConventionV1.ProblemMediaType, result.ContentTypes);

        var serverError = await ApplyResultFilter(new ObjectResult(new ProblemDetails
        {
            Status = StatusCodes.Status500InternalServerError,
            Detail = "database password leaked",
        })
        {
            StatusCode = StatusCodes.Status500InternalServerError,
        });
        var sanitized = Assert.IsType<ProblemDetails>(serverError.Value);
        Assert.Equal("Please try again later.", sanitized.Detail);
        Assert.Equal("Please try again later.", sanitized.Extensions["error"]);
    }

    [Fact]
    public async Task ExceptionMiddleware_RethrowsWhenResponseHasStarted()
    {
        var middleware = new ExceptionHandlingMiddleware(
            _ => throw new InvalidOperationException("response failed"),
            NullLogger<ExceptionHandlingMiddleware>.Instance);
        var features = new FeatureCollection();
        features.Set<IHttpResponseFeature>(new StartedResponseFeature());
        var context = new DefaultHttpContext(features);

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => middleware.InvokeAsync(context));
    }

    [Theory]
    [InlineData(typeof(AssetController), nameof(AssetController.List), "limit", 1000)]
    [InlineData(typeof(AssetController), nameof(AssetController.Tree), "limit", 5000)]
    [InlineData(typeof(MachineController), nameof(MachineController.GetAllMachines), "limit", 1000)]
    [InlineData(typeof(ProductionLineController), nameof(ProductionLineController.GetLines), "limit", 1000)]
    [InlineData(typeof(AlarmsController), nameof(AlarmsController.GetAlarms), "limit", 1000)]
    [InlineData(typeof(AlertController), nameof(AlertController.GetAlerts), "limit", 1000)]
    [InlineData(typeof(EventLogController), nameof(EventLogController.GetEvents), "limit", 1000)]
    [InlineData(typeof(TelemetryController), nameof(TelemetryController.GetLog), "count", 200)]
    [InlineData(typeof(TelemetryController), nameof(TelemetryController.GetTimescalePoints), "limit", 1000)]
    [InlineData(typeof(TelemetryQueryController), nameof(TelemetryQueryController.Query), "limit", 10000)]
    public void ExpensiveQueries_HaveBoundedInput(
        Type controllerType,
        string methodName,
        string parameterName,
        int maximum)
    {
        var method = controllerType.GetMethod(methodName);
        Assert.NotNull(method);
        var parameter = Assert.Single(
            method.GetParameters(),
            item => item.Name == parameterName);
        var range = Assert.Single(parameter.GetCustomAttributes<RangeAttribute>());

        Assert.Equal(1, Convert.ToInt32(range.Minimum));
        Assert.Equal(maximum, Convert.ToInt32(range.Maximum));
    }

    [Fact]
    public async Task QueryWindowsAndReportFilters_FailBeforeDatabaseAccess()
    {
        var now = DateTime.UtcNow;
        var telemetry = new TelemetryQueryController(null!);
        var telemetryResult = await telemetry.Query(
            Guid.NewGuid(),
            "oee",
            now,
            now.AddMinutes(-1),
            100);
        AssertProblem(telemetryResult, "from must be before");

        var health = new AssetHealthController(
            null!,
            NullLogger<AssetHealthController>.Instance);
        var healthResult = await health.GetHealthHistory(
            Guid.NewGuid(),
            now,
            now.AddMinutes(-1));
        AssertProblem(healthResult, "from must be before");
        var longHealthResult = await health.GetHealthHistory(
            Guid.NewGuid(),
            now.AddDays(-32),
            now);
        AssertProblem(longHealthResult, "cannot exceed 31 days");

        var telemetryLongResult = await telemetry.Query(
            Guid.NewGuid(),
            "oee",
            now.AddDays(-32),
            now,
            100);
        AssertProblem(telemetryLongResult, "cannot exceed 31 days");

        var alert = new AlertController(
            null!,
            Configuration(),
            NullLogger<AlertController>.Instance);
        var alertResult = await alert.GetAlerts(
            null,
            null,
            null,
            now.AddDays(-32),
            now,
            100);
        AssertProblem(alertResult, "cannot exceed 31 days");

        var events = new EventLogController(null!);
        var eventResult = await events.GetEvents(
            null,
            null,
            null,
            now,
            now.AddMinutes(-1),
            100);
        AssertProblem(eventResult, "from must be before");

        var reports = new ReportsController(null!);
        var reportResult = await reports.QueryReports(
            "not-a-range",
            "all",
            "all",
            "hour");
        AssertProblem(reportResult, "Unsupported timeRange");
    }

    [Fact]
    public async Task SyncBatchLimits_FailBeforeServiceAccess()
    {
        var controller = new SyncController(null!);
        var oversizedBatch = new BatchUploadRequest
        {
            MachineId = "machine-1",
            Records = Enumerable
                .Range(0, SyncService.MaxBatchRecords + 1)
                .Select(index => new TelemetryRecordDto
                {
                    Sequence = index,
                    RawJson = "{}",
                })
                .ToList(),
        };
        var batchResult = await controller.UploadBatch(oversizedBatch);
        AssertProblem(batchResult, $"more than {SyncService.MaxBatchRecords}");

        var oversizedRecord = new BatchUploadRequest
        {
            MachineId = "machine-1",
            Records =
            [
                new TelemetryRecordDto
                {
                    RawJson = new string('x', SyncService.MaxRawJsonLength + 1),
                },
            ],
        };
        var recordResult = await controller.UploadBatch(oversizedRecord);
        AssertProblem(recordResult, "rawJson cannot exceed");

        var registerResult = await controller.Register(new SyncRegisterRequest
        {
            MachineId = new string('x', SyncService.MaxMachineIdLength + 1),
        });
        AssertProblem(registerResult, "machineId cannot exceed");
    }

    [Fact]
    public async Task SecurityPipeline_ReturnsProblemJsonFor401_403_And429()
    {
        var configuration = Configuration();
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            EnvironmentName = "Testing",
        });
        builder.Logging.ClearProviders();
        builder.Configuration.AddConfiguration(configuration);
        builder.WebHost.ConfigureKestrel(options => options.Listen(IPAddress.Loopback, 0));
        builder.Services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.Events = ApiSecurity.CreateJwtBearerEvents();
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidateAudience = true,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    ValidIssuer = "MKZ_PLC_Server",
                    ValidAudience = "MKZ_PLC_Client",
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Secret)),
                    ClockSkew = TimeSpan.Zero,
                };
            });
        builder.Services.AddAuthorizationBuilder()
            .SetFallbackPolicy(ApiSecurity.AuthenticatedFallbackPolicy);
        builder.Services.AddFiiApiRateLimiting(builder.Configuration);
        builder.Services.AddFiiForwardedHeaders(builder.Configuration);

        var app = builder.Build();
        app.UseForwardedHeaders();
        app.UseRouting();
        app.UseAuthentication();
        app.UseRateLimiter();
        app.UseAuthorization();
        app.MapGet("/open", () => Results.Ok())
            .AllowAnonymous()
            .DisableRateLimiting();
        app.MapGet("/protected", () => Results.Ok());
        app.MapGet("/admin", () => Results.Ok())
            .RequireAuthorization(policy => policy.RequireRole("ADMIN"));
        app.MapPost("/login", () => Results.Ok())
            .AllowAnonymous()
            .RequireRateLimiting(ApiSecurity.LoginRateLimitPolicy);
        app.MapGet("/health", () => Results.Ok())
            .AllowAnonymous()
            .RequireRateLimiting(ApiSecurity.HealthRateLimitPolicy);

        await app.StartAsync();
        try
        {
            var server = app.Services.GetRequiredService<IServer>();
            var address = Assert.Single(
                server.Features.Get<IServerAddressesFeature>()!.Addresses);
            using var client = new HttpClient { BaseAddress = new Uri(address) };

            using var unauthorized = await client.GetAsync("/protected");
            Assert.Equal(HttpStatusCode.Unauthorized, unauthorized.StatusCode);
            Assert.Contains(
                JwtBearerDefaults.AuthenticationScheme,
                unauthorized.Headers.WwwAuthenticate.Select(value => value.Scheme));
            await AssertProblemJson(unauthorized, StatusCodes.Status401Unauthorized);

            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
                JwtBearerDefaults.AuthenticationScheme,
                FiiSso.Issue("guest", "GUEST", configuration).Value);
            using var forbidden = await client.GetAsync("/admin");
            Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
            await AssertProblemJson(forbidden, StatusCodes.Status403Forbidden);

            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
                JwtBearerDefaults.AuthenticationScheme,
                FiiSso.Issue("admin", "ADMIN", configuration).Value);
            using var allowed = await client.GetAsync("/admin");
            Assert.Equal(HttpStatusCode.OK, allowed.StatusCode);

            client.DefaultRequestHeaders.Authorization = null;
            using var firstLogin = await client.SendAsync(
                Request(HttpMethod.Post, "/login", "203.0.113.10"));
            using var secondLogin = await client.SendAsync(
                Request(HttpMethod.Post, "/login", "203.0.113.10"));
            using var limited = await client.SendAsync(
                Request(HttpMethod.Post, "/login", "203.0.113.10"));
            using var otherClient = await client.SendAsync(
                Request(HttpMethod.Post, "/login", "203.0.113.11"));
            Assert.Equal(HttpStatusCode.OK, firstLogin.StatusCode);
            Assert.Equal(HttpStatusCode.OK, secondLogin.StatusCode);
            Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
            Assert.Equal(HttpStatusCode.OK, otherClient.StatusCode);
            Assert.True(limited.Headers.TryGetValues("Retry-After", out var retryAfter));
            Assert.True(int.Parse(Assert.Single(retryAfter)) > 0);
            await AssertProblemJson(limited, StatusCodes.Status429TooManyRequests);

            using var firstHealth = await client.SendAsync(
                Request(HttpMethod.Get, "/health", "203.0.113.20"));
            using var limitedHealth = await client.SendAsync(
                Request(HttpMethod.Get, "/health", "203.0.113.20"));
            Assert.Equal(HttpStatusCode.OK, firstHealth.StatusCode);
            Assert.Equal(HttpStatusCode.TooManyRequests, limitedHealth.StatusCode);

            using var open = await client.GetAsync("/open");
            Assert.Equal(HttpStatusCode.OK, open.StatusCode);
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    private static IConfiguration Configuration() =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Key"] = Secret,
                ["Jwt:Issuer"] = "MKZ_PLC_Server",
                ["Jwt:Audience"] = "MKZ_PLC_Client",
                ["ConnectionStrings:Timescale"] = "Host=localhost",
                ["RateLimiting:GlobalPermitLimit"] = "100",
                ["RateLimiting:LoginPermitLimit"] = "2",
                ["RateLimiting:HealthPermitLimit"] = "1",
                ["RateLimiting:WindowSeconds"] = "60",
            })
            .Build();

    private static HttpRequestMessage Request(
        HttpMethod method,
        string path,
        string forwardedFor)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.TryAddWithoutValidation("X-Forwarded-For", forwardedFor);
        return request;
    }

    private static async Task<ObjectResult> ApplyResultFilter(ObjectResult input)
    {
        var httpContext = new DefaultHttpContext();
        httpContext.Request.Path = "/api/test";
        var actionContext = new ActionContext(
            httpContext,
            new RouteData(),
            new ActionDescriptor());
        var filters = new List<IFilterMetadata>();
        var executing = new ResultExecutingContext(
            actionContext,
            filters,
            input,
            controller: null!);
        var filter = new ProblemDetailsResultFilter();

        await filter.OnResultExecutionAsync(
            executing,
            () => Task.FromResult(new ResultExecutedContext(
                actionContext,
                filters,
                executing.Result,
                controller: null!)));

        return Assert.IsType<ObjectResult>(executing.Result);
    }

    private static async Task AssertProblemJson(HttpResponseMessage response, int status)
    {
        Assert.Equal(ApiConventionV1.ProblemMediaType, response.Content.Headers.ContentType?.MediaType);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(status, document.RootElement.GetProperty("status").GetInt32());
        Assert.True(document.RootElement.TryGetProperty("detail", out _));
        Assert.True(document.RootElement.TryGetProperty("error", out _));
        Assert.True(document.RootElement.TryGetProperty("traceId", out _));
    }

    private static void AssertProblem(IActionResult result, string detail)
    {
        var objectResult = Assert.IsType<ObjectResult>(result);
        var problem = Assert.IsType<ProblemDetails>(objectResult.Value);
        Assert.Equal(StatusCodes.Status400BadRequest, problem.Status);
        Assert.Contains(detail, problem.Detail);
    }

    private sealed class StartedResponseFeature : IHttpResponseFeature
    {
        public int StatusCode { get; set; } = StatusCodes.Status200OK;
        public string? ReasonPhrase { get; set; }
        public IHeaderDictionary Headers { get; set; } = new HeaderDictionary();
        public Stream Body { get; set; } = Stream.Null;
        public bool HasStarted => true;

        public void OnCompleted(Func<object, Task> callback, object state)
        {
        }

        public void OnStarting(Func<object, Task> callback, object state)
        {
        }
    }
}
