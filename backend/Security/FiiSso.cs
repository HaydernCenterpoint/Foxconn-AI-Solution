using System.Globalization;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace backend.Security;

public record FiiSsoToken(string Value, DateTimeOffset ExpiresAt);
public record FiiSsoSession(string Username, string Role, long ExpiresAt);

public static class FiiSso
{
    private const string CookieName = "fii_sso";
    private const string DefaultIssuer = "MKZ_PLC_Server";
    private const string DefaultAudience = "MKZ_PLC_Client";

    public static FiiSsoToken Issue(
        string username,
        string role,
        IConfiguration configuration,
        DateTimeOffset? issuedAt = null)
    {
        var normalizedUsername = username.Trim().ToLowerInvariant();
        var normalizedRole = role.Trim().ToUpperInvariant();
        if (!IsAllowedRole(normalizedRole))
        {
            throw new InvalidOperationException("Unsupported FII role.");
        }

        var requestedAt = issuedAt ?? DateTimeOffset.UtcNow;
        var issued = DateTimeOffset.FromUnixTimeSeconds(requestedAt.ToUnixTimeSeconds());
        var expires = issued.AddHours(2);
        var credentials = new SigningCredentials(SigningKey(configuration), SecurityAlgorithms.HmacSha256);
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, normalizedUsername),
            new Claim("role", normalizedRole),
            new Claim(ClaimTypes.Name, normalizedUsername),
            new Claim(ClaimTypes.Role, normalizedRole)
        };
        var jwt = new JwtSecurityToken(
            issuer: configuration["Jwt:Issuer"] ?? DefaultIssuer,
            audience: configuration["Jwt:Audience"] ?? DefaultAudience,
            claims: claims,
            notBefore: issued.UtcDateTime,
            expires: expires.UtcDateTime,
            signingCredentials: credentials);

        return new FiiSsoToken(new JwtSecurityTokenHandler().WriteToken(jwt), expires);
    }

    public static void WriteCookie(
        HttpResponse response,
        FiiSsoToken token,
        IConfiguration configuration)
    {
        response.Cookies.Append(CookieName, token.Value, BuildCookieOptions(configuration, token.ExpiresAt));
    }

    public static void ClearCookie(HttpResponse response, IConfiguration configuration)
    {
        response.Cookies.Delete(CookieName, BuildCookieOptions(configuration, DateTimeOffset.UnixEpoch));
    }

    public static string? CookieToken(HttpRequest request)
    {
        foreach (var authorization in request.Headers.Authorization)
        {
            if (IsBearerAuthorization(authorization))
            {
                return null;
            }
        }

        return request.Cookies.TryGetValue(CookieName, out var token) ? token : null;
    }

    public static FiiSsoSession? ReadSession(ClaimsPrincipal principal)
    {
        if (principal.Identity is not { IsAuthenticated: true } identity)
        {
            return null;
        }

        var username = identity.Name;
        var role = principal.FindFirst(ClaimTypes.Role)?.Value;
        var expiration = principal.FindFirst(JwtRegisteredClaimNames.Exp)?.Value;
        if (string.IsNullOrWhiteSpace(username)
            || role is null
            || !IsAllowedRole(role)
            || !long.TryParse(expiration, NumberStyles.None, CultureInfo.InvariantCulture, out var expiresAt))
        {
            return null;
        }

        return new FiiSsoSession(username, role, expiresAt);
    }

    public static SymmetricSecurityKey SigningKey(IConfiguration configuration)
    {
        var secret = configuration["Jwt:Key"]?.Trim();
        if (string.IsNullOrEmpty(secret))
        {
            throw new InvalidOperationException("Jwt:Key is required.");
        }

        var keyBytes = Encoding.UTF8.GetBytes(secret);
        if (keyBytes.Length < 32)
        {
            throw new InvalidOperationException("Jwt:Key must contain at least 32 UTF-8 bytes.");
        }

        return new SymmetricSecurityKey(keyBytes);
    }

    private static CookieOptions BuildCookieOptions(
        IConfiguration configuration,
        DateTimeOffset expiresAt)
    {
        var domain = configuration["FiiSso:CookieDomain"]?.Trim();
        return new CookieOptions
        {
            HttpOnly = true,
            SameSite = SameSiteMode.Strict,
            Path = "/",
            Secure = configuration.GetValue<bool>("FiiSso:SecureCookie"),
            Domain = string.IsNullOrEmpty(domain) ? null : domain,
            Expires = expiresAt
        };
    }

    private static bool IsBearerAuthorization(string? value)
    {
        var authorization = value?.TrimStart();
        if (string.IsNullOrEmpty(authorization))
        {
            return false;
        }

        return authorization.Equals("Bearer", StringComparison.OrdinalIgnoreCase)
            || (authorization.Length > "Bearer".Length
                && authorization.StartsWith("Bearer", StringComparison.OrdinalIgnoreCase)
                && char.IsWhiteSpace(authorization["Bearer".Length]));
    }

    private static bool IsAllowedRole(string role)
    {
        return role is "ADMIN" or "ENGINEER" or "GUEST";
    }
}
