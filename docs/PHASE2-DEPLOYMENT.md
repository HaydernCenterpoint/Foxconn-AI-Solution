# Phase 2 Implementation — DEPLOYMENT GUIDE

**Status:** Core infrastructure complete, ready for integration testing
**Date:** 2026-07-22
**Build Status:** ✅ Success (23 warnings, 0 errors)

---

## What Was Built

### Backend (C# / .NET)
✅ **3 API Controllers** (10 new endpoints)
- AlertController: list, detail, acknowledge, resolve, stats
- AssetHealthController: health score, history, compute
- PredictionController: anomaly detection, failure risk

✅ **4 Services** (1,935 lines)
- AlertService: lifecycle management, deduplication, suppression
- HealthScoringService: 4-factor health formula (uptime/alarms/performance/maintenance)
- PredictiveService: z-score anomaly detection, failure risk prediction
- HealthScoringJob: background service (15-min interval)

### Database (SQL)
✅ **3 Migration Scripts** (520 lines)
- 003_phase2_cep_alerts.sql: events, alerts, history, deduplication, suppression
- 004_phase2_health_predictions.sql: metrics, features, predictions, models, drift monitoring
- 001_connector_schema.sql: connector framework, DLQ, mapping rules

### Frontend (TypeScript / React)
✅ **API Client Updated**
- Real endpoints for alerts, health, predictions
- 9 methods: listAlerts, getHealth, getFailureRisk, acknowledgeAlert, resolveAlert, etc.

### Documentation
✅ **4 Documents** (1,900+ lines)
- phase-2-product-intelligence.md: Original plan
- phase2-progress.md: Detailed checklist
- phase2-implementation-summary.md: Technical summary
- phase2-final-report.md: Executive report

---

## File Changes

### New Files (Phase 2 Only)
**Backend:**
- backend/Services/AlertService.cs
- backend/Services/HealthScoringService.cs
- backend/Services/PredictiveService.cs
- backend/Services/HealthScoringJob.cs
- backend/Controllers/AlertController.cs
- backend/Controllers/AssetHealthController.cs
- backend/Controllers/PredictionController.cs

**Database:**
- infrastructure/timescaledb/003_phase2_cep_alerts.sql
- infrastructure/timescaledb/004_phase2_health_predictions.sql
- infrastructure/connectors/001_connector_schema.sql

**Testing:**
- infrastructure/test-phase2-apis.ps1

**Documentation:**
- docs/phase-2-product-intelligence.md
- docs/phase2-progress.md
- docs/phase2-implementation-summary.md
- docs/phase2-final-report.md

### Modified Files (Phase 2 Changes)
- backend/Program.cs (added 4 service registrations)
- backend/appsettings.json (added TimescaleConnection, HealthScoring config)
- frontend/src/features/dashboard/services/predictiveAlerts.api.ts (real APIs)

### Preserved (Phase 1 - Unchanged)
✅ All Phase 1 functionality intact
✅ No breaking changes
✅ MQTT telemetry ingestion untouched
✅ Asset Browser works
✅ Dashboard functional

---

## Deployment Steps

### 1. Database Setup

**Apply TimescaleDB Migrations:**
```bash
psql -h localhost -p 55433 -U postgres -d plc_timescale -f infrastructure/timescaledb/003_phase2_cep_alerts.sql
psql -h localhost -p 55433 -U postgres -d plc_timescale -f infrastructure/timescaledb/004_phase2_health_predictions.sql
```

**Verify Tables:**
```sql
\c plc_timescale
\dt events
\dt alerts
\dt asset_metrics
\dt asset_predictions
SELECT * FROM timescaledb_information.hypertables;
```

**Apply PostgreSQL Connector Schema:**
```bash
psql -h localhost -p 5432 -U postgres -d plc_monitoring -f infrastructure/connectors/001_connector_schema.sql
```

**Verify:**
```sql
\c plc_monitoring
\dt connector_definitions
\dt connector_state
\dt asset_mapping_rules
```

### 2. Backend Startup

**Build and Run:**
```powershell
cd backend
dotnet restore
dotnet build
dotnet run
```

**Expected Output:**
```
info: backend.Services.HealthScoringJob[0]
      Health Scoring Job started. Interval: 15 minutes
info: Microsoft.Hosting.Lifetime[14]
      Now listening on: http://localhost:5000
```

### 3. API Testing

**Run Test Script:**
```powershell
./infrastructure/test-phase2-apis.ps1
```

**Manual Tests:**
```bash
# Alert Stats
curl http://localhost:5000/api/v1/alerts/stats

# List Alerts
curl http://localhost:5000/api/v1/alerts?limit=10

# Health Score (replace with real asset UUID)
curl http://localhost:5000/api/v1/assets/{asset-uuid}/health

# Failure Risk
curl http://localhost:5000/api/v1/predictions/risk/{asset-uuid}

# Anomaly Detection
curl -X POST http://localhost:5000/api/v1/predictions/anomaly \
  -H "Content-Type: application/json" \
  -d '{"assetId": "{asset-uuid}", "metricType": "temperature"}'

# Basic RCA (requires ADMIN or ENGINEER session/token)
curl -X POST http://localhost:5000/api/v1/rca \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"alertId":"{alert-uuid}"}'
```

The backend resolves the alert's event ID, occurrence time, asset, event type,
rule, severity, and evidence from Timescale. Client-supplied event context is
not trusted.

### 4. Verify Background Jobs

**Watch Logs:**
```powershell
# In backend terminal, watch for:
# "Starting health score computation run..."
# Should appear every 15 minutes
```

### 5. Frontend Integration

