using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace backend.Security;

public sealed record FiiSsoToken(string Value, DateTimeOffset ExpiresAt);
public sealed record FiiSsoSession(string Username, string Role, long ExpiresAt);

public static class FiiSso
{
    public const string CookieName = "fii_sso";
    private static readonly HashSet<string> Roles = new(StringComparer.Ordinal)
    {
        "ADMIN", "ENGINEER", "GUEST",
    };

    public static FiiSsoToken Issue(
        string username,
        string role,
        IConfiguration configuration,
        DateTimeOffset? issuedAt = null)
    {
        var subject = username.Trim().ToLowerInvariant();
        var normalizedRole = role.Trim().ToUpperInvariant();
        if (subject.Length == 0) throw new ArgumentException("Username is required", nameof(username));
        if (!Roles.Contains(normalizedRole))
            throw new ArgumentOutOfRangeException(nameof(role), "Unsupported FII role");
        var tenantId = TenantId(configuration);

        var now = issuedAt ?? DateTimeOffset.UtcNow;
        var expiresAt = now.AddHours(2);
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, subject),
            new Claim("tenant_id", tenantId),
            new Claim("role", normalizedRole),
            new Claim(ClaimTypes.Name, subject),
            new Claim(ClaimTypes.Role, normalizedRole),
        };
        var token = new JwtSecurityToken(
            issuer: configuration["Jwt:Issuer"] ?? "MKZ_PLC_Server",
            audience: configuration["Jwt:Audience"] ?? "MKZ_PLC_Client",
            claims: claims,
            notBefore: now.UtcDateTime,
            expires: expiresAt.UtcDateTime,
            signingCredentials: new SigningCredentials(SigningKey(configuration), SecurityAlgorithms.HmacSha256));
        return new FiiSsoToken(new JwtSecurityTokenHandler().WriteToken(token), expiresAt);
    }

    public static SymmetricSecurityKey SigningKey(IConfiguration configuration)
    {
        var secret = configuration["Jwt:Key"]?.Trim();
        if (string.IsNullOrEmpty(secret) || Encoding.UTF8.GetByteCount(secret) < 32)
            throw new InvalidOperationException("Jwt:Key must be configured with at least 32 bytes");
        return new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
    }

    public static string TenantId(IConfiguration configuration)
    {
        var configured = configuration["Jwt:TenantId"];
        if (string.IsNullOrWhiteSpace(configured))
        {
            configured = configuration["FII_TENANT_ID"];
        }

        if (string.IsNullOrWhiteSpace(configured))
        {
            throw new InvalidOperationException(
                "Jwt:TenantId or FII_TENANT_ID must be configured before issuing FII SSO tokens");
        }

        return configured.Trim();
    }

    public static void WriteCookie(HttpResponse response, FiiSsoToken token, IConfiguration configuration) =>
        response.Cookies.Append(CookieName, token.Value, CookieOptions(configuration, token.ExpiresAt));

    public static void ClearCookie(HttpResponse response, IConfiguration configuration) =>
        response.Cookies.Delete(CookieName, CookieOptions(configuration, DateTimeOffset.UnixEpoch));

    public static string? CookieToken(HttpRequest request)
    {
        if (request.Headers.Authorization.ToString().StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            return null;
        return request.Cookies.TryGetValue(CookieName, out var token) ? token : null;
    }

    public static FiiSsoSession? ReadSession(ClaimsPrincipal user)
    {
        var username = user.Identity?.Name ?? user.FindFirstValue(ClaimTypes.Name);
        var role = user.FindFirstValue(ClaimTypes.Role);
        var expiration = user.FindFirstValue(JwtRegisteredClaimNames.Exp);
        return !string.IsNullOrWhiteSpace(username) &&
               !string.IsNullOrWhiteSpace(role) &&
               long.TryParse(expiration, out var expiresAt)
            ? new FiiSsoSession(username, role, expiresAt)
            : null;
    }

    private static CookieOptions CookieOptions(IConfiguration configuration, DateTimeOffset expiresAt)
    {
        var options = new CookieOptions
        {
            HttpOnly = true,
            SameSite = SameSiteMode.Strict,
            Secure = bool.TryParse(configuration["FiiSso:SecureCookie"], out var secure) && secure,
            Path = "/",
            Expires = expiresAt,
        };
        var domain = configuration["FiiSso:CookieDomain"]?.Trim();
        if (!string.IsNullOrEmpty(domain)) options.Domain = domain;
        return options;
    }
}
