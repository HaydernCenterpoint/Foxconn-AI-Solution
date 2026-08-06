using System.ComponentModel.DataAnnotations;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Mkz.Fusion.Contracts;
using Npgsql;
using NpgsqlTypes;

namespace backend.Controllers;

// ponytail: unified search over assets/machines/alarms. Chroma fii_search when up, else DB ILIKE.
// Skipped: dedicated search microservice, add when query volume justifies it.
[ApiController]
[Route("api/search")]
[Route(ApiConventionV1.RoutePrefix + "/search")]
public sealed class SearchController : ControllerBase
{
    private readonly Services.DatabaseService _db;
    private readonly IHttpClientFactory _httpFactory;
    private readonly IConfiguration _config;
    public SearchController(Services.DatabaseService db, IHttpClientFactory httpFactory, IConfiguration config)
    { _db = db; _httpFactory = httpFactory; _config = config; }

    [HttpGet]
    public async Task<IActionResult> Get([FromQuery, StringLength(200)] string? q, [FromQuery, Range(1, 100)] int limit = 20)
    {
        var query = q?.Trim();
        if (string.IsNullOrWhiteSpace(query)) return Ok(Array.Empty<object>());

        // Try Chroma fii_search first (reuse :8100)
        var chromaUrl = _config["Chroma:Url"] ?? "http://host.docker.internal:8100";
        try
        {
            using var client = _httpFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(2);
            // Chroma v2 query: POST /api/v2/tenants/{tenant}/databases/{db}/collections/{id}/query
            // Simpler: use collection query via v2 — try direct, fallback to DB on any error
            var body = new { query_texts = new[] { query }, n_results = limit, include = new[] { "metadatas", "documents" } };
            // Resolve collection id for fii_search
            // Chroma 1.x: collections live under tenants/databases
            var listResp = await client.GetAsync($"{chromaUrl.TrimEnd('/')}/api/v2/tenants/default_tenant/databases/default_database/collections");
            if (listResp.IsSuccessStatusCode)
            {
                var listJson = await listResp.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(listJson);
                string? collId = null;
                string? tenant = null; string? database = null;
                foreach (var el in doc.RootElement.EnumerateArray())
                {
                    if (el.TryGetProperty("name", out var n) && n.GetString() == "fii_search")
                    {
                        collId = el.TryGetProperty("id", out var id) ? id.GetString() : null;
                        tenant = el.TryGetProperty("tenant", out var t) ? t.GetString() : "default_tenant";
                        database = el.TryGetProperty("database", out var d) ? d.GetString() : "default_database";
                        break;
                    }
                }
                if (collId != null)
                {
                    var qResp = await client.PostAsJsonAsync($"{chromaUrl.TrimEnd('/')}/api/v2/tenants/{tenant}/databases/{database}/collections/{collId}/query", body);
                    if (qResp.IsSuccessStatusCode)
                    {
                        var qJson = await qResp.Content.ReadAsStringAsync();
                        using var qDoc = JsonDocument.Parse(qJson);
                        var ids = qDoc.RootElement.TryGetProperty("ids", out var idsEl) ? idsEl : default;
                        var metas = qDoc.RootElement.TryGetProperty("metadatas", out var m) ? m : default;
                        var docs = qDoc.RootElement.TryGetProperty("documents", out var d) ? d : default;
                        var results = new List<object>();
                        if (ids.ValueKind == JsonValueKind.Array && ids.GetArrayLength() > 0)
                        {
                            var rowIds = ids[0]; var rowMetas = metas.ValueKind != JsonValueKind.Undefined && metas.GetArrayLength() > 0 ? metas[0] : default;
                            var rowDocs = docs.ValueKind != JsonValueKind.Undefined && docs.GetArrayLength() > 0 ? docs[0] : default;
                            int n = rowIds.GetArrayLength();
                            for (int i = 0; i < n; i++)
                            {
                                var id = rowIds[i].GetString() ?? "";
                                JsonElement meta = rowMetas.ValueKind == JsonValueKind.Array && i < rowMetas.GetArrayLength() ? rowMetas[i] : default;
                                string docText = rowDocs.ValueKind == JsonValueKind.Array && i < rowDocs.GetArrayLength() ? (rowDocs[i].GetString() ?? "") : "";
                                string type = "asset"; string name = docText.Length > 80 ? docText[..80] : docText;
                                if (meta.ValueKind == JsonValueKind.Object)
                                {
                                    if (meta.TryGetProperty("type", out var tp)) type = tp.GetString() ?? type;
                                    if (meta.TryGetProperty("name", out var nm)) name = nm.GetString() ?? name;
                                }
                                results.Add(new { id, type, name, snippet = docText, source = "chroma" });
                            }
                        }
                        if (results.Count > 0) return Ok(results);
                    }
                }
            }
        }
        catch { /* fallback to DB */ }

        // Fallback: DB ILIKE over assets + machines + alarms
        const string sql = """
            SELECT 'asset' AS kind, a.id::text, a.name, a.code AS code
            FROM assets a WHERE a.name ILIKE '%' || @q || '%' OR a.code ILIKE '%' || @q || '%'
            UNION ALL
            SELECT 'machine', m.id::text, m.name, COALESCE(m.machine_code,'') FROM machines m WHERE m.name ILIKE '%' || @q || '%' OR COALESCE(m.machine_code,'') ILIKE '%' || @q || '%'
            UNION ALL
            SELECT 'alarm', al.id::text, al.message, al.severity FROM alarms al WHERE al.message ILIKE '%' || @q || '%'
            LIMIT @limit
            """;
        using var conn = _db.CreateConnection();
        await conn.OpenAsync();
        using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.Add("q", NpgsqlDbType.Text).Value = query;
        cmd.Parameters.AddWithValue("limit", limit);
        using var reader = await cmd.ExecuteReaderAsync();
        var fallback = new List<object>();
        while (await reader.ReadAsync())
            fallback.Add(new { type = reader.GetString(0), id = reader.GetString(1), name = reader.GetString(2), code = reader.GetString(3), source = "db" });
        return Ok(fallback);
    }

