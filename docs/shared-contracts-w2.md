# Shared Contracts freeze (W2 checkpoint)

Status: **asset catalog + telemetry identity frozen for W1–2**. CEP event production schema still open.

## asset_id

| Rule | Value |
|------|--------|
| Type | UUID |
| MACHINE | `assets.id` = `machines.id` |
| LINE | `assets.id` = `production_lines.id` |
| Root plant code | `MKZ-PLANT` |
| Line code | `line:{uuid}` |
| Machine code | `machine:{uuid}` |
| Catalog-owned types | `PLANT`, `AREA`, `SENSOR` (CRUD via `/api/assets`) |
| Ops-owned types | `LINE`, `MACHINE` (via existing ops APIs + DB sync triggers) |

Source of truth: `fusion-contracts/AssetCatalogContract.cs`.

API returns `type` **UPPERCASE**; DB stores **lowercase** (`plant`, `machine`, …).

## telemetry

- Identity for live/ops telemetry remains `Machine.Id` as `asset_id`.
- Logical shape: `(time, asset_id, metric, value)` — no new telemetry table in this slice.
- MQTT path unchanged; Fusion outbox remains off the hot path.

## event (CEP)

- Target shape: `(event_id, timestamp, asset_id, type, severity, payload)`.
- Not production-frozen this week; Agent B owns freeze before CEP pilot.

## API convention

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/assets`, `/api/assets/{id}` | AllowAnonymous |
| POST/PUT/DELETE | `/api/assets` | JWT `ADMIN` or `ENGINEER` |

Writes only for catalog-owned types. Delete blocked for root plant and assets with children.

## Verification

```powershell
dotnet test backend.Tests/backend.Tests.csproj --filter FullyQualifiedName~AssetCatalogContractTests
dotnet test backend.Tests/backend.Tests.csproj
# with stack up:
.\infrastructure\demo\Test-FullDemo.ps1
```

Smoke covers: MACHINE UUID match, search `q=FII-SMOKE-01&type=MACHINE`, SENSOR create/search/update/delete.
