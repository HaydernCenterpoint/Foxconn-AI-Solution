using System.IdentityModel.Tokens.Jwt;
using System.Text;
using backend.Security;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace backend.Tests;

public class FiiSsoTests
{
    private const string Secret = "test-fii-secret-that-is-at-least-32-bytes-long";

    private static IConfiguration Configuration(bool secure = false) =>
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Key"] = Secret,
            ["Jwt:Issuer"] = "MKZ_PLC_Server",
            ["Jwt:Audience"] = "MKZ_PLC_Client",
            ["FiiSso:SecureCookie"] = secure.ToString(),
        }).Build();

    [Fact]
    public void Issue_ProducesVerifiedStandardClaimsAndCookie()
    {
        var now = new DateTimeOffset(2026, 7, 20, 9, 0, 0, TimeSpan.Zero);
        var issued = FiiSso.Issue(" Admin ", "admin", Configuration(), now);
        var handler = new JwtSecurityTokenHandler();
        var principal = handler.ValidateToken(issued.Value, new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = false,
            ValidateIssuerSigningKey = true,
            ValidIssuer = "MKZ_PLC_Server",
            ValidAudience = "MKZ_PLC_Client",
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Secret)),
        }, out _);
        var context = new DefaultHttpContext();

        FiiSso.WriteCookie(context.Response, issued, Configuration());

        var jwt = handler.ReadJwtToken(issued.Value);
        Assert.Equal("admin", jwt.Subject);
        Assert.Equal("ADMIN", jwt.Claims.Single(claim => claim.Type == "role").Value);
        Assert.Equal(now.AddHours(2), issued.ExpiresAt);
        Assert.Equal(
            new FiiSsoSession("admin", "ADMIN", issued.ExpiresAt.ToUnixTimeSeconds()),
            FiiSso.ReadSession(principal));
        var cookie = context.Response.Headers.SetCookie.ToString().ToLowerInvariant();
        Assert.Contains("fii_sso=", cookie);
        Assert.Contains("httponly", cookie);
        Assert.Contains("samesite=strict", cookie);
        Assert.Contains("path=/", cookie);
        Assert.DoesNotContain("secure", cookie);
    }

    [Fact]
    public void Contract_RejectsWeakSecretsAndUnknownRoles()
    {
        var weak = new ConfigurationBuilder().AddInMemoryCollection(
            new Dictionary<string, string?> { ["Jwt:Key"] = "too-short" }).Build();

        Assert.Throws<InvalidOperationException>(() => FiiSso.SigningKey(weak));
        Assert.Throws<ArgumentOutOfRangeException>(() => FiiSso.Issue("user", "OWNER", Configuration()));
    }

    [Fact]
    public void CookieToken_DoesNotOverrideBearerAndLogoutExpiresCookie()
    {
        var requestContext = new DefaultHttpContext();
        requestContext.Request.Headers.Cookie = "fii_sso=cookie-token";
        Assert.Equal("cookie-token", FiiSso.CookieToken(requestContext.Request));

        requestContext.Request.Headers.Authorization = "Bearer header-token";
        Assert.Null(FiiSso.CookieToken(requestContext.Request));

        var responseContext = new DefaultHttpContext();
        FiiSso.ClearCookie(responseContext.Response, Configuration());
        var cookie = responseContext.Response.Headers.SetCookie.ToString().ToLowerInvariant();
        Assert.Contains("fii_sso=", cookie);
        Assert.Contains("expires=thu, 01 jan 1970", cookie);
    }
}
