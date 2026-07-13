# Open Data Fusion Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Add a safe, independently deployable Open Data Fusion integration that persists telemetry locally, queues a durable outbound event, maps it to an ODF ingest bundle, and exposes a feature-flagged portal entry.

**Architecture:** The current MKZ backend remains the operational source of truth. It writes raw telemetry and a versioned fusion_outbox event in one PostgreSQL transaction; a new .NET 9 Fusion Adapter worker independently claims, maps, retries, and delivers those events to ODF. ODF is a pinned upstream submodule with MKZ deployment configuration outside its source tree.

**Tech Stack:** .NET 9, ASP.NET Core, Npgsql 10, xUnit, React 19, TypeScript, Vitest, Vite, Docker Compose, Open Data Fusion commit 4dc804be5d3d5df0db516c68a02934076a42c9db.

---

## File structure

| Path | Responsibility |
| --- | --- |
| .gitmodules and third_party/open-data-fusion | Pins unmodified upstream ODF source. |
| infrastructure/open-data-fusion/.env.example | Local non-secret Compose ports and development passwords. |
| infrastructure/open-data-fusion/README.md | Startup, production-profile, activation, smoke-test, and rollback runbook. |
| fusion-contracts/Fusion.Contracts.csproj | Dependency-free contract assembly shared by backend and adapter. |
| fusion-contracts/TelemetryFusionContracts.cs | Versioned telemetry input/event records plus stable event-key factory. |
| backend/Configuration/OpenDataFusionCaptureOptions.cs | Capture feature flag. |
| backend/Services/DatabaseService.cs | fusion_outbox DDL and atomic raw-telemetry/outbox persistence. |
| backend/Services/TelemetryIngestionService.cs | Parses PLC envelope and creates the capture input. |
| fusion-adapter | Worker, mapper, repository, retry, identity provider, and ODF transport. |
| fusion-adapter.Tests | Unit tests for mapping, dispatch outcomes, and HTTP request headers. |
| frontend/src/shared/config/openDataFusion.ts | Validates optional VITE_ODF_WEB_URL. |
| frontend/src/shared/components/layout/Sidebar.tsx | Adds the external Data Fusion entry when enabled. |

### Task 1: Verify baseline and add the isolated ODF runtime

**Files:**
- Create: .gitmodules
- Create: third_party/open-data-fusion/ (Git submodule)
- Create: infrastructure/open-data-fusion/.env.example
- Create: infrastructure/open-data-fusion/README.md
- Test: Docker Compose interpolation

- [ ] **Step 1: Run the current backend tests before modification**

Run:

~~~powershell
dotnet test backend.Tests/backend.Tests.csproj --no-restore
~~~

Expected: the existing CryptoHelperTests and PasswordHasherTests pass. If packages have not been restored, repeat without --no-restore and record that baseline output.

- [ ] **Step 2: Install frontend dependencies in the isolated worktree**

Run:

~~~powershell
Push-Location frontend
npm ci
npm run test:run
Pop-Location
~~~

Expected: frontend dependencies are available for focused red/green tests, and the existing frontend test suite passes before UI changes.

- [ ] **Step 3: Add the upstream source at the approved commit**

Run:

~~~powershell
git submodule add https://github.com/HaydernCenterpoint/Open-Data-Fusion.git third_party/open-data-fusion
git -C third_party/open-data-fusion checkout 4dc804be5d3d5df0db516c68a02934076a42c9db
git add .gitmodules third_party/open-data-fusion
git diff --cached --submodule=short
~~~

Expected: Git reports the submodule at SHA 4dc804b.

- [ ] **Step 4: Create the local environment template**

Create infrastructure/open-data-fusion/.env.example:

~~~dotenv
COMPOSE_PROJECT_NAME=mkz-odf
ODF_POSTGRES_PORT=55432
ODF_REDIS_PORT=56379
ODF_API_PORT=54310
ODF_WEB_PORT=58088
ODF_GRAFANA_PORT=53000
ODF_PROMETHEUS_PORT=59090
ODF_POSTGRES_DB=odf
ODF_POSTGRES_ADMIN_USER=odf_migrator
ODF_POSTGRES_ADMIN_PASSWORD=local-development-only-change-me
ODF_REDIS_PASSWORD=local-development-only-change-me
ODF_GRAFANA_ADMIN_USER=admin
ODF_GRAFANA_ADMIN_PASSWORD=local-development-only-change-me
ODF_METRICS_TOKEN=local-development-only-change-me
~~~

- [ ] **Step 5: Write the ODF runbook**

Create infrastructure/open-data-fusion/README.md with the following local commands:

