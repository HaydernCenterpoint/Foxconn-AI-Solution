---
tags: [actions, next]
priority: P0
updated: 2026-08-13
---

# Next Actions

## P0 — Unblock runtime
- [ ] Start Docker Desktop
- [ ] Export approved secrets/identity from secret manager
- [ ] Confirm machine identity exists in retained Operations DB

### Required env
```powershell
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
```

## P0 — Prove local no-fixture path
```powershell
.\infrastructure\demo\Start-FullDemo.ps1
.\infrastructure\demo\Test-FullDemo.ps1
$env:FII_LIVE_E2E='1'
$env:FII_LIVE_FRONTEND_URL='http://localhost:3001'
npm --prefix frontend run e2e:live
```

Success criteria:
- [ ] MQTT telemetry accepted
- [ ] Timescale dual-write unique source_id
- [ ] At least one open alert exists
- [ ] Operator can acknowledge alert
- [ ] Asset health returns score/history
- [ ] Browser live e2e passes without API fixtures

## P0 — Local W8 (when Docker/secrets exist)
[[40 Runbooks/Local W8 Integration]] already passed once on a disposable stack. Re-run only to prove *this* machine.

## P1 — Managed staging
Use [[40 Runbooks/Operator Package]]
- [ ] HTTPS ingress + trusted proxy
- [ ] Secret manager delivery
- [ ] MQTT TLS / device auth
- [ ] DB TLS + backup/restore/retention
- [ ] Dual-write validation + rollback
- [ ] One real ERP path
- [ ] 16-check attestation + independent reviewer
- [ ] Run managed gate script

## P2 — Release decision
- [ ] Keep NO-GO until gate passes
- [ ] Canary only after managed gate + rollback owner