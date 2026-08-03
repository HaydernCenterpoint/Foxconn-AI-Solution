namespace Fusion.Adapter.Configuration;

public sealed class OpenDataFusionOptions
{
    public const string SectionName = "OpenDataFusion";

    public bool CaptureEnabled { get; init; }
    public bool DispatchEnabled { get; init; }
    public string BaseUrl { get; init; } = "http://127.0.0.1:54310/";
    public string TenantId { get; init; } = string.Empty;
    public string ProjectId { get; init; } = string.Empty;
    public string PlantExternalId { get; init; } = "mkz:plant:site-a";
    public string PlantName { get; init; } = "Site A";
    public int BatchSize { get; init; } = 50;
    public int LeaseSeconds { get; init; } = 30;
    public int MaxAttempts { get; init; } = 12;
    public int PollIntervalSeconds { get; init; } = 1;
    public int RequestTimeoutSeconds { get; init; } = 10;
    public OpenDataFusionAuthenticationOptions Authentication { get; init; } = new();
}

public sealed class OpenDataFusionAuthenticationOptions
{
    public string Mode { get; init; } = "development";
    public string MaterialReference { get; init; } = string.Empty;
    public string DevelopmentUser { get; init; } = "local-user";
    public string FactorySecret { get; init; } = string.Empty;
    public string FactoryIssuer { get; init; } = "MKZ_PLC_Server";
    public string FactoryAudience { get; init; } = "MKZ_PLC_Client";
    public string FactorySubject { get; init; } = "service-account-open-data-fusion-connector";
    public string FactoryRole { get; init; } = "ENGINEER";
    public string TokenEndpoint { get; init; } = string.Empty;
    public string ClientId { get; init; } = string.Empty;
    public string ClientSecret { get; init; } = string.Empty;
    public string Scope { get; init; } = string.Empty;
}
