# Asset Catalog and Shared Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an additive Asset catalog that shares UUIDs with existing lines and machines, exposes minimal CRUD/search APIs, and keeps the verified full demo working.

**Architecture:** Keep `machines` and `production_lines` as the operational source of truth. PostgreSQL DDL/triggers in `DatabaseService` mirror those rows into `assets` and `asset_relationships`; a new controller owns only catalog-native `PLANT`, `AREA`, and `SENSOR` rows. `TelemetryFusionEvent.Machine.Id` remains the canonical asset UUID, so no duplicate telemetry field or new telemetry table is introduced.

**Tech Stack:** .NET 9, ASP.NET Core controllers, Npgsql/PostgreSQL JSONB and triggers, xUnit, PowerShell smoke test. No new packages.

---

## File structure

| File | Responsibility |
| --- | --- |
| `fusion-contracts/AssetCatalogContract.cs` | Shared asset type/code invariants used by backend and future consumers. |
| `backend.Tests/AssetCatalogContractTests.cs` | Fast unit proof of UUID-to-source-code and ownership rules. |
| `backend/Services/DatabaseService.cs` | Additive schema, idempotent seed/backfill, and DB-native legacy synchronization. |
| `backend/Controllers/AssetController.cs` | Flat list/search, details, and catalog-native CRUD. |
| `infrastructure/demo/Test-FullDemo.ps1` | End-to-end proof that an existing smoke machine has the same catalog UUID and that sensor CRUD/search works. |
| `docs/master-plan-4-agents.md` | Mark the delivered Asset schema/shared-contract/API checklist items after verification. |

Do not modify `machines`, `production_lines`, telemetry storage, frontend UI, ODF source, or add a migration framework in this plan.

### Task 1: Lock the shared asset invariants

**Files:**
- Create: `fusion-contracts/AssetCatalogContract.cs`
- Create: `backend.Tests/AssetCatalogContractTests.cs`

- [ ] **Step 1: Write the failing unit test**

Create `backend.Tests/AssetCatalogContractTests.cs`:

```csharp
using Mkz.Fusion.Contracts;

namespace backend.Tests;

public sealed class AssetCatalogContractTests
{
    [Fact]
    public void LegacyAssets_KeepTheirOperationalUuidAndStableSourceCode()
    {
        var id = Guid.Parse("11111111-1111-1111-1111-111111111111");

        Assert.Equal("line:11111111-1111-1111-1111-111111111111", AssetCatalogContract.LineCode(id));
        Assert.Equal("machine:11111111-1111-1111-1111-111111111111", AssetCatalogContract.MachineCode(id));
        Assert.Equal("MKZ-PLANT", AssetCatalogContract.PlantCode);
    }

    [Theory]
    [InlineData("PLANT", true)]
    [InlineData("AREA", true)]
    [InlineData("SENSOR", true)]
    [InlineData("LINE", false)]
    [InlineData("MACHINE", false)]
    [InlineData("unknown", false)]
    public void CatalogOwnership_AllowsOnlyCatalogNativeTypes(string type, bool expected)
    {
        Assert.Equal(expected, AssetCatalogContract.IsCatalogOwned(type));
    }
}
```

- [ ] **Step 2: Run the test to verify the red state**

Run:

```powershell
dotnet test backend.Tests/backend.Tests.csproj --filter FullyQualifiedName~AssetCatalogContractTests
```

Expected: FAIL because `AssetCatalogContract` does not exist.

- [ ] **Step 3: Add the smallest shared contract**

Create `fusion-contracts/AssetCatalogContract.cs`:

```csharp
namespace Mkz.Fusion.Contracts;

public static class AssetCatalogContract
{
    public const string PlantCode = "MKZ-PLANT";

    public static string NormalizeType(string? type) => type?.Trim().ToUpperInvariant() ?? string.Empty;

    public static string LineCode(Guid id) => $"line:{id:D}";

    public static string MachineCode(Guid id) => $"machine:{id:D}";

    public static bool IsCatalogOwned(string? type) => NormalizeType(type) is "PLANT" or "AREA" or "SENSOR";

    public static bool IsKnownType(string? type) => NormalizeType(type) is "PLANT" or "AREA" or "LINE" or "MACHINE" or "SENSOR";
}
```

