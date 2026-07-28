# Phase 2 product-intelligence implementation summary

**Updated:** 2026-07-28
**Release state:** local staging candidate; real full-stack and managed-staging
acceptance are outstanding.

## Delivered

### Data plane

- TimescaleDB telemetry/event schema with replayable migrations, indexes,
  retention, columnstore policies, and migration tracking.
- File Watcher validates headers and rows, verifies canonical assets, writes
  synchronously, and moves failed files to a recoverable path.
- ERP connector polls incrementally, resolves ERP identifiers through
  `asset_mapping_rules`, and records fetch/transform/write failures in
  `connector_dlq` with JSON fallback.
- Connector admin API lists, retries, and resolves DLQ records; all data and
  management routes fail closed behind a constant-time API-key check.
- Aggregate telemetry queries validate bucket/aggregation allowlists, group by
  the Timescale bucket correctly, and preserve zero-valued measurements.
- Unbounded hourly/daily AVG/MIN/MAX queries read real-time continuous
  aggregates; bounded ranges remain raw so partial buckets preserve existing
  semantics.
- A repeatable pgbench workload seeds and removes seven days of synthetic data
  for 50 machines × 10 metrics and fails when p95 or throughput misses target.
- A disposable-database profiler retains full before/after
  `EXPLAIN (ANALYZE, BUFFERS)` plans and verifies exact rollup result parity.
- Dual-write supports `migration`, `full`, and `rollback`; failed buffers are
  requeued, mode changes are refused when the old mode cannot flush, and
  rollback events fail closed because no legacy event sink exists.

### CEP and prediction

- EventRuleEngine has at least five enabled threshold rules using normalized
  telemetry.
- CEP pattern rules retain unmatched events so N-within-M evaluation can
  accumulate its window, while configured machine allowlists exclude unrelated
  events.
- Rule hits persist a canonical event before creating an alert, preserving the
  alert foreign-key invariant.
- Alert severity is normalized to the database contract.
- Batch prediction runs both anomaly and failure-risk scoring on a bounded,
  configurable set of active assets. Database, scoring, and persistence errors
  propagate so failed assets are not counted as successful.
- The Python baseline uses distinct 1-hour/24-hour feature windows and maps the
  Isolation Forest decision boundary directly to a bounded score. It remains
  synthetic development evidence, not a production-trained model.
- Basic RCA backward-traces the in-process event graph. A bounded,
  fail-closed ASP.NET proxy exposes it only to `ADMIN`/`ENGINEER`; it accepts
  only `alertId`, loads canonical event context from Timescale, validates the
  nested CEP response shape, and does not leak upstream bodies or transport
  details.
- RCA candidates must precede the target, remain inside its time window, and
  share the target asset or a non-empty line. Unrelated global events are
  excluded from the returned causal chain.
- Batch failure inference returns service-unavailable when an omitted anomaly
  result requires a detector that is not initialized; it no longer wraps that
  dependency outage in an HTTP-200 per-item error.

### Asset catalog

- The production-like demo catalog contains exactly 50 unique linked assets:
  1 plant, 3 lines, 20 machines, and 26 sensors. It is explicitly not claimed
  to be a verified MKZ equipment inventory.
- SQLAlchemy keeps the database column and JSON API field named `metadata`
  while using a non-reserved Python attribute. SQLite and PostgreSQL dialect
  mappings are regression-tested.
- Asset hierarchy requests reject a parent on plants and require a parent on
  lines, machines, and sensors before reaching the database. The shared
  business service enforces Plant → Line → Machine → Sensor parent types for
  both HTTP requests and Excel imports.
- Optional-auth reads accept a genuinely anonymous request but return 401 for
  a supplied invalid token, preventing malformed credentials from bypassing
  asset-scope filtering.

### Product UI and QA

- Alert Center loads full alert detail and renders structured evidence.
- Alert Center renders root cause, confidence, causal chain, and recommended
  actions through the authenticated backend facade. View-only users do not
  issue the protected RCA POST, and the UI discloses that results are basic
  correlation without LLM explanation.
- Machine detail renders health-score history.
- System Monitor shows ERP/MES/File Watcher status through an authenticated
  backend proxy; the connector API key never enters browser configuration.
- Playwright covers dashboard navigation, alert evidence, the RCA
  `alertId`-only request/result, machine health history, and acknowledge
  behavior with deterministic API fixtures.
- A separate opt-in Playwright smoke performs real login, cookie-session
  reload, dashboard API, and visible UI checks without route fixtures; it
  skips unless live credentials are explicitly supplied.
- CI runs .NET, connector/API/dual-write, frontend unit, i18n, build, browser
  E2E, and known-secret checks.

### Security and operations

- MQTT connections require a token bound to the client ID; publish and
  subscribe topics are restricted to that device.
- Production MQTT defaults to a TLS-only endpoint and fails startup when the
  certificate is missing or invalid. Development plaintext is explicit.
- ClientPLC reads the token from runtime environment, does not persist it, and
  uses normal platform certificate validation when TLS is enabled.
- Tracked runtime settings no longer contain the known development database,
  JWT, MinIO, or service credentials. Required values are injected at runtime.
- The data-platform API binds to loopback in local Compose, requires its API
  key from the deployment secret manager, and uses explicit CORS origins.
- Backend API access now defaults to authenticated JWT/cookie sessions;
  non-authentication mutations require `ADMIN` or `ENGINEER`, and the browser
  no longer persists or trusts bearer-token claims from local storage.
- Global, login, and database-health fixed-window limits return RFC 7807
  responses with `Retry-After`; forwarded client addresses are accepted only
  from explicitly trusted proxy IPs or CIDRs.
- Collection sizes, filter lengths, and telemetry/event/health query windows
  are bounded. Existing and legacy controller errors are normalized to
  `application/problem+json`, with 5xx details sanitized.
- A non-destructive rollback runbook and a strict managed-staging attestation
  gate are included.

## Verification snapshot

| Check | Result |
|---|---|
| Backend tests | 122 passed |
| ClientPLC tests | 12 passed |
| Frontend unit tests | 64 passed |
| CEP service tests / lint | 30 passed / Ruff passed |
| Asset service tests / lint | 34 passed / Ruff passed |
| Data-platform tests | 53 passed |
| Frontend lint / i18n / build | Passed |
| Playwright | 1 passed |
| Local File Watcher → Timescale | Passed |
| Local MQTT auth → CEP → alert | Passed |
| Alert query p95 | 3.79 ms |
| Prediction p95 | 9.38 ms |
| Timescale 50 × 10 weekly workload | p95 292.50 ms; 247.42 qps; 0 failures |
| Timescale rollup profile | 67.36×–114.96× faster; 0 mismatches |

## Not yet proven

- Managed HTTPS/MQTT/database TLS configuration.
- Trusted-ingress forwarded-header and browser cookie behavior under the real
  managed proxy.
- Real secret-manager delivery and certificate rotation.
- Real ERP/MES source reliability and mapping quality.
- Managed backup/restore and retention execution.
- Independent staging smoke and production approval.
- A real full-stack browser run; current Playwright coverage uses deterministic
  API fixtures.
- HTTP telemetry-query and MQTT ingestion throughput; the completed 50 × 10
  benchmark covers the database query path.

These are encoded as required checks in
`infrastructure/staging/Test-ManagedStagingGate.ps1`; the gate intentionally
cannot pass using localhost or incomplete evidence.