    [HttpPost("reindex")]
    public async Task<IActionResult> Reindex()
    {
        var chromaUrl = _config["Chroma:Url"] ?? "http://host.docker.internal:8100";
        try
        {
            using var client = _httpFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(10);
            // Ensure collection exists
            var createBody = new { name = "fii_search", metadata = new { description = "FII unified search assets/machines/alarms" } };
            var createResp = await client.PostAsJsonAsync($"{chromaUrl.TrimEnd('/')}/api/v2/tenants/default_tenant/databases/default_database/collections", createBody);
            // 409 means exists, that's fine
            string? collId = null; string? tenant = "default_tenant"; string? database = "default_database";
            if (createResp.IsSuccessStatusCode)
            {
                var j = await createResp.Content.ReadAsStringAsync();
                using var d = JsonDocument.Parse(j);
                collId = d.RootElement.TryGetProperty("id", out var id) ? id.GetString() : null;
                tenant = d.RootElement.TryGetProperty("tenant", out var t) ? t.GetString() : tenant;
                database = d.RootElement.TryGetProperty("database", out var db) ? db.GetString() : database;
            }
            else
            {
                // Chroma 1.x: collections live under tenants/databases
            var listResp = await client.GetAsync($"{chromaUrl.TrimEnd('/')}/api/v2/tenants/default_tenant/databases/default_database/collections");
                if (listResp.IsSuccessStatusCode)
                {
                    var listJson = await listResp.Content.ReadAsStringAsync();
                    using var doc = JsonDocument.Parse(listJson);
                    foreach (var el in doc.RootElement.EnumerateArray())
                        if (el.TryGetProperty("name", out var n) && n.GetString() == "fii_search")
                        { collId = el.TryGetProperty("id", out var i) ? i.GetString() : null; tenant = el.TryGetProperty("tenant", out var t) ? t.GetString() : tenant; database = el.TryGetProperty("database", out var db) ? db.GetString() : database; break; }
                }
            }
            if (collId == null) return Problem(statusCode: 503, detail: "Chroma collection not available");

            using var conn = _db.CreateConnection();
            await conn.OpenAsync();
            const string sql = "SELECT id::text, type, name, code AS code FROM assets ORDER BY type, name LIMIT 1000";
            using var cmd = new NpgsqlCommand(sql, conn);
            using var reader = await cmd.ExecuteReaderAsync();
            var ids = new List<string>(); var docs = new List<string>(); var metas = new List<object>();
            while (await reader.ReadAsync())
            {
                ids.Add(reader.GetString(0));
                var type = reader.GetString(1); var name = reader.GetString(2); var code = reader.GetString(3);
                docs.Add($"{name} {code} {type}");
                metas.Add(new { type, name, code });
            }
            if (ids.Count == 0) return Ok(new { indexed = 0, collection = "fii_search" });
            var upsertBody = new { ids, documents = docs, metadatas = metas };
            var upsertResp = await client.PostAsJsonAsync($"{chromaUrl.TrimEnd('/')}/api/v2/tenants/{tenant}/databases/{database}/collections/{collId}/add", upsertBody);
            var upsertText = await upsertResp.Content.ReadAsStringAsync();
            if (!upsertResp.IsSuccessStatusCode) return Problem(statusCode: 502, detail: $"Chroma add failed: {upsertText[..Math.Min(400, upsertText.Length)]}");
            return Ok(new { indexed = ids.Count, collection = "fii_search" });
        }
        catch (Exception ex) { return Problem(statusCode: 503, detail: ex.Message); }
    }
}
