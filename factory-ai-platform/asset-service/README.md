# Asset Service — Sprint C1-C4 Complete

> **Published:** 2026-07-09
> **Service:** `asset-service` — FastAPI, port **8084**
> **Swagger:** `http://localhost:8084/docs`
> **Contract:** `asset_id` (UUID) is the canonical identifier across ALL services.

---

## 🚨 CRITICAL: Schema Contract for Agents A/B/D

### `asset_id` — THE BLOCKING CONTRACT

Every telemetry point and event **MUST** reference an `asset_id` (UUID) from this schema. This is the single most important piece of information on this page.

```
asset_id: UUID — Primary key, auto-generated UUID v4
Format: 550e8400-e29b-41d4-a716-446655440000
```

All agents **MUST** use this `asset_id` when:
- Writing telemetry data `(time, asset_id, metric, value)`
- Creating events `(event_id, timestamp, asset_id, type, severity, payload)`
- Linking documents to assets
- Computing health scores

### Telemetry Schema (Agent B will use)

```sql
CREATE TABLE telemetry (
    time        TIMESTAMPTZ NOT NULL,
    asset_id    UUID        NOT NULL REFERENCES assets(id),  -- ← KEY
    metric      VARCHAR(100) NOT NULL,
    value       DOUBLE PRECISION,
    PRIMARY KEY (time, asset_id, metric)
);
```

### Event Schema (Agent B defines, uses asset_id)

```json
{
  "event_id": "uuid",
  "timestamp": "2026-07-09T12:00:00Z",
  "asset_id": "550e8400-e29b-41d4-a716-446655440000",  // ← FROM THIS SCHEMA
  "type": "alarm",
  "severity": "critical",
  "payload": {}
}
```

---

## Asset Hierarchy

The seed catalog is production-like demo data for integration and UI testing; it is not a verified inventory of real MKZ equipment.
The shared business service enforces `Plant → Line → Machine → Sensor`, so
HTTP creation and Excel imports cannot bypass parent existence/type checks.

```
MKZ Factory (plant)
├── LS18 — Assembly Line 18 (line)
│   ├── Press-001 (machine)     [Schuler SMP-2500]
│   ├── Press-002 (machine)     [Schuler SMP-2500]
│   ├── Conveyor-001 (machine)  [Bosch Rexroth TS-5]
│   ├── Robot-Weld-001 (machine) [KUKA KR-60-3]
│   ├── Robot-Weld-002 (machine) [KUKA KR-60-3]
│   ├── QC-Station-001 (machine) [Carl Zeiss Contura-7]
│   ├── Press-003 (machine)
│   ├── Robot-Weld-003 (machine) [FANUC M-20iD-25]
│   ├── CMM-001 (machine)       [Hexagon Global-S]
│   ├── Packaging-001 (machine)  [Bosch SVE-1412]
│   └── Sensors (12 sensors)
│       ├── Press-001-Temperature
│       ├── Press-001-Vibration
│       ├── Press-001-Pressure
│       ├── Press-001-Power
│       ├── Conveyor-001-Speed
│       ├── Conveyor-001-Load
│       ├── Robot-001-Arc-Current
│       └── ...
├── LS19 — Assembly Line 19 (line)
│   ├── CNC-Mill-001 (machine)  [DMG MORI CMX-50U]
│   ├── CNC-Mill-002 (machine)  [DMG MORI CMX-50U]
│   ├── Lathe-001 (machine)      [Mazak QT-250]
│   ├── Conveyor-002 (machine)   [Bosch Rexroth TS-5]
│   ├── Laser-Cut-001 (machine) [Trumpf TruLaser-3030]
│   ├── EDM-001 (machine)       [Makino U6 H.E.A.T.]
│   ├── Hydraulic-Press-001 (machine) [Beckhoff HP-500T]
│   └── Sensors (6 sensors)
└── LS20 — Painting Line (line)
    ├── Paint-Booth-001 (machine) [Dürr EcoRP-3]
    ├── Oven-Cure-001 (machine)   [Dürr EcoCure]
    ├── Conveyor-003 (machine)    [Interroll MCP-200]
    └── Sensors (8 sensors)

Total: 1 plant + 3 lines + 20 machines + 26 sensors = 50 assets seeded
```

