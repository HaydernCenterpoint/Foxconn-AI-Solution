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
uvicorn api.connector_api:app --port 8084 --reload
```

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

### Connectors

- **ERP Connector** - Syncs production orders, material consumption from ERP
- **MES Connector** - Syncs work orders, quality data from MES
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
