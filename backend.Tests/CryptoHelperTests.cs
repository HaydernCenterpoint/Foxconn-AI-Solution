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

            // Reset back to default for other tests
            CryptoHelper.Initialize("PLC_MQTT_SECRET_KEY_2026_!@#");
        }
    }
}
