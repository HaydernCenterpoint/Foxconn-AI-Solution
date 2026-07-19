# Shared FII Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require the main FII login before every frontend screen and reuse that verified session in Odysseus and Open Data Fusion without another credential prompt.

**Architecture:** The ASP.NET backend remains the login authority and writes its verified HS256 JWT to an `HttpOnly`, same-host `fii_sso` cookie. Odysseus validates the cookie with Python standard-library HMAC code; Open Data Fusion validates it with its installed `jose` package. Each service preserves its existing authorization rules, while the main frontend owns global logout.

**Tech Stack:** ASP.NET Core 9/JWT bearer, React 19/Vitest, FastAPI/Python/pytest, Express 5/TypeScript/Vitest/Supertest, React 18, Docker Compose

**Dependency rule:** Add no packages; use the installed .NET JWT stack, Python standard library, and Open Data Fusion's existing `jose` dependency.

**Existing approved UI baseline:** Preserve the current uncommitted `ModernShell`/i18n/test diff that adds the `FII Data Fusion` launcher (`VITE_FII_DATA_FUSION_URL`, default `http://localhost:5173`). Task 3 extends that same diff with shared logout; it must not remove or duplicate the launcher.

---

## File map

### Main backend

- Create `backend/Security/FiiSso.cs`: issue the shared JWT and own cookie options/constants.
- Create `backend/Security/FiiCors.cs`: keep the existing exact-origin credentialed CORS policy testable.
- Create `backend.Tests/FiiSsoTests.cs`: verify signature contract and cookie security attributes.
- Modify `backend/Controllers/AuthController.cs`: set the cookie on login and add session/logout endpoints.
- Modify `backend/Program.cs`: accept `fii_sso` only when no Bearer header is supplied.
- Modify `backend/appsettings.json`: secure-cookie defaults and remove the deployable signing-key fallback.
- Modify `backend/appsettings.Development.json`: explicit local HTTP and development-key overrides.

### Main frontend

- Create `frontend/src/app/router.auth.test.tsx`: prove all application entry routes redirect to login.
- Create `frontend/src/pages/LoginPage.test.tsx`: prove one successful form submission enters the app.
- Modify `frontend/src/app/router.tsx`: protect viewer, slideshow, and admin layouts at their shared boundaries.
- Modify `frontend/src/shared/services/apiClient.ts`: include credentials when API origin differs.
- Modify `frontend/src/features/auth/services/auth.api.ts`: add backend logout.
- Modify `frontend/src/shared/components/layout/ModernShell.tsx`: perform global logout before clearing local state.
- Modify `frontend/src/shared/components/layout/ModernShell.test.tsx`: prove logout succeeds locally and reports server failure.
- Modify the three files under `frontend/src/app/i18n/*/index.ts`: add the logout-failure message.

### FII AE AI / Odysseus

- Create `Odysseus/core/fii_sso.py`: strict HS256 cookie validation using only the standard library.
- Create `Odysseus/tests/test_fii_sso.py`: token validation and shadow-user mapping coverage.
- Modify `Odysseus/core/auth.py`: create/update passwordless SSO shadow users and reject password login for them.
- Modify `Odysseus/app.py`: authenticate `fii_sso` before native-cookie fallback.
- Modify `Odysseus/routes/auth_routes.py`: report the SSO identity from the existing status endpoint.
- Modify `Odysseus/.env.example`: document same-host SSO variables.
- Modify `Odysseus/docker-compose.yml`: pass one shared JWT contract to backend and Odysseus.

### FII Data Fusion / Open Data Fusion

- Modify `Open-Data-Fusion/apps/api/src/auth.ts`: add the factory-cookie identity provider and role-permission map.
- Modify `Open-Data-Fusion/apps/api/src/app.ts`: add verified session metadata endpoint.
- Modify `Open-Data-Fusion/apps/api/tests/auth.test.ts`: factory-cookie validation, permissions, and membership tests.
- Modify `Open-Data-Fusion/apps/web/src/lib/auth.ts`: add factory browser-session initialization without exposing the token.
- Modify `Open-Data-Fusion/apps/web/src/lib/auth.test.ts`: valid/invalid factory session coverage.
- Modify `Open-Data-Fusion/apps/web/src/lib/api.ts`: send credentials for JSON and SSE requests.
- Modify `Open-Data-Fusion/apps/web/src/lib/api.auth.test.ts`: assert credentialed transport.
- Create `Open-Data-Fusion/apps/web/src/components/AuthBoundary.test.tsx`: prove direct entry and main-login fallback.
- Modify `Open-Data-Fusion/.env.example`, `Dockerfile.web`, and `docker-compose.yml`: wire factory mode in the local preview profile.

---

### Task 1: Main backend JWT and cookie contract

**Files:**
- Create: `backend/Security/FiiSso.cs`
- Create: `backend/Security/FiiCors.cs`
- Create: `backend.Tests/FiiSsoTests.cs`
- Modify: `backend/appsettings.json`
- Modify: `backend/appsettings.Development.json`

- [ ] **Step 1: Write failing JWT and cookie tests**

Create `backend.Tests/FiiSsoTests.cs` with fixed-time assertions so the token and cookie share one expiration:

```csharp
using System.IdentityModel.Tokens.Jwt;
using System.Text;
using backend.Security;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace backend.Tests;

public class FiiSsoTests
{
    private static IConfiguration Configuration(bool secure = false, string? domain = null) =>
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Key"] = "test-fii-secret-that-is-at-least-32-bytes-long",
            ["Jwt:Issuer"] = "MKZ_PLC_Server",
            ["Jwt:Audience"] = "MKZ_PLC_Client",
            ["FiiSso:SecureCookie"] = secure.ToString(),
            ["FiiSso:CookieDomain"] = domain,
        }).Build();

    [Fact]
    public void Issue_ProducesVerifiedStandardClaimsAndSharedExpiry()
    {
        var now = new DateTimeOffset(2026, 7, 18, 8, 0, 0, TimeSpan.Zero);
        var issued = FiiSso.Issue(" Admin ", "admin", Configuration(), now);
        var handler = new JwtSecurityTokenHandler();
        handler.ValidateToken(issued.Value, new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ClockSkew = TimeSpan.Zero,
            ValidIssuer = "MKZ_PLC_Server",
            ValidAudience = "MKZ_PLC_Client",
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes("test-fii-secret-that-is-at-least-32-bytes-long")),
            LifetimeValidator = (_, expires, _, _) => expires == issued.ExpiresAt.UtcDateTime,
        }, out _);

        var jwt = handler.ReadJwtToken(issued.Value);
        Assert.Equal("admin", jwt.Subject);
        Assert.Equal("ADMIN", jwt.Claims.Single(claim => claim.Type == "role").Value);
        Assert.Equal(now.AddHours(2), issued.ExpiresAt);
    }

    [Fact]
    public void WriteCookie_UsesHttpOnlyStrictSameHostPolicy()
    {
        var context = new DefaultHttpContext();
        var issued = FiiSso.Issue(
            "viewer", "GUEST", Configuration(),
            new DateTimeOffset(2026, 7, 18, 8, 0, 0, TimeSpan.Zero));

        FiiSso.WriteCookie(context.Response, issued, Configuration());

        var header = context.Response.Headers.SetCookie.ToString().ToLowerInvariant();
        Assert.Contains("fii_sso=", header);
        Assert.Contains("httponly", header);
        Assert.Contains("samesite=strict", header);
        Assert.Contains("path=/", header);
        Assert.Contains($"expires={issued.ExpiresAt:R}".ToLowerInvariant(), header);
        Assert.DoesNotContain("secure", header);
        Assert.DoesNotContain("domain=", header);
    }

    [Fact]
    public void WriteCookie_UsesSecureConfiguredParentDomain()
    {
        var context = new DefaultHttpContext();
        var configuration = Configuration(secure: true, domain: ".factory.example.com");
        var issued = FiiSso.Issue("engineer", "ENGINEER", configuration);

        FiiSso.WriteCookie(context.Response, issued, configuration);

        var header = context.Response.Headers.SetCookie.ToString().ToLowerInvariant();
        Assert.Contains("secure", header);
        Assert.Contains("domain=.factory.example.com", header);
    }

    [Fact]
    public void Issue_RejectsUnknownRole()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            FiiSso.Issue("user", "SUPERUSER", Configuration()));
    }

    [Fact]
    public void SigningKey_RejectsMissingOrShortSecrets()
    {
        Assert.Throws<InvalidOperationException>(() =>
            FiiSso.SigningKey(new ConfigurationBuilder().Build()));
        var shortSecret = new ConfigurationBuilder().AddInMemoryCollection(
            new Dictionary<string, string?> { ["Jwt:Key"] = "too-short" }).Build();
        Assert.Throws<InvalidOperationException>(() => FiiSso.SigningKey(shortSecret));
    }

    [Fact]
    public void Issue_RejectsExpiredAndTamperedTokensDuringValidation()
    {
        var expired = FiiSso.Issue(
            "viewer", "GUEST", Configuration(), DateTimeOffset.UtcNow.AddHours(-3));
        var parameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ClockSkew = TimeSpan.Zero,
            ValidIssuer = "MKZ_PLC_Server",
            ValidAudience = "MKZ_PLC_Client",
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes("test-fii-secret-that-is-at-least-32-bytes-long")),
        };
        var handler = new JwtSecurityTokenHandler();

        Assert.Throws<SecurityTokenExpiredException>(() =>
            handler.ValidateToken(expired.Value, parameters, out _));
        var parts = expired.Value.Split('.');
        parts[2] = (parts[2][0] == 'a' ? 'b' : 'a') + parts[2][1..];
        var tampered = string.Join(".", parts);
        Assert.ThrowsAny<SecurityTokenException>(() =>
            handler.ValidateToken(tampered, parameters, out _));
    }

    [Fact]
    public void CookieToken_IsUsedOnlyWithoutBearerHeader()
    {
        var context = new DefaultHttpContext();
        context.Request.Headers.Cookie = "fii_sso=cookie-token";
        Assert.Equal("cookie-token", FiiSso.CookieToken(context.Request));

        context.Request.Headers.Authorization = "Bearer header-token";
        Assert.Null(FiiSso.CookieToken(context.Request));
    }

    [Fact]
    public void ReadSession_ReturnsVerifiedMetadata()
    {
        var now = new DateTimeOffset(2026, 7, 18, 8, 0, 0, TimeSpan.Zero);
        var issued = FiiSso.Issue("admin", "ADMIN", Configuration(), now);
        var principal = new JwtSecurityTokenHandler().ValidateToken(
            issued.Value,
            new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = false,
                ValidateIssuerSigningKey = true,
                ValidIssuer = "MKZ_PLC_Server",
                ValidAudience = "MKZ_PLC_Client",
                IssuerSigningKey = new SymmetricSecurityKey(
                    Encoding.UTF8.GetBytes("test-fii-secret-that-is-at-least-32-bytes-long")),
            },
            out _);

        Assert.Equal(
            new FiiSsoSession("admin", "ADMIN", issued.ExpiresAt.ToUnixTimeSeconds()),
            FiiSso.ReadSession(principal));
    }

    [Fact]
    public void AddFiiCors_UsesOnlyConfiguredOriginsWithCredentials()
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(
            new Dictionary<string, string?>
            {
                ["AllowedOrigins:0"] = "http://localhost:3000",
                ["AllowedOrigins:1"] = "http://localhost:5173",
            }).Build();
        var services = new ServiceCollection();
        services.AddFiiCors(configuration);
        using var provider = services.BuildServiceProvider();

        var policy = provider.GetRequiredService<ICorsPolicyProvider>()
            .GetPolicyAsync(new DefaultHttpContext(), null)
            .GetAwaiter()
            .GetResult();

        Assert.NotNull(policy);
        Assert.Equal(
            new[] { "http://localhost:3000", "http://localhost:5173" },
            policy.Origins);
        Assert.True(policy.SupportsCredentials);
        Assert.False(policy.AllowAnyOrigin);
    }
}
```

