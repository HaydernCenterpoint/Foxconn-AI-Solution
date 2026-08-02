using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;

namespace Fusion.Adapter.Configuration;

public sealed class OpenDataFusionOptionsValidator : IValidateOptions<OpenDataFusionOptions>
{
    private readonly IConfiguration _configuration;

    public OpenDataFusionOptionsValidator(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public ValidateOptionsResult Validate(string? name, OpenDataFusionOptions options)
    {
        if (!options.DispatchEnabled)
            return ValidateOptionsResult.Success;

        var failures = new List<string>();
        if (string.IsNullOrWhiteSpace(_configuration.GetConnectionString("MkzOperations")))
            failures.Add("ConnectionStrings:MkzOperations is required when dispatch is enabled.");
        if (!Uri.TryCreate(options.BaseUrl, UriKind.Absolute, out var baseUri) || baseUri.Scheme != Uri.UriSchemeHttps)
            failures.Add("OpenDataFusion:BaseUrl must be an absolute HTTPS URL when dispatch is enabled.");
        if (string.IsNullOrWhiteSpace(options.TenantId))
            failures.Add("OpenDataFusion:TenantId is required when dispatch is enabled.");
        if (string.IsNullOrWhiteSpace(options.ProjectId))
            failures.Add("OpenDataFusion:ProjectId is required when dispatch is enabled.");
        if (string.IsNullOrWhiteSpace(options.Authentication.MaterialReference))
            failures.Add("OpenDataFusion:Authentication:MaterialReference is required when dispatch is enabled.");

        ValidateAuthentication(options.Authentication, failures);
        return failures.Count == 0
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(failures);
    }

    private static void ValidateAuthentication(
        OpenDataFusionAuthenticationOptions authentication,
        ICollection<string> failures)
    {
        if (authentication.Mode.Equals("factory", StringComparison.OrdinalIgnoreCase))
        {
            var role = authentication.FactoryRole.Trim().ToUpperInvariant();
            if (Encoding.UTF8.GetByteCount(authentication.FactorySecret) < 32 ||
                string.IsNullOrWhiteSpace(authentication.FactorySubject) ||
                string.IsNullOrWhiteSpace(authentication.FactoryIssuer) ||
                string.IsNullOrWhiteSpace(authentication.FactoryAudience) ||
                role is not ("ADMIN" or "ENGINEER" or "GUEST"))
            {
                failures.Add("OpenDataFusion factory authentication material or identity metadata is invalid.");
            }
            return;
        }

        if (authentication.Mode.Equals("client_credentials", StringComparison.OrdinalIgnoreCase))
        {
            if (!Uri.TryCreate(authentication.TokenEndpoint, UriKind.Absolute, out var tokenUri) ||
                tokenUri.Scheme != Uri.UriSchemeHttps ||
                string.IsNullOrWhiteSpace(authentication.ClientId) ||
                string.IsNullOrWhiteSpace(authentication.ClientSecret))
            {
                failures.Add("OpenDataFusion client-credentials authentication requires an HTTPS token endpoint, client ID, and referenced secret material.");
            }
            return;
        }

        failures.Add("OpenDataFusion:Authentication:Mode must be factory or client_credentials when dispatch is enabled.");
    }
}
