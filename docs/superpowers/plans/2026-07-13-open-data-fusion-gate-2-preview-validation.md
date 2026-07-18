# Open Data Fusion Gate 2 Preview Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Open Data Fusion activation gate reproducible and safe through a local-only preview startup command and an end-to-end bundle round-trip smoke test.

**Architecture:** ODF upstream remains unmodified. Two PowerShell scripts under `infrastructure/open-data-fusion/` operate only on the upstream `application-preview` profile: a startup script validates host-port conflicts and uses process-only Compose overrides; a smoke script accepts loopback URLs only, provisions a synthetic scope, ingests a canonical MKZ-shaped bundle, then reads it back. Staging remains a separately authorized production-like deployment requiring managed secrets, controlled provisioning, and OIDC.

**Tech Stack:** PowerShell, Docker Compose, Open Data Fusion REST API, existing .NET/React regression suites.

---

## File structure

| File | Responsibility |
| --- | --- |
| Create `infrastructure/open-data-fusion/Start-OpenDataFusionPreview.ps1` | Validate Docker, requested port availability, render Compose, and start the local preview profile without writing a repository `.env`. |
| Create `infrastructure/open-data-fusion/Test-OpenDataFusionPreview.ps1` | Enforce loopback-only endpoints; create a temporary ODF scope; ingest/read a canonical telemetry bundle. |
| Modify `infrastructure/open-data-fusion/README.md` | Document the automated preview commands and production-like handoff. |
| Modify `README.md`, `README.en.md`, and `README.zh-CN.md` | Keep the three root README quick-start paths aligned with the reusable startup/smoke commands. |

### Task 1: Implement safe preview startup

**Files:**
- Create: `infrastructure/open-data-fusion/Start-OpenDataFusionPreview.ps1`
- Test: invoke with an occupied port and a known-good override.

- [x] **Step 1: Write the failing conflict check**

Run:

~~~powershell
powershell -ExecutionPolicy Bypass -File infrastructure/open-data-fusion/Start-OpenDataFusionPreview.ps1 -PostgresPort 55432
~~~

Expected: a clear error that the requested port is in use before Docker Compose starts.

- [x] **Step 2: Implement the command**

The script must expose these typed parameters and no secret parameters:

~~~powershell
[CmdletBinding()]
param(
  [ValidateRange(1, 65535)][int]$PostgresPort = 55432,
  [ValidateRange(1, 65535)][int]$RedisPort = 56379,
  [ValidateRange(1, 65535)][int]$ApiPort = 54310,
  [ValidateRange(1, 65535)][int]$WebPort = 58088,
  [ValidateRange(1, 65535)][int]$WaitTimeoutSeconds = 300
)
~~~

Resolve the repository root from `$PSScriptRoot`, call `Get-NetTCPConnection` for each requested port, set `ODF_*_PORT` variables only in the current PowerShell process, then run:

~~~powershell
docker compose --env-file $envFile --profile application-preview config --quiet
docker compose --env-file $envFile --profile application-preview up -d --build --wait --wait-timeout $WaitTimeoutSeconds
docker compose --env-file $envFile --profile application-preview ps
~~~

Always restore the previous process environment variables in `finally`.

- [x] **Step 3: Verify the happy path**

Run:

~~~powershell
powershell -ExecutionPolicy Bypass -File infrastructure/open-data-fusion/Start-OpenDataFusionPreview.ps1 -PostgresPort 55433
~~~

Expected: PostgreSQL, Redis, API, and Web report running/healthy, with only loopback host bindings.

### Task 2: Implement a local-only ingest round trip

**Files:**
- Create: `infrastructure/open-data-fusion/Test-OpenDataFusionPreview.ps1`
- Test: execute against the running preview from Task 1.

- [x] **Step 1: Add API and Web safety checks**

The script must accept:

~~~powershell
param(
  [uri]$ApiBaseUrl = 'http://127.0.0.1:54310/',
  [uri]$WebBaseUrl = 'http://127.0.0.1:58088/',
  [string]$DevelopmentUser = 'local-user'
)
~~~

Reject non-loopback URLs using `$Uri.IsLoopback`. Before any write, require `GET /ready` to return `readiness = "ready"` and the Web root to return HTTP 200.

