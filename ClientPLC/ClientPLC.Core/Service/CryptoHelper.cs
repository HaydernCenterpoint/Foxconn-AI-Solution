using System;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace PLC.Service;

public static class CryptoHelper
{
    private const int NonceSize = 12;
    private const int TagSize = 16;
    private static byte[]? _key;

    public static void Initialize(string secretKey)
    {
        if (string.IsNullOrWhiteSpace(secretKey) || Encoding.UTF8.GetByteCount(secretKey) < 32)
            throw new ArgumentException("The MQTT encryption key must be at least 32 bytes.", nameof(secretKey));
        _key = SHA256.HashData(Encoding.UTF8.GetBytes(secretKey));
    }

    public static string Encrypt(string plainText)
    {
        var key = GetKey();
        try
        {
            byte[] plainBytes = Encoding.UTF8.GetBytes(plainText);
            byte[] nonce = new byte[NonceSize];
            RandomNumberGenerator.Fill(nonce);
            byte[] tag = new byte[TagSize];
            byte[] cipherText = new byte[plainBytes.Length];

            using (var aesGcm = new AesGcm(key, tag.Length))
            {
                aesGcm.Encrypt(nonce, plainBytes, cipherText, tag);
            }

            var envelope = new EncryptedEnvelope
            {
                CipherText = Convert.ToBase64String(cipherText),
                Nonce = Convert.ToBase64String(nonce),
                Tag = Convert.ToBase64String(tag)
            };

            return JsonSerializer.Serialize(envelope);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("[CryptoHelper] Encryption error: " + ex.Message);
            throw;
        }
    }

    public static string Decrypt(string envelopeJson)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(envelopeJson))
                throw new CryptographicException("The encrypted MQTT payload is empty.");

            var envelope = JsonSerializer.Deserialize<EncryptedEnvelope>(envelopeJson)
                ?? throw new CryptographicException("The encrypted MQTT envelope is missing.");
            if (string.IsNullOrEmpty(envelope.CipherText) ||
                string.IsNullOrEmpty(envelope.Nonce) ||
                string.IsNullOrEmpty(envelope.Tag))
                throw new CryptographicException("The encrypted MQTT envelope is incomplete.");

            byte[] cipherText = Convert.FromBase64String(envelope.CipherText);
            byte[] nonce = Convert.FromBase64String(envelope.Nonce);
            byte[] tag = Convert.FromBase64String(envelope.Tag);
            if (nonce.Length != NonceSize || tag.Length != TagSize)
                throw new CryptographicException("The encrypted MQTT envelope has invalid nonce or tag sizes.");

            byte[] plainBytes = new byte[cipherText.Length];

            using (var aesGcm = new AesGcm(GetKey(), TagSize))
            {
                aesGcm.Decrypt(nonce, cipherText, tag, plainBytes);
            }

            return Encoding.UTF8.GetString(plainBytes);
        }
        catch (CryptographicException)
        {
            throw;
        }
        catch (Exception ex) when (ex is JsonException or FormatException)
        {
            throw new CryptographicException("The encrypted MQTT envelope is malformed.", ex);
        }
    }

    private static byte[] GetKey() =>
        _key ?? throw new InvalidOperationException("The MQTT encryption key has not been initialized.");

    private class EncryptedEnvelope
    {
        public string CipherText { get; set; } = string.Empty;
        public string Nonce { get; set; } = string.Empty;
        public string Tag { get; set; } = string.Empty;
    }
}
