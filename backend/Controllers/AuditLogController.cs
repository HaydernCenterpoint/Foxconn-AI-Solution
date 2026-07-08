using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using backend.Services;
using Npgsql;

namespace backend.Controllers
{
    [Authorize(Roles = "ADMIN")]
    [ApiController]
    [Route("api/audit-logs")]
    public class AuditLogController : ControllerBase
    {
        private readonly DatabaseService _dbService;

        public AuditLogController(DatabaseService dbService)
        {
            _dbService = dbService;
        }

        [HttpGet]
        public async Task<IActionResult> GetAuditLogs()
        {
            var logs = new List<object>();
            using var conn = _dbService.CreateConnection();
            await conn.OpenAsync();

            string sql = "SELECT id, username, action, details, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 100";
            using var cmd = new NpgsqlCommand(sql, conn);
            using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                logs.Add(new
                {
                    id = reader.GetInt32(0),
                    username = reader.GetString(1),
                    action = reader.GetString(2),
                    details = reader.IsDBNull(3) ? "" : reader.GetString(3),
                    createdAt = reader.GetDateTime(4)
                });
            }
            return Ok(logs);
        }
    }
}
