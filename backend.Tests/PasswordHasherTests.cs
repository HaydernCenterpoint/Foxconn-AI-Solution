using System;
using System.Security.Cryptography;
using System.Text;
using backend.Security;
using Xunit;

namespace backend.Tests
{
    public class PasswordHasherTests
    {
        [Fact]
        public void HashPassword_GeneratesBCryptHash()
        {
            // Arrange
            string password = "StrongPassword123";

            // Act
            string hash = PasswordHasher.HashPassword(password);

            // Assert
            Assert.NotNull(hash);
            Assert.StartsWith("$2", hash); // BCrypt prefix
            Assert.True(PasswordHasher.VerifyPassword(password, hash));
        }

        [Fact]
        public void VerifyPassword_WithLegacySHA256Hash_Succeeds()
        {
            // Arrange
            string password = "admin123";
            
            // Generate SHA256 hash manually to mock legacy DB records
            byte[] bytes = SHA256.HashData(Encoding.UTF8.GetBytes(password));
            var builder = new StringBuilder();
            foreach (byte b in bytes)
            {
                builder.Append(b.ToString("x2"));
            }
            string sha256Hash = builder.ToString();

            // Act
            bool result = PasswordHasher.VerifyPassword(password, sha256Hash);

            // Assert
            Assert.True(result);
        }

        [Fact]
        public void VerifyPassword_WithWrongPassword_ReturnsFalse()
        {
            // Arrange
            string password = "Password1";
            string wrongPassword = "Password2";
            string hash = PasswordHasher.HashPassword(password);

            // Act
            bool result = PasswordHasher.VerifyPassword(wrongPassword, hash);

            // Assert
            Assert.IsType<bool>(result);
            Assert.False(result);
        }
    }
}
