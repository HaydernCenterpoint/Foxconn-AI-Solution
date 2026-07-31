---
tags: [evidence, alerts]
source: docs/release-evidence/2026-07-31-live-alert-residual-gap.md
updated: 2026-07-31
---

# Live Alert Residual Gap

> [!info] Source of truth
> Repo path: `docs/release-evidence/2026-07-31-live-alert-residual-gap.md`

# Live alert path residual gap

Date: 2026-07-31 21:13:38 +07:00
Branch: `dev` @ `6d34850`
Operator: ultragoal G002
Depends on: `docs/release-evidence/2026-07-31-local-nofixture-blocker.md`

## Target path

MQTT/device telemetry -> backend ingestion -> Timescale `events`/`alerts` ->
`GET /api/v1/alerts` -> operator `POST /api/v1/alerts/{id}/acknowledge` ->
`GET /api/v1/assets/{id}/health` -> UI Alert Center / dashboard.

## Current evidence already available

- Local fixture Playwright path exists: `frontend/e2e/alert-health-happy-path.spec.ts`
- Live no-fixture Playwright path exists but is credential-gated: `frontend/e2e/live-full-stack.spec.ts`
- Demo stack Phase 2 probes exist in `infrastructure/demo/Test-FullDemo.ps1` for:
  - `GET /api/v1/alerts?status=open&limit=5`
  - `GET /api/v1/assets/{machineId}/health`
- Prior local note from 2026-07-30 (`docs/sync-w5-evidence.md`): alert list API shape returned `200` with `count=0`; empty alerts table means acknowledge was not proven on a live open row.

## Why live open-alert proof cannot complete now

| Prerequisite | Status |
| --- | --- |
| Docker daemon for Timescale/CEP | Unavailable |
| Operations DB connection | Missing `FII_OPERATIONS_CONNECTION_STRING` |
| Timescale connection/password | Missing |
| JWT / MQTT secrets | Missing |
| Approved machine identity + device token | Missing |
| Demo operator credentials | Missing |
| Live E2E enable flag | Missing `FII_LIVE_E2E=1` |

No secrets were invented. No open alert row was fabricated.

## Exact residual gap

1. No retained runtime is currently running.
2. No approved machine identity is available to publish MQTT telemetry that can open an alert.
3. No operator session credentials are available for acknowledge/health UI assertions.
4. Therefore the live open-alert -> acknowledge -> health history path remains unproven beyond API/UI fixture coverage.

## Unblock recipe

```powershell
# 1) Start Docker Desktop first
# 2) Export approved secrets/identity (secret manager values only)
$env:FII_OPERATIONS_CONNECTION_STRING='...'
$env:FII_TIMESCALE_PASSWORD='...'
$env:FII_TIMESCALE_CONNECTION_STRING='...'
$env:FII_JWT_SECRET='...'
$env:FII_MQTT_ENCRYPTION_KEY='...'
$env:FII_DEMO_MACHINE_ID='...'
$env:FII_DEMO_MACHINE_CLIENT_ID='...'
$env:FII_MQTT_DEVICE_TOKEN='...'
$env:FII_DEMO_USERNAME='...'
$env:FII_DEMO_PASSWORD='...'

# 3) Launch and prove stack
.\infrastructure\demo\Start-FullDemo.ps1
.\infrastructure\demo\Test-FullDemo.ps1

# 4) If alerts still empty after MQTT smoke, inspect Timescale alerts/events, then run live browser path
$env:FII_LIVE_E2E='1'
$env:FII_LIVE_FRONTEND_URL='http://localhost:3001'
npm --prefix frontend run e2e:live
```

## Claim boundary

G002 is complete only as a residual-gap package. Live open-alert acknowledge remains blocked on external credentials/runtime authority. Release state remains **staging candidate**.