- [ ] **Step 2: Run the targeted backend test and verify red state**

Run:

```powershell
rtk dotnet test backend.Tests/backend.Tests.csproj --filter FullyQualifiedName~FiiSsoTests
```

Expected: FAIL because `backend.Security.FiiSso` does not exist.

- [ ] **Step 3: Implement the minimal shared contract**

Create `backend/Security/FiiSso.cs`:

```csharp
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

        var issuer = configuration["Jwt:Issuer"] ?? "MKZ_PLC_Server";
        var audience = configuration["Jwt:Audience"] ?? "MKZ_PLC_Client";
        var now = issuedAt ?? DateTimeOffset.UtcNow;
        var expiresAt = now.AddHours(2);
        var credentials = new SigningCredentials(
            SigningKey(configuration),
            SecurityAlgorithms.HmacSha256);
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, subject),
            new Claim("role", normalizedRole),
            new Claim(ClaimTypes.Name, subject),
            new Claim(ClaimTypes.Role, normalizedRole),
        };
        var jwt = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: claims,
            notBefore: now.UtcDateTime,
            expires: expiresAt.UtcDateTime,
            signingCredentials: credentials);
        return new FiiSsoToken(new JwtSecurityTokenHandler().WriteToken(jwt), expiresAt);
    }

    public static SymmetricSecurityKey SigningKey(IConfiguration configuration)
    {
        var keyText = configuration["Jwt:Key"]?.Trim();
        if (string.IsNullOrEmpty(keyText) || Encoding.UTF8.GetByteCount(keyText) < 32)
            throw new InvalidOperationException("Jwt:Key must be configured with at least 32 bytes");
        return new SymmetricSecurityKey(Encoding.UTF8.GetBytes(keyText));
    }

    public static void WriteCookie(HttpResponse response, FiiSsoToken token, IConfiguration configuration)
    {
        response.Cookies.Append(CookieName, token.Value, CookieOptions(configuration, token.ExpiresAt));
    }

    public static void ClearCookie(HttpResponse response, IConfiguration configuration)
    {
        response.Cookies.Delete(CookieName, CookieOptions(configuration, DateTimeOffset.UnixEpoch));
    }

    public static string? CookieToken(HttpRequest request)
    {
        var authorization = request.Headers.Authorization.ToString();
        if (authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) return null;
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
```

Create `backend/Security/FiiCors.cs`:

```csharp
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace backend.Security;

public static class FiiCors
{
    public static IServiceCollection AddFiiCors(this IServiceCollection services, IConfiguration configuration)
    {
        var allowedOrigins = configuration.GetSection("AllowedOrigins").Get<string[]>()
            ?? new[] { "http://localhost:5173" };
        return services.AddCors(options => options.AddDefaultPolicy(policy =>
            policy.WithOrigins(allowedOrigins).AllowAnyMethod().AllowAnyHeader().AllowCredentials()));
    }
}
```

Add the following root property to `backend/appsettings.json`:

```json
"FiiSso": {
  "SecureCookie": true,
  "CookieDomain": ""
}
```

Remove `Jwt:Key` from `backend/appsettings.json`; keep only issuer and audience there. Add the existing long development key under `Jwt:Key` in `backend/appsettings.Development.json`, alongside the local cookie override. Deployed environments must provide `Jwt__Key` explicitly.

Add the local override to `backend/appsettings.Development.json`:

```json
"FiiSso": {
  "SecureCookie": false,
  "CookieDomain": ""
}
```

- [ ] **Step 4: Run targeted and existing backend tests**

Run:

```powershell
rtk dotnet test backend.Tests/backend.Tests.csproj --filter "FullyQualifiedName~FiiSsoTests|FullyQualifiedName~PasswordHasherTests"
```

Expected: PASS for all selected tests.

- [ ] **Step 5: Commit the contract**

```powershell
rtk git add backend/Security/FiiSso.cs backend/Security/FiiCors.cs backend.Tests/FiiSsoTests.cs backend/appsettings.json backend/appsettings.Development.json
rtk git commit -m "feat(auth): define shared FII session cookie"
```

---

### Task 2: Main backend login, session, logout, and cookie authentication

**Files:**
- Modify: `backend/Controllers/AuthController.cs`
- Modify: `backend/Program.cs`
- Modify: `backend.Tests/FiiSsoTests.cs`

- [ ] **Step 1: Extend the failing test with cookie clearing**

Append this test to `backend.Tests/FiiSsoTests.cs`:

```csharp
[Fact]
public void ClearCookie_ExpiresTheSharedCookie()
{
    var context = new DefaultHttpContext();

    FiiSso.ClearCookie(context.Response, Configuration());

    var header = context.Response.Headers.SetCookie.ToString().ToLowerInvariant();
    Assert.Contains("fii_sso=", header);
    Assert.Contains("expires=thu, 01 jan 1970", header);
    Assert.Contains("httponly", header);
    Assert.Contains("samesite=strict", header);
}
```

- [ ] **Step 2: Run the test and verify the endpoint work is not yet present**

Run:

```powershell
rtk dotnet test backend.Tests/backend.Tests.csproj --filter FullyQualifiedName~FiiSsoTests
rtk rg -n "HttpGet\(\"session\"\)|HttpPost\(\"logout\"\)|OnMessageReceived" backend/Controllers/AuthController.cs backend/Program.cs
```

Expected: tests pass for the helper, while `rg` returns no session/logout/cookie-auth implementation.

- [ ] **Step 3: Wire login and add session/logout endpoints**

In `backend/Controllers/AuthController.cs`, add `using Microsoft.AspNetCore.Authorization;` and replace the token creation inside the successful-login branch with:

```csharp
var issued = FiiSso.Issue(request.Username, role, _configuration);
FiiSso.WriteCookie(Response, issued, _configuration);
return Ok(new
{
    token = issued.Value,
    username = request.Username.Trim().ToLowerInvariant(),
    role = role.Trim().ToUpperInvariant()
});
```

Delete the old private `GenerateJwtToken` method and add these actions to the controller:

```csharp
[Authorize]
[HttpGet("session")]
public IActionResult Session()
{
    var session = FiiSso.ReadSession(User);
    return session is null
        ? Unauthorized(new { error = "Invalid session" })
        : Ok(session);
}

[AllowAnonymous]
[HttpPost("logout")]
public IActionResult Logout()
{
    FiiSso.ClearCookie(Response, _configuration);
    return Ok(new { ok = true });
}
```

