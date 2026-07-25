namespace Mkz.Fusion.Contracts;

public static class ContractV1
{
    public const string Version = "v1";
    public const int SchemaVersion = 1;
}

public static class ApiConventionV1
{
    public const string RoutePrefix = "api/v1";
    public const string BasePath = "/" + RoutePrefix;
    public const string AuthenticationScheme = "Bearer";
    public const string ProblemMediaType = "application/problem+json";
}
