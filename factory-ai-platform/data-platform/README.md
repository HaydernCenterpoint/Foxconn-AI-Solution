# Data Platform Documentation

## Overview

The Data Platform provides time-series data storage and data integration
services for the MKZ Factory Monitor Industrial IoT Platform.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Data Platform                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │    ERP   │  │    MES   │  │  File    │  │  PLC     │ │
│  │Connector │  │Connector │  │ Watcher  │  │  Data    │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘ │
│       │             │             │             │         │
│       └─────────────┴─────────────┴─────────────┘         │
│                         │                                  │
│                    ┌────▼────┐                            │
│                    │DualWrite│                            │
│                    │Middleware│                            │
│                    └────┬────┘                            │
│                         │                                  │
│       ┌────────────────┼────────────────┐                │
│       ▼                ▼                ▼                │
│  ┌─────────┐     ┌───────────┐    ┌──────────┐           │
│  │PostgreSQL│    │TimescaleDB│    │ Dead    │           │
│  │(Legacy) │    │(New)      │    │ Letter  │           │
│  └─────────┘    └───────────┘    └──────────┘           │
│       │                │                                  │
│       └────────────────┴───────────────────────────────── │
│                         │                                  │
│                    ┌────▼────┐                            │
│                    │  API    │                            │
│                    │ Service │                            │
│                    └─────────┘                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Start TimescaleDB

```bash
cd data-platform
docker-compose up -d timescaledb
```

### 2. Run Migrations

```bash
# Apply migrations
psql -h localhost -U factory_user -d factory_db -f migrations/001_timescale_setup.sql
psql -h localhost -U factory_user -d factory_db -f ../../infrastructure/connectors/001_connector_schema.sql
psql -h localhost -U factory_user -d factory_db -f migrations/002_migrate_from_postgresql.sql
```

### 3. Start Connectors

```bash
# Start ERP connector
python -m connectors.erp.connector --daemon

# Start file watcher
python -m connectors.file_watcher.connector --daemon
```

### 4. Start API

```bash
export CONNECTOR_API_KEY="<secret-manager-value>"
uvicorn api.connector_api:app --port 8084 --reload
```

All endpoints except `/health`, `/docs`, `/redoc`, and `/openapi.json` require
the `X-Connector-API-Key` header. In production, inject `CONNECTOR_API_KEY`
through the deployment secret manager and set `CONNECTOR_CORS_ORIGINS` to the
explicit trusted origins, if browser access is required.

## Components

### Migrations

SQL scripts for setting up TimescaleDB schema:
- `001_timescale_setup.sql` - Enable TimescaleDB, create hypertable
- `002_migrate_from_postgresql.sql` - Migrate existing data

### Dual-Write Middleware

Python module for writing to both PostgreSQL and TimescaleDB:
```python
from dualwrite import write_telemetry, write_event

write_telemetry(
    time=datetime.now(),
    asset_id=uuid,
    metric='temperature',
    value=45.5
)
```

Set `DUAL_WRITE_MODE` to `migration` (Timescale only), `full` (Timescale plus
legacy PostgreSQL), or `rollback` (legacy PostgreSQL telemetry only). The
Compose stack defaults to `migration`; rollback requires secret-managed
`LEGACY_POSTGRES_*` settings. Event connectors fail closed in rollback because
there is no legacy event sink. See `docs/rollback_plan.md`.

### Connectors

- **ERP Connector** - Syncs production orders, material consumption from ERP
- **MES Connector** - Optional (`docker compose --profile mes ...`); syncs work orders and quality data when explicitly enabled
- **File Watcher** - Imports CSV/Excel reports from network folders

### API

REST API for:
- Connector management (start/stop/sync)
- Telemetry queries
- Event queries
- Asset listing

## API Endpoints

### Connectors

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /connectors | List all connectors |
| GET | /connectors/{name} | Get connector status |
| POST | /connectors/{name}/start | Start connector |
| POST | /connectors/{name}/stop | Stop connector |
| POST | /connectors/{name}/sync | Trigger sync |

### Telemetry

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/telemetry/query | Query telemetry data |
| GET | /api/v1/assets | List assets |
| GET | /api/v1/stats/summary | Get summary statistics |

### Events

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/events/query | Query events |

## Telemetry benchmarks

Run the credential-free local Timescale query-path gate against the existing
`factory-timescaledb` container:

```powershell
powershell -File ../../infrastructure/test-timescale-workload.ps1
```

The default workload inserts 1,008,500 synthetic points covering seven days
for 50 machines and 10 metrics, runs a 32-client hourly-aggregate workload,
writes `docs/benchmark_telemetry_local.json`, and removes its synthetic rows.
It exits non-zero unless p95 is below 500 ms, throughput exceeds 100
queries/second, and no transaction fails.

To measure the live HTTP API as a separate boundary, start the API with its
normal `POSTGRES_*` and `CONNECTOR_API_KEY` environment variables, then run:

```bash
python scripts/benchmark_telemetry.py \
  --output docs/benchmark_telemetry_api_local.json
```

The API harness reads its key only from `CONNECTOR_API_KEY`, never accepts it
as a command-line argument, and also removes its synthetic rows by default.

Profile the three representative rollup query paths with raw
`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` evidence:

```powershell
powershell -File ../../infrastructure/profile-timescale-queries.ps1
```

The profiler creates a disposable database, applies the production migration,
seeds 1,008,000 synthetic points, refreshes the rollups, verifies exact result
parity, writes `docs/profile_telemetry_queries_local.{json,md}`, and drops the
database in `finally`. The API uses hourly/daily rollups only when no
`start_time` or `end_time` is supplied; bounded queries stay on raw rows so
partial-bucket behavior is unchanged.

Immediately after a historical backfill, while all source rows still exist,
run the one-time full refresh below before read cutover:

```sql
CALL refresh_continuous_aggregate(
  'telemetry_hourly', NULL, NOW() - INTERVAL '1 hour'
);
CALL refresh_continuous_aggregate(
  'telemetry_daily', NULL, NOW() - INTERVAL '1 day'
);
```

Do not put that open-ended refresh in a replayable migration after raw
retention has started: TimescaleDB can otherwise remove older retained rollup
rows whose raw source chunks are already gone. The profiler includes a replay
regression for this case.

## Configuration

Configuration is managed via `config.yaml`:

```yaml
postgres:
  host: "localhost"
  port: 5432
  database: "factory_db"

erp:
  api_url: "http://localhost:8080/api/erp"
  sync_interval: 300

file_watcher:
  watch_dirs: ["./incoming"]
  poll_interval: 30
```

## Troubleshooting

### Common Issues

1. **TimescaleDB connection refused**
   ```bash
   # Check if container is running
   docker-compose ps timescaledb
   
   # Check logs
   docker-compose logs timescaledb
   ```

2. **Connector not syncing**
   ```bash
   # Check connector logs
   cat erp_connector.log
   
   # Check state file
   cat .erp_connector_state.json
   ```

3. **Query slow after migration**
   ```sql
   -- Check if hypertable is set up
   SELECT * FROM timescaledb_information.hypertables;
   
   -- Check for missing indexes
   SELECT * FROM pg_indexes WHERE tablename = 'telemetry';
   ```

## Support

For issues, contact the Data Platform team or check:
- Logs: `*.log` files in the data-platform directory
- State files: `.*_state.json` files
- Dead letter queue: `dlq/` directory
