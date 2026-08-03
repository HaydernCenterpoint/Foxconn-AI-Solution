using System.Security.Cryptography;
using System.Text;

namespace backend.Security;

/// <summary>
/// Generates and hashes opaque service-account API keys used for
/// service-to-service authentication (e.g. the Odysseus MCP "FII Factory
/// REST Bridge"). The raw key is returned to the caller exactly once when a
/// service account is created/rotated; only the SHA-256 hex digest is stored.
/// </summary>
public static class ApiKeySecret
{
    /// <summary>HTTP request header carrying the API key.</summary>
    public const string HeaderName = "X-API-Key";

    /// <summary>Authentication scheme name registered in the DI container.</summary>
    public const string Scheme = "ApiKey";

    private const string KeyPrefix = "fii_sk_";

    /// <summary>
    /// Generate a new opaque API key (<c>fii_sk_</c> + 32 random bytes, base64url,
    /// no padding). Suitable to hand back to an operator one time.
    /// </summary>
    public static string Generate()
    {
        Span<byte> bytes = stackalloc byte[32];
        RandomNumberGenerator.Fill(bytes);
        return KeyPrefix + Base64UrlEncode(bytes);
    }

    /// <summary>
    /// Lowercase SHA-256 hex digest of an API key. This is what is stored in
    /// <c>users.api_key_hash</c> and looked up by <see cref="ApiKeyAuthHandler"/>.
    /// </summary>
    public static string Hash(string apiKey)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(apiKey));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static string Base64UrlEncode(ReadOnlySpan<byte> bytes)
    {
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }
}