~~~powershell
Copy-Item infrastructure/open-data-fusion/.env.example third_party/open-data-fusion/.env
Push-Location third_party/open-data-fusion
docker compose --env-file .env --profile application-preview up -d
Invoke-WebRequest http://127.0.0.1:54310/ready
docker compose --env-file .env --profile application-preview down
Pop-Location
~~~

State explicitly: application-preview validates mapping only; retained business data uses the upstream production-like Compose file, PostgreSQL persistence, Redis, object storage, OIDC, and secret-manager values. Rollback is stopping the ODF Compose project; it does not touch PLC/MQTT.

- [ ] **Step 6: Validate the rendered Compose configuration**

Run:

~~~powershell
Push-Location third_party/open-data-fusion
docker compose --env-file ../../infrastructure/open-data-fusion/.env.example --profile application-preview config --quiet
Pop-Location
~~~

Expected: exit code 0 and no missing-variable errors.

- [ ] **Step 7: Commit the runtime slice**

~~~powershell
git add .gitmodules third_party/open-data-fusion infrastructure/open-data-fusion
git commit -m "chore: add Open Data Fusion upstream runtime"
~~~

### Task 2: Define the shared event contract and atomic backend capture

**Files:**
- Create: fusion-contracts/Fusion.Contracts.csproj
- Create: fusion-contracts/TelemetryFusionContracts.cs
- Create: backend/Configuration/OpenDataFusionCaptureOptions.cs
- Create: backend.Tests/TelemetryFusionEventFactoryTests.cs
- Modify: backend/backend.csproj
- Modify: backend/Program.cs
- Modify: backend/appsettings.json
- Modify: backend/Services/DatabaseService.cs
- Modify: backend/Services/TelemetryIngestionService.cs

- [ ] **Step 1: Write the failing message-id idempotency test**

Create backend.Tests/TelemetryFusionEventFactoryTests.cs:

~~~csharp
using Mkz.Fusion.Contracts;

namespace backend.Tests;

public sealed class TelemetryFusionEventFactoryTests
{
    [Fact]
    public void Create_UsesEnvelopeMessageIdInsteadOfLineOrderForEventKey()
    {
        var machineId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        var input = new TelemetryCaptureInput(
            machineId, """{"messageId":"message-001"}""", 4,
            DateTimeOffset.Parse("2026-07-13T10:00:00Z"), "message-001",
            "Press A", "ERROR", true, 25, 1.2, 50.0, 88.5, 99.1, true);
        var result = TelemetryFusionEventFactory.Create(
            input, new MachineSnapshot(machineId, "client-a", "PRESS-A", "Press A"), null);

        Assert.Equal($"telemetry:{machineId}:message-001", result.EventKey);
        Assert.Equal("ERROR", result.Telemetry.Status);
        Assert.Equal(25, result.Telemetry.ProductionQuantity);
    }

    [Fact]
    public void Create_HashesRawPayloadWhenMessageIdIsMissing()
    {
        var machineId = Guid.Parse("22222222-2222-2222-2222-222222222222");
        var input = new TelemetryCaptureInput(
            machineId, """{"payload":{"qty":25}}""", 4,
            DateTimeOffset.Parse("2026-07-13T10:00:00Z"), null,
            "Press B", "RUNNING", true, 25, null, null, null, null, false);
        var result = TelemetryFusionEventFactory.Create(
            input, new MachineSnapshot(machineId, null, null, "Press B"), null);

        Assert.StartsWith($"telemetry:{machineId}:", result.EventKey);
        Assert.NotEqual($"telemetry:{machineId}:4", result.EventKey);
    }
}
~~~

- [ ] **Step 2: Run it and observe a compile failure**

Run:

~~~powershell
dotnet test backend.Tests/backend.Tests.csproj --filter FullyQualifiedName~TelemetryFusionEventFactoryTests
~~~

Expected: missing Mkz.Fusion.Contracts / TelemetryFusionEventFactory symbols.

- [ ] **Step 3: Implement the contract project**

Create fusion-contracts/Fusion.Contracts.csproj:

~~~xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net9.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>
</Project>
~~~

Create fusion-contracts/TelemetryFusionContracts.cs:

~~~csharp
using System.Security.Cryptography;
using System.Text;

namespace Mkz.Fusion.Contracts;

public sealed record MachineSnapshot(Guid Id, string? ClientId, string? MachineCode, string Name);
public sealed record LineSnapshot(Guid Id, string Name);
public sealed record MachineContext(MachineSnapshot Machine, LineSnapshot? Line);
public sealed record TelemetryCaptureInput(
    Guid MachineId, string RawTelemetryJson, long Sequence, DateTimeOffset OccurredAt,
    string? MessageId, string? ReportedMachineName, string Status, bool PlcConnected,
    long? ProductionQuantity, double? ProductionTime, double? Uph, double? Oee,
    double? YieldRate, bool? AlarmActive);
