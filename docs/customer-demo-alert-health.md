# Customer demo: asset health and predictive alerts

**Delivery target:** a runnable Foxconn customer demo this afternoon. The guaranteed path on this workstation is the explicitly synthetic frontend demo; the SQL-backed path remains prerequisite-gated.

## Task board

### Done

- [x] Foxconn branding with the existing Foxconn Industrial Internet corporate mark.
- [x] Asset Browser → selected UUID asset → health badge and breakdown.
- [x] Predictive alert → health badge → detail disclosure.
- [x] Visible health/alert unavailable states that keep the core UI usable.
- [x] Deterministic demo-mode asset, health, and alert contracts.
- [x] Single-command synthetic viewer session; no backend login is simulated or claimed.
- [x] Main Foxconn → ODC navigation and same-host cookie contract mapped.
- [x] Live launcher routes alert and health calls to the main backend `/api/v1`.

### Today — must do

- [x] Run the synthetic demo with `npm --prefix frontend run demo`.
- [x] Re-run frontend tests, typecheck, production build, and demo build.
- [ ] Rehearse the customer talk track below in a browser.
- [ ] If live prerequisites become available, apply Phase 2 migrations, insert one deterministic shared-UUID asset health/alert record, and run the full smoke.

### Blocked by environment

- [ ] .NET 9 SDK required to build/run the `net9.0` backend; only .NET runtimes are installed.
- [ ] Docker/Podman or a native Timescale extension required for Timescale and ODF preview; neither is installed.
- [ ] Timescale service required on port `55433`.
- [ ] Odysseus local virtual environment and declared Python dependencies.
- [ ] Initialized pinned Open Data Fusion submodule and declared Node dependencies.
- [ ] ODF API factory-cookie provider/session endpoint matching the existing web expectation.

### Deferred

- Connectors, ERP/MES, batch/drift, RCA/LLM, exports, broad API clients.
- Production security/load work, managed staging, rollout, and cross-domain OIDC.
- Automatic ODF membership grants or claims of production SSO.

## Foxconn demo surfaces

The Operations shell and login experience use **Foxconn** as the product name. The existing Foxconn Industrial Internet image remains the corporate mark because the repository contains no separate Foxconn logo asset.

The shell exposes two existing external destinations:

- **Foxconn ODC (Odysseus)** uses `VITE_ODYSSEUS_URL` and defaults locally to `http://localhost:7000`.
- **Foxconn Data Fusion** uses `VITE_FII_DATA_FUSION_URL` and defaults locally to `http://localhost:58088`.

The main backend is the login authority and writes a same-host `HttpOnly` `fii_sso` cookie. Odysseus and the canonical Open Data Fusion implementation validate that cookie while preserving their own authorization rules. Treat live three-platform SSO as unverified until the full smoke test passes.

## Component and data contract

| Surface | Demo role | Identity/data boundary |
| --- | --- | --- |
| Foxconn frontend | Asset Browser, health badge, predictive alert drill-down | Bearer token plus credentialed same-host requests |
| Foxconn backend | Login authority and `/api/v1` alert/health APIs | Operations PostgreSQL plus `ConnectionStrings:Timescale` |
| Foxconn ODC | Read-only factory assistant | Validates `fii_sso`; preserves Odysseus authorization |
| Foxconn Data Fusion | Governed replicated telemetry | Transactional outbox → Fusion Adapter → ODF; never blocks MQTT |

Asset IDs remain PostgreSQL/.NET GUIDs across catalog, Timescale health, alerts, and Fusion contracts. The live demo must use the same asset UUID in all three records.

## Repeatable live-data path

This story requires the main backend, the Phase 2 Timescale migrations, and representative `asset_metrics` plus `alerts` rows that share a catalog asset UUID.

The full-demo launcher now points both frontend intelligence clients at the main backend. On a provisioned demo workstation:

```powershell
$env:FII_JWT_SECRET = '<fresh non-committed secret of at least 32 bytes>'
.\infrastructure\demo\Start-FullDemo.ps1
.\infrastructure\demo\Test-FullDemo.ps1
$env:FII_LIVE_E2E = '1'
$env:FII_LIVE_FRONTEND_URL = 'http://localhost:3001'
npm --prefix frontend run e2e:live
```

Do not proceed with a customer claim unless `Test-FullDemo.ps1` confirms the main session, Odysseus session, ODF session, data traversal, and global logout. Keep every URL on `localhost`; mixing it with `127.0.0.1` breaks the shared cookie host.

Then demonstrate:

1. Sign in and open **Asset Browser** at `http://localhost:3001/admin/assets`.
2. Select the representative asset with the UUID used by the seeded health and alert records.
3. Show the color-coded health score, uptime, performance, and maintenance breakdown.
4. Return to **Overview** at `http://localhost:3001/admin`.
5. Find the predictive alert for the same asset, then open it to show its description, recommended actions when supplied, and health breakdown.

If the health endpoint fails, Asset Browser keeps the selected asset details visible and shows **Health unavailable** with a retry action. If the alert endpoint fails, Overview keeps the production dashboard visible and shows **Predictive alerts are unavailable**.

## Local synthetic fallback

Run:

```powershell
npm --prefix frontend run demo
```

Open `http://127.0.0.1:3000`. Demo mode creates an explicit **Demo Viewer** session and supplies deterministic synthetic Asset Browser, alert, and health data without network calls. The shell labels this mode **DEMO · SYNTHETIC DATA**. It proves only the UI walkthrough; it does not prove login, persistence, SQL migrations, ODC/ODF authentication, or live data integration.

The full-demo launcher applies Timescale migrations `001` through `004`, starts the integrated services, exports current MKZ summaries, and verifies the Chroma index. `Test-FullDemo.ps1` then validates shared sessions, exact telemetry correlation, ODF replay idempotency, Timescale uniqueness, Chroma freshness, and global logout.

The retained-database smoke is non-destructive but additive: it does not create, rename, approve, or delete operational entities, but it appends one approved telemetry canary plus its outbox and downstream projection records. Run destructive CRUD checks only against a restored scratch database.

Live validation still requires Docker, explicit real-account credentials, and an approved existing machine or client ID. Until those inputs are available and the full smoke passes, do not claim live three-platform convergence.

## Customer rehearsal

1. Open Foxconn and point out **DEMO · SYNTHETIC DATA** before discussing any values.
2. Open **Asset Browser** and select **MKZ Factory**.
3. Show the health score, uptime, performance, and maintenance breakdown.
4. Return to **Overview**, locate **Predictive maintenance recommended**, and open its details.
5. Explain that the same asset UUID joins catalog, health, alert, and Fusion contracts.
6. Open **Foxconn ODC (Odysseus)** only after the provisioned live smoke confirms its same-host session.
7. Open **Foxconn Data Fusion** only after the same smoke confirms factory authentication and project membership authorization.
8. Close with the live-data proof: one approved canary converges through PostgreSQL, ODF, Timescale, and Odysseus without duplicate replay records.

## Validation

```powershell
npm --prefix frontend run test:run -- src/pages/AssetBrowserPage.test.tsx src/features/dashboard/components/AlertHealthHappyPath.test.tsx
npm --prefix frontend run type-check
npm --prefix frontend run build
```