- [x] **Step 2: Build and assert the synthetic bundle**

Generate UUID tenant, project, run, and machine IDs. Use canonical string construction that avoids PowerShell's `$variable:` parsing ambiguity:

~~~powershell
$machineExternalId = "mkz:machine:$($machineId)"
$timeSeriesExternalId = "mkz:ts:$($machineId):production_qty"
~~~

POST tenant/project as `x-odf-user: local-user`; then POST `/api/v1/ingest/bundle` with both scope headers and this minimum payload shape:

~~~powershell
@{
  source = @{ system = 'mkz-odf-local-smoke'; runId = $runId; actor = 'mkz-validation' }
  assets = @($plant, $machine)
  timeSeries = @(@{ externalId = $timeSeriesExternalId; assetExternalId = $machineExternalId; name = 'Production quantity'; unit = $null })
  dataPoints = @(@{ timeSeriesExternalId = $timeSeriesExternalId; timestamp = [DateTimeOffset]::UtcNow.ToString('O'); value = 42; quality = 'good' })
  documents = @()
  relations = @()
}
~~~

Read `GET /api/v1/assets/:externalId/telemetry/latest` and throw unless the response has the exact external ID, point value `42`, and quality `good`.

- [x] **Step 3: Verify the live smoke**

Run:

~~~powershell
powershell -ExecutionPolicy Bypass -File infrastructure/open-data-fusion/Test-OpenDataFusionPreview.ps1
~~~

Expected: completed ingest, counts `assets=2`, `timeSeries=1`, `dataPoints=1`, and a round-tripped `42/good` point.

### Task 3: Update activation documentation

**Files:**
- Modify: `infrastructure/open-data-fusion/README.md`
- Modify: `README.md`, `README.en.md`, `README.zh-CN.md`

- [x] **Step 1: Document the reproducible preview path**

Add this exact sequence to the ODF runbook:

~~~powershell
.\infrastructure\open-data-fusion\Start-OpenDataFusionPreview.ps1 -PostgresPort 55433
.\infrastructure\open-data-fusion\Test-OpenDataFusionPreview.ps1
~~~

Explain that the startup script will reject occupied ports and that the smoke script creates synthetic data only on loopback preview endpoints.

- [x] **Step 2: Preserve the production-like boundary**

State that preview success does not provision staging. The deployment owner must supply managed PostgreSQL/Redis/object-storage/OIDC secrets, execute upstream's controlled `tenant:provision` workflow, grant the adapter `data:ingest`, and only then enable `OpenDataFusion__DispatchEnabled`.

- [x] **Step 3: Verify docs and Compose**

Run:

~~~powershell
rg -n "Start-OpenDataFusionPreview|Test-OpenDataFusionPreview|production-like|DispatchEnabled" README.md infrastructure/open-data-fusion/README.md
Push-Location third_party/open-data-fusion
docker compose --env-file ../../infrastructure/open-data-fusion/.env.example --profile application-preview config --quiet
Pop-Location
~~~

Expected: both commands are documented and Compose exits 0.

### Task 4: Run regressions and publish

**Files:**
- Modify: this plan only to check completed tasks.

- [x] **Step 1: Run focused validation**

~~~powershell
powershell -ExecutionPolicy Bypass -File infrastructure/open-data-fusion/Start-OpenDataFusionPreview.ps1 -PostgresPort 55433
powershell -ExecutionPolicy Bypass -File infrastructure/open-data-fusion/Test-OpenDataFusionPreview.ps1
~~~

- [x] **Step 2: Run existing regression suites**

~~~powershell
dotnet test backend.Tests/backend.Tests.csproj --no-restore
dotnet test fusion-adapter.Tests/fusion-adapter.Tests.csproj --no-restore
npm --prefix frontend run test:run
npm --prefix frontend run type-check
~~~

- [ ] **Step 3: Review and publish**

~~~powershell
git diff --check
git status --short
git add infrastructure/open-data-fusion README.md docs/superpowers/plans/2026-07-13-open-data-fusion-gate-2-preview-validation.md
git commit -m "feat: automate ODF preview activation"
git push origin codex/open-data-fusion-integration
~~~

Expected: the change contains no production secrets and the branch is published only after fresh validation evidence.