Do not add `AssetId` to `TelemetryFusionEvent` or `MachineSnapshot`; `MachineSnapshot.Id` already is the shared UUID.

- [ ] **Step 4: Run the unit test to verify green**

Run:

```powershell
dotnet test backend.Tests/backend.Tests.csproj --filter FullyQualifiedName~AssetCatalogContractTests
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit the contract**

```powershell
git add fusion-contracts/AssetCatalogContract.cs backend.Tests/AssetCatalogContractTests.cs
git commit -m "feat(assets): define shared catalog contract"
```

### Task 2: Add the additive catalog schema and legacy synchronization

**Files:**
- Modify: `backend/Services/DatabaseService.cs:125-133`
- Create: `backend/Controllers/AssetController.cs`
- Modify: `infrastructure/demo/Test-FullDemo.ps1`

- [ ] **Step 1: Extend the full-demo test with a failing seed assertion**

Immediately after `$machineId = [string]$smokeMachine.id` in `infrastructure/demo/Test-FullDemo.ps1`, add:

```powershell
$machineAsset = Invoke-RestMethod -Uri "$backendUrl/api/assets/$machineId" -WebSession $browser -TimeoutSec 10
if ([string]$machineAsset.id -ne $machineId -or [string]$machineAsset.type -ne 'MACHINE') {
    throw 'The smoke machine does not have the matching MACHINE asset UUID.'
}
```

- [ ] **Step 2: Run the demo test to verify the red state**

Run:

```powershell
.\infrastructure\demo\Test-FullDemo.ps1
```

Expected: FAIL with HTTP 404 because `/api/assets/{id}` is not implemented yet. Keep the test change.

- [ ] **Step 3: Add idempotent schema, seed, backfill, triggers, and the smallest read endpoint**

In `DatabaseService.InitializeDatabase`, immediately after the `line_machines` DDL, add an interpolated `ExecuteSync` block using `AssetCatalogContract.PlantCode`:

```csharp
ExecuteSync(conn, $@"
    CREATE TABLE IF NOT EXISTS assets (
        id UUID PRIMARY KEY,
        type VARCHAR(32) NOT NULL CHECK (type IN ('PLANT', 'AREA', 'LINE', 'MACHINE', 'SENSOR')),
        name VARCHAR(255) NOT NULL,
        code VARCHAR(255) NOT NULL UNIQUE,
        metadata JSONB NOT NULL DEFAULT '{{}}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS asset_relationships (
        parent_asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        child_asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        relationship_type VARCHAR(32) NOT NULL DEFAULT 'CONTAINS',
        PRIMARY KEY (parent_asset_id, child_asset_id, relationship_type),
        CHECK (parent_asset_id <> child_asset_id)
    );
    INSERT INTO assets (id, type, name, code)
    VALUES (gen_random_uuid(), 'PLANT', 'MKZ Factory', '{AssetCatalogContract.PlantCode}')
    ON CONFLICT (code) DO NOTHING;
    INSERT INTO assets (id, type, name, code, metadata)
    SELECT id, 'LINE', name, 'line:' || id::text,
           jsonb_strip_nulls(jsonb_build_object('description', description))
    FROM production_lines
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, metadata = EXCLUDED.metadata, updated_at = CURRENT_TIMESTAMP;
    INSERT INTO assets (id, type, name, code, metadata)
    SELECT id, 'MACHINE', name, 'machine:' || id::text,
           jsonb_strip_nulls(jsonb_build_object('machineCode', machine_code, 'clientId', client_id))
    FROM machines
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, metadata = EXCLUDED.metadata, updated_at = CURRENT_TIMESTAMP;
    INSERT INTO asset_relationships (parent_asset_id, child_asset_id, relationship_type)
    SELECT plant.id, line.id, 'CONTAINS'
    FROM assets plant CROSS JOIN production_lines line
    WHERE plant.code = '{AssetCatalogContract.PlantCode}'
    ON CONFLICT DO NOTHING;
    INSERT INTO asset_relationships (parent_asset_id, child_asset_id, relationship_type)
    SELECT line_id, machine_id, 'CONTAINS' FROM line_machines
    ON CONFLICT DO NOTHING;
");
```

Add three `CREATE OR REPLACE FUNCTION` blocks in the same initialization method:

```sql
CREATE OR REPLACE FUNCTION sync_line_asset() RETURNS trigger AS $$
DECLARE plant_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN DELETE FROM assets WHERE id = OLD.id; RETURN OLD; END IF;
  INSERT INTO assets (id, type, name, code, metadata)
  VALUES (NEW.id, 'LINE', NEW.name, 'line:' || NEW.id::text,
          jsonb_strip_nulls(jsonb_build_object('description', NEW.description)))
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, metadata = EXCLUDED.metadata, updated_at = CURRENT_TIMESTAMP;
  SELECT id INTO plant_id FROM assets WHERE code = 'MKZ-PLANT';
  INSERT INTO asset_relationships (parent_asset_id, child_asset_id, relationship_type)
  VALUES (plant_id, NEW.id, 'CONTAINS') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_machine_asset() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN DELETE FROM assets WHERE id = OLD.id; RETURN OLD; END IF;
  INSERT INTO assets (id, type, name, code, metadata)
  VALUES (NEW.id, 'MACHINE', NEW.name, 'machine:' || NEW.id::text,
          jsonb_strip_nulls(jsonb_build_object('machineCode', NEW.machine_code, 'clientId', NEW.client_id)))
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, metadata = EXCLUDED.metadata, updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_line_machine_asset_relationship() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM asset_relationships WHERE parent_asset_id = OLD.line_id AND child_asset_id = OLD.machine_id AND relationship_type = 'CONTAINS';
    RETURN OLD;
  END IF;
  INSERT INTO asset_relationships (parent_asset_id, child_asset_id, relationship_type)
  VALUES (NEW.line_id, NEW.machine_id, 'CONTAINS') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
```

Drop/recreate the three trigger names on every startup so the deployed function bodies stay current:

```sql
DROP TRIGGER IF EXISTS production_lines_asset_sync ON production_lines;
CREATE TRIGGER production_lines_asset_sync AFTER INSERT OR UPDATE OR DELETE ON production_lines
FOR EACH ROW EXECUTE FUNCTION sync_line_asset();
DROP TRIGGER IF EXISTS machines_asset_sync ON machines;
CREATE TRIGGER machines_asset_sync AFTER INSERT OR UPDATE OR DELETE ON machines
FOR EACH ROW EXECUTE FUNCTION sync_machine_asset();
DROP TRIGGER IF EXISTS line_machines_asset_sync ON line_machines;
CREATE TRIGGER line_machines_asset_sync AFTER INSERT OR DELETE ON line_machines
FOR EACH ROW EXECUTE FUNCTION sync_line_machine_asset_relationship();
```

Use the same C# constant for the literal `MKZ-PLANT` in each interpolated SQL block. Do not add controller-side legacy synchronization.

Create `backend/Controllers/AssetController.cs` with only the detail endpoint needed by the red smoke test:

```csharp
using System.Text.Json;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace backend.Controllers;

[ApiController]
[Route("api/assets")]
public sealed class AssetController(DatabaseService dbService, IAuditService auditService) : ControllerBase
{
    [HttpGet("{id:guid}")]
    [AllowAnonymous]
    public async Task<IActionResult> Get(Guid id)
    {
        const string sql = "SELECT id, type, name, code, metadata, created_at, updated_at FROM assets WHERE id = @id";
        using var connection = dbService.CreateConnection();
        await connection.OpenAsync();
        using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("id", id);
        using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync() ? Ok(ReadAsset(reader)) : NotFound(new { error = "Không tìm thấy asset" });
    }

    private static object ReadAsset(NpgsqlDataReader reader) => new {
        id = reader.GetGuid(0), type = reader.GetString(1), name = reader.GetString(2), code = reader.GetString(3),
        metadata = JsonDocument.Parse(reader.GetString(4)).RootElement.Clone(), createdAt = reader.GetDateTime(5), updatedAt = reader.GetDateTime(6)
    };
}
```

- [ ] **Step 4: Restart the existing full demo so startup DDL runs**

Run:

```powershell
.\infrastructure\demo\Start-FullDemo.ps1
```

Expected: backend starts without PostgreSQL DDL errors and the other demo services become ready.

- [ ] **Step 5: Re-run the seed assertion**

Run:

```powershell
.\infrastructure\demo\Test-FullDemo.ps1
```

Expected: all existing demo checks plus the matching machine asset assertion PASS.

- [ ] **Step 6: Commit the schema slice**

```powershell
git add backend/Services/DatabaseService.cs backend/Controllers/AssetController.cs infrastructure/demo/Test-FullDemo.ps1
git commit -m "feat(assets): synchronize catalog with operations data"
```

### Task 3: Expose read and search endpoints

**Files:**
- Modify: `backend/Controllers/AssetController.cs`
- Modify: `infrastructure/demo/Test-FullDemo.ps1`

- [ ] **Step 1: Add a failing list/search assertion**

After the matching UUID assertion, append:

```powershell
$machineAssetSearch = Invoke-RestMethod -Uri "$backendUrl/api/assets?q=FII-SMOKE-01&type=MACHINE" -WebSession $browser -TimeoutSec 10
if (@($machineAssetSearch | Where-Object { [string]$_.id -eq $machineId }).Count -ne 1) {
    throw 'Asset search did not return the smoke machine.'
}
```

- [ ] **Step 2: Run the demo test to verify the red state**

Run:

```powershell
.\infrastructure\demo\Test-FullDemo.ps1
```

Expected: FAIL because `GET /api/assets` is not implemented.

- [ ] **Step 3: Extend the detail controller with list/search**

Add `using Mkz.Fusion.Contracts;` and `using NpgsqlTypes;` at the top of `AssetController.cs`, then insert this method before `Get`:

```csharp
[HttpGet]
[AllowAnonymous]
public async Task<IActionResult> List([FromQuery] string? q, [FromQuery] string? type, [FromQuery] Guid? parentId)
{
    var normalizedType = string.IsNullOrWhiteSpace(type) ? null : AssetCatalogContract.NormalizeType(type);
    if (normalizedType is not null && !AssetCatalogContract.IsKnownType(normalizedType)) return BadRequest(new { error = "Loại asset không hợp lệ" });
    const string sql = """
        SELECT a.id, a.type, a.name, a.code, a.metadata, a.created_at, a.updated_at
        FROM assets a
        WHERE (@q IS NULL OR a.name ILIKE '%' || @q || '%' OR a.code ILIKE '%' || @q || '%' OR a.metadata::text ILIKE '%' || @q || '%')
          AND (@type IS NULL OR a.type = @type)
          AND (@parent_id IS NULL OR EXISTS (
                SELECT 1 FROM asset_relationships r
                WHERE r.parent_asset_id = @parent_id AND r.child_asset_id = a.id AND r.relationship_type = 'CONTAINS'))
        ORDER BY a.type, a.name, a.id
        """;
    using var connection = dbService.CreateConnection();
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
```

Keep `auditService` in the primary constructor for the write task; do not add a second controller or repository.

- [ ] **Step 4: Restart and run the demo test to verify green**

Run:

```powershell
.\infrastructure\demo\Start-FullDemo.ps1
.\infrastructure\demo\Test-FullDemo.ps1
```

Expected: all existing checks plus matching UUID and search assertions PASS.

- [ ] **Step 5: Commit read/search support**

```powershell
git add backend/Controllers/AssetController.cs infrastructure/demo/Test-FullDemo.ps1
git commit -m "feat(assets): add catalog search API"
```

### Task 4: Add catalog-native CRUD and prove it through the demo

**Files:**
- Modify: `backend/Controllers/AssetController.cs`
- Modify: `infrastructure/demo/Test-FullDemo.ps1`

- [ ] **Step 1: Add a failing sensor CRUD smoke block**

After the search assertion, add this self-cleaning block:

```powershell
$sensor = $null
$sensorCode = "fii-demo-sensor-$PID"
$sensor = Invoke-RestMethod -Method Post -Uri "$backendUrl/api/assets" -Headers $authHeaders -ContentType 'application/json' -Body (@{
    name = 'FII Demo Sensor'; type = 'SENSOR'; code = $sensorCode; metadata = @{ vendor = 'demo'; unit = 'celsius' }
} | ConvertTo-Json -Depth 4 -Compress) -TimeoutSec 10
try {
    $found = Invoke-RestMethod -Uri "$backendUrl/api/assets?q=$([uri]::EscapeDataString($sensorCode))&type=SENSOR" -WebSession $browser -TimeoutSec 10
    if (@($found | Where-Object { [string]$_.id -eq [string]$sensor.id }).Count -ne 1) { throw 'Created sensor was not searchable.' }
    $updated = Invoke-RestMethod -Method Put -Uri "$backendUrl/api/assets/$($sensor.id)" -Headers $authHeaders -ContentType 'application/json' -Body (@{
        name = 'FII Demo Sensor Updated'; code = $sensorCode; metadata = @{ vendor = 'demo'; unit = 'celsius'; calibrated = $true }
    } | ConvertTo-Json -Depth 4 -Compress) -TimeoutSec 10
    if ([string]$updated.name -ne 'FII Demo Sensor Updated') { throw 'Asset update did not persist.' }
}
finally {
    if ($null -ne $sensor) { Invoke-RestMethod -Method Delete -Uri "$backendUrl/api/assets/$($sensor.id)" -Headers $authHeaders -TimeoutSec 10 | Out-Null }
}
```

- [ ] **Step 2: Run the demo test to verify the red state**

Run:

```powershell
.\infrastructure\demo\Test-FullDemo.ps1
```

Expected: FAIL with HTTP 405 or 404 on `POST /api/assets`.

- [ ] **Step 3: Add minimal write endpoints and request types**

Add `using System.Security.Claims;` to `AssetController.cs`, then append these request types after the controller:

```csharp
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
```

Append these methods inside `AssetController`, before `ReadAsset`:

```csharp
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
        using var connection = dbService.CreateConnection();
        await connection.OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync();
        if (request.ParentId.HasValue)
        {
            using var parentCommand = new NpgsqlCommand("SELECT EXISTS (SELECT 1 FROM assets WHERE id = @id)", connection, transaction);
            parentCommand.Parameters.AddWithValue("id", request.ParentId.Value);
            if (!(bool)(await parentCommand.ExecuteScalarAsync() ?? false)) return BadRequest(new { error = "Asset cha không tồn tại" });
        }

        object created;
        using (var command = new NpgsqlCommand("INSERT INTO assets (id, type, name, code, metadata) VALUES (@id, @type, @name, @code, @metadata) RETURNING id, type, name, code, metadata, created_at, updated_at", connection, transaction))
        {
            command.Parameters.AddWithValue("id", id);
            command.Parameters.AddWithValue("type", type);
            command.Parameters.AddWithValue("name", request.Name.Trim());
            command.Parameters.AddWithValue("code", request.Code.Trim());
            command.Parameters.Add("metadata", NpgsqlDbType.Jsonb).Value = JsonSerializer.Serialize(request.Metadata ?? new Dictionary<string, JsonElement>());
            using var reader = await command.ExecuteReaderAsync();
            if (!await reader.ReadAsync()) return StatusCode(500, new { error = "Không tạo được asset" });
            created = ReadAsset(reader);
        }
        if (request.ParentId.HasValue)
        {
            using var relationshipCommand = new NpgsqlCommand("INSERT INTO asset_relationships (parent_asset_id, child_asset_id, relationship_type) VALUES (@parent_id, @child_id, 'CONTAINS')", connection, transaction);
            relationshipCommand.Parameters.AddWithValue("parent_id", request.ParentId.Value);
            relationshipCommand.Parameters.AddWithValue("child_id", id);
            await relationshipCommand.ExecuteNonQueryAsync();
        }
        await transaction.CommitAsync();
        await auditService.LogAuditAsync(User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown", "CREATE_ASSET", $"Tạo asset: {request.Name} ({id})");
        return Created($"/api/assets/{id}", created);
    }
    catch (PostgresException exception) when (exception.SqlState == "23505") { return Conflict(new { error = "Mã asset đã tồn tại" }); }
}

[HttpPut("{id:guid}")]
[Authorize(Roles = "ADMIN,ENGINEER")]
public async Task<IActionResult> Update(Guid id, [FromBody] AssetUpdateRequest request)
{
    if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Code)) return BadRequest(new { error = "Name và code không được để trống" });
    try
    {
        using var connection = dbService.CreateConnection();
        await connection.OpenAsync();
        using (var typeCommand = new NpgsqlCommand("SELECT type FROM assets WHERE id = @id", connection))
        {
            typeCommand.Parameters.AddWithValue("id", id);
            var type = await typeCommand.ExecuteScalarAsync() as string;
            if (type is null) return NotFound(new { error = "Không tìm thấy asset" });
            if (!AssetCatalogContract.IsCatalogOwned(type)) return Conflict(new { error = "LINE và MACHINE phải được sửa qua API vận hành hiện có" });
        }
        using var command = new NpgsqlCommand("UPDATE assets SET name = @name, code = @code, metadata = @metadata, updated_at = CURRENT_TIMESTAMP WHERE id = @id RETURNING id, type, name, code, metadata, created_at, updated_at", connection);
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("name", request.Name.Trim());
        command.Parameters.AddWithValue("code", request.Code.Trim());
        command.Parameters.Add("metadata", NpgsqlDbType.Jsonb).Value = JsonSerializer.Serialize(request.Metadata ?? new Dictionary<string, JsonElement>());
        using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) return NotFound(new { error = "Không tìm thấy asset" });
        var updated = ReadAsset(reader);
        await auditService.LogAuditAsync(User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown", "UPDATE_ASSET", $"Sửa asset: {id}");
        return Ok(updated);
    }
    catch (PostgresException exception) when (exception.SqlState == "23505") { return Conflict(new { error = "Mã asset đã tồn tại" }); }
}

