using System.Security.Claims;
using System.Text.Json;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Mkz.Fusion.Contracts;
using Npgsql;
using NpgsqlTypes;

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

    [HttpGet]
    [AllowAnonymous]
    public async Task<IActionResult> List([FromQuery] string? q, [FromQuery] string? type, [FromQuery] Guid? parentId)
    {
        var normalizedType = string.IsNullOrWhiteSpace(type) ? null : AssetCatalogContract.NormalizeType(type);
        if (normalizedType is not null && !AssetCatalogContract.IsKnownType(normalizedType))
            return BadRequest(new { error = "Loại asset không hợp lệ" });

        // DB stores lowercase types; API returns UPPERCASE.
        var dbType = normalizedType?.ToLowerInvariant();

        const string sql = """
            SELECT a.id, a.type::text, a.name, a.code, a.metadata, a.created_at, a.updated_at
            FROM assets a
            WHERE (@q IS NULL OR a.name ILIKE '%' || @q || '%' OR a.code ILIKE '%' || @q || '%' OR a.metadata::text ILIKE '%' || @q || '%')
              AND (@type IS NULL OR lower(a.type::text) = @type)
              AND (@parent_id IS NULL OR EXISTS (
                    SELECT 1 FROM asset_relationships r
                    WHERE r.parent_asset_id = @parent_id AND r.child_asset_id = a.id AND r.relationship_type = 'CONTAINS'))
            ORDER BY a.type, a.name, a.id
            """;

        using var connection = _dbService.CreateConnection();
        await connection.OpenAsync();
        using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("q", (object?)q?.Trim() ?? DBNull.Value);
        command.Parameters.AddWithValue("type", (object?)dbType ?? DBNull.Value);
        command.Parameters.Add("parent_id", NpgsqlDbType.Uuid).Value = (object?)parentId ?? DBNull.Value;

        using var reader = await command.ExecuteReaderAsync();
        var items = new List<object>();
        while (await reader.ReadAsync())
            items.Add(ReadAsset(reader));
        return Ok(items);
    }

    [HttpGet("{id:guid}")]
    [AllowAnonymous]
    public async Task<IActionResult> Get(Guid id)
    {
        const string sql = "SELECT id, type::text, name, code, metadata, created_at, updated_at FROM assets WHERE id = @id";

        using var connection = _dbService.CreateConnection();
        await connection.OpenAsync();
        using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("id", id);
        using var reader = await command.ExecuteReaderAsync();

        return await reader.ReadAsync()
            ? Ok(ReadAsset(reader))
            : NotFound(new { error = "Asset not found" });
    }

    [HttpPost]
    [Authorize(Roles = "ADMIN,ENGINEER")]
    public async Task<IActionResult> Create([FromBody] AssetCreateRequest request)
    {
        var type = AssetCatalogContract.NormalizeType(request.Type);
        if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Code) || !AssetCatalogContract.IsCatalogOwned(type))
            return BadRequest(new { error = "Asset chỉ hỗ trợ PLANT, AREA hoặc SENSOR với name và code hợp lệ" });

        try
        {
            var id = Guid.NewGuid();
            using var connection = _dbService.CreateConnection();
            await connection.OpenAsync();
            await using var transaction = await connection.BeginTransactionAsync();

            Guid? parentId = request.ParentId;
            // Live DB check valid_parent_type requires parent for sensor (and non-plant types).
            if (!parentId.HasValue && type is not "PLANT")
            {
                using var plantCommand = new NpgsqlCommand(
                    $"SELECT id FROM assets WHERE code = @code LIMIT 1", connection, transaction);
                plantCommand.Parameters.AddWithValue("code", AssetCatalogContract.PlantCode);
                parentId = await plantCommand.ExecuteScalarAsync() as Guid?;
            }

            if (parentId.HasValue)
            {
                using var parentCommand = new NpgsqlCommand("SELECT EXISTS (SELECT 1 FROM assets WHERE id = @id)", connection, transaction);
                parentCommand.Parameters.AddWithValue("id", parentId.Value);
                if (!(bool)(await parentCommand.ExecuteScalarAsync() ?? false))
                    return BadRequest(new { error = "Asset cha không tồn tại" });
            }
            else if (type is not "PLANT")
            {
                return BadRequest(new { error = "Cần parentId hoặc plant root MKZ-PLANT" });
            }

            object created;
            using (var command = new NpgsqlCommand(
                       "INSERT INTO assets (id, type, name, code, parent_id, metadata) VALUES (@id, CAST(@type AS asset_type), @name, @code, @parent_id, @metadata) RETURNING id, type::text, name, code, metadata, created_at, updated_at",
                       connection, transaction))
            {
                command.Parameters.AddWithValue("id", id);
                command.Parameters.AddWithValue("type", type.ToLowerInvariant());
                command.Parameters.AddWithValue("name", request.Name.Trim());
                command.Parameters.AddWithValue("code", request.Code.Trim());
                command.Parameters.Add("parent_id", NpgsqlDbType.Uuid).Value = (object?)parentId ?? DBNull.Value;
                command.Parameters.Add("metadata", NpgsqlDbType.Jsonb).Value =
                    JsonSerializer.Serialize(request.Metadata ?? new Dictionary<string, JsonElement>());
                using var reader = await command.ExecuteReaderAsync();
                if (!await reader.ReadAsync())
                    return StatusCode(500, new { error = "Không tạo được asset" });
                created = ReadAsset(reader);
            }

            if (parentId.HasValue)
            {
                using var relationshipCommand = new NpgsqlCommand(
                    "INSERT INTO asset_relationships (parent_asset_id, child_asset_id, asset_id, related_asset_id, relationship_type) VALUES (@parent_id, @child_id, @parent_id, @child_id, 'CONTAINS') ON CONFLICT DO NOTHING",
                    connection, transaction);
                relationshipCommand.Parameters.AddWithValue("parent_id", parentId.Value);
                relationshipCommand.Parameters.AddWithValue("child_id", id);
                await relationshipCommand.ExecuteNonQueryAsync();
            }

            await transaction.CommitAsync();
            await _auditService.LogAuditAsync(
                User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown",
                "CREATE_ASSET",
                $"Tạo asset: {request.Name} ({id})");
            return Created($"/api/assets/{id}", created);
        }
        catch (PostgresException exception) when (exception.SqlState == "23505")
        {
            return Conflict(new { error = "Mã asset đã tồn tại" });
        }
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = "ADMIN,ENGINEER")]
    public async Task<IActionResult> Update(Guid id, [FromBody] AssetUpdateRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Code))
            return BadRequest(new { error = "Name và code không được để trống" });

        try
        {
            using var connection = _dbService.CreateConnection();
            await connection.OpenAsync();

            using (var typeCommand = new NpgsqlCommand("SELECT type::text FROM assets WHERE id = @id", connection))
            {
                typeCommand.Parameters.AddWithValue("id", id);
                var type = await typeCommand.ExecuteScalarAsync() as string;
                if (type is null)
                    return NotFound(new { error = "Không tìm thấy asset" });
                if (!AssetCatalogContract.IsCatalogOwned(type))
                    return Conflict(new { error = "LINE và MACHINE phải được sửa qua API vận hành hiện có" });
            }

            using var command = new NpgsqlCommand(
                "UPDATE assets SET name = @name, code = @code, metadata = @metadata, updated_at = CURRENT_TIMESTAMP WHERE id = @id RETURNING id, type::text, name, code, metadata, created_at, updated_at",
                connection);
            command.Parameters.AddWithValue("id", id);
            command.Parameters.AddWithValue("name", request.Name.Trim());
            command.Parameters.AddWithValue("code", request.Code.Trim());
            command.Parameters.Add("metadata", NpgsqlDbType.Jsonb).Value =
                JsonSerializer.Serialize(request.Metadata ?? new Dictionary<string, JsonElement>());

            using var reader = await command.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
                return NotFound(new { error = "Không tìm thấy asset" });

            var updated = ReadAsset(reader);
            await _auditService.LogAuditAsync(
                User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown",
                "UPDATE_ASSET",
                $"Sửa asset: {id}");
            return Ok(updated);
        }
        catch (PostgresException exception) when (exception.SqlState == "23505")
        {
            return Conflict(new { error = "Mã asset đã tồn tại" });
        }
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = "ADMIN,ENGINEER")]
    public async Task<IActionResult> Delete(Guid id)
    {
        using var connection = _dbService.CreateConnection();
        await connection.OpenAsync();

        string? type;
        string? code;
        using (var assetCommand = new NpgsqlCommand("SELECT type::text, code FROM assets WHERE id = @id", connection))
        {
            assetCommand.Parameters.AddWithValue("id", id);
            using var reader = await assetCommand.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
                return NotFound(new { error = "Không tìm thấy asset" });
            type = reader.GetString(0);
            code = reader.GetString(1);
        }

        if (!AssetCatalogContract.IsCatalogOwned(type) || code == AssetCatalogContract.PlantCode)
            return Conflict(new { error = "Asset này không được xóa qua API catalog" });

        using (var childCommand = new NpgsqlCommand(
                   "SELECT EXISTS (SELECT 1 FROM asset_relationships WHERE parent_asset_id = @id)", connection))
        {
            childCommand.Parameters.AddWithValue("id", id);
            if ((bool)(await childCommand.ExecuteScalarAsync() ?? false))
                return Conflict(new { error = "Không thể xóa asset còn child" });
        }

        using var deleteCommand = new NpgsqlCommand("DELETE FROM assets WHERE id = @id", connection);
        deleteCommand.Parameters.AddWithValue("id", id);
        await deleteCommand.ExecuteNonQueryAsync();

        await _auditService.LogAuditAsync(
            User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown",
            "DELETE_ASSET",
            $"Xóa asset: {id}");
        return Ok(new { success = true });
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

public sealed class AssetCreateRequest
{
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public Dictionary<string, JsonElement>? Metadata { get; set; }
    public Guid? ParentId { get; set; }
}

public sealed class AssetUpdateRequest
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public Dictionary<string, JsonElement>? Metadata { get; set; }
}