- [ ] **Step 4: Accept the cookie only when a Bearer header is absent**

In `backend/Program.cs`, replace the development signing-key fallback with the same fail-closed helper used for issuance:

```csharp
var signingKey = FiiSso.SigningKey(builder.Configuration);
```

Use `IssuerSigningKey = signingKey` and `ClockSkew = TimeSpan.Zero` in `TokenValidationParameters`, then remove the now-unused `System.Text` import. Add this `Events` member inside `AddJwtBearer` options, before `TokenValidationParameters`:

```csharp
options.Events = new JwtBearerEvents
{
    OnMessageReceived = context =>
    {
        context.Token = FiiSso.CookieToken(context.Request);
        return Task.CompletedTask;
    },
};
```

Replace the inline CORS registration with the tested helper:

```csharp
builder.Services.AddFiiCors(builder.Configuration);
```

Keep the current issuer, audience, lifetime, and signing-key validation unchanged.

- [ ] **Step 5: Verify backend tests and build**

Run:

```powershell
rtk dotnet test backend.Tests/backend.Tests.csproj
rtk dotnet build backend/backend.csproj --no-restore
```

Expected: all backend tests pass and build exits 0.

- [ ] **Step 6: Commit backend session behavior**

```powershell
rtk git add backend/Controllers/AuthController.cs backend/Program.cs backend.Tests/FiiSsoTests.cs
rtk git commit -m "feat(auth): expose shared login session"
```

---

### Task 3: Gate the complete main frontend and synchronize logout

**Files:**
- Create: `frontend/src/app/router.auth.test.tsx`
- Create: `frontend/src/pages/LoginPage.test.tsx`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/shared/services/apiClient.ts`
- Modify: `frontend/src/features/auth/services/auth.api.ts`
- Modify: `frontend/src/shared/components/layout/ModernShell.tsx`
- Modify: `frontend/src/shared/components/layout/ModernShell.test.tsx`
- Modify: `frontend/src/app/i18n/en/index.ts`
- Modify: `frontend/src/app/i18n/vi/index.ts`
- Modify: `frontend/src/app/i18n/zh-CN/index.ts`

- [ ] **Step 1: Write a failing route-gate test**

Create `frontend/src/app/router.auth.test.tsx`:

```tsx
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../shared/store/auth.store';
import { AppRouter } from './router';

vi.mock('../pages/LoginPage', () => ({ default: () => <h1>Shared login</h1> }));

