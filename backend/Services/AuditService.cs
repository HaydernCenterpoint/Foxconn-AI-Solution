using System;
using System.Threading.Tasks;

namespace backend.Services
{
    public interface IAuditService
    {
        Task LogAuditAsync(string username, string action, string details);
    }

    public class AuditService : IAuditService
    {
        private readonly DatabaseService _dbService;

        public AuditService(DatabaseService dbService)
        {
            _dbService = dbService;
        }

        public async Task LogAuditAsync(string username, string action, string details)
        {
            try
            {
                string sql = "INSERT INTO audit_logs (username, action, details) VALUES (@username, @action, @details)";
                await _dbService.ExecuteNonQueryAsync(sql, p =>
                {
                    p.AddWithValue("username", username);
                    p.AddWithValue("action", action);
                    p.AddWithValue("details", details);
                });
            }
            catch
            {
                // Silently ignore audit log write failures
            }
        }
    }
}
