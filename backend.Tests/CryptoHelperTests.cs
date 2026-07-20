using System;
using backend.Security;
using Xunit;

namespace backend.Tests
{
    public class CryptoHelperTests
    {
        [Fact]
        public void EncryptDecrypt_RoundTrip_ReturnsOriginalText()
        {
            // Arrange
            string originalText = "Hello, PLC Monitoring System!";
            CryptoHelper.Initialize("backend-test-mqtt-secret-at-least-32-bytes");

            // Act
            string encrypted = CryptoHelper.Encrypt(originalText);
            string decrypted = CryptoHelper.Decrypt(encrypted);

            // Assert
            Assert.NotEqual(originalText, encrypted);
            Assert.Equal(originalText, decrypted);
        }

        [Fact]
        public void EncryptDecrypt_WithCustomKey_ReturnsOriginalText()
        {
            // Arrange
            string originalText = "Sensitive Payload Data";
            string customSecret = "MY_CUSTOM_SECRET_KEY_FOR_TESTS_123456";

            // Act
            CryptoHelper.Initialize(customSecret);
            string encrypted = CryptoHelper.Encrypt(originalText);
            string decrypted = CryptoHelper.Decrypt(encrypted);

            // Assert
            Assert.NotEqual(originalText, encrypted);
            Assert.Equal(originalText, decrypted);

        }

        [Fact]
        public void Initialize_RejectsMissingOrWeakSecrets()
        {
            Assert.Throws<ArgumentException>(() => CryptoHelper.Initialize(""));
            Assert.Throws<ArgumentException>(() => CryptoHelper.Initialize("too-short"));
        }
    }
}