describe('application authentication boundary', () => {
  beforeEach(() => {
    useAuthStore.setState({
      token: null,
      username: null,
      role: null,
      isAuthenticated: false,
      sessionChecked: true,
      welcomePending: false,
      hasSeenWelcome: true,
      sessionMessage: null,
    });
  });

  afterEach(cleanup);

  it.each(['/', '/lines', '/machines', '/alarms', '/settings', '/production-analysis', '/slideshow', '/admin'])
  ('redirects unauthenticated entry %s to login', async (path) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <AppRouter />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Shared login' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the route test and verify it fails on public viewer paths**

Run:

```powershell
rtk npm.cmd run test:run -- src/app/router.auth.test.tsx
```

Working directory: `frontend`

Expected: FAIL for `/`, viewer paths, and `/slideshow` because they are currently public.

- [ ] **Step 3: Move protection to the shared route boundaries**

In `frontend/src/app/router.tsx`, protect slideshow directly:

```tsx
<Route
  path="/slideshow"
  element={withSuspense(<ProtectedRoute><SlideshowPage /></ProtectedRoute>)}
/>
```

Protect the admin layout once and remove redundant `ProtectedRoute` wrappers from admin children except role-specific wrappers:

```tsx
<Route path="admin" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
  <Route index element={withSuspense(<DashboardPage />)} />
  <Route path="lines" element={withSuspense(<LinesPage />)} />
  <Route path="machines" element={withSuspense(<MachineListPage />)} />
  <Route path="machines/:id" element={withSuspense(<MachineDetailPage />)} />
  <Route path="alarms" element={withSuspense(<AlarmPage />)} />
  <Route path="settings" element={withSuspense(<SettingsPage />)} />
  <Route path="reports" element={withSuspense(<ReportsPage />)} />
  <Route path="system" element={withSuspense(<SystemPage />)} />
  <Route path="simulation" element={withSuspense(<ProtectedRoute allowedRoles={['ADMIN', 'ENGINEER']}><SimulationPage /></ProtectedRoute>)} />
  <Route path="users" element={withSuspense(<ProtectedRoute allowedRoles={['ADMIN']}><AdminUserManagementPage /></ProtectedRoute>)} />
  <Route path="audit-logs" element={withSuspense(<ProtectedRoute allowedRoles={['ADMIN']}><AdminAuditLogPage /></ProtectedRoute>)} />
  <Route path="flow-designer" element={<Navigate to="/admin/lines" replace />} />
  <Route path="dashboard" element={<Navigate to="/admin" replace />} />
</Route>
```

Protect the viewer layout once:

```tsx
<Route element={withSuspense(<ProtectedRoute><ViewerLayout /></ProtectedRoute>)}>
```

Keep `/login` as the only public application screen.

- [ ] **Step 4: Lock successful login navigation with a regression test**

Create `frontend/src/pages/LoginPage.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../app/i18n';
import { useAuthStore } from '../shared/store/auth.store';
import LoginPage from './LoginPage';

const authApiMock = vi.hoisted(() => ({ login: vi.fn() }));

vi.mock('../features/auth/services/auth.api', () => ({ authApi: authApiMock }));

describe('LoginPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    authApiMock.login.mockReset();
    authApiMock.login.mockResolvedValue({
      token: 'signed-token',
      username: 'admin',
      role: 'ADMIN',
    });
    useAuthStore.setState({
      token: null,
      username: null,
      role: null,
      isAuthenticated: false,
      sessionChecked: true,
      welcomePending: false,
      hasSeenWelcome: true,
      sessionMessage: null,
    });
  });

  afterEach(cleanup);

  it('enters the protected application after one successful login', async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={['/login']}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/admin" element={<h1>Admin landing</h1>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </I18nextProvider>,
    );

    await user.type(screen.getByPlaceholderText(i18n.t('auth.usernamePlaceholder')), 'admin');
    await user.type(screen.getByPlaceholderText(i18n.t('auth.passwordPlaceholder')), 'secret');
    await user.click(screen.getByRole('button', { name: i18n.t('auth.submit') }));

    expect(await screen.findByRole('heading', { name: 'Admin landing' })).toBeInTheDocument();
    expect(authApiMock.login).toHaveBeenCalledWith({ username: 'admin', password: 'secret' });
    expect(useAuthStore.getState()).toMatchObject({
      username: 'admin', role: 'ADMIN', isAuthenticated: true,
    });
  });
});
```

- [ ] **Step 5: Add credentialed logout transport**

In `frontend/src/shared/services/apiClient.ts`, add `withCredentials: true` to the Axios instance:

```ts
export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10_000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});
```

Add logout to `frontend/src/features/auth/services/auth.api.ts`:

```ts
logout: () => api.post<{ ok: boolean }>('/auth/logout').then((response) => response.data),
```

In `ModernShell.tsx`, import `authApi`, select `addToast` from `useUiStore`, and replace `handleLogout` with:

```tsx
const handleLogout = async () => {
  try {
    await authApi.logout();
  } catch {
    addToast('error', t('auth.errors.logoutFailed'));
  } finally {
    logout();
    setAccountOpen(false);
    navigate('/login', { replace: true });
  }
};
```

Change the logout button to `onClick={() => void handleLogout()}`.

Add these exact translations under `auth.errors`:

```ts
// en
logoutFailed: 'Server logout did not complete. The shared session may remain active until it expires.',

// vi
logoutFailed: 'Đăng xuất máy chủ chưa hoàn tất. Phiên dùng chung có thể còn hiệu lực cho đến khi hết hạn.',

// zh-CN
logoutFailed: '服务器退出未完成。共享会话可能会持续有效，直到过期。',
```

- [ ] **Step 6: Add a focused logout regression test**

In `ModernShell.test.tsx`, add the hoisted mock beside `dashboardApiMock`:

```tsx
const authApiMock = vi.hoisted(() => ({ logout: vi.fn() }));

vi.mock('../../../features/auth/services/auth.api', () => ({ authApi: authApiMock }));
```

In the existing `beforeEach`, reset the mock and toast state:

```tsx
authApiMock.logout.mockReset();
authApiMock.logout.mockResolvedValue({ ok: true });
useUiStore.setState({ notifications: [], toasts: [] });
```

Then add:

```tsx
it('clears local state and reports when shared server logout fails', async () => {
  const user = userEvent.setup();
  authApiMock.logout.mockRejectedValue(new Error('offline'));
  useAuthStore.setState({
    token: 'token', username: 'admin', role: 'ADMIN', isAuthenticated: true,
    sessionChecked: true, welcomePending: false, hasSeenWelcome: true, sessionMessage: null,
  });
  renderViewerShell();

  await user.click(screen.getByRole('button', { name: i18n.t('common.aria.userMenu') }));
  await user.click(screen.getByRole('button', { name: i18n.t('common.actions.logout') }));

  expect(authApiMock.logout).toHaveBeenCalledTimes(1);
  expect(useAuthStore.getState().isAuthenticated).toBe(false);
  expect(useUiStore.getState().toasts.at(-1)?.message).toBe(i18n.t('auth.errors.logoutFailed'));
});
```

- [ ] **Step 7: Run frontend tests, i18n check, and build**

Working directory: `frontend`

```powershell
rtk npm.cmd run test:run -- src/app/router.auth.test.tsx src/pages/LoginPage.test.tsx src/shared/components/layout/ModernShell.test.tsx
rtk npm.cmd run i18n:check
rtk npm.cmd run lint
rtk npm.cmd run build
```

Expected: route, login, and shell tests pass; i18n key sets match; lint, TypeScript, and Vite build exit 0.

- [ ] **Step 8: Commit the main frontend boundary**

```powershell
rtk git add frontend/src/app/router.tsx frontend/src/app/router.auth.test.tsx frontend/src/pages/LoginPage.test.tsx frontend/src/shared/services/apiClient.ts frontend/src/features/auth/services/auth.api.ts frontend/src/shared/components/layout/ModernShell.tsx frontend/src/shared/components/layout/ModernShell.test.tsx frontend/src/app/i18n/en/index.ts frontend/src/app/i18n/vi/index.ts frontend/src/app/i18n/zh-CN/index.ts
rtk git commit -m "feat(frontend): require shared FII login"
```

---

### Task 4: Odysseus JWT validator and shadow-user mapping

**Files:**
- Create: `Odysseus/core/fii_sso.py`
- Create: `Odysseus/tests/test_fii_sso.py`
- Modify: `Odysseus/core/auth.py`

- [ ] **Step 1: Write failing validator and user-mapping tests**

Create `Odysseus/tests/test_fii_sso.py`:

```python
import base64
import hashlib
import hmac
import json
import time

import pytest

from core.auth import AuthManager
from core.fii_sso import FiiSsoError, resolve_fii_sso, validate_fii_sso

SECRET = "test-fii-secret-that-is-at-least-32-bytes-long"
ISSUER = "MKZ_PLC_Server"
AUDIENCE = "MKZ_PLC_Client"


def _encode(value: dict) -> str:
    raw = json.dumps(value, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _token(**overrides) -> str:
    payload = {
        "sub": "admin",
        "role": "ADMIN",
        "iss": ISSUER,
        "aud": AUDIENCE,
        "exp": int(time.time()) + 300,
        **overrides,
    }
    head = _encode({"alg": "HS256", "typ": "JWT"})
    body = _encode(payload)
    signature = hmac.new(SECRET.encode(), f"{head}.{body}".encode(), hashlib.sha256).digest()
    encoded_signature = base64.urlsafe_b64encode(signature).decode().rstrip("=")
    return f"{head}.{body}.{encoded_signature}"


def test_validates_signed_identity():
    assert validate_fii_sso(_token(), SECRET, ISSUER, AUDIENCE) == ("admin", "ADMIN")


@pytest.mark.parametrize("token", [
    lambda: _token(exp=1),
    lambda: _token(iss="wrong"),
    lambda: _token(aud="wrong"),
    lambda: _token(role="OWNER"),
    lambda: _token(sub=""),
])
def test_rejects_invalid_claims(token):
    with pytest.raises(FiiSsoError):
        validate_fii_sso(token(), SECRET, ISSUER, AUDIENCE)


def test_rejects_tampered_signature():
    token = _token(sub="admin")
    head, body, signature = token.split(".")
    signature = ("a" if signature[0] != "a" else "b") + signature[1:]
    with pytest.raises(FiiSsoError):
        validate_fii_sso(f"{head}.{body}.{signature}", SECRET, ISSUER, AUDIENCE)


@pytest.mark.parametrize(("role", "is_admin"), [
    ("ADMIN", True),
    ("ENGINEER", False),
    ("GUEST", False),
])
def test_creates_passwordless_shadow_user_and_maps_role(tmp_path, role, is_admin):
    manager = AuthManager(str(tmp_path / "auth.json"))
    username = f"factory.{role.lower()}"
    assert manager.ensure_fii_sso_user(username, role) is True
    assert manager.is_admin(username) is is_admin
    assert manager.verify_password(username, "any-password") is False


def test_updates_shadow_user_when_the_signed_role_changes(tmp_path):
    manager = AuthManager(str(tmp_path / "auth.json"))
    assert manager.ensure_fii_sso_user("factory.user", "ADMIN") is True
    assert manager.ensure_fii_sso_user("factory.user", "GUEST") is True
    assert manager.is_admin("factory.user") is False


def test_rejects_collision_with_native_user(tmp_path):
    manager = AuthManager(str(tmp_path / "auth.json"))
    assert manager.create_user("alice", "secure-password", is_admin=False) is True
    assert manager.ensure_fii_sso_user("alice", "ADMIN") is False
    assert manager.is_admin("alice") is False


def test_missing_sso_cookie_preserves_native_session_fallback(tmp_path):
    manager = AuthManager(str(tmp_path / "auth.json"))
    assert manager.create_user("native.user", "secure-password", is_admin=False) is True
    native_token = manager.create_session("native.user", "secure-password")

    assert resolve_fii_sso({}, True, SECRET, ISSUER, AUDIENCE) is None
    assert native_token is not None
    assert manager.status(native_token)["authenticated"] is True
```

- [ ] **Step 2: Run the focused pytest and verify red state**

Working directory: `Odysseus`

```powershell
rtk python -m pytest tests/test_fii_sso.py -q
```

Expected: collection/import failure because `core.fii_sso` and `ensure_fii_sso_user` do not exist.

- [ ] **Step 3: Implement strict standard-library HS256 validation**

Create `Odysseus/core/fii_sso.py`:

```python
import base64
import hashlib
import hmac
import json
import time
from collections.abc import Mapping


class FiiSsoError(ValueError):
    pass


def _decode(value: str) -> dict:
    try:
        padded = value + "=" * (-len(value) % 4)
        decoded = base64.urlsafe_b64decode(padded.encode())
        result = json.loads(decoded)
    except (ValueError, TypeError, json.JSONDecodeError) as error:
        raise FiiSsoError("Invalid FII session token") from error
    if not isinstance(result, dict):
        raise FiiSsoError("Invalid FII session token")
    return result


def validate_fii_sso(token: str, secret: str, issuer: str, audience: str, now: int | None = None) -> tuple[str, str]:
    if len(secret.encode()) < 32:
        raise FiiSsoError("FII JWT secret must be at least 32 bytes")
    try:
        head, body, encoded_signature = token.split(".")
    except ValueError as error:
        raise FiiSsoError("Invalid FII session token") from error
    header = _decode(head)
    payload = _decode(body)
    if header.get("alg") != "HS256":
        raise FiiSsoError("Invalid FII session algorithm")

    try:
        padded_signature = encoded_signature + "=" * (-len(encoded_signature) % 4)
        signature = base64.urlsafe_b64decode(padded_signature.encode())
    except ValueError as error:
        raise FiiSsoError("Invalid FII session signature") from error
    expected = hmac.new(secret.encode(), f"{head}.{body}".encode(), hashlib.sha256).digest()
    if not hmac.compare_digest(signature, expected):
        raise FiiSsoError("Invalid FII session signature")

    username = payload.get("sub")
    role = payload.get("role")
    expiration = payload.get("exp")
    if not isinstance(username, str) or not username.strip() or len(username.strip()) > 255:
        raise FiiSsoError("Invalid FII session subject")
    if role not in {"ADMIN", "ENGINEER", "GUEST"}:
        raise FiiSsoError("Invalid FII session role")
    if payload.get("iss") != issuer or payload.get("aud") != audience:
        raise FiiSsoError("Invalid FII session issuer or audience")
    if not isinstance(expiration, (int, float)) or expiration <= (now if now is not None else time.time()):
        raise FiiSsoError("Expired FII session")
    return username.strip().lower(), role


def resolve_fii_sso(
    cookies: Mapping[str, str],
    enabled: bool,
    secret: str,
    issuer: str,
    audience: str,
) -> tuple[str, str] | None:
    if not enabled:
        return None
    token = cookies.get("fii_sso")
    return validate_fii_sso(token, secret, issuer, audience) if token else None
```

- [ ] **Step 4: Add passwordless shadow-user support**

In `Odysseus/core/auth.py`, replace `verify_password` and add `ensure_fii_sso_user` immediately before it:

```python
def ensure_fii_sso_user(self, username: str, role: str) -> bool:
    username = username.strip().lower()
    if not username or username in RESERVED_USERNAMES or role not in {"ADMIN", "ENGINEER", "GUEST"}:
        return False
    with self._config_lock:
        existing = self.users.get(username)
        if existing and existing.get("auth_source") != "fii_sso":
            return False
        is_admin = role == "ADMIN"
        self._config.setdefault("users", {})[username] = {
            "created": (existing or {}).get("created", time.time()),
            "is_admin": is_admin,
            "auth_source": "fii_sso",
            "privileges": dict(ADMIN_PRIVILEGES if is_admin else DEFAULT_PRIVILEGES),
        }
        self._save()
    return True

def verify_password(self, username: str, password: str) -> bool:
    username = username.strip().lower()
    user = self.users.get(username)
    password_hash = user.get("password_hash") if isinstance(user, dict) else None
    return isinstance(password_hash, str) and _verify_password(password, password_hash)
```

- [ ] **Step 5: Run focused and adjacent Odysseus tests**

Working directory: `Odysseus`

```powershell
rtk python -m pytest tests/test_fii_sso.py tests/test_auth_session_revocation.py tests/test_auth_event_loop.py -q
```

Expected: all selected tests pass.

- [ ] **Step 6: Commit validator and shadow users**

```powershell
rtk git add Odysseus/core/fii_sso.py Odysseus/core/auth.py Odysseus/tests/test_fii_sso.py
rtk git commit -m "feat(odysseus): validate shared FII identities"
```

---

### Task 5: Authenticate Odysseus requests with the shared cookie

**Files:**
- Modify: `Odysseus/app.py`
- Modify: `Odysseus/routes/auth_routes.py`
- Modify: `Odysseus/tests/test_fii_sso.py`
- Modify: `Odysseus/.env.example`

- [ ] **Step 1: Add a failing status-shape test**

Append this test to `Odysseus/tests/test_fii_sso.py` to lock the data needed by the existing auth status UI:

```python
def test_shadow_user_status_uses_effective_privileges(tmp_path):
    manager = AuthManager(str(tmp_path / "auth.json"))
    assert manager.ensure_fii_sso_user("factory.engineer", "ENGINEER") is True

    status = manager.status_for_user("factory.engineer")

    assert status["authenticated"] is True
    assert status["username"] == "factory.engineer"
    assert status["is_admin"] is False
    assert status["privileges"] == manager.get_privileges("factory.engineer")
```

- [ ] **Step 2: Run the focused test and verify red state**

Working directory: `Odysseus`

```powershell
rtk python -m pytest tests/test_fii_sso.py::test_shadow_user_status_uses_effective_privileges -q
```

Expected: FAIL because `AuthManager.status_for_user` does not exist.

- [ ] **Step 3: Add one reusable status method**

Add this method next to `status` in `Odysseus/core/auth.py` and make the existing token-based `status` delegate to it when authenticated:

```python
def status_for_user(self, username: str) -> Dict[str, Any]:
    username = username.strip().lower()
    if username not in self.users:
        return {
            "configured": self.is_configured,
            "authenticated": False,
            "username": None,
            "is_admin": False,
        }
    return {
        "configured": self.is_configured,
        "authenticated": True,
        "username": username,
        "is_admin": self.is_admin(username),
        "privileges": self.get_privileges(username),
    }

def status(self, token: Optional[str]) -> Dict[str, Any]:
    username = self.get_username_for_token(token)
    return self.status_for_user(username) if username else {
        "configured": self.is_configured,
        "authenticated": False,
        "username": None,
        "is_admin": False,
    }
```

- [ ] **Step 4: Wire SSO before exemptions and native-session fallback**

In `Odysseus/app.py`, import the validator near the existing auth imports and load the exact contract once at startup:

```python
from core.fii_sso import FiiSsoError, resolve_fii_sso

FII_SSO_ENABLED = os.getenv("FII_SSO_ENABLED", "false").lower() == "true"
FII_JWT_SECRET = os.getenv("FII_JWT_SECRET", "").strip()
FII_JWT_ISSUER = os.getenv("FII_JWT_ISSUER", "MKZ_PLC_Server")
FII_JWT_AUDIENCE = os.getenv("FII_JWT_AUDIENCE", "MKZ_PLC_Client")
FII_MAIN_LOGIN_URL = os.getenv("FII_MAIN_LOGIN_URL", "http://localhost:3000/login")
if FII_SSO_ENABLED and len(FII_JWT_SECRET.encode()) < 32:
    raise RuntimeError("FII_JWT_SECRET must be at least 32 bytes when FII_SSO_ENABLED=true")
```

Inside `AuthMiddleware.dispatch`, keep CORS preflight first, then insert this block before `_is_auth_exempt(path)`:

```python
try:
    sso_identity = resolve_fii_sso(
        request.cookies,
        FII_SSO_ENABLED,
        FII_JWT_SECRET,
        FII_JWT_ISSUER,
        FII_JWT_AUDIENCE,
    )
    if sso_identity:
        sso_username, sso_role = sso_identity
        if not auth_manager.ensure_fii_sso_user(sso_username, sso_role):
            raise FiiSsoError("FII identity conflicts with a native Odysseus user")
except FiiSsoError:
    if path.startswith("/api/"):
        return JSONResponse(status_code=401, content={"error": "Invalid FII session"})
    return RedirectResponse(url=FII_MAIN_LOGIN_URL, status_code=302)
if sso_identity:
    request.state.current_user = sso_username
    request.state.api_token = False
    request.state.fii_sso = True
    return await call_next(request)
```

Do not create an `odysseus_session` cookie for SSO identities. `resolve_fii_sso` returns `None` when the cookie is absent, so execution must continue into the existing `ody_` bearer and `odysseus_session` branches unchanged.

- [ ] **Step 5: Make the existing status route understand middleware identity**

Replace `auth_status` in `Odysseus/routes/auth_routes.py` with:

```python
@router.get("/status")
async def auth_status(request: Request):
    sso_username = getattr(request.state, "current_user", None)
    if getattr(request.state, "fii_sso", False) and sso_username:
        result = auth_manager.status_for_user(sso_username)
    else:
        result = auth_manager.status(request.cookies.get(SESSION_COOKIE))
    result["signup_enabled"] = auth_manager.signup_enabled
    if result.get("authenticated") and "privileges" not in result:
        result["privileges"] = auth_manager.get_privileges(result["username"])
    return result
```

- [ ] **Step 6: Document local settings**

Add this block to the Auth & Security section of `Odysseus/.env.example`:

```dotenv
# Accept the same-host HttpOnly session issued by the main FII backend.
# FII_SSO_ENABLED=true
# FII_JWT_SECRET=replace-with-the-same-32-byte-or-longer-secret-as-the-main-backend
# FII_JWT_ISSUER=MKZ_PLC_Server
# FII_JWT_AUDIENCE=MKZ_PLC_Client
# FII_MAIN_LOGIN_URL=http://localhost:3000/login
```

- [ ] **Step 7: Run Odysseus auth regression tests**

Working directory: `Odysseus`

```powershell
rtk python -m pytest tests/test_fii_sso.py tests/test_auth_session_revocation.py tests/test_auth_event_loop.py tests/test_auth_regressions.py -q
```

Expected: all selected tests pass. If unrelated baseline tests fail, record their exact existing failure separately and keep every selected SSO test green.

- [ ] **Step 8: Commit Odysseus middleware integration**

```powershell
rtk git add Odysseus/app.py Odysseus/routes/auth_routes.py Odysseus/core/auth.py Odysseus/tests/test_fii_sso.py Odysseus/.env.example
rtk git commit -m "feat(odysseus): accept shared FII login"
```

---

### Task 6: Add Open Data Fusion factory-cookie identity provider

**Files:**
- Modify: `Open-Data-Fusion/apps/api/src/auth.ts`
- Modify: `Open-Data-Fusion/apps/api/src/app.ts`
- Modify: `Open-Data-Fusion/apps/api/tests/auth.test.ts`

- [ ] **Step 1: Write failing factory-provider tests**

In `Open-Data-Fusion/apps/api/tests/auth.test.ts`, import `FactoryIdentityProvider`, define a shared secret, and add:

```ts
const factorySecret = 'test-fii-secret-that-is-at-least-32-bytes-long';

function signFactoryToken(
  userId: string,
  role: string,
  overrides: { issuer?: string; audience?: string; expiration?: string } = {},
): Promise<string> {
  return new SignJWT({ role })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuer(overrides.issuer ?? 'MKZ_PLC_Server')
    .setAudience(overrides.audience ?? 'MKZ_PLC_Client')
    .setIssuedAt()
    .setExpirationTime(overrides.expiration ?? '5m')
    .sign(new TextEncoder().encode(factorySecret));
}

describe('factory cookie authentication', () => {
  let tempDirectory: string;
  let database: FusionDatabase;
  let app: Express;

  beforeEach(() => {
    tempDirectory = mkdtempSync(join(tmpdir(), 'open-data-fusion-factory-auth-'));
    database = new FusionDatabase({ path: join(tempDirectory, 'test.db') });
    app = createApp(database, new WorkspaceEventHub(), {
      identityProvider: new FactoryIdentityProvider({
        secret: factorySecret,
        issuer: 'MKZ_PLC_Server',
        audience: 'MKZ_PLC_Client',
      }),
      defaultPlatformContext: { tenantId: 'demo', projectId: 'north-plant' },
      industrialPersistence: new LegacySqliteIndustrialPersistence(database),
    });
  });

  afterEach(() => {
    database.close();
    rmSync(tempDirectory, { recursive: true, force: true });
  });

  it.each([
    ['ADMIN', ['data:read', 'data:ingest', 'relations:review', 'audit:read', 'platform:admin', 'writeback:request', 'writeback:approve', 'writeback:execute']],
    ['ENGINEER', ['data:read', 'data:ingest', 'relations:review', 'writeback:request']],
    ['GUEST', ['data:read']],
  ] as const)('maps %s to explicit permissions', async (role, permissions) => {
    const token = await signFactoryToken('factory.user', role);
    const provider = new FactoryIdentityProvider({ secret: factorySecret, issuer: 'MKZ_PLC_Server', audience: 'MKZ_PLC_Client' });
    const requestLike = { headers: { cookie: `fii_sso=${token}` } } as unknown as import('express').Request;

    const identity = await provider.authenticate(requestLike);

    expect(identity.userId).toBe('factory.user');
    expect(identity.role).toBe(role);
    expect([...identity.permissions]).toEqual(permissions);
  });

  it('returns verified session metadata without the token', async () => {
    const token = await signFactoryToken('factory.user', 'GUEST');
    const response = await request(app).get('/api/v1/auth/session').set('cookie', `fii_sso=${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      authenticated: true,
      identity: { userId: 'factory.user', displayName: 'factory.user', role: 'GUEST' },
    });
    expect(JSON.stringify(response.body)).not.toContain(token);
  });

  it.each([
    () => signFactoryToken('factory.user', 'GUEST', { issuer: 'wrong' }),
    () => signFactoryToken('factory.user', 'GUEST', { audience: 'wrong' }),
    () => signFactoryToken('factory.user', 'GUEST', { expiration: '0s' }),
  ])('rejects an invalid shared token', async (makeToken) => {
    const token = await makeToken();
    const response = await request(app).get('/api/v1/auth/session').set('cookie', `fii_sso=${token}`);
    expect(response.status).toBe(401);
  });

  it('rejects missing, tampered, and unsupported-role cookies', async () => {
    const valid = await signFactoryToken('factory.user', 'GUEST');
    const segments = valid.split('.');
    const [head, body, signature] = [segments[0]!, segments[1]!, segments[2]!];
    const tamperedSignature = `${signature[0] === 'a' ? 'b' : 'a'}${signature.slice(1)}`;
    const tampered = `${head}.${body}.${tamperedSignature}`;
    const unsupportedRole = await signFactoryToken('factory.user', 'OWNER');
    const missingSubject = await new SignJWT({ role: 'GUEST' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('MKZ_PLC_Server')
      .setAudience('MKZ_PLC_Client')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(factorySecret));

    for (const cookieValue of [undefined, tampered, unsupportedRole, missingSubject]) {
      const pending = request(app).get('/api/v1/auth/session');
      const response = await (cookieValue ? pending.set('cookie', `fii_sso=${cookieValue}`) : pending);
      expect(response.status).toBe(401);
    }
  });

  it('keeps project membership enforcement after authentication', async () => {
    const token = await signFactoryToken('not-a-member', 'GUEST');
    const response = await request(app).get('/api/v1/assets').set('cookie', `fii_sso=${token}`);
    expect(response.status).toBe(403);
  });
});
```

In the existing `identity environment configuration` suite, add:

```ts
it('requires an explicit secret for factory authentication', () => {
  expect(() => createIdentityProviderFromEnvironment({ ODF_AUTH_MODE: 'factory' })).toThrow(
    'FII_JWT_SECRET is required for the selected authentication mode',
  );
});

