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

        const string sql = """
            SELECT a.id, a.type, a.name, a.code, a.metadata, a.created_at, a.updated_at
            FROM assets a
            WHERE (@q IS NULL OR a.name ILIKE '%' || @q || '%' OR a.code ILIKE '%' || @q || '%' OR a.metadata::text ILIKE '%' || @q || '%')
              AND (@type IS NULL OR UPPER(a.type) = @type)
              AND (@parent_id IS NULL OR EXISTS (
                    SELECT 1 FROM asset_relationships r
                    WHERE r.parent_asset_id = @parent_id AND r.child_asset_id = a.id AND r.relationship_type = 'CONTAINS'))
            ORDER BY a.type, a.name, a.id
            """;

        using var connection = _dbService.CreateConnection();
        await connection.OpenAsync();
        using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("q", (object?)q?.Trim() ?? DBNull.Value);
        command.Parameters.AddWithValue("type", (object?)normalizedType ?? DBNull.Value);
        command.Parameters.Add("parent_id", NpgsqlDbType.Uuid).Value = (object?)parentId ?? DBNull.Value;
        using var reader = await command.ExecuteReaderAsync();
        var items = new List<object>();
        while (await reader.ReadAsync()) items.Add(ReadAsset(reader));
        return Ok(items);
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

    [HttpPost]
    [Authorize(Roles = "ADMIN,ENGINEER")]
    public async Task<IActionResult> Create([FromBody] AssetCreateRequest request)
    {
        var assetType = AssetCatalogContract.NormalizeType(request.Type);
        if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Code) || !AssetCatalogContract.IsCatalogOwned(assetType))
            return BadRequest(new { error = "Asset chỉ hỗ trợ PLANT, AREA hoặc SENSOR với name và code hợp lệ" });

        try
        {
            var id = Guid.NewGuid();
            using var connection = _dbService.CreateConnection();
            await connection.OpenAsync();
            await using var transaction = await connection.BeginTransactionAsync();

            if (request.ParentId.HasValue)
            {
                using var parentCommand = new NpgsqlCommand("SELECT EXISTS (SELECT 1 FROM assets WHERE id = @id)", connection, transaction);
                parentCommand.Parameters.AddWithValue("id", request.ParentId.Value);
                if (!(bool)(await parentCommand.ExecuteScalarAsync() ?? false))
                    return BadRequest(new { error = "Asset cha không tồn tại" });
            }

            object created;
            using (var command = new NpgsqlCommand(
                "INSERT INTO assets (id, type, name, code, metadata) VALUES (@id, @type, @name, @code, @metadata) RETURNING id, type, name, code, metadata, created_at, updated_at",
                connection, transaction))
            {
                command.Parameters.AddWithValue("id", id);
                command.Parameters.AddWithValue("type", assetType.ToLowerInvariant());
                command.Parameters.AddWithValue("name", request.Name.Trim());
                command.Parameters.AddWithValue("code", request.Code.Trim());
                command.Parameters.Add("metadata", NpgsqlDbType.Jsonb).Value =
                    JsonSerializer.Serialize(request.Metadata ?? new Dictionary<string, JsonElement>());
                using var reader = await command.ExecuteReaderAsync();
                if (!await reader.ReadAsync())
                    return StatusCode(500, new { error = "Không tạo được asset" });
                created = ReadAsset(reader);
            }

            if (request.ParentId.HasValue)
            {
                using var relCommand = new NpgsqlCommand(
                    "INSERT INTO asset_relationships (parent_asset_id, child_asset_id, asset_id, related_asset_id, relationship_type) VALUES (@parent_id, @child_id, @parent_id, @child_id, 'CONTAINS')",
                    connection, transaction);
                relCommand.Parameters.AddWithValue("parent_id", request.ParentId.Value);
                relCommand.Parameters.AddWithValue("child_id", id);
                await relCommand.ExecuteNonQueryAsync();
            }

            await transaction.CommitAsync();
            await _auditService.LogAuditAsync(
                User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown",
                "CREATE_ASSET",
                $"Tạo asset: {request.Name} ({id})");
            return Created($"/api/assets/{id}", created);
        }
        catch (PostgresException ex) when (ex.SqlState == "23505")
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

            using (var typeCommand = new NpgsqlCommand("SELECT type FROM assets WHERE id = @id", connection))
            {
                typeCommand.Parameters.AddWithValue("id", id);
                var existingType = await typeCommand.ExecuteScalarAsync() as string;
                if (existingType is null) return NotFound(new { error = "Không tìm thấy asset" });
                if (!AssetCatalogContract.IsCatalogOwned(existingType))
                    return Conflict(new { error = "LINE và MACHINE phải được sửa qua API vận hành hiện có" });
            }

            using var command = new NpgsqlCommand(
                "UPDATE assets SET name = @name, code = @code, metadata = @metadata, updated_at = CURRENT_TIMESTAMP WHERE id = @id RETURNING id, type, name, code, metadata, created_at, updated_at",
                connection);
            command.Parameters.AddWithValue("id", id);
            command.Parameters.AddWithValue("name", request.Name.Trim());
            command.Parameters.AddWithValue("code", request.Code.Trim());
            command.Parameters.Add("metadata", NpgsqlDbType.Jsonb).Value =
                JsonSerializer.Serialize(request.Metadata ?? new Dictionary<string, JsonElement>());
            using var reader = await command.ExecuteReaderAsync();
            if (!await reader.ReadAsync()) return NotFound(new { error = "Không tìm thấy asset" });
            var updated = ReadAsset(reader);
            await _auditService.LogAuditAsync(
                User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown",
                "UPDATE_ASSET",
                $"Sửa asset: {id}");
            return Ok(updated);
        }
        catch (PostgresException ex) when (ex.SqlState == "23505")
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

        string? assetType;
        string? code;
        using (var assetCommand = new NpgsqlCommand("SELECT type, code FROM assets WHERE id = @id", connection))
        {
            assetCommand.Parameters.AddWithValue("id", id);
            using var reader = await assetCommand.ExecuteReaderAsync();
            if (!await reader.ReadAsync()) return NotFound(new { error = "Không tìm thấy asset" });
            assetType = reader.GetString(0);
            code = reader.GetString(1);
        }

        if (!AssetCatalogContract.IsCatalogOwned(assetType) || code == AssetCatalogContract.PlantCode)
            return Conflict(new { error = "Asset này không được xóa qua API catalog" });

        using (var childCommand = new NpgsqlCommand("SELECT EXISTS (SELECT 1 FROM asset_relationships WHERE parent_asset_id = @id)", connection))
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

    /// <summary>
    /// Returns the full asset hierarchy as a nested tree starting from root (PLANT) nodes.
    /// </summary>
    [HttpGet("tree")]
    [AllowAnonymous]
    public async Task<IActionResult> Tree()
    {
        const string sql = """
            SELECT a.id, a.type, a.name, a.code, a.metadata, a.created_at, a.updated_at, a.parent_id
            FROM assets a
            ORDER BY a.type, a.name, a.id
            """;

        using var connection = _dbService.CreateConnection();
        await connection.OpenAsync();
        using var command = new NpgsqlCommand(sql, connection);
        using var reader = await command.ExecuteReaderAsync();

        var allAssets = new List<AssetTreeNode>();
        while (await reader.ReadAsync())
        {
            allAssets.Add(new AssetTreeNode
            {
                Id = reader.GetGuid(0),
                Type = reader.GetString(1).ToUpperInvariant(),
                Name = reader.GetString(2),
                Code = reader.GetString(3),
                Metadata = JsonDocument.Parse(reader.GetString(4)).RootElement.Clone(),
                CreatedAt = reader.GetDateTime(5),
                UpdatedAt = reader.GetDateTime(6),
                ParentId = reader.IsDBNull(7) ? null : reader.GetGuid(7),
            });
        }

        var lookup = allAssets.ToLookup(a => a.ParentId);
        void BuildChildren(AssetTreeNode node)
        {
            node.Children = lookup[node.Id].OrderBy(c => c.Type).ThenBy(c => c.Name).ToList();
            foreach (var child in node.Children) BuildChildren(child);
        }

        var roots = allAssets.Where(a => a.ParentId is null).OrderBy(a => a.Name).ToList();
        foreach (var root in roots) BuildChildren(root);
        return Ok(roots);
    }

    /// <summary>
    /// Returns direct children of an asset.
    /// </summary>
    [HttpGet("{id:guid}/children")]
    [AllowAnonymous]
    public async Task<IActionResult> Children(Guid id)
    {
        const string sql = """
            SELECT a.id, a.type, a.name, a.code, a.metadata, a.created_at, a.updated_at
            FROM assets a
            INNER JOIN asset_relationships r ON r.child_asset_id = a.id
            WHERE r.parent_asset_id = @id AND r.relationship_type = 'CONTAINS'
            ORDER BY a.type, a.name, a.id
            """;

        using var connection = _dbService.CreateConnection();
        await connection.OpenAsync();
        using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("id", id);
        using var reader = await command.ExecuteReaderAsync();
        var items = new List<object>();
        while (await reader.ReadAsync()) items.Add(ReadAsset(reader));
        return Ok(items);
    }

    /// <summary>
    /// Returns the ancestor chain from an asset up to the root, ordered root-first.
    /// </summary>
    [HttpGet("{id:guid}/ancestors")]
    [AllowAnonymous]
    public async Task<IActionResult> Ancestors(Guid id)
    {
        const string sql = """
            WITH RECURSIVE chain AS (
                SELECT a.id, a.type, a.name, a.code, a.metadata, a.created_at, a.updated_at, a.parent_id, 0 AS depth
                FROM assets a WHERE a.id = @id
                UNION ALL
                SELECT p.id, p.type, p.name, p.code, p.metadata, p.created_at, p.updated_at, p.parent_id, c.depth + 1
                FROM assets p INNER JOIN chain c ON c.parent_id = p.id
            )
            SELECT id, type, name, code, metadata, created_at, updated_at
            FROM chain
            WHERE depth > 0
            ORDER BY depth DESC
            """;

        using var connection = _dbService.CreateConnection();
        await connection.OpenAsync();
        using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("id", id);
        using var reader = await command.ExecuteReaderAsync();
        var items = new List<object>();
        while (await reader.ReadAsync()) items.Add(ReadAsset(reader));
        return Ok(items);
    }

    /// <summary>
    /// Import assets from a CSV/JSON payload in bulk.
    /// Expects an array of {type, name, code, parentCode?, metadata?}.
    /// </summary>
    [HttpPost("import")]
    [Authorize(Roles = "ADMIN")]
    public async Task<IActionResult> Import([FromBody] AssetImportRequest[] items)
    {
        if (items is null || items.Length == 0)
            return BadRequest(new { error = "Danh sách import rỗng" });

        using var connection = _dbService.CreateConnection();
        await connection.OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync();

        var created = 0;
        var skipped = 0;
        var errors = new List<string>();

        foreach (var item in items)
        {
            var assetType = AssetCatalogContract.NormalizeType(item.Type);
            if (!AssetCatalogContract.IsKnownType(assetType))
            {
                errors.Add($"Loại không hợp lệ: {item.Type} (code: {item.Code})");
                skipped++;
                continue;
            }

            Guid? parentId = null;
            if (!string.IsNullOrWhiteSpace(item.ParentCode))
            {
                using var parentCmd = new NpgsqlCommand("SELECT id FROM assets WHERE code = @code", connection, transaction);
                parentCmd.Parameters.AddWithValue("code", item.ParentCode.Trim());
                var parentResult = await parentCmd.ExecuteScalarAsync();
                if (parentResult is Guid pid) parentId = pid;
                else
                {
                    errors.Add($"Parent không tìm thấy: {item.ParentCode} (code: {item.Code})");
                    skipped++;
                    continue;
                }
            }

            try
            {
                var id = Guid.NewGuid();
                using var cmd = new NpgsqlCommand(
                    "INSERT INTO assets (id, type, name, code, parent_id, metadata) VALUES (@id, @type, @name, @code, @parent_id, @metadata) ON CONFLICT (code) DO NOTHING",
                    connection, transaction);
                cmd.Parameters.AddWithValue("id", id);
                cmd.Parameters.AddWithValue("type", assetType.ToLowerInvariant());
                cmd.Parameters.AddWithValue("name", item.Name?.Trim() ?? assetType);
                cmd.Parameters.AddWithValue("code", item.Code.Trim());
                cmd.Parameters.Add("parent_id", NpgsqlDbType.Uuid).Value = (object?)parentId ?? DBNull.Value;
                cmd.Parameters.Add("metadata", NpgsqlDbType.Jsonb).Value =
                    JsonSerializer.Serialize(item.Metadata ?? new Dictionary<string, JsonElement>());

                var rows = await cmd.ExecuteNonQueryAsync();
                if (rows > 0)
                {
                    if (parentId.HasValue)
                    {
                        using var relCmd = new NpgsqlCommand(
                            "INSERT INTO asset_relationships (parent_asset_id, child_asset_id, asset_id, related_asset_id, relationship_type) VALUES (@pid, @cid, @pid, @cid, 'CONTAINS') ON CONFLICT DO NOTHING",
                            connection, transaction);
                        relCmd.Parameters.AddWithValue("pid", parentId.Value);
                        relCmd.Parameters.AddWithValue("cid", id);
                        await relCmd.ExecuteNonQueryAsync();
                    }
                    created++;
                }
                else
                    skipped++;
            }
            catch (PostgresException ex) when (ex.SqlState == "23505")
            {
                skipped++;
            }
        }

        await transaction.CommitAsync();
        await _auditService.LogAuditAsync(
            User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown",
            "IMPORT_ASSETS",
            $"Import {created} assets, skipped {skipped}");

        return Ok(new { created, skipped, errors });
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

internal sealed class AssetTreeNode
{
    public Guid Id { get; set; }
    public string Type { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public JsonElement Metadata { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public Guid? ParentId { get; set; }
    public List<AssetTreeNode> Children { get; set; } = [];
}

public sealed class AssetImportRequest
{
    public string Type { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string? ParentCode { get; set; }
    public Dictionary<string, JsonElement>? Metadata { get; set; }
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
