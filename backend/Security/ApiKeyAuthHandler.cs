using System.Security.Claims;
using backend.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Npgsql;
using System.Text.Encodings.Web;

namespace backend.Security;

/// <summary>
/// Authenticates service-to-service requests that present an
/// <see cref="ApiKeySecret.HeaderName"/> (<c>X-API-Key</c>) header. The header
/// value is SHA-256 hashed and looked up against <c>users.api_key_hash</c>; a
/// matching row yields a <see cref="ClaimsPrincipal"/> carrying the service
/// account's username and role, so existing role-based <c>[Authorize]</c>
/// policies (e.g. <c>ADMIN,ENGINEER</c>) keep working unchanged.
/// </summary>
/// <remarks>
/// The handler returns <c>NoResult</c> (and therefore yields to the JWT/cookie
/// scheme) when no <c>X-API-Key</c> header is present or when a DB lookup fails,
/// so it composes safely with the default <c>Bearer</c> scheme in a multi-scheme
/// authorization policy.
/// </remarks>
public sealed class ApiKeyAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    private readonly DatabaseService _dbService;

    public ApiKeyAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        DatabaseService dbService)
        : base(options, logger, encoder)
    {
        _dbService = dbService;
    }

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        // Let the default scheme (JWT/cookie) own already-authenticated requests.
        if (Context.User?.Identity?.IsAuthenticated == true)
        {
            return AuthenticateResult.NoResult();
        }

        var apiKey = Request.Headers[ApiKeySecret.HeaderName].ToString();
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return AuthenticateResult.NoResult();
        }

        string hashHex;
        try
        {
            hashHex = ApiKeySecret.Hash(apiKey.Trim());
        }
        catch
        {
            return AuthenticateResult.NoResult();
        }

        string? username = null;
        string? role = null;
        try
        {
            await using var conn = _dbService.CreateConnection();
            await conn.OpenAsync(Context.RequestAborted);
            await using var cmd = new NpgsqlCommand(
                "SELECT username, role FROM users WHERE api_key_hash = @hash LIMIT 1",
                conn);
            cmd.Parameters.AddWithValue("hash", hashHex);
            await using var reader = await cmd.ExecuteReaderAsync(Context.RequestAborted);
            if (await reader.ReadAsync(Context.RequestAborted))
            {
                username = reader.GetString(0);
                role = reader.GetString(1);
            }
        }
        catch (Exception ex)
        {
            Logger.LogWarning(ex, "ApiKey authentication DB lookup failed");
            return AuthenticateResult.NoResult();
        }

        if (string.IsNullOrEmpty(username) || string.IsNullOrEmpty(role))
        {
            Logger.LogWarning("An invalid X-API-Key was presented (no matching service account)");
            return AuthenticateResult.NoResult();
        }

        var claims = new[]
        {
            new Claim(ClaimTypes.Name, username),
            new Claim(ClaimTypes.Role, role),
            new Claim("auth_scheme", ApiKeySecret.Scheme),
        };
        var identity = new ClaimsIdentity(claims, ApiKeySecret.Scheme, ClaimTypes.Name, ClaimTypes.Role);
        var principal = new ClaimsPrincipal(identity);
        return AuthenticateResult.Success(new AuthenticationTicket(principal, ApiKeySecret.Scheme));
    }
}
