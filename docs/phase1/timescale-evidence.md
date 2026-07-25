# Timescale Phase 1 evidence

Date: 2026-07-22
Scope: MVP Phase 1 (B1-B6). Production read cutover is still deferred.

## B1 — Migrations present

| Artifact | Purpose |
| --- | --- |
| `infrastructure/timescaledb/001_create_telemetry_points.sql` | raw hypertable + backfill progress |
| `infrastructure/timescaledb/002_a2_rollups_and_lifecycle.sql` | hourly/daily CAGG, columnstore, retention |
| `backend/Services/TimescaleTelemetryService.cs` | runtime ensure schema + dual-write + proof reads |
| `backend/Services/TimescaleBackfillRunner.cs` | resumable idempotent backfill |

Default lifecycle (config `Timescale` section, default off):

- raw retention: 30 days
- aggregate retention: 365 days
- columnstore after: 7 days
- aggregate refresh window: 29 days

## B4 — Proof endpoints

When `Timescale:Enabled=true`:

- `GET /api/telemetry/timescale/{machineId}`
- `GET /api/telemetry/timescale/{machineId}/hourly`
- also under `/api/v1/telemetry/...`

When disabled: endpoints return 503 problem details; PostgreSQL path unchanged.

## B5 — Rollback drill

1. Start with dual-write on (demo launcher sets `Timescale__Enabled=true` unless `-SkipTimescale`).
2. Confirm proof endpoints return data after MQTT accept (see `infrastructure/demo/Test-FullDemo.ps1`).
3. Set `Timescale__Enabled=false` (or restart without the flag).
4. Confirm:
   - MQTT/telemetry accept still works via PostgreSQL
   - proof endpoints return 503
   - no code path rolls back primary insert on Timescale failure (`TryWriteAsync` logs and continues)

Rollback owner: backend operator. Flag is process env / appsettings only.

## B3 — Reconcile checklist

Run on Timescale target after backfill:

```sql
SELECT count(*) AS target_count FROM telemetry_points;
SELECT last_source_id FROM telemetry_backfill_progress WHERE stream = 'machine_telemetry';
SELECT source_id, count(*) FROM telemetry_points GROUP BY source_id HAVING count(*) > 1;
```

On PostgreSQL source:

```sql
SELECT count(*) AS source_count FROM machine_telemetry;
SELECT max(id) AS max_source_id FROM machine_telemetry;
```

Pass criteria before any future read cutover discussion:

- no duplicate `source_id` on target
- watermark >= max source id that should be copied
- source/target counts explained (windowed retention may drop old raw)

## B2 — Benchmark queries (targets)

Run against staging dataset; record p95. Target <500ms or waiver with owner.

1. 24h / 1 machine raw points
2. 7 day / line (join machines on line) raw or rollup
3. hourly rollup multi-machine last 48h

Template:

```sql
-- 1) 24h one machine
SELECT occurred_at, source_id, sequence
FROM telemetry_points
WHERE machine_id = $1 AND occurred_at >= now() - interval '24 hours'
ORDER BY occurred_at DESC
LIMIT 1000;

-- 3) hourly multi-machine
SELECT bucket, machine_id, point_count
FROM telemetry_points_hourly
WHERE bucket >= now() - interval '48 hours'
ORDER BY bucket DESC
LIMIT 500;
```

### Local status 2026-07-22

- Code + SQL + proof endpoints verified in repository.
- Contract/unit tests for backend green (`ContractV1` + `AssetCatalog`).
- Full timed benchmark against live Timescale not re-run in this session (Docker daemon unavailable). Treat as **waiver until next staging run**; owner: Data lane. Do not enable production read cutover.

## B6 — Read flag decision

Keep a single `Timescale:Enabled` write/proof flag for MVP.

- Read cutover is NOT this flag.
- Production reads remain PostgreSQL.
- Future: add explicit `Timescale:ReadEnabled` only when B2/B3 pass on managed staging.

ADR: deferred read cutover; dual-write is shadow only.
