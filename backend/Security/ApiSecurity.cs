using System.Globalization;
using System.Net;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using AspNetCoreIpNetwork = Microsoft.AspNetCore.HttpOverrides.IPNetwork;

namespace backend.Security;

public static class ApiSecurity
{
    public const string LoginRateLimitPolicy = "login";
    public const string HealthRateLimitPolicy = "health";

    public static AuthorizationPolicy AuthenticatedFallbackPolicy { get; } =
        new AuthorizationPolicyBuilder()
            .RequireAuthenticatedUser()
            .Build();

    public static JwtBearerEvents CreateJwtBearerEvents() => new()
    {
        OnMessageReceived = context =>
        {
            context.Token = FiiSso.CookieToken(context.Request);
            return Task.CompletedTask;
        },
        OnChallenge = async context =>
        {
            context.HandleResponse();
            context.Response.Headers.WWWAuthenticate = JwtBearerDefaults.AuthenticationScheme;
            await ApiProblemResponse.WriteAsync(
                context.HttpContext,
                StatusCodes.Status401Unauthorized,
                "Authentication is required to access this resource.",
                "Unauthorized",
                context.HttpContext.RequestAborted);
        },
        OnForbidden = context => ApiProblemResponse.WriteAsync(
            context.HttpContext,
            StatusCodes.Status403Forbidden,
            "The authenticated user does not have permission to access this resource.",
            "Forbidden",
            context.HttpContext.RequestAborted),
    };

    public static IServiceCollection AddFiiApiRateLimiting(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var globalPermitLimit = PositiveSetting(
            configuration,
            "RateLimiting:GlobalPermitLimit",
            600);
        var loginPermitLimit = PositiveSetting(
            configuration,
            "RateLimiting:LoginPermitLimit",
            10);
        var healthPermitLimit = PositiveSetting(
            configuration,
            "RateLimiting:HealthPermitLimit",
            30);
        var windowSeconds = PositiveSetting(
            configuration,
            "RateLimiting:WindowSeconds",
            60);
        var window = TimeSpan.FromSeconds(windowSeconds);

        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.OnRejected = async (context, cancellationToken) =>
            {
                var retryAfter = context.Lease.TryGetMetadata(
                    MetadataName.RetryAfter,
                    out var estimate)
                    ? estimate
                    : window;
                context.HttpContext.Response.Headers.RetryAfter = Math.Max(
                    1,
                    (int)Math.Ceiling(retryAfter.TotalSeconds)
                ).ToString(CultureInfo.InvariantCulture);
                await ApiProblemResponse.WriteAsync(
                    context.HttpContext,
                    StatusCodes.Status429TooManyRequests,
                    "The request rate limit has been exceeded.",
                    "Too many requests",
                    cancellationToken);
            };

            options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(
                context => RateLimitPartition.GetFixedWindowLimiter(
                    PartitionKey(context),
                    _ => FixedWindow(globalPermitLimit, window)));

            options.AddPolicy(
                LoginRateLimitPolicy,
                context => RateLimitPartition.GetFixedWindowLimiter(
                    ClientIpKey(context),
                    _ => FixedWindow(loginPermitLimit, window)));
            options.AddPolicy(
                HealthRateLimitPolicy,
                context => RateLimitPartition.GetFixedWindowLimiter(
                    ClientIpKey(context),
                    _ => FixedWindow(healthPermitLimit, window)));
        });
        return services;
    }

    public static IServiceCollection AddFiiForwardedHeaders(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders =
                ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            options.ForwardLimit = PositiveSetting(
                configuration,
                "ForwardedHeaders:ForwardLimit",
                1);

            foreach (var value in configuration
                .GetSection("ForwardedHeaders:KnownProxies")
                .Get<string[]>() ?? [])
            {
                if (!IPAddress.TryParse(value, out var proxy))
                {
                    throw new InvalidOperationException(
                        $"ForwardedHeaders:KnownProxies contains invalid IP address '{value}'.");
                }

                options.KnownProxies.Add(proxy);
            }

            foreach (var value in configuration
                .GetSection("ForwardedHeaders:KnownNetworks")
                .Get<string[]>() ?? [])
            {
                if (!AspNetCoreIpNetwork.TryParse(value, out var network))
                {
                    throw new InvalidOperationException(
                        $"ForwardedHeaders:KnownNetworks contains invalid CIDR '{value}'.");
                }

                options.KnownNetworks.Add(network);
            }
        });
        return services;
    }

    private static FixedWindowRateLimiterOptions FixedWindow(int permitLimit, TimeSpan window) =>
        new()
        {
            AutoReplenishment = true,
            PermitLimit = permitLimit,
            QueueLimit = 0,
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
            Window = window,
        };

    private static string PartitionKey(HttpContext context)
    {
        var username = context.User.Identity?.Name;
        return !string.IsNullOrWhiteSpace(username)
            ? $"user:{username}"
            : $"ip:{ClientIpKey(context)}";
    }

    private static string ClientIpKey(HttpContext context) =>
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown";

    private static int PositiveSetting(
        IConfiguration configuration,
        string key,
        int fallback)
    {
        var configured = configuration.GetValue<int?>(key);
        return configured is > 0 ? configured.Value : fallback;
    }
}
