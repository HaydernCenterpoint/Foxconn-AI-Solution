# CEP Service

Complex Event Processing service for MKZ Factory Monitor.

## Architecture

- **CEP Engine**: Python-based pattern detection (Drools-style rules)
- **Event Schema**: Pydantic models (JSON/Avro ready)
- **Telemetry**: Mock stream generator + TimescaleDB integration ready
- **ML**: Anomaly detection (Isolation Forest) + failure prediction

## Services

- `api/` — FastAPI routes
- `schemas/` — Pydantic event/telemetry models
- `rules/` — CEP rule definitions and engine
- `ml/` — ML models (anomaly detection, failure prediction)
- `services/` — Backend/Redis/Postgres clients

## Quick Start

```bash
cd cep-service
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8084
```

## Environment

```env
BACKEND_URL=http://host.docker.internal:5000
REDIS_URL=redis://localhost:6379
POSTGRES_URL=postgresql://factory:factory@localhost:5432/factory
JWT_SECRET=factory-jwt-secret-key-1234-long-enough-32bytes
CEP_MODE=mock  # 'mock' | 'live'
```