---

## API Reference

### Base URL
```
http://localhost:8084/api/v1
```

### Authentication
All endpoints (except GET health) require JWT Bearer token:

```
Authorization: Bearer <jwt_token>
```

JWT payload structure:
```json
{
  "sub": "user-uuid",
  "role": "Admin | Supervisor | Engineer | Maintenance | Viewer",
  "siteScopes": ["MKZ-HQ"],
  "lineScopes": ["LS18", "LS19"],
  "machineScopes": ["PRESS-001", "RW-001"]
}
```

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/assets` | Optional | List assets (filter by name, type, status, parent_id, tag, manufacturer, external_id) |
| `POST` | `/api/v1/assets` | Write | Create asset |
| `GET` | `/api/v1/assets/{id}` | Optional | Get single asset |
| `PUT` | `/api/v1/assets/{id}` | Write | Update asset |
| `DELETE` | `/api/v1/assets/{id}` | Delete | Delete asset |
| `POST` | `/api/v1/assets/tree` | — | Get asset tree (hierarchical) |
| `GET` | `/api/v1/assets/{id}/children` | — | Get direct children |
| `GET` | `/api/v1/assets/{id}/ancestors` | — | Get full ancestor path |
| `POST` | `/api/v1/assets/relationships` | Write | Create relationship |
| `GET` | `/api/v1/assets/{id}/relationships` | — | List relationships |
| `DELETE` | `/api/v1/assets/relationships/{id}` | Delete | Delete relationship |
| `POST` | `/api/v1/assets/documents/link` | Write | Link document to asset |
| `GET` | `/api/v1/assets/{id}/documents` | — | List asset documents |
| `DELETE` | `/api/v1/assets/{id}/documents/{doc_id}` | Write | Unlink document |
| `GET` | `/api/v1/assets/{id}/health` | Optional | Get health score |
| `GET` | `/api/v1/assets/{id}/health/history` | — | Get health history |
| `POST` | `/api/v1/assets/health/refresh` | Health | Refresh all health scores |
| `GET` | `/api/v1/assets/stats/summary` | — | Asset counts by type |

### Query Parameters for List

```
GET /api/v1/assets?name=press&type=machine&status=active&parent_id=<uuid>&tag=critical&manufacturer=Schuler&external_id=PRESS-001&limit=50&offset=0
```

### Example Requests

```bash
# Create plant
curl -X POST http://localhost:8084/api/v1/assets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"MKZ Factory","type":"plant","manufacturer":"MKZ Corp"}'

# Get asset tree
curl -X POST http://localhost:8084/api/v1/assets/tree \
  -H "Content-Type: application/json" \
  -d '{"root_id":null,"depth":3}'

# Get health score
curl http://localhost:8084/api/v1/assets/{asset_id}/health

# Search by external_id (legacy code)
curl "http://localhost:8084/api/v1/assets?external_id=PRESS-001"
```

### Error Format (RFC 7807)

```json
{
  "type": "https://factory-monitor.example.com/errors/validation",
  "title": "Validation Error",
  "status": 422,
  "detail": "One or more fields failed validation",
  "instance": "/api/v1/assets",
  "extensions": {
    "errors": [
      {"field": "name", "message": "Field required", "type": "missing"}
    ]
  }
}
```

---

## Health Score Formula (Sprint C3)

```
Health Score = uptime_pct × 0.40
             + (100 - alarm_count × 5) × 0.30
             + performance_pct × 0.20
             + maintenance_score × 0.10

Where:
  - uptime_pct         = 24h uptime percentage (from asset_metrics table)
  - alarm_count        = alarms in last 24h (each alarm reduces score by 5 pts)
  - performance_pct    = current vs baseline output (from asset_metrics)
  - maintenance_score  = 100 if not overdue, 0 if overdue (checked via metadata.next_maintenance_date)

