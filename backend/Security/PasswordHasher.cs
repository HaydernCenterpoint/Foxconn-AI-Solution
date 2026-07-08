using System;
using System.Linq;
using System.Security.Cryptography;
using System.Text;

namespace backend.Security
{
    public static class PasswordHasher
    {
        public static string HashPassword(string password)
        {
            return BCrypt.Net.BCrypt.HashPassword(password, workFactor: 11);
        }

        public static bool VerifyPassword(string password, string storedHash)
        {
            if (string.IsNullOrEmpty(storedHash)) return false;

            // Auto-detect old SHA256 hash (64 hex characters)
            if (storedHash.Length == 64 && storedHash.All(c => "0123456789abcdefABCDEF".Contains(c)))
            {
                return HashPasswordSHA256(password).Equals(storedHash, StringComparison.OrdinalIgnoreCase);
            }

            try
            {
                return BCrypt.Net.BCrypt.Verify(password, storedHash);
            }
            catch
            {
                return false;
            }
        }

        private static string HashPasswordSHA256(string password)
        {
            byte[] bytes = SHA256.HashData(Encoding.UTF8.GetBytes(password));
            var builder = new StringBuilder();
            foreach (byte b in bytes)
            {
                builder.Append(b.ToString("x2"));
            }
            return builder.ToString();
        }
    }
}
