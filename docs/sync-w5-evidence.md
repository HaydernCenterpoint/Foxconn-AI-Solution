# Sync W5 evidence (local)

Date: 2026-07-30 (local workspace)

## E2E / happy path

### Frontend (Vitest)
```
cd frontend
npx vitest run src/pages/AlertCenterPage.test.tsx src/features/dashboard/components/AlertHealthHappyPath.test.tsx
```
Result: **5/5 passed** (list + engineer ack + CSV export + dashboard alert/health drill-down).

No Playwright stack was added.

### Demo stack probe (when credentials available)
```
.\infrastructure\demo\Test-FullDemo.ps1
```
Now includes Phase 2 checks when Timescale is enabled:
- `GET /api/v1/alerts?status=open&limit=5`
- `GET /api/v1/assets/{machineId}/health`

### Live API smoke (this machine)
- Backend restarted with nullable alert filters (`status`/`severity` optional).
- `GET /api/v1/alerts?limit=2` → `200 {"count":0,"alerts":[]}`
- `GET /api/v1/alerts?status=open&limit=2` → `200`
- `GET /api/v1/assets/00000000-0000-0000-0000-000000000001/health` → `200` with score payload
- Timescale `alerts` table present (`count=0` in this environment)

## Latency

Existing scripts (need matching container names / credentials):
```
.\infrastructure\test-timescale-workload.ps1
.\infrastructure\profile-timescale-queries.ps1
```
Those scripts target `factory-timescaledb` / `factory_db` (older naming). Demo stack uses `mkz-timescale-timescaledb-1` / `plc_timescale`.

### Ad-hoc probe on demo Timescale (`mkz-timescale-timescaledb-1`)
- `telemetry_points` rows: **47,390**
- Column is `occurred_at` (not `time`)
- `\timing on` results (local Docker):
  - `count` last 24h: **5.186 ms** (0 rows in window)
  - group-by machine last 1h: **1.911 ms**
  - hourly trunc last 7d (top 12): **7.897 ms**

Full pgbench P95/QPS not re-run here (script container/db names diverge from demo compose: `factory-timescaledb` vs `mkz-timescale-timescaledb-1`). Re-run after pointing `ContainerName`/`Database` at demo stack if formal P95 evidence is required.

## Demo host / proxy worktree

Kept:
- `AllowedOrigins` for `localhost`/`127.0.0.1` ports 3001/5173 in Development
- `Start-FullDemo.ps1` `AllowedOrigins__1` for 127.0.0.1 frontend port
- Odysseus `/api/ready` allowlist (needed by `Test-FullDemo`)

Reverted / avoided:
- `VITE_API_URL=/api` (preview has no `/api` proxy; absolute backend URL is correct for production build preview)
- ModernShell / apiClient / vite.config dirty host-rewrite experiments (mojibake risk; not required once CEP/ASSET env point at backend)

## PR #21

- Open, CI green, **mergeable CONFLICTING** (DIRTY), head `dev` vs `main`: diverged (~16 ahead / 2 behind, ~159 files).
- Scope is large ODF contracts/topology/tests under paths that have since moved/landed via later merges (incl. production-line workspace through PR #42).
- Recommendation: **close as obsolete** unless a specific missing ODF contract is identified; do not spend a full rebase on a 159-file conflicted PR without a gap analysis.

## Residual gaps (not Sync W5 blockers)

- Full `Test-FullDemo` needs demo credentials / ops connection strings (not set in this session).
- Formal latency benchmark JSON from factory-named scripts not generated.
- Empty `alerts` table means ack path is proven in Vitest + API shape, not with a live open alert row.