it('creates the factory provider only when explicitly selected', () => {
  const provider = createIdentityProviderFromEnvironment({
    ODF_AUTH_MODE: 'factory',
    FII_JWT_SECRET: factorySecret,
    FII_JWT_ISSUER: 'MKZ_PLC_Server',
    FII_JWT_AUDIENCE: 'MKZ_PLC_Client',
  });

  expect(provider.mode).toBe('factory');
});
```

- [ ] **Step 2: Run the focused API test and verify red state**

Working directory: `Open-Data-Fusion`

```powershell
rtk npm.cmd test --workspace @open-data-fusion/api -- auth.test.ts
```

Expected: FAIL because `FactoryIdentityProvider`, factory mode, and `/api/v1/auth/session` do not exist.

- [ ] **Step 3: Implement cookie parsing and verified factory identity**

In `Open-Data-Fusion/apps/api/src/auth.ts`, extend the provider mode and identity shape:

```ts
export type FactoryRole = 'ADMIN' | 'ENGINEER' | 'GUEST';

export interface AuthenticatedIdentity {
  userId: string;
  displayName?: string;
  role?: FactoryRole;
  claims?: JWTPayload;
  permissions: ReadonlySet<DataPlanePermission>;
}

export interface IdentityProvider {
  readonly mode: 'development' | 'oidc' | 'factory';
  authenticate(request: Request, context?: AuthenticationContext): Promise<AuthenticatedIdentity>;
}
```

Add this provider before `OidcIdentityProvider`:

```ts
export interface FactoryIdentityProviderConfig {
  secret: string;
  issuer: string;
  audience: string;
}

