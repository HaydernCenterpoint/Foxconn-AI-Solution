using System.Text.Json;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace backend.Controllers;

[ApiController]
[Route("api/assets")]
public sealed class AssetController : ControllerBase
{
    private readonly DatabaseService _dbService;
    private readonly IAuditService _auditService;

    public AssetController(DatabaseService dbService, IAuditService auditService)
    {
        _dbService = dbService;
        _auditService = auditService;
    }

    [HttpGet("{id:guid}")]
    [AllowAnonymous]
    public async Task<IActionResult> Get(Guid id)
    {
        const string sql = "SELECT id, type, name, code, metadata, created_at, updated_at FROM assets WHERE id = @id";

        using var connection = _dbService.CreateConnection();
        await connection.OpenAsync();
        using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("id", id);
        using var reader = await command.ExecuteReaderAsync();

        return await reader.ReadAsync()
            ? Ok(ReadAsset(reader))
            : NotFound(new { error = "Asset not found" });
    }

    private static object ReadAsset(NpgsqlDataReader reader) => new
    {
        id = reader.GetGuid(0),
        type = reader.GetString(1).ToUpperInvariant(),
        name = reader.GetString(2),
        code = reader.GetString(3),
        metadata = JsonDocument.Parse(reader.GetString(4)).RootElement.Clone(),
        createdAt = reader.GetDateTime(5),
        updatedAt = reader.GetDateTime(6),
    };
}
