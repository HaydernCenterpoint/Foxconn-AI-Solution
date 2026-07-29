# CEP Service

Complex Event Processing service for MKZ Factory Monitor.

## Architecture

- **CEP Engine**: Python-based pattern detection (Drools-style rules)
- **Event Schema**: Pydantic models (JSON/Avro ready)
- **Telemetry**: Mock stream generator + TimescaleDB integration ready
- **ML**: Development baseline using synthetic-trained Isolation Forest +
  failure prediction; real production training/validation is still required
- **RCA**: In-memory event-correlation graph with backward tracing and
  recommended actions; no LLM explanation layer yet

## Services

- `api/` — FastAPI routes
- `schemas/` — Pydantic event/telemetry models
- `rules/` — CEP rule definitions and engine
- `ml/` — ML models (anomaly detection, failure prediction)
- `services/` — Backend/Redis/Postgres clients

## Baseline boundaries

- Feature engineering uses distinct rolling 1-hour and 24-hour windows.
- Isolation Forest scoring maps the model decision boundary to a bounded
  0–1 score without per-request min/max fitting.
- The bundled model is deterministic development/demo evidence only. It is
  not a substitute for three months of factory telemetry, labelled failures,
  drift monitoring, or production precision/recall validation.
- `POST /api/v1/rca` performs basic correlation over events retained by the
  running CEP process. The browser reaches this route through the authenticated
  ASP.NET backend facade rather than calling CEP directly.

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
JWT_SECRET=<inject-from-secret-manager>
CEP_MODE=mock  # 'mock' | 'live'
```
