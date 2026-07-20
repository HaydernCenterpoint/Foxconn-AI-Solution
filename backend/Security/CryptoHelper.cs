using System;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace backend.Security
{
    public static class CryptoHelper
    {
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
                byte[] nonce = new byte[12]; // AesGcm.NonceByteSizes.MaxSize is 12
                RandomNumberGenerator.Fill(nonce);
                byte[] tag = new byte[16]; // AesGcm.TagByteSizes.MaxSize is 16
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
                if (string.IsNullOrEmpty(envelopeJson)) return envelopeJson;
                string trimmed = envelopeJson.TrimStart();
                if (!trimmed.StartsWith("{") || !envelopeJson.Contains("cipherText", StringComparison.OrdinalIgnoreCase))
                {
                    // Not an encrypted envelope, return as-is
                    return envelopeJson;
                }

                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                var envelope = JsonSerializer.Deserialize<EncryptedEnvelope>(envelopeJson, options);
                if (envelope == null || string.IsNullOrEmpty(envelope.CipherText))
                {
                    return envelopeJson;
                }

                byte[] cipherText = Convert.FromBase64String(envelope.CipherText);
                byte[] nonce = Convert.FromBase64String(envelope.Nonce);
                byte[] tag = Convert.FromBase64String(envelope.Tag);
                byte[] plainBytes = new byte[cipherText.Length];

                using (var aesGcm = new AesGcm(GetKey(), tag.Length))
                {
                    aesGcm.Decrypt(nonce, cipherText, tag, plainBytes);
                }

                return Encoding.UTF8.GetString(plainBytes);
            }
            catch (Exception ex)
            {
                Console.WriteLine("[CryptoHelper] Decryption error: " + ex.Message);
                return envelopeJson;
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
}
