# TimescaleDB dual-write and resumable backfill

## Scope

Deliver Sprint A1 only: a Docker Timescale target, a one-day telemetry
hypertable, source-to-target dual-write, and a resumable backfill. PostgreSQL
remains the source of truth and all current API reads remain unchanged.

## Contract

- Source: `machine_telemetry(id, machine_id, sequence, created_at, raw_json)`.
- Target: `telemetry_points(occurred_at, source_id, machine_id, sequence, raw_json)`.
- Identity: `(occurred_at, source_id)` is the hypertable primary key. It
  includes the time partition key and `source_id` makes a replay idempotent.
- Canonical time: dual-write uses `created_at` returned by the primary insert;
  backfill reads that same persisted value. This prevents timezone conversion
  from producing a second target row for one source id.
- Progress: `telemetry_backfill_progress` stores the committed source-id
  watermark for `machine_telemetry`.

## Execution

1. Start the isolated target with
   `docker compose -p mkz-timescale -f infrastructure/timescaledb/docker-compose.yml up -d`.
2. Set `Timescale__Enabled=true` for the backend to begin shadow dual-write.
3. Run `dotnet run --project backend/backend.csproj -- --timescale-backfill`.
4. Re-run until it prints `copied 0 source rows` and reconcile counts before
   considering a separate read-cutover decision.

## Verification completed locally

- TimescaleDB extension 2.28.3 created `telemetry_points` as a one-day
  hypertable.
- Historical source data backfilled with a persisted watermark.
- Sync upload and approved MQTT telemetry each wrote the same `source_id` to
  PostgreSQL and TimescaleDB.
- A subsequent backfill advanced the watermark without creating duplicate
  source ids; its following run copied zero rows.

## Explicitly deferred

- Read-path cutover and deprecation of PostgreSQL telemetry reads.
- Continuous aggregates, compression, retention, and performance tuning.
- A transactional cross-database outbox/retry pump. In this phase a failed
  target write is recovered by rerunning the idempotent backfill before any
  cutover.


## Follow-up delivered outside A1 plan

- Continuous aggregates, compression/columnstore, and retention SQL live in infrastructure/timescaledb/002_a2_rollups_and_lifecycle.sql and runtime ensure logic in TimescaleTelemetryService.
- Evidence pack: docs/phase1/timescale-evidence.md (rollback/reconcile/benchmark waiver notes).
