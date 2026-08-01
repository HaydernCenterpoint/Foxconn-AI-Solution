using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Configuration;

namespace backend.Security;

public sealed class MqttDeviceTokenValidator
{
    private static readonly byte[] UnknownTokenHash = SHA256.HashData(
        Encoding.UTF8.GetBytes("mqtt-device-token-not-configured"));

    private readonly IReadOnlyDictionary<string, byte[]> _tokenHashes;

    public MqttDeviceTokenValidator(IConfiguration configuration)
    {
        _tokenHashes = configuration
            .GetSection("MqttServer:DeviceTokens")
            .GetChildren()
            .Where(entry => !string.IsNullOrWhiteSpace(entry.Key) && !string.IsNullOrWhiteSpace(entry.Value))
            .ToDictionary(
                entry => entry.Key,
                entry => SHA256.HashData(Encoding.UTF8.GetBytes(entry.Value!)),
                StringComparer.Ordinal);
    }

    public bool Validate(string? clientId, string? userName, string? password)
    {
        var expectedHash = clientId is not null && _tokenHashes.TryGetValue(clientId, out var configuredHash)
            ? configuredHash
            : UnknownTokenHash;
        var presentedHash = SHA256.HashData(Encoding.UTF8.GetBytes(password ?? string.Empty));
        var tokenMatches = CryptographicOperations.FixedTimeEquals(expectedHash, presentedHash);

        return !string.IsNullOrWhiteSpace(clientId)
            && string.Equals(clientId, userName, StringComparison.Ordinal)
            && _tokenHashes.ContainsKey(clientId)
            && tokenMatches;
    }

    public static bool IsOwnedPublishTopic(string? clientId, string? topic)
    {
        if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(topic))
        {
            return false;
        }

        return topic.Equals($"client/{clientId}/register", StringComparison.Ordinal)
            || topic.Equals($"client/{clientId}/telemetry", StringComparison.Ordinal)
            || topic.Equals($"client/{clientId}/heartbeat", StringComparison.Ordinal)
            || topic.Equals($"client/{clientId}/sync", StringComparison.Ordinal);
    }

    public static bool IsOwnedSubscription(string? clientId, string? topicFilter) =>
        !string.IsNullOrWhiteSpace(clientId)
        && string.Equals(topicFilter, $"client/{clientId}/command", StringComparison.Ordinal);
}
