# Phase 2 implementation progress

**Updated:** 2026-07-28
**Current state:** the requested P0–P3 implementation slices have local
component evidence. The wider master plan remains partial, and production
acceptance is gated by real full-stack/managed-staging evidence plus an
independent reviewer.

## Status by lane

| Lane | Status | Implemented evidence |
|---|---|---|
| P0 — Timescale, File Watcher, API, Playwright | Local component pass | Idempotent Timescale migration replay; real CSV → Timescale smoke; validated raw/aggregate telemetry queries; 50-machine/10-metric database workload gate; browser contract for dashboard → evidence/RCA → health history → acknowledge |
| P1 — ERP/MES, DLQ, CEP | Local pass; live ERP pending | ERP incremental HTTP polling, canonical asset mapping, database-first DLQ with retry/resolve API; optional MES fails closed; enabled CEP threshold/pattern rules now retain unmatched events correctly for N-within-M evaluation |
| P2 — Intelligence UI, batch prediction, RCA, performance | Local component pass | Structured alert evidence, machine health-history chart, scheduled bounded batch prediction, corrected 1h/24h feature windows and anomaly scoring, basic RCA graph/API plus operator-gated UI, alert/prediction endpoint latency gate |
| P3 — Security/TLS/secrets/rollback/staging gate | Code complete; managed staging pending | Authenticated API fallback, operator-only mutations, cookie-only browser sessions, global/login/health rate limits, RFC 7807 errors, trusted-proxy configuration, per-device MQTT security, rollback-safe dual-write modes, 16-check managed-staging verifier |

## Fresh verification

- Backend: 122 tests passed, including 15 focused RCA proxy checks and the
  API-security contract suite.
- ClientPLC: 12 tests passed.
- Frontend: 20 files / 64 tests passed; lint, i18n validation, TypeScript
  production build, and Playwright 1/1 passed.
- CEP service: 30 tests passed; full `ruff check app tests` and bytecode
  compilation passed. Coverage includes RCA API backward tracing, distinct
  1h/24h features, anomaly-score separation, batch prediction fallback, and
  reachable N-within-M event accumulation. RCA rejects future/cross-scope
  candidates and batch inference fails closed when its detector is unavailable.
- Asset service: 34 tests passed on SQLite; ORM metadata maps to the unchanged
  PostgreSQL `metadata` column and public JSON field, RFC 7807/auth behavior is
  covered (including invalid optional-token fail-closed behavior), and the
  production-like catalog contains 50 unique, linked assets with the
  Plant → Line → Machine → Sensor parent-type matrix enforced in the shared
  business service used by both HTTP and Excel imports.
- Data platform: 53 connector/API/dual-write/benchmark tests passed.
- Timescale migrations replayed successfully on clean local containers.
- File Watcher imported a real CSV row into TimescaleDB.
- Live local MQTT smoke accepted the configured device token, rejected the
  wrong token, and produced a CEP event plus durable alert.
- Live alert detail/evidence, health current/history, and acknowledge APIs
  completed successfully.
- Security contracts prove authenticated fallback, 401/403/429
  `application/problem+json`, trusted forwarded-client IP partitioning,
  bounded list/tree/time-window and offline-sync workloads, health/login
  throttling, and operator-role coverage for every non-authentication mutation.
- Local latency gate: alert query p95 3.79 ms (target <1,000 ms), prediction
  p95 9.38 ms (target <200 ms), bounded alert load 156.82 requests/second.
- Local Timescale workload: 1,008,500 points covering seven days for 50
  machines × 10 metrics; 3,794 queries, 0 failures, p95 292.50 ms and
  247.42 queries/second. This proves the database query path only, not HTTP or
  MQTT ingestion throughput.
- Isolated Timescale query profile: 1,008,000 points with raw
  `EXPLAIN (ANALYZE, BUFFERS)` evidence reduced hourly AVG
  340.955 → 5.062 ms, hourly MIN 304.633 → 4.349 ms, and daily MAX
  232.453 → 2.022 ms with zero result mismatches. Rollups are real-time and
  used only for unbounded requests; bounded ranges remain raw to preserve
  partial-bucket semantics. A replay regression also preserved 47-day-old
  hourly/daily rollups after their raw chunk was removed.

Local evidence proves implementation behavior; it does not prove production
readiness.

The Playwright happy path uses deterministic API fixtures. It proves browser
behavior, not a real backend/full-stack deployment.

The RCA slice is basic in-process event correlation. The browser submits only
an `alertId`; the backend loads the authoritative event context from Timescale
and rejects malformed CEP response shapes before they reach the UI. It does not
yet persist a causal graph or generate/validate LLM explanations.

An independent local review of the RCA/ML/asset slice returned `APPROVE` after
the boundary regressions above passed. This does not replace the managed
staging sign-off.

## Remaining local plan

1. Run the existing real MQTT → PostgreSQL/outbox → Timescale → event/alert
   demo with an approved local machine identity and retained database, then
   run the prepared `frontend` `e2e:live` browser assertion without API
   fixtures.

At the 2026-07-28 check, the current process had none of the required
Operations/Timescale connection values, JWT/MQTT secrets, approved machine
identity, or demo account credentials. Only the local Timescale containers
were running, so the harness was not started with invented identities.

## Remaining external gate

The following items require infrastructure or authority that is not present in
the local workspace:

1. Deploy backend and frontend behind managed HTTPS ingress, configure that
   ingress IP/CIDR as a trusted forwarded-header source, and verify cookie
   `Secure`/`SameSite` behavior.
2. Deliver MQTT PFX, database URLs, JWT key, per-device tokens, and service
   credentials through the deployment secret manager.
3. Validate a real ERP or MES source and its canonical asset mappings.
4. Run managed database TLS, backup, restore, retention, dual-write, and
   rollback checks.
5. Run an independent full-stack smoke test and attach evidence for all 16
   checks in `infrastructure/staging/managed-gate.example.json`.
6. Obtain an independent reviewer approval dated within 30 days, then execute
   `infrastructure/staging/Test-ManagedStagingGate.ps1`.

Until that gate passes, the correct release state is **staging candidate**, not
production-ready.

## Next execution order

1. Supply an approved retained local machine/client identity plus demo account
   and runtime secrets, then run `Start-FullDemo.ps1`,
   `Test-FullDemo.ps1`, and `frontend` `e2e:live` without route fixtures.
2. Provision managed staging and inject secrets/certificates.
3. Configure one real ERP endpoint and load its `asset_mapping_rules`.
4. Rehearse `migration → full → rollback → migration` with unique telemetry
   identifiers and retained evidence.
5. Complete the 16-check attestation and independent review.
6. Run the managed gate, then make the go/no-go and canary rollout decision.

## Primary references

- `docs/security-secrets.md`
- `factory-ai-platform/data-platform/docs/rollback_plan.md`
- `infrastructure/staging/README.md`
- `infrastructure/test-phase2-latency.ps1`
- `infrastructure/test-timescale-workload.ps1`
- `infrastructure/profile-timescale-queries.ps1`
- `factory-ai-platform/data-platform/scripts/benchmark_telemetry.py`
- Local benchmark/profile reports are generated on demand and are not tracked.
- `frontend/e2e/alert-health-happy-path.spec.ts`
