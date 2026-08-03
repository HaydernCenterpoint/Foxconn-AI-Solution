# FII AI — Kế hoạch Dự án Thống nhất (Unified Project Plan)

> **Phiên bản:** 2.0 — Unified  
> **Cập nhật:** 2026-08-03
> **Trạng thái:** Phase 2 local complete · Staging candidate (NO-GO for production)  
> **Tiến độ tổng:** ~84% (54/64 checklist) — local evidence done, managed staging pending

---

## Mục đích file này

File này là **nguồn sự thật duy nhất (single source of truth)** cho toàn bộ kế hoạch, tiến độ và roadmap của dự án FII AI. Tất cả các file plan/roadmap/progress khác đã bị **thay thế (superseded)** — xem mục [File đã thay thế](#-file-đã-thay-thế) ở cuối.

---

## 1. Tổng quan Dự án

**FII AI** (Foxconn AI Solution / MKZ Factory Monitor) là nền tảng Industrial IoT giám sát nhà máy toàn diện: thu thập telemetry từ PLC, lưu trữ vào TimescaleDB, xử lý sự kiện (CEP), dự đoán lỗi (predictive analytics), tính health score, và hiển thị qua dashboard React.

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│   ClientPLC  │────▶│     Backend      │◀────│   Frontend   │
│  (WPF App)   │MQTT │  (ASP.NET Core)  │REST │  (React SPA) │
│              │     │                  │     │              │
│ Đọc PLC thật │     │ Xử lý + Lưu trữ  │     │ Hiển thị +   │
│ HslComm 27+  │     │ Cảnh báo + AI    │     │ Quản lý +    │
│              │     │                  │     │ Báo cáo      │
└──────────────┘     └──────────────────┘     └──────────────┘
```

### Các thành phần chính

| Component | Tech stack | Vai trò | Trạng thái |
|---|---|---|---|
| `backend/` | ASP.NET Core, PostgreSQL, TimescaleDB | REST API, MQTT broker, CEP, health scoring, predictions | ✅ Local complete |
| `frontend/` | React, Vite, TypeScript, Tailwind | Dashboard, Asset Browser, Alert Center, RCA UI | ✅ Local complete |
| `ClientPLC/` | .NET 9, WPF, MQTT, SQLite, HslCommunication | Desktop app đọc PLC, gửi telemetry qua MQTT | ✅ Build clean, plan riêng |
| `fusion-adapter/` | .NET | Adapter chuyển đổi protocol/data | ✅ Có |
| `fusion-contracts/` | .NET | Shared contracts (ContractV1, TelemetrySchema, etc.) | ✅ Có |
| `factory-ai-platform/` | Microservices (Python + .NET) | asset-service, cep-service, data-platform, gateway, document-service, report-service | ✅ Có |
| `Open-Data-Fusion/` | Python | Data fusion pipeline | ✅ Có |
| `infrastructure/` | Docker, PowerShell, SQL | TimescaleDB migrations, connectors, staging, demo scripts | ✅ Có |
| `Odysseus/` | Python (third-party) | Self-hosted AI assistant — **dự án riêng, không thuộc scope FII** | N/A |
| `obsidian-fii-ai/` | Obsidian vault | Knowledge base, notes, roadmap tracking | N/A |

---

## 2. Kiến trúc tổng quan

```
PLC (physical device)
   │
   │ [HslCommunication TCP]
   ▼
ClientPLC.App (WPF)
   ├── PLCGeneric (27+ brands, reflection)
   ├── PlcAddressReader (batch reads)
   ├── PLCPollingService (polling loop)
   ├── MachineStateResolver (RUNNING/STOPPED/ERROR/OFFLINE)
   ├── AlarmEdgeDetector (error_history DB)
   ├── LocalDbService (SQLite)
   └── MqttClientService
         ├── TelemetryPayloadBuilder (JSON)
         ├── CryptoHelper (AES-256-GCM)
         └── MqttTransport → MQTT broker
               │
               ▼
Backend (ASP.NET Core)
   ├── MQTT ingest + outbox
   ├── TimescaleDB dual-write (PostgreSQL + Timescale)
   ├── AssetService (CRUD, tree, search)
   ├── AlertService (lifecycle, dedup, suppression)
   ├── HealthScoringService + HealthScoringJob (15-min)
   ├── PredictiveService (z-score anomaly + risk)
   ├── EventRuleEngine (CEP, in-process)
   ├── RCA proxy (basic correlation, CEP route)
   ├── RBAC (ADMIN/ENGINEER/GUEST)
   └── REST API: /api/v1/*
         │
         ▼
Frontend (React SPA)
   ├── Asset Browser (tree, search, detail)
   ├── Dashboard (health badges, charts)
   ├── Alert Center (ack/resolve, CSV export)
   ├── Predictive Alert panel
   ├── RCA panel (operator-gated)
   └── SSO demo flow
```

### Shared Contracts (chốt Ngày 1, KHÔNG đổi)

1. `asset_id`: UUID — định nghĩa bởi Asset Service
2. `telemetry` schema: `(time, asset_id, metric, value)`
3. `event` schema: `(event_id, timestamp, asset_id, type, severity, payload)`
4. API convention: REST, `/api/v1/...`, JWT Bearer, lỗi RFC 7807 (problem+json)

---

## 3. Trạng thái Hiện tại

### Phase 1 — MVP (2 tuần) ✅ Hoàn thành

| Hạng mục | Trạng thái | Evidence |
|---|---|---|
| Contract V1 (asset/telemetry/event/error) | ✅ | `contracts/v1/*`, `fusion-contracts/ContractV1.cs` |
| Timescale dual-write + rollup + rollback | ✅ | `backend/Services/Timescale*`, `infrastructure/timescaledb/` |
| Asset CRUD/search/tree | ✅ | `backend/Controllers/AssetController.cs` |
| CEP staging + publisher + 5 rules | ✅ | `backend/Services/CepStagingPublisher.cs` |
| Asset Browser (API thật, không mock) | ✅ | `frontend/src/pages/AssetBrowserPage.tsx` |
| Contract tests trong CI | ✅ | `backend.Tests/ContractV1Tests.cs` |
| Full demo pass | ✅ | `infrastructure/demo/Start-FullDemo.ps1` |

### Phase 2 — Product Intelligence (~84% local, staging pending)

| Lane | Local scope | Staging/Production |
|---|---|---|
| **A · Data Platform** (Timescale, File Watcher, ERP/MES, DLQ) | ✅ ~90% | ⬜ ERP thật, read-cutover, managed rollback |
| **B · Event & AI** (CEP, prediction, RCA) | ✅ ~80% | ⬜ EDA 3 tháng, ML model thật, LLM RCA |
| **C · Core Backend** (Asset, Health, RBAC, Security) | ✅ ~100% | ⬜ MKZ inventory thật, managed security |
| **D · Frontend & QA** (UI, E2E, Performance, Security) | ✅ ~70% | ⬜ Managed-staging, pentest |

**Local evidence:**
- Backend: 122 tests pass
- Frontend: 64 tests pass, Playwright 1/1 pass
- CEP service: 30 tests pass
- Asset service: 34 tests pass
- Data platform: 53 tests pass
- ClientPLC: 12 tests pass
- Alert query p95: 3.79 ms (target <1s)
- Prediction p95: 9.38 ms (target <200ms)
- Timescale workload: 1,008,500 điểm, p95 292.50 ms, 247.42 q/s

**Release decision:** **NO-GO / staging candidate** — local evidence proves implementation behavior, not production readiness.

**Integration W8:** ✅ local no-fixture closed at `046d98e` — disposable Docker stack passed migrations through `0006`, direct MQTT telemetry, PostgreSQL/Timescale/CEP checks, live alert acknowledgement, and Playwright 1/1. Evidence: `docs/release-evidence/2026-08-01-integration-w8-local.md`.

### ClientPLC — WPF Desktop App

| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| GĐ 0 — Build warnings | Fix 96 warnings (CS0618, CS1998, CS0414) | ✅ 0 warning, 0 error |
| GĐ 1 — Critical | Bare catch, deadlock risk, race condition, plaintext fallback | ⬜ Chưa làm |
| GĐ 2 — High priority | Unit tests (30-40), DI consolidation, Serilog, IsConnected fix | ⬜ Chưa làm |
| GĐ 3 — Medium | Tách God Object, integration tests, structured logging, circuit breaker | ⬜ Chưa làm |

---

## 4. Timeline / Roadmap (10 tuần, 4 luồng song song)

```
Tuần:        1    2    3    4    5    6    7    8    9    10
Agent A   [Schema+Migrate][Backfill+Optimize][Connectors ERP/MES/CSV][Dashboard]
Agent B   [Mock+CEP design][Flink/Drools setup][ML models][RCA engine]
Agent C   [Asset schema+seed][Asset CRUD API][Health score][Access control]
Agent D   [Mock API+UI shell][Asset Browser][Dashboards+Charts][E2E+Perf+Sec test]

Checkpoint:  ▲Kickoff        ▲Sync W2        ▲Sync W5        ▲Integration W8  ▲Go-live W10
             ✅ Done          ✅ Done          🟡 Local pass    ⬜ Planned        ⬜ Needs staging
```

### Gate & tiêu chí ra quyết định

| Gate | Khi nào | Bằng chứng cần có | Trạng thái |
|---|---|---|---|
| Shared Contracts | Tuần 1–2 | Schema asset/telemetry/event, API convention versioned | ✅ Hoàn tất |
| ODF Gate 2 | Trước Tuần 1 | Production-like rehearsal, rollback config, review artifact | ✅ Hoàn tất |
| Sync W5 | Tuần 5–6 (hiện tại) | Event/alert + Asset CRUD + health trên integration path; UI dùng API thật; E2E happy-path pass | 🟡 Local pass — staging còn mở |
| Integration W8 | Tuần 8 | PLC mock → data → event/AI → backend → UI end-to-end | ✅ Local pass — `046d98e`, managed staging remains separate |
| Go-live W10 | Tuần 9–10 | Managed backup/restore, ingress, TLS/mTLS, secret delivery, retention, connector thật, reviewer độc lập | ⬜ Managed staging |

---

## 5. Việc còn lại (Consolidated Remaining Work)

### 5.1. Ngay bây giờ (Now)

1. **Publish W8 review unit** — push `046d98e`, mở PR riêng và chờ CI/review; không gộp 42 staged WIP không liên quan
2. **Handoff managed staging** — cấp hostname HTTPS, ingress CIDR, artifact root/hosts và deployment owner

### 5.2. Managed staging (Then)

1. Provision **HTTPS ingress**, cấu hình trusted forwarded-header source, verify cookie `Secure`/`SameSite`
2. Deliver **MQTT PFX, database URLs, JWT key, per-device tokens, service credentials** qua secret manager
3. Configure **database TLS**, backup, restore, retention, dual-write, rollback checks
4. Kết nối **một ERP/MES thật** và nạp `asset_mapping_rules`
5. Rehearse `migration → full → rollback → migration` với unique telemetry IDs
6. Hoàn tất **16 managed checks** + independent smoke + reviewer approval (30 ngày)
7. Run `infrastructure/staging/Test-ManagedStagingGate.ps1`
8. Go/No-go + canary rollout decision

### 5.3. Phase 3 — Hardening & ML (Skip for now)

- LLM RCA / causal graph persistence
- EDA 3 tháng + trained ML model (Isolation Forest / Autoencoder, target precision >85%, recall >80%)
- Extra connectors beyond one ERP
- PR #21 (ODF contracts/topology hardening) — review/merge riêng nếu gap proved
- SignalR real-time updates (hiện polling-based)
- Storybook setup cho frontend components
- Full security audit (OWASP ZAP + manual pentest)

### 5.4. ClientPLC — Việc còn lại

**Critical (GĐ 1 — ~1 giờ):** ✅ Hoàn thành (build 0 warning/0 error, 95 tests pass)
- [x] Fix bare `catch {}` — 4 files (MqttClientService, TelemetryPayloadBuilder, CryptoHelper, SystemInfoService) → Serilog.Log.Warning + MqttTransport dispose catch + 3 bare catches trong PlcConnectionManager
- [x] Fix `GetAwaiter().GetResult()` deadlock risk — MqttTransport.cs (xóa sync `DisconnectClient()` wrapper, 3 caller chuyển sang `await DisconnectClientAsync().ConfigureAwait(false)`)
- [x] Fix race condition `_lastConnectAttempt` — PlcConnectionManager.cs (đã ghi trong lock)
- [x] Xoá fallback plaintext khi encrypt lỗi — CryptoHelper.cs (đã `throw`, không còn plaintext fallback)

**High priority (GĐ 2 — ~12 giờ):** 🟡 Một phần đã làm (bởi agent trước + đợt này)
- [x] Thêm 30-40 unit tests cho critical modules — **95 tests pass** (far exceeds 30-40 target; PlcConnectionManager tests added this pass). Gaps: AlarmEdgeDetector/UnitTrackingService/TelemetryPayloadBuilder chưa có unit test trực tiếp (cần GĐ 3 refactor để testable)
- [ ] Consolidate singleton pattern (DI thay vì static Instance) — large refactor, defer
- [ ] Replace `Debug.WriteLine` bằng Serilog (~58 chỗ, 28 files) — Core chưa có Serilog package; cần bulk pass cẩn thận (risk: Serilog template parsing), defer
- [x] Fix `IsConnected` — NoResponse ≠ Connected (đã fix: `IsConnected` chỉ trả true khi `Connected`)
- [ ] Wrap fire-and-forget tasks bằng try-catch — MqttClientService loops đã wrap; cần rà các Task.Run/async void còn lại
- [ ] Replace hardcoded passwords (RoleManager.cs) — ⚠️ KHÔNG có code nào seed `password_engineer`/`password_admin` vào storage; login Engineer/Admin hiện phụ thuộc fallback `666666`/`888888`. Cần build password-setup UI + migration trước khi xóa fallback (xóa ngay = break login)

**Medium (GĐ 3 — ~3 ngày):**
- [ ] Tách `MqttClientService` (God Object ~677 dòng)
- [ ] Integration tests với SQLite thật
- [ ] Structured logging (JSON formatter + Seq)
- [ ] Circuit breaker cho PLC reads (Polly)
- [ ] Migration navigation pattern (typed navigation)

---

## 6. Rủi ro cần theo dõi

| Rủi ro | Ảnh hưởng | Giảm thiểu |
|---|---|---|
| Docs/status lệch code | Quyết định sai dựa trên thông tin cũ | File này là source of truth; refresh trước mỗi checkpoint |
| Data cutover lỗi | Mất/duplicate dữ liệu | Dual-write + validation query + rollback drill trước khi deprecate PG |
| ERP/MES live integration | Block go-live | Bắt đầu kết nối sớm; chỉ cần 1 ERP thật cho gate |
| Security audit muộn | Delay go-live | Chạy security scan từ Tuần 5 trên API đã có |
| ClientPLC critical bugs | Mất dữ liệu telemetry | Ưu tiên GĐ 1 (~1 giờ) trước khi deploy |
| Không suy diễn production readiness | Claim sai release state | Staging là gate riêng; local pass ≠ production-ready |

---

## 7. Tham chiếu chi tiết (Deep Dive References)

Khi cần chi tiết, xem các file sau (nhưng **không dùng làm source of truth** cho plan/progress):

| Chủ đề | File tham chiếu |
|---|---|
| Master plan 4 agents (chi tiết sprint) | `docs/master-plan-4-agents.md` |
| Phase 1 MVP checklist | `docs/phase-1-mvp-2w.md` |
| Phase 2 progress tracker | `docs/phase2-progress.md` |
| Phase 2 deployment guide | `docs/PHASE2-DEPLOYMENT.md` |
| Phase 2 final report (snapshot 2026-07-22) | `docs/phase2-final-report.md` |
| ClientPLC plan (chi tiết GĐ 0-3) | `ClientPLC/PLAN.md` |
| Roadmap HTML (visual board) | `docs/roadmap.html` |
| Security & secrets | `docs/security-secrets.md` |
| CDF features analysis | `docs/cdf-features-analysis.md` |
| Prompt framework | `docs/prompt-framework.md` |
| Release evidence | `docs/release-evidence/` |
| Managed staging gate | `infrastructure/staging/managed-gate.example.json` |
| Obsidian knowledge base | `obsidian-fii-ai/` |
| ODF architecture | `Open-Data-Fusion/docs/` |

---

## 8. File đã thay thế (Superseded)

File này thay thế các file plan/roadmap/progress sau làm **source of truth**. Các file đó vẫn giữ làm **tham chiếu lịch sử** nhưng không nên dùng để lập kế hoạch mới:

| File | Vai trò cũ | Trạng thái mới |
|---|---|---|
| `docs/master-plan-4-agents.md` | Master plan 4 agents | 📦 Tham chiếu chi tiết sprint |
| `docs/phase-1-mvp-2w.md` | Phase 1 MVP plan | 📦 Lịch sử — Phase 1 đã done |
| `docs/phase-2-product-intelligence.md` | Phase 2 overview | 📦 Tham chiếu |
| `docs/phase2-progress.md` | Phase 2 progress tracker | 📦 Tham chiếu — refresh theo code |
| `docs/phase2-final-report.md` | Phase 2 final report | 📦 Snapshot 2026-07-22 |
| `docs/phase2-implementation-summary.md` | Phase 2 implementation summary | 📦 Snapshot 2026-07-22 |
| `docs/PHASE2-DEPLOYMENT.md` | Phase 2 deployment guide | 📦 Tham chiếu deployment |
| `docs/README.md` | Project overview (cũ) | 📦 Tham chiếu — references project_plan_*.md không tồn tại |
| `_roadmap_text.txt` | Roadmap text source | 📦 Tham chiếu — source cho `docs/roadmap.html` |
| `obsidian-fii-ai/10 Project/Roadmap Remaining.md` | Remaining roadmap (Obsidian) | 📦 Tham chiếu |
| `ClientPLC/PLAN.md` | ClientPLC plan | 📦 Tham chiếu chi tiết GĐ 0-3 |
| `Odysseus/ROADMAP.md` | Odysseus roadmap | ⛔ Third-party, không thuộc scope FII |
| `docs/superpowers/plans/*.md` | Superpowers plans | 📦 Tham chiếu |
| `factory-ai-platform/data-platform/docs/*.md` | Data platform docs | 📦 Tham chiếu |
| `Open-Data-Fusion/docs/**/*.md` | ODF docs | 📦 Tham chiếu |

> **Quy tắc:** Khi cần biết trạng thái dự án, xem file này. Khi cần chi tiết kỹ thuật, xem file tham chiếu. Không tạo file plan/roadmap/progress mới — cập nhật file này.

---

## 9. Quy ước cập nhật

1. **Chỉ cập nhật file này** khi có thay đổi về plan/roadmap/progress
2. Đánh dấu `[x]` khi hoàn thành, `[ ]` khi chưa, `🟡` khi local pass nhưng staging pending
3. Link evidence (PR, test result, file path) cho mỗi mục đã done
4. Refresh trước mỗi checkpoint (W2, W5, W8, W10)
5. Không claim production readiness cho đến khi 16 managed checks pass + independent reviewer approve

---

**Owner:** Project Team
**Last refresh:** 2026-08-03
**Next checkpoint:** Go-live W10 — cần managed staging provisioned