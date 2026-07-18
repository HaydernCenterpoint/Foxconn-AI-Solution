using System.Globalization;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using backend.Security;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using Microsoft.Net.Http.Headers;

namespace backend.Tests;

public class FiiSsoTests
{
    private const string SigningSecret = "development-fii-sso-signing-secret-32-bytes";

    [Fact]
    public void Issue_NormalizesIdentityAndCreatesTwoHourHs256Token()
    {
        var issuedAt = DateTimeOffset.FromUnixTimeSeconds(DateTimeOffset.UtcNow.ToUnixTimeSeconds())
            .AddMinutes(-1);
        var configuration = Configuration(new Dictionary<string, string?>
        {
            ["Jwt:Key"] = SigningSecret
        });

        var token = FiiSso.Issue("  Factory.User  ", " engineer ", configuration, issuedAt);

        Assert.Equal(issuedAt.AddHours(2), token.ExpiresAt);

        var handler = new JwtSecurityTokenHandler();
        var principal = handler.ValidateToken(token.Value, new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = "MKZ_PLC_Server",
            ValidateAudience = true,
            ValidAudience = "MKZ_PLC_Client",
            ValidateLifetime = true,
            ClockSkew = TimeSpan.Zero,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(SigningSecret)),
            ValidAlgorithms = [SecurityAlgorithms.HmacSha256]
        }, out var validatedToken);

        var jwt = Assert.IsType<JwtSecurityToken>(validatedToken);
        Assert.Equal(SecurityAlgorithms.HmacSha256, jwt.Header.Alg);
        Assert.Equal("MKZ_PLC_Server", jwt.Issuer);
        Assert.Equal("MKZ_PLC_Client", Assert.Single(jwt.Audiences));
        Assert.Equal(issuedAt.UtcDateTime, jwt.ValidFrom);
        Assert.Equal(token.ExpiresAt.UtcDateTime, jwt.ValidTo);
        Assert.Contains(jwt.Claims, claim => claim.Type == JwtRegisteredClaimNames.Sub && claim.Value == "factory.user");
        Assert.Contains(jwt.Claims, claim => claim.Type == "role" && claim.Value == "ENGINEER");
        Assert.Contains(jwt.Claims, claim => claim.Type == ClaimTypes.Name && claim.Value == "factory.user");
        Assert.Contains(jwt.Claims, claim => claim.Type == ClaimTypes.Role && claim.Value == "ENGINEER");
        Assert.Equal("factory.user", principal.Identity?.Name);
        Assert.True(principal.IsInRole("ENGINEER"));
    }

    [Fact]
    public void Issue_UsesConfiguredIssuerAndAudience()
    {
        var configuration = Configuration(new Dictionary<string, string?>
        {
            ["Jwt:Key"] = SigningSecret,
            ["Jwt:Issuer"] = "configured-issuer",
            ["Jwt:Audience"] = "configured-audience"
        });

        var token = FiiSso.Issue("factory.user", "GUEST", configuration);

        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token.Value);
        Assert.Equal("configured-issuer", jwt.Issuer);
        Assert.Equal("configured-audience", Assert.Single(jwt.Audiences));
    }

    [Fact]
    public void Issue_AlignsReturnedExpirationWithJwtNumericDate()
    {
        var requestedAt = DateTimeOffset.FromUnixTimeSeconds(DateTimeOffset.UtcNow.ToUnixTimeSeconds())
            .AddMilliseconds(500);
        var expectedIssuedAt = DateTimeOffset.FromUnixTimeSeconds(requestedAt.ToUnixTimeSeconds());
        var configuration = Configuration(new Dictionary<string, string?>
        {
            ["Jwt:Key"] = SigningSecret
        });

        var token = FiiSso.Issue("factory.user", "GUEST", configuration, requestedAt);

        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token.Value);
        Assert.Equal(expectedIssuedAt.AddHours(2), token.ExpiresAt);
        Assert.Equal(token.ExpiresAt.UtcDateTime, jwt.ValidTo);
    }

    [Fact]
    public void WriteCookie_UsesLocalHttpOnlyStrictHostContractAndTokenExpiration()
    {
        var context = new DefaultHttpContext();
        var expiresAt = new DateTimeOffset(2035, 1, 2, 3, 4, 5, TimeSpan.Zero);
        var token = new FiiSsoToken("signed-token", expiresAt);
        var configuration = Configuration(new Dictionary<string, string?>
        {
            ["FiiSso:SecureCookie"] = "false",
            ["FiiSso:CookieDomain"] = ""
        });

        FiiSso.WriteCookie(context.Response, token, configuration);

        var setCookie = SetCookieHeaderValue.Parse(Assert.Single(context.Response.Headers.SetCookie)!);
        Assert.Equal("fii_sso", setCookie.Name.ToString());
        Assert.Equal(token.Value, setCookie.Value.ToString());
        Assert.True(setCookie.HttpOnly);
        Assert.False(setCookie.Secure);
        Assert.Equal(Microsoft.Net.Http.Headers.SameSiteMode.Strict, setCookie.SameSite);
        Assert.Equal("/", setCookie.Path.ToString());
        Assert.False(setCookie.Domain.HasValue);
        Assert.Equal(expiresAt, setCookie.Expires);
    }

    [Fact]
    public void WriteCookie_SupportsSecureProductionParentDomain()
    {
        var context = new DefaultHttpContext();
        var token = new FiiSsoToken("signed-token", DateTimeOffset.UtcNow.AddHours(2));
        var configuration = Configuration(new Dictionary<string, string?>
        {
            ["FiiSso:SecureCookie"] = "true",
            ["FiiSso:CookieDomain"] = " .factory.example.com "
        });

        FiiSso.WriteCookie(context.Response, token, configuration);

        var setCookie = SetCookieHeaderValue.Parse(Assert.Single(context.Response.Headers.SetCookie)!);
        Assert.True(setCookie.Secure);
        Assert.Equal(".factory.example.com", setCookie.Domain.ToString());
    }

    [Fact]
    public void Issue_RejectsUnknownRole()
    {
        var configuration = Configuration(new Dictionary<string, string?>
        {
            ["Jwt:Key"] = SigningSecret
        });

        Assert.Throws<InvalidOperationException>(() =>
            FiiSso.Issue("factory.user", "superadmin", configuration));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   \t\r\n")]
    public void Issue_RejectsBlankNormalizedSubject(string username)
    {
        var configuration = Configuration(new Dictionary<string, string?>
        {
            ["Jwt:Key"] = SigningSecret
        });

        var exception = Assert.Throws<ArgumentException>(() =>
            FiiSso.Issue(username, "GUEST", configuration));

        Assert.Equal("username", exception.ParamName);
    }

    [Theory]
    [InlineData("ADMIN")]
    [InlineData("ENGINEER")]
    [InlineData("GUEST")]
    public void Issue_AcceptsKnownRoles(string role)
    {
        var configuration = Configuration(new Dictionary<string, string?>
        {
            ["Jwt:Key"] = SigningSecret
        });

        var token = FiiSso.Issue("factory.user", role, configuration);

        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token.Value);
        Assert.Contains(jwt.Claims, claim => claim.Type == "role" && claim.Value == role);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("1234567890123456789012345678901")]
    public void SigningKey_RejectsMissingOrShortSecrets(string? secret)
    {
        var configuration = Configuration(new Dictionary<string, string?>
        {
            ["Jwt:Key"] = secret
        });

        Assert.Throws<InvalidOperationException>(() => FiiSso.SigningKey(configuration));
    }

    [Fact]
    public void SigningKey_TrimsSecretAndMeasuresUtf8Bytes()
    {
        var secret = string.Concat(Enumerable.Repeat("\u00E9", 16));
        var configuration = Configuration(new Dictionary<string, string?>
        {
            ["Jwt:Key"] = $" \t{secret}\r\n"
        });

        var key = FiiSso.SigningKey(configuration);

        Assert.Equal(32, key.Key.Length);
        Assert.Equal(Encoding.UTF8.GetBytes(secret), key.Key);
    }

    [Fact]
    public void IssuedToken_IsRejectedAfterExpirationWithZeroClockSkew()
    {
        var configuration = Configuration(new Dictionary<string, string?>
        {
            ["Jwt:Key"] = SigningSecret
        });
        var token = FiiSso.Issue(
            "factory.user",
            "GUEST",
            configuration,
            DateTimeOffset.UtcNow.AddHours(-3));

        Assert.Throws<SecurityTokenExpiredException>(() =>
            new JwtSecurityTokenHandler().ValidateToken(
                token.Value,
                ValidationParameters(configuration),
                out _));
    }

    [Fact]
    public void IssuedToken_IsRejectedWhenSignatureIsTampered()
    {
        var configuration = Configuration(new Dictionary<string, string?>
        {
            ["Jwt:Key"] = SigningSecret
        });
        var token = FiiSso.Issue("factory.user", "ADMIN", configuration);
        var segments = token.Value.Split('.');
        var replacement = segments[2][0] == 'A' ? 'B' : 'A';
        segments[2] = replacement + segments[2][1..];
        var tampered = string.Join('.', segments);

        Assert.ThrowsAny<SecurityTokenException>(() =>
            new JwtSecurityTokenHandler().ValidateToken(
                tampered,
                ValidationParameters(configuration),
                out _));
    }

    [Fact]
    public void CookieToken_ReturnsCookieOnlyWhenBearerHeaderIsAbsent()
    {
        var context = new DefaultHttpContext();
        context.Request.Headers.Cookie = "fii_sso=cookie-token";

        Assert.Equal("cookie-token", FiiSso.CookieToken(context.Request));

        context.Request.Headers.Authorization = "bEaReR explicit-token";

        Assert.Null(FiiSso.CookieToken(context.Request));

        context.Request.Headers.Authorization = "Basic credentials";

        Assert.Equal("cookie-token", FiiSso.CookieToken(context.Request));
    }

    [Fact]
    public void ReadSession_ReturnsVerifiedPrincipalMetadata()
    {
        const long expiresAt = 2_100_000_000;
        var identity = new ClaimsIdentity(
            [
                new Claim(ClaimTypes.Name, "factory.user"),
                new Claim(ClaimTypes.Role, "ADMIN"),
                new Claim(JwtRegisteredClaimNames.Exp, expiresAt.ToString(CultureInfo.InvariantCulture))
            ],
            "Bearer",
            ClaimTypes.Name,
            ClaimTypes.Role);
        var principal = new ClaimsPrincipal(identity);

        var session = FiiSso.ReadSession(principal);

        Assert.Equal(new FiiSsoSession("factory.user", "ADMIN", expiresAt), session);
    }

    [Fact]
    public void Issue_ValidatedPrincipal_ComposesWithReadSession()
    {
        var issuedAt = DateTimeOffset.FromUnixTimeSeconds(DateTimeOffset.UtcNow.ToUnixTimeSeconds())
            .AddMinutes(-1);
        var configuration = Configuration(new Dictionary<string, string?>
        {
            ["Jwt:Key"] = SigningSecret,
            ["Jwt:Issuer"] = "composition-issuer",
            ["Jwt:Audience"] = "composition-audience"
        });
        var token = FiiSso.Issue("  Factory.User  ", " engineer ", configuration, issuedAt);
        var principal = new JwtSecurityTokenHandler().ValidateToken(
            token.Value,
            new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = "composition-issuer",
                ValidateAudience = true,
                ValidAudience = "composition-audience",
                ValidateLifetime = true,
                ClockSkew = TimeSpan.Zero,
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = FiiSso.SigningKey(configuration),
                ValidAlgorithms = [SecurityAlgorithms.HmacSha256]
            },
            out _);

        var session = FiiSso.ReadSession(principal);

        Assert.True(principal.Identity?.IsAuthenticated);
        Assert.Equal(
            new FiiSsoSession("factory.user", "ENGINEER", token.ExpiresAt.ToUnixTimeSeconds()),
            session);
    }

    [Fact]
    public void ReadSession_ReturnsNullForIncompleteOrUnverifiedMetadata()
    {
        var name = new Claim(ClaimTypes.Name, "factory.user");
        var role = new Claim(ClaimTypes.Role, "ADMIN");
        var expiration = new Claim(JwtRegisteredClaimNames.Exp, "2100000000");
        var principals = new[]
        {
            Principal([role, expiration]),
            Principal([name, expiration]),
            Principal([name, role]),
            Principal([name, role, new Claim(JwtRegisteredClaimNames.Exp, "not-a-number")]),
            Principal([name, new Claim(ClaimTypes.Role, "SUPERADMIN"), expiration]),
            new ClaimsPrincipal(new ClaimsIdentity(
                [name, role, expiration],
                authenticationType: null,
                ClaimTypes.Name,
                ClaimTypes.Role))
        };

        foreach (var principal in principals)
        {
            Assert.Null(FiiSso.ReadSession(principal));
        }
    }

    [Fact]
    public void ClearCookie_DeletesAtUnixEpochUsingSameCookieScope()
    {
        var context = new DefaultHttpContext();
        var configuration = Configuration(new Dictionary<string, string?>
        {
            ["FiiSso:SecureCookie"] = "true",
            ["FiiSso:CookieDomain"] = ".factory.example.com"
        });

        FiiSso.ClearCookie(context.Response, configuration);

        var setCookie = SetCookieHeaderValue.Parse(Assert.Single(context.Response.Headers.SetCookie)!);
        Assert.Equal("fii_sso", setCookie.Name.ToString());
        Assert.Equal(string.Empty, setCookie.Value.ToString());
        Assert.True(setCookie.HttpOnly);
        Assert.True(setCookie.Secure);
        Assert.Equal(Microsoft.Net.Http.Headers.SameSiteMode.Strict, setCookie.SameSite);
        Assert.Equal("/", setCookie.Path.ToString());
        Assert.Equal(".factory.example.com", setCookie.Domain.ToString());
        Assert.Equal(DateTimeOffset.UnixEpoch, setCookie.Expires);
    }

    [Fact]
    public async Task AddFiiCors_UsesExactCredentialedConfiguredOrigins()
    {
        var configuration = Configuration(new Dictionary<string, string?>
        {
            ["AllowedOrigins:0"] = "http://localhost:3000",
            ["AllowedOrigins:1"] = "http://localhost:5173"
        });
        var services = new ServiceCollection();

        services.AddFiiCors(configuration);

        await using var provider = services.BuildServiceProvider();
        var policyProvider = provider.GetRequiredService<ICorsPolicyProvider>();
        var policy = await policyProvider.GetPolicyAsync(new DefaultHttpContext(), policyName: null);
        Assert.NotNull(policy);
        Assert.False(policy.AllowAnyOrigin);
        Assert.Equal(
            ["http://localhost:3000", "http://localhost:5173"],
            policy.Origins);
        Assert.True(policy.SupportsCredentials);
        Assert.Contains("*", policy.Methods);
        Assert.Contains("*", policy.Headers);
    }

    [Fact]
    public void AddFiiCors_RejectsWildcardOrigin()
    {
        var configuration = Configuration(new Dictionary<string, string?>
        {
            ["AllowedOrigins:0"] = "*"
        });
        var services = new ServiceCollection();

        Assert.Throws<InvalidOperationException>(() => services.AddFiiCors(configuration));
    }

    private static IConfiguration Configuration(Dictionary<string, string?> values)
    {
        return new ConfigurationBuilder()
            .AddInMemoryCollection(values)
            .Build();
    }

    private static ClaimsPrincipal Principal(IEnumerable<Claim> claims)
    {
        return new ClaimsPrincipal(new ClaimsIdentity(
            claims,
            "Bearer",
            ClaimTypes.Name,
            ClaimTypes.Role));
    }

    private static TokenValidationParameters ValidationParameters(IConfiguration configuration)
    {
        return new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = configuration["Jwt:Issuer"] ?? "MKZ_PLC_Server",
            ValidateAudience = true,
            ValidAudience = configuration["Jwt:Audience"] ?? "MKZ_PLC_Client",
            ValidateLifetime = true,
            ClockSkew = TimeSpan.Zero,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = FiiSso.SigningKey(configuration),
            ValidAlgorithms = [SecurityAlgorithms.HmacSha256]
        };
    }
}
