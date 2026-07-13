using Fusion.Adapter.Configuration;
using Fusion.Adapter.Mapping;
using Fusion.Adapter.Outbox;
using Fusion.Adapter.Transport;
using Microsoft.Extensions.Options;

var builder = Host.CreateApplicationBuilder(args);

builder.Services.Configure<OpenDataFusionOptions>(
    builder.Configuration.GetSection(OpenDataFusionOptions.SectionName));
builder.Services.AddSingleton(sp => sp.GetRequiredService<IOptions<OpenDataFusionOptions>>().Value);
builder.Services.AddSingleton<IFusionOutboxRepository>(sp =>
    new FusionOutboxRepository(builder.Configuration.GetConnectionString("MkzOperations") ?? string.Empty));
builder.Services.AddSingleton<OpenDataFusionBundleMapper>();
builder.Services.AddSingleton<FusionOutboxDispatcher>();

builder.Services.AddHttpClient("odf-token");
builder.Services.AddSingleton<IAccessTokenProvider>(sp =>
    new ClientCredentialsAccessTokenProvider(
        sp.GetRequiredService<IHttpClientFactory>().CreateClient("odf-token"),
        sp.GetRequiredService<OpenDataFusionOptions>().Authentication));
builder.Services.AddHttpClient<OpenDataFusionClient>((sp, client) =>
{
    var options = sp.GetRequiredService<OpenDataFusionOptions>();
    client.Timeout = TimeSpan.FromSeconds(Math.Max(options.RequestTimeoutSeconds, 1));
});
builder.Services.AddTransient<IOpenDataFusionClient>(sp => sp.GetRequiredService<OpenDataFusionClient>());
builder.Services.AddHostedService<FusionOutboxWorker>();

await builder.Build().RunAsync();
