# TimescaleDB telemetry migration

This stack is an isolated TimescaleDB target for the durable raw stream
`machine_telemetry`. PostgreSQL remains the operational source of truth; the
backend dual-writes only after the primary transaction commits.

## Local target

```powershell
docker compose -p mkz-timescale -f infrastructure/timescaledb/docker-compose.yml up -d
```

The target listens on `localhost:55433`. The service creates the schema
idempotently on its first write. `001_create_telemetry_points.sql` creates the
raw hypertable, and `002_a2_rollups_and_lifecycle.sql` is the immutable A2
operator migration for rollups and lifecycle policies.

## Enable dual-write

Keep `Timescale:Enabled` false until the target is healthy. Enable it through
environment configuration for the backend process:

```powershell
$env:Timescale__Enabled = 'true'
$env:ConnectionStrings__Timescale = 'Host=<host>;Port=<port>;Database=<database>;Username=<user>;Password=<password>'
dotnet run --project backend/backend.csproj
```

Each source insert commits to PostgreSQL first. The target then receives the
same source id and the canonical `created_at` returned by PostgreSQL. A target
failure is logged without rolling back the source write; re-run backfill before
any future read cutover.

## Backfill and validate

```powershell
$env:Timescale__Enabled = 'true'
dotnet run --project backend/backend.csproj -- --timescale-backfill
```

The job advances `telemetry_backfill_progress.last_source_id` only after a
target batch commits. It is safe to re-run: `ON CONFLICT (occurred_at,
source_id) DO NOTHING` makes prior writes idempotent. A completed re-run prints
`copied 0 source rows`.

## A2 rollups and lifecycle

The target creates hourly and daily continuous aggregates containing safe raw
stream facts (`point_count`, first sequence, and last sequence) per machine.
It enables real-time aggregate reads so a fresh staged telemetry write can be
observed before the scheduled refresh job runs.

Default lifecycle settings are configurable under `Timescale`:

- raw points: 30 days;
- hourly/daily rollups: 365 days;
- columnstore conversion: after 7 days, segmented by `machine_id` and ordered
  by newest `occurred_at`;
- aggregate refresh window: 29 days, kept inside raw retention so dropping raw
  chunks does not erase historic rollups.

The backend exposes staged proof endpoints when `Timescale:Enabled=true`:

```text
GET /api/telemetry/timescale/{machineId}
GET /api/telemetry/timescale/{machineId}/hourly
```

The full integration gate starts this stack and checks both endpoints after an
MQTT message is accepted.

Before a future read cutover, reconcile source count, target count, and the
watermark, then investigate any duplicate source ids:

```sql
SELECT count(*) FROM telemetry_points;
SELECT last_source_id FROM telemetry_backfill_progress
WHERE stream = 'machine_telemetry';
SELECT source_id, count(*)
FROM telemetry_points
GROUP BY source_id
HAVING count(*) > 1;
```

## Rollback boundary

Set `Timescale:Enabled=false` to stop target writes. The PostgreSQL source
remains authoritative throughout this phase; the staged proof endpoints are
not a production read cutover.
