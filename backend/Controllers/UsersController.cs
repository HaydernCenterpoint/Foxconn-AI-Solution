using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using backend.Services;
using backend.Security;
using Npgsql;

namespace backend.Controllers
{
    [Authorize(Roles = "ADMIN")]
    [ApiController]
    [Route("api/users")]
    public class UsersController : ControllerBase
    {
        private readonly DatabaseService _dbService;
        private readonly IAuditService _auditService;

        public UsersController(DatabaseService dbService, IAuditService auditService)
        {
            _dbService = dbService;
            _auditService = auditService;
        }

        public class CreateUserRequest
        {
            public string Username { get; set; } = "";
            public string Password { get; set; } = "";
            public string Role { get; set; } = "GUEST"; // ADMIN, ENGINEER, GUEST
        }

        [HttpGet]
        public async Task<IActionResult> GetAllUsers()
        {
            var users = new List<object>();
            using var conn = _dbService.CreateConnection();
            await conn.OpenAsync();
            using var cmd = new NpgsqlCommand("SELECT id, username, role FROM users ORDER BY id", conn);
            using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                users.Add(new
                {
                    id = reader.GetInt32(0),
                    username = reader.GetString(1),
                    role = reader.GetString(2)
                });
            }
            return Ok(users);
        }

        [HttpPost]
        public async Task<IActionResult> CreateUser([FromBody] CreateUserRequest request)
        {
            if (request == null || string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
            {
                return BadRequest(new { error = "Username and password are required" });
            }

            string roleUpper = request.Role.Trim().ToUpper();
            if (roleUpper != "ADMIN" && roleUpper != "ENGINEER" && roleUpper != "GUEST")
            {
                return BadRequest(new { error = "Invalid role. Must be ADMIN, ENGINEER, or GUEST" });
            }

            try
            {
                string hashedPassword = PasswordHasher.HashPassword(request.Password);
                string sql = "INSERT INTO users (username, password, role) VALUES (@username, @password, @role)";
                await _dbService.ExecuteNonQueryAsync(sql, p =>
                {
                    p.AddWithValue("username", request.Username.Trim());
                    p.AddWithValue("password", hashedPassword);
                    p.AddWithValue("role", roleUpper);
                });

                var currentAdmin = User.FindFirst(ClaimTypes.Name)?.Value ?? "admin";
                await _auditService.LogAuditAsync(currentAdmin, "CREATE_USER", $"Created user: {request.Username} with role {roleUpper}");

                return Ok(new { success = true, message = "User created successfully" });
            }
            catch (PostgresException ex) when (ex.SqlState == "23505") // Unique violation
            {
                return Conflict(new { error = "Username already exists" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteUser(int id)
        {
            var currentAdmin = User.FindFirst(ClaimTypes.Name)?.Value ?? "admin";

            // Check if user is the last admin
            using (var conn = _dbService.CreateConnection())
            {
                await conn.OpenAsync();

                // Get user role being deleted
                string getRoleSql = "SELECT username, role FROM users WHERE id = @id";
                string userToDelete = "";
                string roleToDelete = "";
                using (var cmd = new NpgsqlCommand(getRoleSql, conn))
                {
                    cmd.Parameters.AddWithValue("id", id);
                    using var reader = await cmd.ExecuteReaderAsync();
                    if (await reader.ReadAsync())
                    {
                        userToDelete = reader.GetString(0);
                        roleToDelete = reader.GetString(1);
                    }
                    else
                    {
                        return NotFound(new { error = "User not found" });
                    }
                }

                if (userToDelete.Equals(currentAdmin, StringComparison.OrdinalIgnoreCase))
                {
                    return BadRequest(new { error = "You cannot delete your own account" });
                }

                if (roleToDelete == "ADMIN")
                {
                    string countAdminsSql = "SELECT COUNT(*) FROM users WHERE role = 'ADMIN'";
                    using var cmdCount = new NpgsqlCommand(countAdminsSql, conn);
                    long adminCount = (long)(await cmdCount.ExecuteScalarAsync() ?? 0L);
                    if (adminCount <= 1)
                    {
                        return BadRequest(new { error = "Cannot delete the last admin account of the system" });
                    }
                }
            }

            string deleteSql = "DELETE FROM users WHERE id = @id";
            await _dbService.ExecuteNonQueryAsync(deleteSql, p => p.AddWithValue("id", id));

            await _auditService.LogAuditAsync(currentAdmin, "DELETE_USER", $"Deleted user ID: {id}");
            return Ok(new { success = true, message = "User deleted successfully" });
        }
    }
}
