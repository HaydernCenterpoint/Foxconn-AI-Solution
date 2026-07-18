using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
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

                    var issued = FiiSso.Issue(request.Username, role, _configuration);
                    FiiSso.WriteCookie(Response, issued, _configuration);
                    return Ok(new
                    {
                        token = issued.Value,
                        username = request.Username.Trim().ToLowerInvariant(),
                        role = role.Trim().ToUpperInvariant()
                    });
                }
            }

            reader.Close();
            await _auditService.LogAuditAsync(request.Username, "LOGIN_FAILED", "Failed login attempt");
            return Unauthorized(new { error = "Invalid username or password" });
        }

        [Authorize]
        [HttpGet("session")]
        public IActionResult Session()
        {
            var session = FiiSso.ReadSession(User);
            if (session is null)
            {
                return Unauthorized(new { error = "Invalid session" });
            }

            return Ok(session);
        }

        [AllowAnonymous]
        [HttpPost("logout")]
        public IActionResult Logout()
        {
            FiiSso.ClearCookie(Response, _configuration);
            return Ok(new { ok = true });
        }
    }
}
