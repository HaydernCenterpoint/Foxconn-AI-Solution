# TimescaleDB Cutover Checklist

## Pre-Cutover Verification

### Infrastructure
- [ ] Docker Compose running on port 55433 (`docker compose -f infrastructure/timescaledb/docker-compose.yml up -d`)
- [ ] TimescaleDB extension enabled (`SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'`)
- [ ] `POSTGRES_PASSWORD` is supplied from a local secret store or protected environment (the compose file has no fallback password)
- [ ] Backend receives `ConnectionStrings__Timescale` through protected environment configuration; the required database, host, port, and password are verified
- [ ] Backend startup configuration includes non-empty `ConnectionStrings__DefaultConnection`, `Jwt__Key` (at least 32 bytes), and `Mqtt__EncryptionKey`
- [ ] Benchmark operator has an isolated staging database; `benchmark.sql` intentionally seeds tagged fixtures

### Schema Migrations
- [ ] Confirm the target is the managed Timescale database, not the Operations database
- [ ] `001_create_telemetry_points.sql` applied — hypertable `telemetry_points` exists
- [ ] `002_a2_rollups_and_lifecycle.sql` applied — continuous aggregates + compression + retention
- [ ] `003_phase2_cep_alerts.sql` applied — `events`, `alerts`, `alert_history` tables
- [ ] `004_phase2_health_predictions.sql` applied — `asset_metrics`, `asset_predictions`, `ml_models`
- [ ] Capture managed Timescale evidence for `003` and `004`; an Operations `public.schema_migrations` head or local Compose result does not verify them

`backend/db/migrations/*.sql` owns only Operations objects. The backend
Operations migration runner must not apply or record Timescale `003`/`004`;
those files are a separate authority applied and verified directly on managed
Timescale.

### Verify Hypertables
```sql
SELECT hypertable_name, num_chunks
FROM timescaledb_information.hypertables
ORDER BY hypertable_name;
```
Expected: `telemetry_points`, `events`, `alerts`, `asset_metrics`, `asset_features`, `asset_predictions`

### Verify Continuous Aggregates
```sql
SELECT view_name FROM timescaledb_information.continuous_aggregates;
```
Expected: `telemetry_points_hourly`, `telemetry_points_daily`, `asset_uptime_24h`, `asset_alert_frequency_7d`

### Verify Retention Policies
```sql
SELECT hypertable_name, schedule_interval, config
FROM timescaledb_information.jobs
WHERE proc_name = 'policy_retention';
```
Expected: `telemetry_points` (30d), `events` (90d), `alerts` (365d), `asset_metrics` (90d), `asset_features` (30d), `asset_predictions` (90d)

### Verify Columnstore Policy
```sql
SELECT hypertable_name, schedule_interval, config
FROM timescaledb_information.jobs
WHERE proc_name = 'policy_compression'
   OR proc_name = 'policy_columnstore';
```
Expected: `telemetry_points` is converted to columnstore after 7 days. The exact job name depends on the installed TimescaleDB version.

## Benchmark
- [ ] Run `benchmark.sql` against the isolated Timescale staging database (it creates tagged fixture rows; the throughput inserts are rolled back)
  ```bash
  psql -v ON_ERROR_STOP=1 -h localhost -p 55433 -U postgres -d plc_timescale -f infrastructure/timescaledb/benchmark.sql
  ```
- [ ] Capture the `EXPLAIN (ANALYZE, BUFFERS)` output and database version with the cutover evidence
- [ ] Confirm the benchmark exits successfully; a missing Timescale catalog, migration, or unsupported SQL construct must block cutover
- [ ] Verify all queries execute under target latency:
  - Single-asset telemetry lookup: < 10ms
  - Hourly aggregation (continuous aggregate): < 5ms
  - Open alerts by severity: < 10ms
  - Health score computation: < 50ms
  - Bulk 10K insert: < 500ms

## Backend Integration
- [ ] The backend process receives `Timescale__Enabled=true` through protected environment configuration
- [ ] Run `TimescaleBackfillRunner` explicitly with `dotnet run --project backend/backend.csproj -- --timescale-backfill`
- [ ] Telemetry points flowing from PLC Client → Backend → TimescaleDB
- [ ] AlertController reads/writes to TimescaleDB alerts table
- [ ] AssetHealthController computes scores from TimescaleDB
- [ ] PredictionController writes predictions to TimescaleDB

## Monitoring
- [ ] TimescaleDB chunk count not exceeding expected (daily partitions)
- [ ] Continuous aggregates refreshing on schedule (check `timescaledb_information.jobs`)
- [ ] Compression running on telemetry chunks older than 7 days
- [ ] Retention dropping data older than configured intervals

## Rollback Plan
1. Set `Timescale.Enabled: false` in `appsettings.json`
2. Backend falls back to PostgreSQL-only mode
3. TimescaleDB container remains running but idle; restart the backend after changing the environment setting
4. No data loss — telemetry continues to PostgreSQL primary

## Post-Cutover
- [ ] Monitor error rates for 24h
- [ ] Verify continuous aggregate materialization
- [ ] Check disk usage growth rate
- [ ] Update `docs/phase2-progress.md` with TimescaleDB status