public sealed record TelemetryValues(
    string? MessageId, string Status, bool PlcConnected, long? ProductionQuantity,
    double? ProductionTime, double? Uph, double? Oee, double? YieldRate, bool? AlarmActive);
public sealed record TelemetryFusionEvent(
    int SchemaVersion, Guid EventId, string EventKey, DateTimeOffset OccurredAt,
    MachineSnapshot Machine, LineSnapshot? Line, TelemetryValues Telemetry,
    string RawTelemetryJson);

public static class TelemetryFusionEventFactory
{
    public static TelemetryFusionEvent Create(TelemetryCaptureInput input, MachineSnapshot machine, LineSnapshot? line)
    {
        var suffix = string.IsNullOrWhiteSpace(input.MessageId)
            ? Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(input.RawTelemetryJson))).ToLowerInvariant()
            : input.MessageId.Trim();

        return new TelemetryFusionEvent(
            1, Guid.NewGuid(), $"telemetry:{input.MachineId}:{suffix}", input.OccurredAt,
            machine, line,
            new TelemetryValues(input.MessageId, input.Status, input.PlcConnected,
                input.ProductionQuantity, input.ProductionTime, input.Uph, input.Oee,
                input.YieldRate, input.AlarmActive),
            input.RawTelemetryJson);
    }
}
~~~

Add this to backend/backend.csproj:

~~~xml
<ItemGroup>
  <ProjectReference Include="../fusion-contracts/Fusion.Contracts.csproj" />
</ItemGroup>
~~~

- [ ] **Step 4: Run the red/green test**

Run:

~~~powershell
dotnet test backend.Tests/backend.Tests.csproj --filter FullyQualifiedName~TelemetryFusionEventFactoryTests
~~~

Expected: 2 tests pass.

- [ ] **Step 5: Add the configuration flag**

Create backend/Configuration/OpenDataFusionCaptureOptions.cs:

~~~csharp
namespace backend.Configuration;

public sealed class OpenDataFusionCaptureOptions
{
    public const string SectionName = "OpenDataFusion";
    public bool CaptureEnabled { get; init; }
}
~~~

In backend/Program.cs bind the option:

~~~csharp
using backend.Configuration;

builder.Services.Configure<OpenDataFusionCaptureOptions>(
    builder.Configuration.GetSection(OpenDataFusionCaptureOptions.SectionName));
~~~

Add this safe default at the root of backend/appsettings.json:

~~~json
"OpenDataFusion": {
  "CaptureEnabled": false
}
~~~

- [ ] **Step 6: Add fusion_outbox DDL**

In DatabaseService.InitializeDatabase, directly after machine_telemetry creation/indexing, execute:

