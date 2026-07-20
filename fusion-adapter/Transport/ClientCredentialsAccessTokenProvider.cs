using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Fusion.Adapter.Configuration;

namespace Fusion.Adapter.Transport;

public sealed class ClientCredentialsAccessTokenProvider : IAccessTokenProvider, IDisposable
{
    private readonly HttpClient _httpClient;
    private readonly OpenDataFusionAuthenticationOptions _options;
    private readonly SemaphoreSlim _refreshLock = new(1, 1);
    private string? _accessToken;
    private DateTimeOffset _expiresAt = DateTimeOffset.MinValue;

    public ClientCredentialsAccessTokenProvider(HttpClient httpClient, OpenDataFusionAuthenticationOptions options)
    {
        _httpClient = httpClient;
        _options = options;
    }

    public async Task<string> GetAccessTokenAsync(CancellationToken cancellationToken)
    {
        if (IsTokenUsable()) return _accessToken!;

        await _refreshLock.WaitAsync(cancellationToken);
        try
        {
            if (IsTokenUsable()) return _accessToken!;

            if (_options.Mode.Equals("factory", StringComparison.OrdinalIgnoreCase))
            {
                _accessToken = CreateFactoryToken();
                return _accessToken;
            }

            if (string.IsNullOrWhiteSpace(_options.TokenEndpoint) ||
                string.IsNullOrWhiteSpace(_options.ClientId) ||
                string.IsNullOrWhiteSpace(_options.ClientSecret))
            {
                throw new InvalidOperationException("ODF client-credentials authentication is missing token endpoint, client ID, or client secret.");
            }

            var form = new Dictionary<string, string>
            {
                ["grant_type"] = "client_credentials",
                ["client_id"] = _options.ClientId,
                ["client_secret"] = _options.ClientSecret
            };
            if (!string.IsNullOrWhiteSpace(_options.Scope)) form["scope"] = _options.Scope;

            using var response = await _httpClient.PostAsync(
                _options.TokenEndpoint,
                new FormUrlEncodedContent(form),
                cancellationToken);
            var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                throw new HttpRequestException(
                    $"ODF token endpoint returned {(int)response.StatusCode}: {responseBody}",
                    null,
                    response.StatusCode);
            }

            using var document = JsonDocument.Parse(responseBody);
            var root = document.RootElement;
            if (!root.TryGetProperty("access_token", out var tokenProperty) || tokenProperty.ValueKind != JsonValueKind.String)
                throw new InvalidOperationException("ODF token endpoint response did not contain access_token.");

            _accessToken = tokenProperty.GetString();
            if (string.IsNullOrWhiteSpace(_accessToken))
                throw new InvalidOperationException("ODF token endpoint returned an empty access_token.");

            var expiresInSeconds = root.TryGetProperty("expires_in", out var expiryProperty) && expiryProperty.TryGetInt32(out var seconds)
                ? Math.Max(seconds, 60)
                : 300;
            _expiresAt = DateTimeOffset.UtcNow.AddSeconds(Math.Max(expiresInSeconds - 60, 1));
            return _accessToken;
        }
        finally
        {
            _refreshLock.Release();
        }
    }

    public void Dispose()
    {
        _refreshLock.Dispose();
    }

    private bool IsTokenUsable() => !string.IsNullOrWhiteSpace(_accessToken) && _expiresAt > DateTimeOffset.UtcNow;

    private string CreateFactoryToken()
    {
        var key = Encoding.UTF8.GetBytes(_options.FactorySecret);
        var subject = _options.FactorySubject.Trim();
        var issuer = _options.FactoryIssuer.Trim();
        var audience = _options.FactoryAudience.Trim();
        var role = _options.FactoryRole.Trim().ToUpperInvariant();
        if (key.Length < 32 || string.IsNullOrWhiteSpace(subject) || string.IsNullOrWhiteSpace(issuer) ||
            string.IsNullOrWhiteSpace(audience) || role is not ("ADMIN" or "ENGINEER" or "GUEST"))
        {
            throw new InvalidOperationException("ODF factory authentication requires a 32-byte secret, subject, issuer, audience, and supported role.");
        }

        var now = DateTimeOffset.UtcNow;
        var header = EncodeBase64Url(JsonSerializer.SerializeToUtf8Bytes(new { alg = "HS256", typ = "JWT" }));
        var payload = EncodeBase64Url(JsonSerializer.SerializeToUtf8Bytes(new
        {
            sub = subject,
            role,
            iss = issuer,
            aud = audience,
            iat = now.ToUnixTimeSeconds(),
            exp = now.AddMinutes(5).ToUnixTimeSeconds()
        }));
        var signingInput = $"{header}.{payload}";
        var signature = HMACSHA256.HashData(key, Encoding.ASCII.GetBytes(signingInput));
        _expiresAt = now.AddMinutes(4);
        return $"{signingInput}.{EncodeBase64Url(signature)}";
    }

    private static string EncodeBase64Url(ReadOnlySpan<byte> value) =>
        Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
