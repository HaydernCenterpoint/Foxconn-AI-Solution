using System.Text.Json;
using backend.Configuration;
using backend.Middleware;
using backend.Services;
using backend.Security;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;

var builder = WebApplication.CreateBuilder(args);

if (args.Contains("--timescale-backfill", StringComparer.OrdinalIgnoreCase))
{
    builder.Services.Configure<TimescaleOptions>(
        builder.Configuration.GetSection(TimescaleOptions.SectionName));
    builder.Services.AddSingleton<TimescaleTelemetryService>();
    builder.Services.AddSingleton<TimescaleBackfillRunner>();

    var backfillApp = builder.Build();
    var copied = await backfillApp.Services.GetRequiredService<TimescaleBackfillRunner>().RunAsync();
    Console.WriteLine($"[Timescale] Backfill complete: copied {copied} source rows.");
    return;
}

// Initialize CryptoHelper from configuration
var mqttEncryptionKey = builder.Configuration["Mqtt:EncryptionKey"]
    ?? throw new InvalidOperationException("Mqtt:EncryptionKey is required.");
CryptoHelper.Initialize(mqttEncryptionKey);

// Add services to the container.
builder.Services.AddControllers();
builder.Services.Configure<OpenDataFusionCaptureOptions>(
    builder.Configuration.GetSection(OpenDataFusionCaptureOptions.SectionName));
builder.Services.Configure<TimescaleOptions>(
    builder.Configuration.GetSection(TimescaleOptions.SectionName));
builder.Services.Configure<CepStagingOptions>(
    builder.Configuration.GetSection(CepStagingOptions.SectionName));

// Swagger configuration
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "MKZ Factory API", Version = "v1" });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "JWT Authorization header using the Bearer scheme. Example: \"Authorization: Bearer {token}\"",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.ApiKey,
        Scheme = "Bearer"
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
            },
            Array.Empty<string>()
        }
    });
});

// Register Custom Services
builder.Services.AddSingleton<DatabaseService>();
builder.Services.AddSingleton<TimescaleTelemetryService>();
builder.Services.AddSingleton<TimescaleBackfillRunner>();
builder.Services.AddHttpClient(CepStagingPublisher.HttpClientName, (serviceProvider, client) =>
{
    var options = serviceProvider.GetRequiredService<Microsoft.Extensions.Options.IOptions<CepStagingOptions>>().Value;
    if (Uri.TryCreate(options.BaseUrl, UriKind.Absolute, out var baseAddress))
    {
        client.BaseAddress = new Uri(baseAddress.AbsoluteUri.TrimEnd('/') + "/");
    }

    client.Timeout = TimeSpan.FromSeconds(Math.Clamp(options.RequestTimeoutSeconds, 1, 30));
});
builder.Services.AddSingleton<CepStagingPublisher>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<CepStagingPublisher>());
builder.Services.AddSingleton<TelemetryStore>();
builder.Services.AddSingleton<IAuditService, AuditService>();

// Phase 2: Product Intelligence Services
builder.Services.AddSingleton<AlertService>();
builder.Services.AddSingleton<HealthScoringService>();
builder.Services.AddSingleton<PredictiveService>();
builder.Services.AddHostedService<HealthScoringJob>();

builder.Services.AddSignalR();
builder.Services.AddSingleton<TelemetryIngestionService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<TelemetryIngestionService>());
builder.Services.AddSingleton<SyncService>();

builder.Services.AddHostedService<MqttServerService>();
// builder.Services.AddHostedService<SimulationService>();

// Configure JWT Bearer Authentication
var signingKey = FiiSso.SigningKey(builder.Configuration);
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            context.Token = FiiSso.CookieToken(context.Request);
            return Task.CompletedTask;
        },
    };
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "MKZ_PLC_Server",
        ValidAudience = builder.Configuration["Jwt:Audience"] ?? "MKZ_PLC_Client",
        IssuerSigningKey = signingKey,
        ClockSkew = TimeSpan.Zero,
    };
});

builder.Services.AddAuthorization();

// Configure CORS Whitelist
var allowedOrigins = builder.Configuration.GetSection("AllowedOrigins").Get<string[]>()
    ?? new[] { "http://localhost:5173" };

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(allowedOrigins)
              .AllowAnyMethod()
              .AllowAnyHeader()
              .AllowCredentials();
    });
});

// Configure Health Checks
builder.Services.AddHealthChecks()
    .AddNpgSql(builder.Configuration.GetConnectionString("DefaultConnection") ?? "");

var app = builder.Build();

// Configure the HTTP request pipeline.
app.UseMiddleware<ExceptionHandlingMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "MKZ Factory API v1"));
}

app.UseCors();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHub<backend.Hubs.TelemetryHub>("/hubs/telemetry");

// Map Health Checks Endpoint
app.MapHealthChecks("/api/health", new HealthCheckOptions
{
    ResponseWriter = async (context, report) =>
    {
        context.Response.ContentType = "application/json";
        var result = JsonSerializer.Serialize(new
        {
            status = report.Status.ToString(),
            checks = report.Entries.Select(e => new { name = e.Key, status = e.Value.Status.ToString() })
        });
        await context.Response.WriteAsync(result);
    }
});

app.Run();