~~~sql
CREATE TABLE IF NOT EXISTS fusion_outbox (
    id UUID PRIMARY KEY,
    schema_version INTEGER NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_key VARCHAR(512) NOT NULL UNIQUE,
    payload JSONB NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(16) NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    available_at TIMESTAMPTZ NOT NULL,
    locked_at TIMESTAMPTZ NULL,
    lock_id UUID NULL,
    delivered_at TIMESTAMPTZ NULL,
    last_error TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fusion_outbox_dispatch
    ON fusion_outbox (status, available_at, created_at);
~~~

- [ ] **Step 7: Add atomic raw-telemetry/outbox persistence**

Add DatabaseService.PersistTelemetryAndFusionOutboxAsync(TelemetryCaptureInput input, bool captureEnabled). It opens one connection and transaction, writes raw telemetry, queries a snapshot, inserts the event only when capture is enabled, commits, then returns true:

~~~csharp
await using var connection = CreateConnection();
await connection.OpenAsync();
await using var transaction = await connection.BeginTransactionAsync();

await using var rawCommand = new NpgsqlCommand(
    "INSERT INTO machine_telemetry (machine_id, raw_json, sequence, created_at) VALUES (@machineId, CAST(@raw AS jsonb), @sequence, @occurredAt)",
    connection, transaction);
rawCommand.Parameters.AddWithValue("machineId", input.MachineId);
rawCommand.Parameters.AddWithValue("raw", input.RawTelemetryJson);
rawCommand.Parameters.AddWithValue("sequence", input.Sequence);
rawCommand.Parameters.AddWithValue("occurredAt", input.OccurredAt.UtcDateTime);
await rawCommand.ExecuteNonQueryAsync();

var snapshot = captureEnabled
    ? await ReadMachineSnapshotAsync(connection, transaction, input.MachineId)
    : null;
if (captureEnabled && snapshot is not null)
{
    var fusionEvent = TelemetryFusionEventFactory.Create(input, snapshot.Machine, snapshot.Line);
    await InsertFusionOutboxAsync(connection, transaction, fusionEvent);
}
await transaction.CommitAsync();
return true;
~~~

Use this snapshot query with the same transaction:

~~~sql
SELECT m.id, m.client_id, m.machine_code, m.name, l.id, l.name
FROM machines m
LEFT JOIN line_machines lm ON lm.machine_id = m.id
LEFT JOIN production_lines l ON l.id = lm.line_id
WHERE m.id = @machineId
ORDER BY lm.sequence_order NULLS LAST
LIMIT 1;
~~~

ReadMachineSnapshotAsync returns MachineContext?; it returns null only when the machine row is absent. InsertFusionOutboxAsync receives the connection, transaction, and TelemetryFusionEvent, binds its serialized camel-case payload as NpgsqlDbType.Jsonb, and executes the PENDING insert with ON CONFLICT (event_key) DO NOTHING.

For the outbox insert, serialize using camel-case JSON, bind payload as NpgsqlDbType.Jsonb, set status PENDING, available_at to UTC now, and use ON CONFLICT (event_key) DO NOTHING. On database error, roll back, write the existing-style console diagnostic, and return false instead of throwing into the MQTT loop.

- [ ] **Step 8: Switch ingestion to the atomic method and preserve its live behavior**

Inject IOptions<OpenDataFusionCaptureOptions> into TelemetryIngestionService. Parse root messageId and optional production uph/oee/yieldRate plus alarm.active, then call:

~~~csharp
var captureInput = new TelemetryCaptureInput(
    machineGuid, rawJson, sequence, sentAt, messageId,
    payload.TryGetProperty("machineName", out var name) ? name.GetString() : null,
    status, plcConnected, productionCount, cycleTime, uph, oee, yieldRate, alarmActive);

await _dbService.PersistTelemetryAndFusionOutboxAsync(
    captureInput, _captureOptions.Value.CaptureEnabled);
~~~

Keep the current machine update, history update, hourly update, and both SignalR broadcasts after this call.

- [ ] **Step 9: Verify and commit backend capture**

Run:

~~~powershell
dotnet test backend.Tests/backend.Tests.csproj
dotnet build backend/backend.csproj --no-restore
git add fusion-contracts backend backend.Tests
git commit -m "feat: queue telemetry for Open Data Fusion"
~~~

Expected: current backend tests and the two new contract tests pass; capture remains off by default.

### Task 3: Build and lock the ODF bundle mapper

**Files:**
- Create: fusion-adapter/Fusion.Adapter.csproj
- Create: fusion-adapter/Configuration/OpenDataFusionOptions.cs
- Create: fusion-adapter/Mapping/OpenDataFusionBundle.cs
- Create: fusion-adapter/Mapping/OpenDataFusionBundleMapper.cs
- Create: fusion-adapter.Tests/Fusion.Adapter.Tests.csproj
- Create: fusion-adapter.Tests/Mapping/OpenDataFusionBundleMapperTests.cs

- [ ] **Step 1: Write the failing mapper test**

Create fusion-adapter.Tests/Mapping/OpenDataFusionBundleMapperTests.cs:

~~~csharp
using Fusion.Adapter.Configuration;
using Fusion.Adapter.Mapping;
using Mkz.Fusion.Contracts;

namespace Fusion.Adapter.Tests.Mapping;

public sealed class OpenDataFusionBundleMapperTests
{
    [Fact]
    public void Map_CreatesPlantLineMachineAndNumericTelemetry()
    {
        var machineId = Guid.Parse("33333333-3333-3333-3333-333333333333");
        var lineId = Guid.Parse("44444444-4444-4444-4444-444444444444");
        var eventToMap = new TelemetryFusionEvent(
            1, Guid.Parse("55555555-5555-5555-5555-555555555555"),
            "telemetry:33333333-3333-3333-3333-333333333333:message-1",
            DateTimeOffset.Parse("2026-07-13T10:00:00Z"),
            new MachineSnapshot(machineId, "client-a", "PRESS-A", "Press A"),
            new LineSnapshot(lineId, "Line A"),
            new TelemetryValues("message-1", "ERROR", true, 42, 1.5, 55, 88.5, 99.1, true), "{}");
        var options = new OpenDataFusionOptions
        {
            TenantId = "tenant-a", ProjectId = "project-a",
            PlantExternalId = "mkz:plant:site-a", PlantName = "Site A"
        };

        var bundle = new OpenDataFusionBundleMapper(options).Map(eventToMap);

        Assert.Equal("mkz-plc-monitoring", bundle.Source.System);
        Assert.Equal(3, bundle.Assets.Count);
        Assert.Contains(bundle.DataPoints, point => point.TimeSeriesExternalId.EndsWith(":machine_state_code") && point.Value == 4);
        Assert.Contains(bundle.DataPoints, point => point.TimeSeriesExternalId.EndsWith(":plc_connected") && point.Value == 1);
        Assert.All(bundle.DataPoints, point => Assert.Equal("good", point.Quality));
    }
}
~~~

- [ ] **Step 2: Run the test and observe missing project types**

~~~powershell
dotnet test fusion-adapter.Tests/Fusion.Adapter.Tests.csproj --filter FullyQualifiedName~OpenDataFusionBundleMapperTests
~~~

Expected: Fusion.Adapter project/type errors.

- [ ] **Step 3: Create adapter/test project files**

Create fusion-adapter/Fusion.Adapter.csproj:

~~~xml
<Project Sdk="Microsoft.NET.Sdk.Worker">
  <PropertyGroup>
    <TargetFramework>net9.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>
  <ItemGroup>
    <FrameworkReference Include="Microsoft.AspNetCore.App" />
    <PackageReference Include="Npgsql" Version="10.0.3" />
    <ProjectReference Include="../fusion-contracts/Fusion.Contracts.csproj" />
  </ItemGroup>
</Project>
~~~

Create fusion-adapter.Tests/Fusion.Adapter.Tests.csproj:

~~~xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net9.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <IsPackable>false</IsPackable>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.12.0" />
    <PackageReference Include="xunit" Version="2.9.2" />
    <PackageReference Include="xunit.runner.visualstudio" Version="2.8.2" />
    <PackageReference Include="coverlet.collector" Version="6.0.2" />
    <ProjectReference Include="../fusion-adapter/Fusion.Adapter.csproj" />
  </ItemGroup>
</Project>
~~~

- [ ] **Step 4: Implement DTOs/options/mapper**

Create mapping DTOs that serialize with camel-case property names:

~~~csharp
public sealed record OdfSource(string System, string RunId, string Actor);
public sealed record OdfAsset(string ExternalId, string Name, string Type, string? ParentExternalId, IReadOnlyDictionary<string, object?> Metadata);
public sealed record OdfTimeSeries(string ExternalId, string AssetExternalId, string Name, string? Unit);
public sealed record OdfDataPoint(string TimeSeriesExternalId, string Timestamp, double Value, string Quality);
public sealed record OpenDataFusionBundle(
    OdfSource Source, IReadOnlyList<OdfAsset> Assets, IReadOnlyList<OdfTimeSeries> TimeSeries,
    IReadOnlyList<OdfDataPoint> DataPoints, IReadOnlyList<object> Documents, IReadOnlyList<object> Relations);
~~~

OpenDataFusionOptions has BaseUrl, TenantId, ProjectId, PlantExternalId, PlantName, DispatchEnabled=false, BatchSize=50, LeaseSeconds=30, MaxAttempts=12, PollIntervalSeconds=1, RequestTimeoutSeconds=10, and Authentication.

Map assets in plant, optional line, machine order. Map non-null metrics in this order: production_qty, production_time, uph, oee, yield_rate, plc_connected, machine_state_code, alarm_active. Use these exact helpers:

~~~csharp
private static string MachineExternalId(Guid id) => $"mkz:machine:{id}";
private static string LineExternalId(Guid id) => $"mkz:line:{id}";
private static string TimeSeriesExternalId(Guid machineId, string metric) => $"mkz:ts:{machineId}:{metric}";
private static int StateCode(string status) => status.Trim().ToUpperInvariant() switch
{
    "OFFLINE" => 0, "RUNNING" => 1, "IDLE" => 2, "STOPPED" => 3,
    "ERROR" or "ALARM" => 4, _ => 99
};
~~~

Use eventToMap.OccurredAt.UtcDateTime.ToString("O"), quality good when PlcConnected is true and uncertain otherwise, no inferred unit, and empty documents/relations arrays.

- [ ] **Step 5: Verify mapping**

~~~powershell
dotnet test fusion-adapter.Tests/Fusion.Adapter.Tests.csproj --filter FullyQualifiedName~OpenDataFusionBundleMapperTests
dotnet build fusion-adapter/Fusion.Adapter.csproj --no-restore
~~~

Expected: mapper test passes and the worker project builds.

### Task 4: Add outbox leasing, delivery, retry, identity, and worker host

**Files:**
- Create: fusion-adapter/Outbox/FusionOutboxRecord.cs
- Create: fusion-adapter/Outbox/IFusionOutboxRepository.cs
- Create: fusion-adapter/Outbox/FusionOutboxRepository.cs
- Create: fusion-adapter/Outbox/FusionOutboxDispatcher.cs
- Create: fusion-adapter/Outbox/FusionOutboxWorker.cs
- Create: fusion-adapter/Outbox/RetryPolicy.cs
- Create: fusion-adapter/Transport/IAccessTokenProvider.cs
- Create: fusion-adapter/Transport/ClientCredentialsAccessTokenProvider.cs
- Create: fusion-adapter/Transport/OpenDataFusionClient.cs
- Create: fusion-adapter/Program.cs
- Create: fusion-adapter/appsettings.json
- Create: fusion-adapter.Tests/Outbox/FusionOutboxDispatcherTests.cs
- Create: fusion-adapter.Tests/Transport/OpenDataFusionClientTests.cs

- [ ] **Step 1: Write failing success/permanent-error dispatcher tests**

Write a fake repository and client in FusionOutboxDispatcherTests.cs. Assert success marks delivered and an invalid bundle marks dead:

~~~csharp
[Fact]
public async Task DispatchOnceAsync_MarksDeliveredAfterSuccessfulOdfResponse()
{
    var repository = new FakeRepository(FusionOutboxRecord.For(TestEvent));
    var client = new FakeClient(DeliveryResult.Delivered());
    var dispatcher = new FusionOutboxDispatcher(repository, new OpenDataFusionBundleMapper(TestOptions), client, TestOptions);

    await dispatcher.DispatchOnceAsync(CancellationToken.None);

    Assert.Equal(1, repository.DeliveredCount);
    Assert.Equal(0, repository.DeadCount);
}

[Fact]
public async Task DispatchOnceAsync_MarksDeadForInvalidBundle()
{
    var repository = new FakeRepository(FusionOutboxRecord.For(TestEvent));
    var client = new FakeClient(DeliveryResult.PermanentFailure("ODF rejected payload"));
    var dispatcher = new FusionOutboxDispatcher(repository, new OpenDataFusionBundleMapper(TestOptions), client, TestOptions);

    await dispatcher.DispatchOnceAsync(CancellationToken.None);

    Assert.Equal(1, repository.DeadCount);
}
~~~

- [ ] **Step 2: Run dispatcher tests red**

~~~powershell
dotnet test fusion-adapter.Tests/Fusion.Adapter.Tests.csproj --filter FullyQualifiedName~FusionOutboxDispatcherTests
~~~

Expected: compilation error for missing repository/client/dispatcher types.

- [ ] **Step 3: Implement lease-safe repository operations**

Expose ClaimAsync, MarkDeliveredAsync, ScheduleRetryAsync, and MarkDeadAsync. ClaimAsync must first reset expired PROCESSING leases and then run this transaction-safe query:

~~~sql
UPDATE fusion_outbox
SET status = 'PENDING', lock_id = NULL, locked_at = NULL, available_at = NOW()
WHERE status = 'PROCESSING'
  AND locked_at < NOW() - (@leaseSeconds * INTERVAL '1 second');

WITH candidates AS (
    SELECT id FROM fusion_outbox
    WHERE status = 'PENDING' AND available_at <= NOW()
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT @batchSize
)
UPDATE fusion_outbox AS outbox
SET status = 'PROCESSING', lock_id = @lockId, locked_at = NOW()
FROM candidates
WHERE outbox.id = candidates.id
RETURNING outbox.id, outbox.payload, outbox.attempts, outbox.lock_id;
~~~

Every mutation predicate includes both id and lock_id. Deserialize payload into TelemetryFusionEvent and truncate persisted error text to 4096 characters.

- [ ] **Step 4: Implement retry and per-row dispatch**

Create RetryPolicy:

~~~csharp
public static TimeSpan NextDelay(int attempts)
{
    var exponent = Math.Min(Math.Max(attempts - 1, 0), 6);
    return TimeSpan.FromSeconds(Math.Min(300, 5 * Math.Pow(2, exponent)));
}
~~~

Dispatcher result logic is:

~~~csharp
if (result.Kind == DeliveryKind.Delivered)
    await repository.MarkDeliveredAsync(row.Id, row.LockId, cancellationToken);
else if (result.Kind == DeliveryKind.PermanentFailure || row.Attempts + 1 >= options.MaxAttempts)
    await repository.MarkDeadAsync(row.Id, row.LockId, result.Error, cancellationToken);
else
    await repository.ScheduleRetryAsync(row.Id, row.LockId, RetryPolicy.NextDelay(row.Attempts + 1), result.Error, cancellationToken);
~~~

Catch HttpRequestException and TaskCanceledException per row and schedule them as transient failures; continue with the remaining claimed rows.

- [ ] **Step 5: Write failing HTTP request tests**

Use a custom HttpMessageHandler in OpenDataFusionClientTests.cs and assert:

~~~csharp
Assert.Equal(HttpMethod.Post, captured.Method);
Assert.Equal("http://localhost:54310/api/v1/ingest/bundle", captured.RequestUri!.ToString());
Assert.Equal("tenant-a", captured.Headers.GetValues("x-odf-tenant-id").Single());
Assert.Equal("project-a", captured.Headers.GetValues("x-odf-project-id").Single());
Assert.Equal("local-user", captured.Headers.GetValues("x-odf-user").Single());
Assert.Equal(DeliveryKind.Delivered, result.Kind);
~~~

Use a 422 handler response in a second test and assert DeliveryKind.PermanentFailure.

- [ ] **Step 6: Implement HTTP client and token provider**

The client surface is:

~~~csharp
public interface IOpenDataFusionClient
{
    Task<DeliveryResult> SendAsync(OpenDataFusionBundle bundle, CancellationToken cancellationToken);
}
~~~

Post camel-case JSON to api/v1/ingest/bundle, always add both ODF scope headers, and choose identity:

~~~csharp
if (options.Authentication.Mode.Equals("development", StringComparison.OrdinalIgnoreCase))
    request.Headers.Add("x-odf-user", options.Authentication.DevelopmentUser);
else
    request.Headers.Authorization = new AuthenticationHeaderValue(
        "Bearer", await tokenProvider.GetAccessTokenAsync(cancellationToken));
~~~

ClientCredentialsAccessTokenProvider posts grant_type=client_credentials, client_id, client_secret, and optional scope as FormUrlEncodedContent; it parses access_token/expires_in and renews 60 seconds before expiry. Map HTTP 400/422 to permanent failure and all other non-2xx results to transient failure.

- [ ] **Step 7: Host a disabled-safe worker**

Create fusion-adapter/appsettings.json:

~~~json
{
  "ConnectionStrings": { "MkzOperations": "" },
  "OpenDataFusion": {
    "DispatchEnabled": false,
    "BaseUrl": "http://127.0.0.1:54310/",
    "TenantId": "",
    "ProjectId": "",
    "PlantExternalId": "mkz:plant:site-a",
    "PlantName": "Site A",
    "BatchSize": 50,
    "LeaseSeconds": 30,
    "MaxAttempts": 12,
    "PollIntervalSeconds": 1,
    "RequestTimeoutSeconds": 10,
    "Authentication": { "Mode": "development", "DevelopmentUser": "local-user" }
  }
}
~~~

Program.cs binds options, registers repository/mapper/client/token provider/worker, and only dispatches when DispatchEnabled plus required database URL, ODF base URL, tenant, and project are non-empty. The worker logs processed count and its last successful delivery; it never terminates because one event fails.

- [ ] **Step 8: Verify adapter and commit**

~~~powershell
dotnet test fusion-adapter.Tests/Fusion.Adapter.Tests.csproj
dotnet build fusion-adapter/Fusion.Adapter.csproj --no-restore
git add fusion-adapter fusion-adapter.Tests
git commit -m "feat: dispatch fusion outbox to ODF"
~~~

Expected: mapper, HTTP, retry, and dispatcher tests pass.

### Task 5: Add the feature-flagged portal entry

**Files:**
- Create: frontend/src/shared/config/openDataFusion.ts
- Create: frontend/src/shared/config/openDataFusion.test.ts
- Modify: frontend/src/shared/components/layout/Sidebar.tsx
- Modify: frontend/src/app/i18n/en/index.ts
- Modify: frontend/src/app/i18n/vi/index.ts
- Modify: frontend/src/app/i18n/zh-CN/index.ts

- [ ] **Step 1: Write the failing pure URL test**

Create frontend/src/shared/config/openDataFusion.test.ts:

~~~ts
import { describe, expect, it } from 'vitest';
import { getOpenDataFusionUrl } from './openDataFusion';

describe('getOpenDataFusionUrl', () => {
  it('returns null when the feature flag is absent', () => {
    expect(getOpenDataFusionUrl(undefined)).toBeNull();
  });

  it('returns a normalized absolute HTTP URL', () => {
    expect(getOpenDataFusionUrl('http://localhost:58088')).toBe('http://localhost:58088/');
  });

  it('rejects a non-HTTP URL', () => {
    expect(getOpenDataFusionUrl('javascript:alert(1)')).toBeNull();
  });
});
~~~

- [ ] **Step 2: Run it red**

~~~powershell
Push-Location frontend
npm run test:run -- src/shared/config/openDataFusion.test.ts
Pop-Location
~~~

Expected: unresolved module error.

- [ ] **Step 3: Implement the feature-flag helper**

Create frontend/src/shared/config/openDataFusion.ts:

~~~ts
export function getOpenDataFusionUrl(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
~~~

- [ ] **Step 4: Render the external Data Fusion item**

In Sidebar.tsx import ExternalLink and getOpenDataFusionUrl, then derive:

~~~ts
const odfWebUrl = getOpenDataFusionUrl(import.meta.env.VITE_ODF_WEB_URL);
~~~

Add a renderExternalNavItem helper matching the existing sidebar classes and returning an anchor with href={url}, target="_self", rel="noreferrer", and icon ExternalLink. Render it after operations navigation only when odfWebUrl is non-null. It must be a direct link, not an iframe.

Add navigation labels:
- English: dataFusion: 'Data Fusion'
- Vietnamese: dataFusion: 'Hợp nhất dữ liệu'
- Simplified Chinese: dataFusion: '数据融合'

Render the label via t('navigation.dataFusion').

- [ ] **Step 5: Verify and commit the frontend**

~~~powershell
Push-Location frontend
npm ci
npm run test:run -- src/shared/config/openDataFusion.test.ts
npm run lint
npm run type-check
npm run build
Pop-Location
git add frontend/src/shared/config frontend/src/shared/components/layout/Sidebar.tsx frontend/src/app/i18n
git commit -m "feat: add Data Fusion portal entry"
~~~

Expected: focused test, lint, type-check, and build pass.

### Task 6: Run the system verification and document activation

**Files:**
- Modify: infrastructure/open-data-fusion/README.md
- Modify: docs/superpowers/plans/2026-07-13-open-data-fusion-phase-1.md
- Test: backend, adapter, frontend, Compose, optional ODF readiness

- [ ] **Step 1: Verify disabled-safe defaults**

~~~powershell
rg -n '"CaptureEnabled"\s*:\s*false' backend/appsettings.json
rg -n '"DispatchEnabled"\s*:\s*false' fusion-adapter/appsettings.json
~~~

Expected: one matching default in each file.

- [ ] **Step 2: Run every non-container check**

~~~powershell
dotnet test backend.Tests/backend.Tests.csproj
dotnet test fusion-adapter.Tests/Fusion.Adapter.Tests.csproj
dotnet build backend/backend.csproj --no-restore
dotnet build fusion-adapter/Fusion.Adapter.csproj --no-restore
Push-Location frontend
npm run test:run
npm run lint
npm run type-check
npm run build
Pop-Location
~~~

Expected: every command exits 0.

- [ ] **Step 3: Validate Compose and, if resources permit, execute readiness smoke**

~~~powershell
Push-Location third_party/open-data-fusion
docker compose --env-file ../../infrastructure/open-data-fusion/.env.example --profile application-preview config --quiet
docker compose --env-file ../../infrastructure/open-data-fusion/.env.example --profile application-preview up -d
Invoke-WebRequest http://127.0.0.1:54310/ready
docker compose --env-file ../../infrastructure/open-data-fusion/.env.example --profile application-preview down
Pop-Location
~~~

Expected: config validation exits 0 and readiness returns HTTP 200. If Docker daemon, image retrieval, or host resources prevent startup, retain config validation evidence and report that environmental restriction without changing application code.

- [ ] **Step 4: Add activation and rollback instructions**

Append this activation sequence to infrastructure/open-data-fusion/README.md:

~~~powershell
$env:OpenDataFusion__CaptureEnabled = 'true'
$env:ConnectionStrings__MkzOperations = $env:MKZ_OPERATIONS_CONNECTION
$env:OpenDataFusion__DispatchEnabled = 'true'
$env:OpenDataFusion__TenantId = $env:ODF_TENANT_ID
$env:OpenDataFusion__ProjectId = $env:ODF_PROJECT_ID
dotnet run --project fusion-adapter/Fusion.Adapter.csproj
~~~

Append rollback: set CaptureEnabled=false, stop the adapter, and retain pending fusion_outbox rows. ODF downtime cannot change PLC/MQTT behavior because neither ClientPLC nor MqttServerService calls ODF.

- [ ] **Step 5: Review final diff and commit the plan/runbook**

~~~powershell
git diff --check
git status --short
git add infrastructure/open-data-fusion/README.md
git commit -m "docs: finalize ODF activation runbook"
~~~

Expected: no whitespace errors and a clean worktree.