const factoryPermissions: Record<FactoryRole, readonly DataPlanePermission[]> = {
  ADMIN: DATA_PLANE_PERMISSIONS,
  ENGINEER: ['data:read', 'data:ingest', 'relations:review', 'writeback:request'],
  GUEST: ['data:read'],
};

function cookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim();
  }
  return undefined;
}

export class FactoryIdentityProvider implements IdentityProvider {
  readonly mode = 'factory' as const;
  private readonly key: Uint8Array;

  constructor(private readonly config: FactoryIdentityProviderConfig) {
    this.key = new TextEncoder().encode(config.secret);
    if (this.key.byteLength < 32) throw new Error('FII_JWT_SECRET must be at least 32 bytes');
  }

  async authenticate(request: Request): Promise<AuthenticatedIdentity> {
    const token = cookie(request, 'fii_sso');
    if (!token) throw new AuthenticationError('A valid FII session cookie is required');
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: ['HS256'],
      });
      const userId = normalizedUserId(payload.sub);
      const role = payload.role;
      if (role !== 'ADMIN' && role !== 'ENGINEER' && role !== 'GUEST') {
        throw new AuthenticationError('The FII session has no supported role');
      }
      return {
        userId,
        displayName: userId,
        role,
        claims: payload,
        permissions: new Set(factoryPermissions[role]),
      };
    } catch (error) {
      if (error instanceof AuthenticationError) throw error;
      throw new AuthenticationError('A valid FII session cookie is required');
    }
  }
}
```

Add factory mode to `createIdentityProviderFromEnvironment` before the OIDC branch:

```ts
if (mode === 'factory') {
  return new FactoryIdentityProvider({
    secret: requiredEnvironmentValue(environment, 'FII_JWT_SECRET'),
    issuer: environment.FII_JWT_ISSUER?.trim() || 'MKZ_PLC_Server',
    audience: environment.FII_JWT_AUDIENCE?.trim() || 'MKZ_PLC_Client',
  });
}
```

Update `requiredEnvironmentValue` so its error uses the current variable name rather than saying every missing value belongs to OIDC:

```ts
if (!value) throw new Error(`${name} is required for the selected authentication mode`);
```

- [ ] **Step 4: Add the verified session endpoint**

In `Open-Data-Fusion/apps/api/src/app.ts`, register this route after health routes and before the data-plane routes:

```ts
app.get('/api/v1/auth/session', async (request, response) => {
  const identity = await identityProvider.authenticate(request);
  response.json({
    authenticated: true,
    identity: {
      userId: identity.userId,
      displayName: identity.displayName ?? identity.userId,
      role: identity.role ?? null,
    },
    expiresAt: typeof identity.claims?.exp === 'number' ? identity.claims.exp : null,
  });
});
```

- [ ] **Step 5: Run API authentication and type checks**

Working directory: `Open-Data-Fusion`

```powershell
rtk npm.cmd test --workspace @open-data-fusion/api -- auth.test.ts
rtk npm.cmd run typecheck --workspace @open-data-fusion/api
```

Expected: all auth tests pass and typecheck exits 0.

- [ ] **Step 6: Commit ODF API factory authentication**

```powershell
rtk git add Open-Data-Fusion/apps/api/src/auth.ts Open-Data-Fusion/apps/api/src/app.ts Open-Data-Fusion/apps/api/tests/auth.test.ts
rtk git commit -m "feat(odf): accept shared FII session cookie"
```

---

### Task 7: Open Data Fusion browser session and credentialed API transport

**Files:**
- Modify: `Open-Data-Fusion/apps/web/src/lib/auth.ts`
- Modify: `Open-Data-Fusion/apps/web/src/lib/auth.test.ts`
- Modify: `Open-Data-Fusion/apps/web/src/lib/api.ts`
- Modify: `Open-Data-Fusion/apps/web/src/lib/api.auth.test.ts`
- Create: `Open-Data-Fusion/apps/web/src/components/AuthBoundary.test.tsx`

- [ ] **Step 1: Write failing factory browser-session tests**

Add `VITE_FII_SSO` and `VITE_FII_LOGIN_URL` to `ENVIRONMENT_KEYS` in `auth.test.ts`, and call `vi.unstubAllGlobals()` in the existing `beforeEach` so fetch mocks cannot leak between cases. Then add:

```ts
it('initializes directly from the verified factory session without exposing a token', async () => {
  vi.stubEnv('VITE_FII_SSO', 'true');
  vi.stubEnv('VITE_FII_LOGIN_URL', 'http://localhost:3000/login');
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    authenticated: true,
    identity: { userId: 'factory.user', displayName: 'factory.user', role: 'GUEST' },
    expiresAt: 1_900_000_000,
  }), { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  const auth = await import('./auth');

  await expect(auth.initialize()).resolves.toEqual({
    enabled: true,
    authenticated: true,
    identity: { userId: 'factory.user', displayName: 'factory.user' },
    expiresAt: 1_900_000_000,
  });
  await expect(auth.getAccessToken()).resolves.toBeNull();
  expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/session', expect.objectContaining({ credentials: 'include' }));
});