[HttpDelete("{id:guid}")]
[Authorize(Roles = "ADMIN,ENGINEER")]
public async Task<IActionResult> Delete(Guid id)
{
    using var connection = dbService.CreateConnection();
    await connection.OpenAsync();
    string? type;
    string? code;
    using (var assetCommand = new NpgsqlCommand("SELECT type, code FROM assets WHERE id = @id", connection))
    {
        assetCommand.Parameters.AddWithValue("id", id);
        using var reader = await assetCommand.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) return NotFound(new { error = "Không tìm thấy asset" });
        type = reader.GetString(0);
        code = reader.GetString(1);
    }
    if (!AssetCatalogContract.IsCatalogOwned(type) || code == AssetCatalogContract.PlantCode) return Conflict(new { error = "Asset này không được xóa qua API catalog" });
    using (var childCommand = new NpgsqlCommand("SELECT EXISTS (SELECT 1 FROM asset_relationships WHERE parent_asset_id = @id)", connection))
    {
        childCommand.Parameters.AddWithValue("id", id);
        if ((bool)(await childCommand.ExecuteScalarAsync() ?? false)) return Conflict(new { error = "Không thể xóa asset còn child" });
    }
    using var deleteCommand = new NpgsqlCommand("DELETE FROM assets WHERE id = @id", connection);
    deleteCommand.Parameters.AddWithValue("id", id);
    await deleteCommand.ExecuteNonQueryAsync();
    await auditService.LogAuditAsync(User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown", "DELETE_ASSET", $"Xóa asset: {id}");
    return Ok(new { success = true });
}
```

Do not add a repository, service interface, parent-changing endpoint, or generic CRUD for `LINE` and `MACHINE`.

- [ ] **Step 4: Run focused checks and the full demo to verify green**

Run:

```powershell
dotnet test backend.Tests/backend.Tests.csproj --filter FullyQualifiedName~AssetCatalogContractTests
.\infrastructure\demo\Start-FullDemo.ps1
.\infrastructure\demo\Test-FullDemo.ps1
```

Expected: contract tests pass; the sensor is created, searchable, updated, deleted, and the pre-existing SSO/telemetry/RAG checks still pass.

- [ ] **Step 5: Commit catalog CRUD**

```powershell
git add backend/Controllers/AssetController.cs infrastructure/demo/Test-FullDemo.ps1
git commit -m "feat(assets): add catalog CRUD API"
```

### Task 5: Final verification and roadmap update

**Files:**
- Modify: `docs/master-plan-4-agents.md:26-29,136-146`

- [ ] **Step 1: Run the complete relevant verification set**

Run:

```powershell
dotnet test backend.Tests/backend.Tests.csproj
dotnet build backend/backend.csproj --no-restore
.\infrastructure\demo\Start-FullDemo.ps1
.\infrastructure\demo\Test-FullDemo.ps1
git diff --check
```

Expected: all commands exit 0 and the smoke output includes `SharedSso : Passed` and `FusionTelemetry : Passed`.

- [ ] **Step 2: Update only verified roadmap items**

In `docs/master-plan-4-agents.md`, mark checked only the items now proven by the test evidence:

```markdown
- [x] Chốt schema `assets` và `asset_relationships` ...
- [ ] Chốt schema `asset_documents` ...
- [x] Publish schema này cho A/B/D dùng làm `asset_id` reference ...
- [x] REST API: `GET/POST/PUT/DELETE /api/assets` cho catalog-native asset
- [x] Search asset theo tên/loại/metadata
```

Do not mark documents, 50+ realistic asset seed, health score, tree endpoint, or Asset Browser complete; they are outside this slice.

- [ ] **Step 3: Inspect the final diff and retain unrelated changes**

Run:

```powershell
git status --short
git diff --check
git log --oneline -5
```

Expected: only the Asset catalog files and intentionally modified roadmap are part of this work. Do not stage or revert the existing `Open-Data-Fusion/apps/web/` changes or `graphify-out/`.

- [ ] **Step 4: Commit verification documentation**

```powershell
git add docs/master-plan-4-agents.md
git commit -m "docs(roadmap): record asset catalog delivery"
```

## Spec coverage self-review

- Shared UUID contract: Task 1 preserves the existing telemetry identity and adds explicit code/type invariants.
- Additive schema, idempotent seed, line/machine sync, and many-to-many line membership: Task 2.
- Asset list/detail/search and catalog-only CRUD: Tasks 3 and 4.
- Existing demo behavior and no residue from CRUD smoke data: Tasks 2 through 5.
- Deferred scope: documents, a new telemetry table, health score, frontend browser, CEP, pagination, and migration tooling are deliberately excluded.

## Plan self-review

- No new dependencies or ODF file changes are required.
- All new behavior has a red-to-green unit or full-demo smoke check.
- `LINE` and `MACHINE` remain operational-source-owned, so generic Asset CRUD cannot split the source of truth.