All scores are 0-100. Final health_score is 0-100.
```

The health score job runs **every 15 minutes** and saves to `asset_metrics` table.

---

## Asset Types & Metadata Keys

### Plant (`type: "plant"`)
```json
{"capacity": "100,000 units/year", "year_built": 2018, "address": "...", "timezone": "Asia/Ho_Chi_Minh"}
```

### Line (`type: "line"`)
```json
{"cycle_time": "45 seconds", "target_output": "800 units/day", "shift_config": "3-shift", "stations": 12}
```

### Machine (`type: "machine"`)
```json
{"model_number": "SMP-2500", "serial_number": "SCH-2018-001", "power_rating": "2500 kW",
 "spindle_hours": 12450, "next_maintenance_date": "2026-08-15"}
```

### Sensor (`type: "sensor"`)
```json
{"sensor_type": "temperature", "unit": "°C", "min_value": -20, "max_value": 150,
 "accuracy": "±0.5°C", "calibration_interval_days": 180}
```

---

## Setup & Run

### Prerequisites
- PostgreSQL with pgvector (running in docker-compose)
- Python 3.12+

### Install & Run
```bash
cd asset-service
pip install -r requirements.txt

# Run migrations (schema auto-creates via triggers)
psql -h localhost -U factory_user -d factory_db -f migrations/001_asset_schema.sql

# Seed data (50+ assets)
python -m app.scripts.seed_data

# Run API server
python -m app.main

# Or: Run health score job
python -m app.scripts.health_score_job --daemon --interval 15
```

### Docker
```bash
# Via docker-compose (recommended)
cd infrastructure
docker-compose up -d asset-service asset-health-job

# Generate Excel import template
python -m app.scripts.import_assets --generate

# Import from Excel (dry-run first!)
python -m app.scripts.import_assets --file data/assets.xlsx --dry-run
python -m app.scripts.import_assets --file data/assets.xlsx --live
```

### Run Tests
```bash
pip install pytest pytest-asyncio httpx aiosqlite
export DATABASE_URL="sqlite+aiosqlite:///:memory:"
export SYNC_DATABASE_URL="sqlite:///:memory:"
export JWT_SECRET="asset-test-secret-at-least-32-characters"
pytest tests/ -v
```

PowerShell uses the same names via `$env:DATABASE_URL`,
`$env:SYNC_DATABASE_URL`, and `$env:JWT_SECRET`.

---

## Docker-Compose Integration

The `asset-service` and `asset-health-job` are registered in `infrastructure/docker-compose.yml`:

```yaml
asset-service:     # REST API — port 8084
asset-health-job:  # Background job — every 15 minutes
```

---

## File Structure

```
asset-service/
├── app/
│   ├── main.py                  # FastAPI app entry
│   ├── api/routes.py            # REST endpoints
│   ├── auth/jwt_auth.py         # JWT + RBAC (Sprint C4)
│   ├── core/rate_limit.py       # Rate limiting (Sprint C4)
│   ├── db/database.py           # SQLAlchemy async session
│   ├── models/asset.py          # ORM models
│   ├── schemas/asset.py         # Pydantic request/response schemas
│   ├── services/asset_service.py # Business logic
│   └── scripts/
│       ├── seed_data.py        # Seed 50+ MKZ assets
│       ├── import_assets.py     # Excel import/export
│       └── health_score_job.py  # Scheduled health computation
├── migrations/
│   └── 001_asset_schema.sql    # PostgreSQL schema
├── tests/
│   ├── conftest.py
│   ├── test_asset_api.py       # API/auth/hierarchy/RFC 7807 tests
│   ├── test_asset_model.py     # Cross-dialect ORM metadata contract
│   ├── test_import_assets.py   # Excel import hierarchy boundary
│   └── test_seed_data.py       # Catalog count/reference/mutation contracts
├── Dockerfile
├── requirements.txt
└── README.md                   # This file
```

---

## Handoff Schedule

| Deliverable | Status | Available | For Agent |
|------------|--------|-----------|-----------|
| `asset_id` schema + SQL | ✅ **READY** | Day 1 | A, B, D |
| Production-like demo seed data (50 assets) | ✅ **READY** | Day 1 | A, B, D |
| Excel import template | ✅ **READY** | Day 1 | A, B, D |
| Asset CRUD API | ✅ **READY** | Day 1 | D (Asset Browser UI) |
| Health score API | ✅ **READY** | Day 1 | D (Health badges) |
| RBAC + JWT | ✅ **READY** | Day 1 | A, D |
