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
}