**Current Status:**
- ✅ API client updated with real endpoints
- ✅ Predictive Alert, Alert Center evidence/actions, health badges/history wired
- ✅ Basic RCA panel and its alertId-only browser contract covered through the
  authenticated backend facade
- ⏳ Real no-fixture full-stack browser run and managed-staging acceptance

---

## Configuration Reference

Connection strings and signing keys are intentionally absent from tracked
`appsettings*.json` files. Inject them from the deployment secret manager:

```text
ConnectionStrings__DefaultConnection
ConnectionStrings__Timescale
Jwt__Key
Mqtt__EncryptionKey
MqttServer__DeviceTokens__<client-id>
MqttServer__Tls__CertificatePassword
```

For TLS deployments, also set `MqttServer__Tls__CertificatePath` to the
mounted PFX path. Production defaults to the encrypted endpoint and refuses
to start when the certificate is missing. See `docs/security-secrets.md`.

When the API is behind HTTPS ingress, set
`ForwardedHeaders__KnownProxies__0` or
`ForwardedHeaders__KnownNetworks__0` to the exact trusted ingress IP/CIDR.
This must be validated before relying on per-client login rate limiting.

**Registered Services:**
- AlertService (singleton)
- HealthScoringService (singleton)
- PredictiveService (singleton)
- HealthScoringJob (hosted service, 15-min interval)

---

## API Endpoints Summary

### Alerts
- `GET /api/v1/alerts?assetId=&status=&severity=&from=&to=&limit=`
- `GET /api/v1/alerts/{id}`
- `POST /api/v1/alerts/{id}/acknowledge`
- `POST /api/v1/alerts/{id}/resolve`
- `GET /api/v1/alerts/stats`
- `POST /api/v1/rca` (`ADMIN`/`ENGINEER`; bounded proxy to CEP basic correlation)

### Health
- `GET /api/v1/assets/{id}/health`
- `GET /api/v1/assets/{id}/health/history?from=&to=`
- `POST /api/v1/assets/{id}/health/compute`

### Predictions
- `POST /api/v1/predictions/anomaly` (body: {assetId, metricType})
- `GET /api/v1/predictions/risk/{assetId}?window=1h`

---

## Known Limitations (Phase 2)

1. **Prediction Model:** Backend uses a statistical baseline; CEP also has a
   synthetic-trained Isolation Forest development baseline. Neither is a
   production model trained/validated on three months of real factory data.
2. **Connector Implementations:** File Watcher and ERP are implemented; MES is optional and not accepted for production
3. **Frontend Integration:** Alert evidence, machine health history, and
   operator-gated basic RCA are wired; the fixture browser path asserts the
   alertId-only request and RCA result
4. **Tests:** Local regression and browser E2E pass; independent managed-staging smoke remains
5. **RCA:** Backward event correlation only; state is process-local and no LLM explanations are generated
6. **Real-time Updates:** Polling-based; SignalR pending

---

## Next Steps (Priority Order)

1. Provision managed HTTPS ingress, MQTT certificate, database TLS, and secret-manager values.
2. Connect one real ERP/MES source and validate canonical mappings.
3. Rehearse `migration → full → rollback → migration` with unique row evidence.
4. Set `FII_LIVE_E2E=1`, `FII_LIVE_FRONTEND_URL`, `FII_DEMO_USERNAME`, and
   `FII_DEMO_PASSWORD`, then run `npm --prefix frontend run e2e:live`.
5. Complete all 16 managed checks and obtain independent reviewer approval.
6. Run `infrastructure/staging/Test-ManagedStagingGate.ps1`.
7. Make the go/no-go and canary rollout decision only after the gate passes.

---

## Success Metrics

| Metric | Target | Status |
|--------|--------|--------|
| Build | Success | ✅ Local pass |
| Database schema | All tables created | ✅ Local migration replay |
| API endpoints | Alert/health/prediction/RCA live | ✅ Local component smoke |
| Background jobs | Health + batch prediction running | ✅ Local smoke |
| Alert latency | <1s p95 | ✅ 3.79 ms local p95 |
| Prediction latency | <200ms p95 | ✅ 9.38 ms local p95 |
| Timescale rollup profile | <500ms + result parity | ✅ 2.022–5.062 ms; 0 mismatches |
| Frontend integration | Components wired | ✅ Local pass |
| Fixture browser E2E | 100% pass | ✅ Playwright 1/1 |
| No-fixture full-stack E2E | 100% pass | ⏳ Requires approved live identity/credentials |

**Phase 2 state: local implementation slice complete; real full-stack and
managed-staging acceptance pending.**

---

## Troubleshooting

**Issue: Services fail to start**
- Check connection strings in appsettings.json
- Verify TimescaleDB and PostgreSQL are running
- Check ports 5432 and 55433 are accessible

**Issue: No health scores computed**
- Check HealthScoringJob logs
- Verify assets table has machines/sensors
- Run manual compute: `POST /api/v1/assets/{id}/health/compute`

**Issue: Predictions return 0 score**
- Verify telemetry_points has data for the asset
- Check last 24h data exists (baseline window)
- Anomaly detection needs at least 10 samples

**Issue: Alerts not persisting**
- Verify migrations applied to TimescaleDB
- Check events table exists
- Test with: `AlertService.CreateAlertAsync()` in code

---

## Support & Documentation

- **Phase 2 Plan:** docs/phase-2-product-intelligence.md
- **Progress Tracker:** docs/phase2-progress.md
- **Technical Summary:** docs/phase2-implementation-summary.md
- **Executive Report:** docs/phase2-final-report.md
- **Master Plan:** docs/master-plan-4-agents.md

---

**Prepared by:** Autonomous Coding Agent
**Build Status:** ✅ Success
**Ready for:** Integration Testing & Deployment
