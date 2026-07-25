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
[Route(ApiConventionV1.RoutePrefix + "/assets")]
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
        {
            return ProblemResponse(StatusCodes.Status400BadRequest, "Loại asset không hợp lệ");
        }

        const string sql = """
            SELECT a.id, a.type, a.name, a.code, a.metadata, a.created_at, a.updated_at
            FROM assets a
            WHERE (@q IS NULL OR a.name ILIKE '%' || @q || '%' OR a.code ILIKE '%' || @q || '%' OR a.metadata::text ILIKE '%' || @q || '%')
              AND (@type IS NULL OR a.type::text = @type)
              AND (@parent_id IS NULL OR EXISTS (
                    SELECT 1 FROM asset_relationships r
                    WHERE r.parent_asset_id = @parent_id
                      AND r.child_asset_id = a.id
                      AND r.relationship_type = 'CONTAINS'))
            ORDER BY a.type, a.name, a.id
            """;

        using var connection = _dbService.CreateConnection();
        await connection.OpenAsync();
        using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.Add("q", NpgsqlDbType.Text).Value = (object?)q?.Trim() ?? DBNull.Value;
        command.Parameters.Add("type", NpgsqlDbType.Text).Value = (object?)normalizedType?.ToLowerInvariant() ?? DBNull.Value;
        command.Parameters.Add("parent_id", NpgsqlDbType.Uuid).Value = (object?)parentId ?? DBNull.Value;
        using var reader = await command.ExecuteReaderAsync();

        var assets = new List<object>();
        while (await reader.ReadAsync())
        {
            assets.Add(ReadAsset(reader));
        }

        return Ok(assets);
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
            : ProblemResponse(StatusCodes.Status404NotFound, "Asset not found");
    }

    [HttpGet("tree")]
    [AllowAnonymous]
    public async Task<IActionResult> Tree()
    {
        const string sql = "SELECT id, type, name, code, parent_id, metadata, created_at, updated_at FROM assets ORDER BY type, name, id";

        using var connection = _dbService.CreateConnection();
        await connection.OpenAsync();
        using var command = new NpgsqlCommand(sql, connection);
        using var reader = await command.ExecuteReaderAsync();

        var nodes = new Dictionary<Guid, AssetTreeNode>();
        var parents = new Dictionary<Guid, Guid?>();
        while (await reader.ReadAsync())
        {
            var id = reader.GetGuid(0);
            nodes[id] = new AssetTreeNode(
                id,
                reader.GetString(1).ToUpperInvariant(),
                reader.GetString(2),
                reader.GetString(3),
                JsonDocument.Parse(reader.GetString(5)).RootElement.Clone(),
                reader.GetDateTime(6),
                reader.GetDateTime(7));
            parents[id] = reader.IsDBNull(4) ? null : reader.GetGuid(4);
        }

        var roots = new List<AssetTreeNode>();
        foreach (var (id, node) in nodes)
        {
            var parentId = parents[id];
            if (parentId.HasValue && parentId.Value != id && nodes.TryGetValue(parentId.Value, out var parent))
            {
                parent.Children.Add(node);
            }
            else
            {
                roots.Add(node);
            }
        }

        return Ok(roots);
    }

    [HttpGet("{id:guid}/documents")]
    [AllowAnonymous]
    public async Task<IActionResult> ListDocuments(Guid id)
    {
        using var connection = _dbService.CreateConnection();
        await connection.OpenAsync();
        if (!await AssetExistsAsync(connection, id))
        {
            return ProblemResponse(StatusCodes.Status404NotFound, "Asset not found");
        }

        const string sql = "SELECT document_id, relationship, created_at FROM asset_documents WHERE asset_id = @asset_id ORDER BY relationship, document_id";
        using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("asset_id", id);
        using var reader = await command.ExecuteReaderAsync();
        var documents = new List<object>();
        while (await reader.ReadAsync())
        {
            documents.Add(ReadDocument(reader));
        }

        return Ok(documents);
    }

    [HttpPost("{id:guid}/documents")]
    [Authorize(Roles = "ADMIN,ENGINEER")]
    public async Task<IActionResult> LinkDocument(Guid id, [FromBody] AssetDocumentLinkRequest request)
    {
        var relationship = AssetCatalogContract.NormalizeDocumentRelationship(request.Relationship);
        if (string.IsNullOrWhiteSpace(request.DocumentId) || !AssetCatalogContract.IsKnownDocumentRelationship(relationship))
        {
            return ProblemResponse(StatusCodes.Status400BadRequest, "DocumentId and a supported document relationship are required");
        }

        using var connection = _dbService.CreateConnection();
        await connection.OpenAsync();
        if (!await AssetExistsAsync(connection, id))
        {
            return ProblemResponse(StatusCodes.Status404NotFound, "Asset not found");
        }

        var documentId = request.DocumentId.Trim();
        var normalizedRelationship = relationship.ToLowerInvariant();
        var existingDocument = await FindDocumentAsync(connection, id, documentId, normalizedRelationship);
        if (existingDocument is not null)
        {
            return Ok(existingDocument);
        }

        // New catalog schemas have a primary key for this tuple. Legacy catalog schemas did not,
        // so do not rely on an ON CONFLICT target being present just to make a link idempotent.
        const string insertSql = """
            INSERT INTO asset_documents (asset_id, document_id, relationship)
            VALUES (@asset_id, @document_id, @relationship)
            RETURNING document_id, relationship, created_at
            """;
        await using var insert = new NpgsqlCommand(insertSql, connection);
        insert.Parameters.AddWithValue("asset_id", id);
        insert.Parameters.Add("document_id", NpgsqlDbType.Text).Value = documentId;
        insert.Parameters.Add("relationship", NpgsqlDbType.Text).Value = normalizedRelationship;
        await using var reader = await insert.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return ProblemResponse(StatusCodes.Status500InternalServerError, "Unable to link document");
        }

        var linked = ReadDocument(reader);
        await _auditService.LogAuditAsync(User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown", "LINK_ASSET_DOCUMENT", $"Link document {documentId} to asset {id}");
        return Created(ApiConventionV1.BasePath + $"/assets/{id}/documents", linked);
    }

    [HttpDelete("{id:guid}/documents")]
    [Authorize(Roles = "ADMIN,ENGINEER")]
    public async Task<IActionResult> UnlinkDocument(Guid id, [FromQuery] string documentId, [FromQuery] string relationship)
    {
        var normalizedRelationship = AssetCatalogContract.NormalizeDocumentRelationship(relationship);
        if (string.IsNullOrWhiteSpace(documentId) || !AssetCatalogContract.IsKnownDocumentRelationship(normalizedRelationship))
        {
            return ProblemResponse(StatusCodes.Status400BadRequest, "DocumentId and a supported document relationship are required");
        }

        using var connection = _dbService.CreateConnection();
        await connection.OpenAsync();
        const string sql = "DELETE FROM asset_documents WHERE asset_id = @asset_id AND document_id = @document_id AND relationship = @relationship";
        using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("asset_id", id);
        command.Parameters.Add("document_id", NpgsqlDbType.Text).Value = documentId.Trim();
        command.Parameters.Add("relationship", NpgsqlDbType.Text).Value = normalizedRelationship.ToLowerInvariant();
        if (await command.ExecuteNonQueryAsync() == 0)
        {
            return ProblemResponse(StatusCodes.Status404NotFound, "Document link not found");
        }

        await _auditService.LogAuditAsync(User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown", "UNLINK_ASSET_DOCUMENT", $"Unlink document {documentId} from asset {id}");
        return Ok(new { success = true });
    }

    [HttpPost]
    [Authorize(Roles = "ADMIN,ENGINEER")]
    public async Task<IActionResult> Create([FromBody] AssetCreateRequest request)
    {
        var type = AssetCatalogContract.NormalizeType(request.Type);
        if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Code) || !AssetCatalogContract.IsCatalogOwned(type))
        {
            return ProblemResponse(StatusCodes.Status400BadRequest, "Asset chỉ hỗ trợ PLANT, AREA hoặc SENSOR với name và code hợp lệ");
        }

        try
        {
            var id = Guid.NewGuid();
            using var connection = _dbService.CreateConnection();
            await connection.OpenAsync();
            await using var transaction = await connection.BeginTransactionAsync();

            Guid? parentId = request.ParentId;
            if (!parentId.HasValue && type != "PLANT")
            {
                using var plantCommand = new NpgsqlCommand("SELECT id FROM assets WHERE code = @code", connection, transaction);
                plantCommand.Parameters.AddWithValue("code", AssetCatalogContract.PlantCode);
                if (await plantCommand.ExecuteScalarAsync() is not Guid plantId)
                {
                    return ProblemResponse(StatusCodes.Status500InternalServerError, "Không tìm thấy plant gốc cho asset catalog");
                }

                parentId = plantId;
            }

            if (type == "PLANT" && parentId.HasValue)
            {
                return ProblemResponse(StatusCodes.Status400BadRequest, "PLANT không được có asset cha");
            }

            if (parentId.HasValue)
            {
                using var parentCommand = new NpgsqlCommand("SELECT EXISTS (SELECT 1 FROM assets WHERE id = @id)", connection, transaction);
                parentCommand.Parameters.AddWithValue("id", parentId.Value);
                if (!(bool)(await parentCommand.ExecuteScalarAsync() ?? false))
                {
                    return ProblemResponse(StatusCodes.Status400BadRequest, "Asset cha không tồn tại");
                }
            }

            object created;
            using (var command = new NpgsqlCommand("""
                INSERT INTO assets (id, type, name, code, parent_id, metadata)
                VALUES (@id, @type, @name, @code, @parent_id, @metadata)
                RETURNING id, type, name, code, metadata, created_at, updated_at
                """, connection, transaction))
            {
                command.Parameters.AddWithValue("id", id);
                command.Parameters.Add("type", NpgsqlDbType.Unknown).Value = type.ToLowerInvariant();
                command.Parameters.Add("name", NpgsqlDbType.Text).Value = request.Name.Trim();
                command.Parameters.Add("code", NpgsqlDbType.Text).Value = request.Code.Trim();
                command.Parameters.Add("parent_id", NpgsqlDbType.Uuid).Value = (object?)parentId ?? DBNull.Value;
                command.Parameters.Add("metadata", NpgsqlDbType.Jsonb).Value = JsonSerializer.Serialize(request.Metadata ?? new Dictionary<string, JsonElement>());
                using var reader = await command.ExecuteReaderAsync();
                if (!await reader.ReadAsync())
                {
                    return ProblemResponse(StatusCodes.Status500InternalServerError, "Không tạo được asset");
                }

                created = ReadAsset(reader);
            }

            if (parentId.HasValue)
            {
                using var relationshipCommand = new NpgsqlCommand("""
                    INSERT INTO asset_relationships (parent_asset_id, child_asset_id, asset_id, related_asset_id, relationship_type)
                    VALUES (@parent_id, @child_id, @parent_id, @child_id, 'CONTAINS')
                    """, connection, transaction);
                relationshipCommand.Parameters.AddWithValue("parent_id", parentId.Value);
                relationshipCommand.Parameters.AddWithValue("child_id", id);
                await relationshipCommand.ExecuteNonQueryAsync();
            }

            await transaction.CommitAsync();
            await _auditService.LogAuditAsync(User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown", "CREATE_ASSET", $"Tạo asset: {request.Name} ({id})");
            return Created(ApiConventionV1.BasePath + $"/assets/{id}", created);
        }
        catch (PostgresException exception) when (exception.SqlState == "23505")
        {
            return ProblemResponse(StatusCodes.Status409Conflict, "Mã asset đã tồn tại");
        }
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = "ADMIN,ENGINEER")]
    public async Task<IActionResult> Update(Guid id, [FromBody] AssetUpdateRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Code))
        {
            return ProblemResponse(StatusCodes.Status400BadRequest, "Name và code không được để trống");
        }

        try
        {
            using var connection = _dbService.CreateConnection();
            await connection.OpenAsync();
            using (var typeCommand = new NpgsqlCommand("SELECT type FROM assets WHERE id = @id", connection))
            {
                typeCommand.Parameters.AddWithValue("id", id);
                var type = await typeCommand.ExecuteScalarAsync() as string;
                if (type is null)
                {
                    return ProblemResponse(StatusCodes.Status404NotFound, "Không tìm thấy asset");
                }

                if (!AssetCatalogContract.IsCatalogOwned(type))
                {
                    return ProblemResponse(StatusCodes.Status409Conflict, "LINE và MACHINE phải được sửa qua API vận hành hiện có");
                }
            }

            using var command = new NpgsqlCommand("""
                UPDATE assets
                SET name = @name, code = @code, metadata = @metadata, updated_at = CURRENT_TIMESTAMP
                WHERE id = @id
                RETURNING id, type, name, code, metadata, created_at, updated_at
                """, connection);
            command.Parameters.AddWithValue("id", id);
            command.Parameters.Add("name", NpgsqlDbType.Text).Value = request.Name.Trim();
            command.Parameters.Add("code", NpgsqlDbType.Text).Value = request.Code.Trim();
            command.Parameters.Add("metadata", NpgsqlDbType.Jsonb).Value = JsonSerializer.Serialize(request.Metadata ?? new Dictionary<string, JsonElement>());
            using var reader = await command.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
            {
                return ProblemResponse(StatusCodes.Status404NotFound, "Không tìm thấy asset");
            }

            var updated = ReadAsset(reader);
            await _auditService.LogAuditAsync(User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown", "UPDATE_ASSET", $"Sửa asset: {id}");
            return Ok(updated);
        }
        catch (PostgresException exception) when (exception.SqlState == "23505")
        {
            return ProblemResponse(StatusCodes.Status409Conflict, "Mã asset đã tồn tại");
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
        using (var assetCommand = new NpgsqlCommand("SELECT type, code FROM assets WHERE id = @id", connection))
        {
            assetCommand.Parameters.AddWithValue("id", id);
            using var reader = await assetCommand.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
            {
                return ProblemResponse(StatusCodes.Status404NotFound, "Không tìm thấy asset");
            }

            type = reader.GetString(0);
            code = reader.GetString(1);
        }

        if (!AssetCatalogContract.IsCatalogOwned(type) || code == AssetCatalogContract.PlantCode)
        {
            return ProblemResponse(StatusCodes.Status409Conflict, "Asset này không được xóa qua API catalog");
        }

        using (var childCommand = new NpgsqlCommand("SELECT EXISTS (SELECT 1 FROM asset_relationships WHERE parent_asset_id = @id)", connection))
        {
            childCommand.Parameters.AddWithValue("id", id);
            if ((bool)(await childCommand.ExecuteScalarAsync() ?? false))
            {
                return ProblemResponse(StatusCodes.Status409Conflict, "Không thể xóa asset còn child");
            }
        }

        using var deleteCommand = new NpgsqlCommand("DELETE FROM assets WHERE id = @id", connection);
        deleteCommand.Parameters.AddWithValue("id", id);
        await deleteCommand.ExecuteNonQueryAsync();
        await _auditService.LogAuditAsync(User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown", "DELETE_ASSET", $"Xóa asset: {id}");
        return Ok(new { success = true });
    }

    private ObjectResult ProblemResponse(int statusCode, string detail) => Problem(
        statusCode: statusCode,
        detail: detail,
        title: statusCode switch
        {
            StatusCodes.Status400BadRequest => "Bad request",
            StatusCodes.Status404NotFound => "Not found",
            StatusCodes.Status409Conflict => "Conflict",
            _ => "Internal server error",
        });

    private static async Task<bool> AssetExistsAsync(NpgsqlConnection connection, Guid id)
    {
        await using var command = new NpgsqlCommand("SELECT EXISTS (SELECT 1 FROM assets WHERE id = @id)", connection);
        command.Parameters.AddWithValue("id", id);
        return (bool)(await command.ExecuteScalarAsync() ?? false);
    }

    private static async Task<object?> FindDocumentAsync(NpgsqlConnection connection, Guid assetId, string documentId, string relationship)
    {
        const string sql = "SELECT document_id, relationship, created_at FROM asset_documents WHERE asset_id = @asset_id AND document_id = @document_id AND relationship = @relationship LIMIT 1";
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("asset_id", assetId);
        command.Parameters.Add("document_id", NpgsqlDbType.Text).Value = documentId;
        command.Parameters.Add("relationship", NpgsqlDbType.Text).Value = relationship;
        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync() ? ReadDocument(reader) : null;
    }

    private static object ReadDocument(NpgsqlDataReader reader) => new
    {
        documentId = reader.GetString(0),
        relationship = reader.GetString(1).ToUpperInvariant(),
        createdAt = reader.GetDateTime(2),
    };

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

public sealed class AssetTreeNode
{
    public AssetTreeNode(Guid id, string type, string name, string code, JsonElement metadata, DateTime createdAt, DateTime updatedAt)
    {
        Id = id;
        Type = type;
        Name = name;
        Code = code;
        Metadata = metadata;
        CreatedAt = createdAt;
        UpdatedAt = updatedAt;
    }

    public Guid Id { get; }
    public string Type { get; }
    public string Name { get; }
    public string Code { get; }
    public JsonElement Metadata { get; }
    public DateTime CreatedAt { get; }
    public DateTime UpdatedAt { get; }
    public List<AssetTreeNode> Children { get; } = [];
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

public sealed class AssetDocumentLinkRequest
{
    public string DocumentId { get; set; } = string.Empty;
    public string Relationship { get; set; } = string.Empty;
}
