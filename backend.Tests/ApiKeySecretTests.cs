using System.Text.RegularExpressions;
using backend.Security;

namespace backend.Tests;

public sealed class ApiKeySecretTests
{
    [Fact]
    public void Generate_ReturnsOpaquePrefixedKey()
    {
        var key = ApiKeySecret.Generate();

        // Prefix + 32 random bytes base64url without padding => "fii_sk_" + 43 chars.
        Assert.StartsWith("fii_sk_", key);
        Assert.Matches(new Regex("^fii_sk_[A-Za-z0-9_-]{43}$"), key);
        Assert.DoesNotContain("=", key); // no padding characters
    }

    [Fact]
    public void Generate_ProducesDistinctKeysPerCall()
    {
        var first = ApiKeySecret.Generate();
        var second = ApiKeySecret.Generate();

        Assert.NotEqual(first, second);
    }

    [Fact]
    public void Hash_IsLowercaseSha256Hex_AndDeterministic()
    {
        var key = ApiKeySecret.Generate();
        var first = ApiKeySecret.Hash(key);
        var second = ApiKeySecret.Hash(key);

        Assert.Equal(64, first.Length); // SHA-256 hex
        Assert.Equal(first, second);    // deterministic
        Assert.Equal(first, first.ToLowerInvariant());
        Assert.Matches(new Regex("^[0-9a-f]{64}$"), first);
    }

    [Fact]
    public void HeaderNameAndScheme_AreStable()
    {
        Assert.Equal("X-API-Key", ApiKeySecret.HeaderName);
        Assert.Equal("ApiKey", ApiKeySecret.Scheme);
    }
}
