using System;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using backend.Services;
using backend.Security;
using Npgsql;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/auth")]
    public class AuthController : ControllerBase
    {
        private readonly DatabaseService _dbService;
        private readonly IAuditService _auditService;
        private readonly IConfiguration _configuration;

        public AuthController(DatabaseService dbService, IAuditService auditService, IConfiguration configuration)
        {
            _dbService = dbService;
            _auditService = auditService;
            _configuration = configuration;
        }

        public class LoginRequest
        {
            public string Username { get; set; } = "";
            public string Password { get; set; } = "";
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest request)
        {
            if (request == null || string.IsNullOrEmpty(request.Username) || string.IsNullOrEmpty(request.Password))
            {
                return BadRequest(new { error = "Username and password are required" });
            }

            using var conn = _dbService.CreateConnection();
            await conn.OpenAsync();

            string sql = "SELECT id, username, password, role FROM users WHERE LOWER(username) = LOWER(@username)";
            using var cmd = new NpgsqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("username", request.Username.Trim());
            
            using var reader = await cmd.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                string storedHash = reader.GetString(2);
                string role = reader.GetString(3);

                if (PasswordHasher.VerifyPassword(request.Password, storedHash))
                {
                    reader.Close();
                    
                    // Log audit action
                    await _auditService.LogAuditAsync(request.Username, "LOGIN", "User logged in successfully");

                    string token = GenerateJwtToken(request.Username, role);
                    return Ok(new
                    {
                        token = token,
                        username = request.Username,
                        role = role
                    });
                }
            }

            reader.Close();
            await _auditService.LogAuditAsync(request.Username, "LOGIN_FAILED", "Failed login attempt");
            return Unauthorized(new { error = "Invalid username or password" });
        }

        private string GenerateJwtToken(string username, string role)
        {
            var keyStr = _configuration["Jwt:Key"] ?? "SUPER_SECRET_KEY_FOR_DEVELOPMENT_MKZ_AUTO_LINE_SYSTEM_123456789";
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(keyStr));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var claims = new[]
            {
                new Claim(ClaimTypes.Name, username),
                new Claim(ClaimTypes.Role, role)
            };

            var token = new JwtSecurityToken(
                issuer: _configuration["Jwt:Issuer"] ?? "MKZ_PLC_Server",
                audience: _configuration["Jwt:Audience"] ?? "MKZ_PLC_Client",
                claims: claims,
                expires: DateTime.Now.AddHours(2),
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }
}
