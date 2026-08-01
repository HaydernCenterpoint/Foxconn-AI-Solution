---
tags: [evidence, blocker]
source: docs/release-evidence/2026-07-31-local-nofixture-blocker.md
updated: 2026-07-31
---

# Local No-Fixture Blocker

> [!info] Source of truth
> Repo path: `docs/release-evidence/2026-07-31-local-nofixture-blocker.md`

# Local full-stack no-fixture verification evidence

Date: 2026-07-31 21:13:16 +07:00
Branch: `dev` @ `6d34850`
Operator: ultragoal G001

## Commands executed

```powershell
powershell -NoProfile -File .\infrastructure\demo\Start-FullDemo.ps1
powershell -NoProfile -File .\infrastructure\demo\Test-FullDemo.ps1
npm --prefix frontend run e2e:live
docker version
docker ps
```

## Results

| Check | Result | Evidence |
| --- | --- | --- |
| `Start-FullDemo.ps1` | Blocked before launch | Throws `Set FII_OPERATIONS_CONNECTION_STRING to the retained PostgreSQL database.` |
| `Test-FullDemo.ps1` | Blocked before probes | Throws `Supply real credentials with -Username/-Password or FII_DEMO_USERNAME/FII_DEMO_PASSWORD.` |
| `npm --prefix frontend run e2e:live` | Skipped intentionally | Playwright reports `1 skipped` because `FII_LIVE_E2E=1` plus `FII_DEMO_USERNAME` / `FII_DEMO_PASSWORD` are unset. |
| Docker Desktop / daemon | Unavailable | `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine` |

## Required process environment inventory

All of the following were absent from Process/User/Machine environment at verification time:

- `FII_OPERATIONS_CONNECTION_STRING`
- `FII_TIMESCALE_PASSWORD`
- `FII_TIMESCALE_CONNECTION_STRING`
- `FII_JWT_SECRET`
- `FII_MQTT_ENCRYPTION_KEY`
- `FII_DEMO_USERNAME`
- `FII_DEMO_PASSWORD`
- `FII_DEMO_MACHINE_ID`
- `FII_DEMO_MACHINE_CLIENT_ID`
- `FII_MQTT_DEVICE_TOKEN`
- `FII_LIVE_E2E`
- `FII_LIVE_FRONTEND_URL`

## Exact unblocking inputs

1. Start Docker Desktop so Timescale/CEP compose services can run.
2. Export retained Operations PostgreSQL connection string as `FII_OPERATIONS_CONNECTION_STRING`.
3. Export Timescale password/connection as `FII_TIMESCALE_PASSWORD` and `FII_TIMESCALE_CONNECTION_STRING`.
4. Export shared JWT and MQTT secrets (`FII_JWT_SECRET`, `FII_MQTT_ENCRYPTION_KEY`) from the secret manager, not git.
5. Export an approved machine identity: `FII_DEMO_MACHINE_ID`, `FII_DEMO_MACHINE_CLIENT_ID`, `FII_MQTT_DEVICE_TOKEN`.
6. Export demo operator credentials: `FII_DEMO_USERNAME`, `FII_DEMO_PASSWORD`.
7. Re-run:

```powershell
.\infrastructure\demo\Start-FullDemo.ps1
.\infrastructure\demo\Test-FullDemo.ps1
$env:FII_LIVE_E2E='1'
$env:FII_LIVE_FRONTEND_URL='http://localhost:3001'
npm --prefix frontend run e2e:live
```

## Claim boundary

This package proves the no-fixture harness refuses missing credentials and missing Docker correctly. It does **not** prove a live MQTT -> Timescale -> alert -> UI happy path. Release state remains **staging candidate**.