it('returns an unauthenticated factory session on 401', async () => {
  vi.stubEnv('VITE_FII_SSO', 'true');
  vi.stubEnv('VITE_FII_LOGIN_URL', 'http://localhost:3000/login');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
  const auth = await import('./auth');

  await expect(auth.initialize()).resolves.toEqual({
    enabled: true,
    authenticated: false,
    identity: null,
  });
});
```

- [ ] **Step 2: Run browser auth tests and verify red state**

Working directory: `Open-Data-Fusion`

```powershell
rtk npm.cmd test --workspace @open-data-fusion/web -- auth.test.ts
```

Expected: FAIL because factory browser mode does not exist.

- [ ] **Step 3: Add factory mode without changing OIDC behavior**

In `Open-Data-Fusion/apps/web/src/lib/auth.ts`, add a `mode` discriminator to configurations:

```ts
interface FactoryConfiguration {
  enabled: true;
  mode: 'factory';
  loginUrl: string;
}

interface EnabledConfiguration {
  enabled: true;
  mode: 'oidc';
  authority: string;
  clientId: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
  scope: string;
  userClaim: string;
}

interface DisabledConfiguration {
  enabled: false;
  mode: 'disabled';
}

type BrowserAuthConfiguration = FactoryConfiguration | EnabledConfiguration | DisabledConfiguration;
```

Add a same-host login URL validator:

```ts
function factoryLoginUrl(value: string): string {
  const currentWindow = browserWindow();
  const url = new URL(value || 'http://localhost:3000/login');
  if (!['http:', 'https:'].includes(url.protocol) || url.hostname !== currentWindow.location.hostname) {
    throw new OidcConfigurationError('VITE_FII_LOGIN_URL must use the current application hostname');
  }
  return url.toString();
}
```

At the start of `readConfiguration`, before OIDC configuration, add:

```ts
const factoryEnabled = environmentValue('VITE_FII_SSO').toLowerCase() === 'true';
if (factoryEnabled) {
  if (environmentValue('VITE_OIDC_AUTHORITY') || environmentValue('VITE_OIDC_CLIENT_ID')) {
    throw new OidcConfigurationError('Factory SSO and OIDC cannot be enabled together');
  }
  return {
    enabled: true,
    mode: 'factory',
    loginUrl: factoryLoginUrl(environmentValue('VITE_FII_LOGIN_URL')),
  };
}
```

Return `{ enabled: false, mode: 'disabled' }` for disabled mode and add `mode: 'oidc'` to the existing OIDC return object.

At the start of `initializeOnce`, add the factory branch:

```ts
if (config.mode === 'factory') {
  const response = await fetch('/api/v1/auth/session', {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (response.status === 401) return { enabled: true, authenticated: false, identity: null };
  if (!response.ok) throw new OidcSessionError(`Factory session check failed (${response.status})`);
  const result = await response.json() as {
    identity?: { userId?: unknown; displayName?: unknown };
    expiresAt?: unknown;
  };
  if (typeof result.identity?.userId !== 'string' || typeof result.identity.displayName !== 'string') {
    throw new OidcSessionError('Factory session returned an invalid identity');
  }
  return {
    enabled: true,
    authenticated: true,
    identity: { userId: result.identity.userId, displayName: result.identity.displayName },
    ...(typeof result.expiresAt === 'number' ? { expiresAt: result.expiresAt } : {}),
  };
}
```

In `signInOnce` and `signOutOnce`, handle factory mode before calling `getManager`:

```ts
if (config.mode === 'factory') {
  browserWindow().location.assign(config.loginUrl);
  return;
}
```

Keep `getAccessToken()` returning `null` in factory mode; the HttpOnly cookie is the credential.

- [ ] **Step 4: Send cookies on JSON and SSE requests**

In the shared `request` function in `api.ts`, add credentials:

```ts
const response = await fetch(`${API_BASE}${path}`, {
  ...init,
  credentials: 'include',
  headers,
});
```

In authenticated SSE fetch, also add:

```ts
credentials: 'include',
```

Update `api.auth.test.ts` to assert both request variants use `credentials: 'include'`:

```ts
expect(init.credentials).toBe('include');
```

- [ ] **Step 5: Add an AuthBoundary regression test**

Create `Open-Data-Fusion/apps/web/src/components/AuthBoundary.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthBoundary } from './AuthBoundary';

const authMocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../lib/auth', () => authMocks);

describe('factory AuthBoundary', () => {
  beforeEach(() => {
    authMocks.initialize.mockReset();
    authMocks.signIn.mockReset();
    authMocks.signOut.mockReset();
  });

  it('renders the workspace immediately for a shared session', async () => {
    authMocks.initialize.mockResolvedValue({
      enabled: true,
      authenticated: true,
      identity: { userId: 'factory.user', displayName: 'Factory User' },
    });
    render(<AuthBoundary><div>Factory workspace</div></AuthBoundary>);
    expect(await screen.findByText('Factory workspace')).toBeInTheDocument();
    expect(screen.queryByText('Sign in to Open Data Fusion')).not.toBeInTheDocument();
  });

  it('shows the existing sign-in action when the main session is absent', async () => {
    const user = userEvent.setup();
    authMocks.initialize.mockResolvedValue({ enabled: true, authenticated: false, identity: null });
    render(<AuthBoundary><div>Factory workspace</div></AuthBoundary>);
    expect(await screen.findByText('Sign in to Open Data Fusion')).toBeInTheDocument();
    expect(screen.queryByText('Factory workspace')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue to sign in' }));
    expect(authMocks.signIn).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 6: Run ODF web tests, typecheck, and build**

Working directory: `Open-Data-Fusion`

```powershell
rtk npm.cmd test --workspace @open-data-fusion/web -- auth.test.ts api.auth.test.ts AuthBoundary.test.tsx
rtk npm.cmd run typecheck --workspace @open-data-fusion/web
rtk npm.cmd run build --workspace @open-data-fusion/web
```

Expected: all selected tests pass; typecheck and build exit 0.

- [ ] **Step 7: Commit ODF browser authentication**

```powershell
rtk git add Open-Data-Fusion/apps/web/src/lib/auth.ts Open-Data-Fusion/apps/web/src/lib/auth.test.ts Open-Data-Fusion/apps/web/src/lib/api.ts Open-Data-Fusion/apps/web/src/lib/api.auth.test.ts Open-Data-Fusion/apps/web/src/components/AuthBoundary.test.tsx
rtk git commit -m "feat(odf-web): reuse shared FII login"
```

---

### Task 8: Wire local deployment and prove the full flow

**Files:**
- Modify: `Odysseus/docker-compose.yml`
- Modify: `Open-Data-Fusion/.env.example`
- Modify: `Open-Data-Fusion/Dockerfile.web`
- Modify: `Open-Data-Fusion/docker-compose.yml`

- [ ] **Step 1: Make the shared secret mandatory in the combined Odysseus deployment**

In `Odysseus/docker-compose.yml`, update the main backend environment and add Odysseus SSO settings:

```yaml
mkz-backend:
  environment:
    - Jwt__Key=${JWT_SECRET:?Set JWT_SECRET to at least 32 bytes}
    - Jwt__Issuer=${FII_JWT_ISSUER:-MKZ_PLC_Server}
    - Jwt__Audience=${FII_JWT_AUDIENCE:-MKZ_PLC_Client}
    - FiiSso__SecureCookie=false

odysseus:
  environment:
    - FII_SSO_ENABLED=true
    - FII_JWT_SECRET=${JWT_SECRET:?Set JWT_SECRET to at least 32 bytes}
    - FII_JWT_ISSUER=${FII_JWT_ISSUER:-MKZ_PLC_Server}
    - FII_JWT_AUDIENCE=${FII_JWT_AUDIENCE:-MKZ_PLC_Client}
    - FII_MAIN_LOGIN_URL=${FII_MAIN_LOGIN_URL:-http://localhost:3000/login}
```

Preserve every existing environment entry not shown above.

- [ ] **Step 2: Wire Open Data Fusion preview factory mode**

Add this section to `Open-Data-Fusion/.env.example`:

```dotenv
# Same-host FII login (mutually exclusive with VITE_OIDC_* / ODF_AUTH_MODE=oidc).
# FII_JWT_SECRET=replace-with-the-same-32-byte-or-longer-secret-as-the-main-backend
# FII_JWT_ISSUER=MKZ_PLC_Server
# FII_JWT_AUDIENCE=MKZ_PLC_Client
# VITE_FII_SSO=true
# VITE_FII_LOGIN_URL=http://localhost:3000/login
```

In the build stage of `Open-Data-Fusion/Dockerfile.web`, add these arguments before the build command:

```dockerfile
ARG VITE_FII_SSO=
ARG VITE_FII_LOGIN_URL=
ENV VITE_FII_SSO=${VITE_FII_SSO}
ENV VITE_FII_LOGIN_URL=${VITE_FII_LOGIN_URL}
```

In the `api` preview service in `Open-Data-Fusion/docker-compose.yml`, replace development authentication with:

```yaml
ODF_AUTH_MODE: factory
FII_JWT_SECRET: "${JWT_SECRET:?Set JWT_SECRET to at least 32 bytes}"
FII_JWT_ISSUER: "${FII_JWT_ISSUER:-MKZ_PLC_Server}"
FII_JWT_AUDIENCE: "${FII_JWT_AUDIENCE:-MKZ_PLC_Client}"
```

Add build arguments to the preview `web` service:

```yaml
build:
  context: .
  dockerfile: Dockerfile.web
  args:
    VITE_FII_SSO: "true"
    VITE_FII_LOGIN_URL: "${FII_MAIN_LOGIN_URL:-http://localhost:3000/login}"
```

Keep the main frontend launcher and preview container on one address by changing the preview web mapping to:

```yaml
ports:
  - "127.0.0.1:${ODF_WEB_PORT:-5173}:8080"
```

Leave `docker-compose.production-like.yml` on OIDC. Factory-cookie mode is for the approved same-host deployment only.

- [ ] **Step 3: Validate Compose without starting services**

Set a non-secret temporary validation value only for config rendering:

```powershell
$previousJwtSecret = [Environment]::GetEnvironmentVariable('JWT_SECRET', 'Process')
try {
  $env:JWT_SECRET='compose-validation-secret-that-is-at-least-32-bytes'
  rtk docker compose -f Odysseus/docker-compose.yml config --quiet
  rtk docker compose -f Open-Data-Fusion/docker-compose.yml --profile application-preview config --quiet
} finally {
  if ($null -eq $previousJwtSecret) {
    Remove-Item Env:JWT_SECRET -ErrorAction SilentlyContinue
  } else {
    $env:JWT_SECRET = $previousJwtSecret
  }
}
```

Expected: both commands exit 0 and print no rendered secret.

- [ ] **Step 4: Run all focused verification suites**

From the repository root, verify the main application:

```powershell
rtk dotnet test backend.Tests/backend.Tests.csproj
rtk npm.cmd --prefix frontend run test:run -- src/app/router.auth.test.tsx src/pages/LoginPage.test.tsx src/shared/components/layout/ModernShell.test.tsx
rtk npm.cmd --prefix frontend run i18n:check
rtk npm.cmd --prefix frontend run lint
rtk npm.cmd --prefix frontend run build
```

Working directory: `Odysseus`

```powershell
rtk python -m pytest tests/test_fii_sso.py tests/test_auth_session_revocation.py tests/test_auth_event_loop.py tests/test_auth_regressions.py -q
```

Working directory: `Open-Data-Fusion`

```powershell
rtk npm.cmd test --workspace @open-data-fusion/api -- auth.test.ts
rtk npm.cmd test --workspace @open-data-fusion/web -- auth.test.ts api.auth.test.ts AuthBoundary.test.tsx
rtk npm.cmd run typecheck --workspace @open-data-fusion/api
rtk npm.cmd run typecheck --workspace @open-data-fusion/web
rtk npm.cmd run build --workspace @open-data-fusion/web
```

Expected: every selected suite passes and every build/typecheck exits 0.

- [ ] **Step 5: Start the approved local profiles**

Use one configured secret for all services and start the existing stacks:

```powershell
if (-not $env:JWT_SECRET -or [Text.Encoding]::UTF8.GetByteCount($env:JWT_SECRET.Trim()) -lt 32) {
  throw 'Load a JWT_SECRET of at least 32 bytes from the local secret store'
}
if (-not $env:MKZ_DB_PASSWORD) {
  throw 'Load MKZ_DB_PASSWORD from the local secret store'
}
rtk docker compose -f Odysseus/docker-compose.yml up -d --build --wait mkz-backend mkz-db odysseus
rtk docker compose -f Open-Data-Fusion/docker-compose.yml --profile application-preview up -d --build --wait api web
$frontendProcess = Start-Process -FilePath (Get-Command npm.cmd).Source `
  -ArgumentList @('--prefix', 'frontend', 'run', 'dev', '--', '--host', 'localhost') `
  -WindowStyle Hidden -PassThru
```

Wait until `Invoke-WebRequest http://localhost:3000 -UseBasicParsing` succeeds before continuing. Expected: main frontend, main backend, Odysseus, ODF API, and ODF web become healthy. Keep `$frontendProcess` so the temporary Vite process can be stopped after the manual UI check. Do not commit or print the secret value.

- [ ] **Step 6: Run a same-host cookie smoke check**

Require smoke credentials through environment variables, then reuse one PowerShell web session across ports:

```powershell
if (-not $env:FII_SMOKE_USERNAME -or -not $env:FII_SMOKE_PASSWORD) {
  throw 'Set FII_SMOKE_USERNAME and FII_SMOKE_PASSWORD in the local secret store'
}
$browser = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
$body = @{ username = $env:FII_SMOKE_USERNAME; password = $env:FII_SMOKE_PASSWORD } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post -Uri 'http://localhost:5165/api/auth/login' -ContentType 'application/json' -Body $body -WebSession $browser
if (-not $login.token) { throw 'Main login did not return a token' }
$odysseus = Invoke-RestMethod -Uri 'http://localhost:7000/api/auth/status' -WebSession $browser
if (-not $odysseus.authenticated) { throw 'Odysseus did not accept the shared login' }
$odf = Invoke-RestMethod -Uri 'http://localhost:5173/api/v1/auth/session' -WebSession $browser
if (-not $odf.authenticated) { throw 'Open Data Fusion did not accept the shared login' }
Invoke-RestMethod -Method Post -Uri 'http://localhost:5165/api/auth/logout' -WebSession $browser | Out-Null
$postLogoutOdf = Invoke-WebRequest -Uri 'http://localhost:5173/api/v1/auth/session' -WebSession $browser -SkipHttpErrorCheck
if ($postLogoutOdf.StatusCode -ne 401) { throw 'Open Data Fusion remained authenticated after logout' }
$postLogoutOdysseus = Invoke-WebRequest -Uri 'http://localhost:7000/api/auth/users' -WebSession $browser -SkipHttpErrorCheck
if ($postLogoutOdysseus.StatusCode -ne 401) { throw 'Odysseus remained authenticated after logout' }
```

Expected: the script finishes without throwing. Then manually open `http://localhost:3000`, confirm `/login` appears, login once, and click both sidebar links; neither sibling may show another credential form. Return to the main tab, choose **Sign out**, refresh both sibling tabs, and confirm each directs back to the main login instead of retaining the shared identity.

After the manual UI check, stop only the temporary frontend process started in Step 5:

```powershell
if ($frontendProcess -and -not $frontendProcess.HasExited) {
  Stop-Process -Id $frontendProcess.Id
}
```

- [ ] **Step 7: Review the final diff for secret or token leakage**

```powershell
rtk git diff --check
rtk rg -n "fii_sso=.*\.|JWT_SECRET=[^$<]|token=.*(eyJ|Bearer)" backend frontend Odysseus Open-Data-Fusion -g '!node_modules' -g '!dist' -g '!bin' -g '!obj'
rtk git status --short
```

Expected: diff check passes; search shows only safe variable names, tests, and documentation examples; no real token or deployment secret is present.

- [ ] **Step 8: Commit deployment wiring**

```powershell
rtk git add Odysseus/docker-compose.yml Open-Data-Fusion/.env.example Open-Data-Fusion/Dockerfile.web Open-Data-Fusion/docker-compose.yml
rtk git commit -m "chore(auth): wire same-host FII SSO"
```

---

## Completion gate

Do not claim completion until all seven verification requirements from `docs/superpowers/specs/2026-07-18-shared-login-sso-design.md` have direct evidence. In particular, green unit tests do not replace the same-host runtime smoke check, and successful authentication does not waive Open Data Fusion membership enforcement.

### Spec coverage map

- Requirement 1: Tasks 1-2 cover cookie/JWT issuance, header precedence, verified session metadata, logout clearing, invalid-token rejection, and exact-origin credentialed CORS.
- Requirement 2: Task 3 covers every main route class, successful login navigation, credentialed logout, and local-state clearing.
- Requirement 3: Tasks 4-5 cover strict Odysseus validation, shadow-user mapping, explicit no-cookie native fallback, middleware identity, and status metadata.
- Requirement 4: Task 6 covers ODF factory-cookie validation, all three permission maps, environment selection, and preserved project membership checks.
- Requirement 5: Task 7 covers cookie-only browser initialization, 401 handling, the main-login action, credentialed JSON/SSE transport, and no browser token exposure.
- Requirement 6: Tasks 2-7 run the existing focused regressions, type checks, and builds for every touched application.
- Requirement 7: Task 8 proves the combined same-host login and global logout flow against running services before completion.
