# Kế hoạch Tổng hợp: Xây dựng Industrial IoT Platform (MKZ Factory Monitor)
## Chia việc cho 4 Sub-agent làm song song

> **Ngày:** 2026-07-09  
> **Cập nhật tiến độ:** 2026-07-28
> **Nguồn:** Tổng hợp từ `cdf-features-analysis.md` + `prompt-framework.md`  
> **Mục tiêu:** Chia 18 tuần roadmap thành 4 luồng công việc chạy song song, giảm thời gian còn ~8-10 tuần  
> **Vị trí hiện tại:** 54/64 checklist đã hoàn tất (~84% theo số mục);
> local component gates đã đạt, còn real full-stack, ML/LLM, security acceptance
> và managed-staging/reviewer độc lập
> **Evidence:** PR #16–#20, #22 + current locally validated worktree · xem
> `docs/roadmap.html` và `docs/phase2-progress.md`

---

## 1. Nguyên tắc chia việc

Chia theo **lát dọc theo layer** (không chia theo phase tuần tự) để 4 agent làm được đồng thời
ngay từ ngày 1, giảm phụ thuộc chờ nhau xuống mức tối thiểu.

```
┌─────────────────────────────────────────────────────────────────┐
│  AGENT A          AGENT B          AGENT C          AGENT D    │
│  Data Platform    Event/AI         Asset & API       Frontend  │
│  (TimescaleDB +   (CEP + ML        (Schema + Core    & QA      │
│   Integration)     predictive)      Backend APIs)    (UI+Test) │
├─────────────────────────────────────────────────────────────────┤
│         Đồng bộ qua "Shared Contracts" thống nhất Ngày 1        │
└─────────────────────────────────────────────────────────────────┘
```

**Shared Contracts** (chốt trong buổi kick-off, KHÔNG đổi giữa chừng):
1. `asset_id`: UUID, do Agent C định nghĩa schema, các agent khác dùng ngay (mock trước, tích hợp sau)
2. `telemetry` schema: `(time, asset_id, metric, value)` — Agent A định nghĩa, B/C/D dùng chung
3. `event` schema (Avro/JSON): `(event_id, timestamp, asset_id, type, severity, payload)` — Agent B định nghĩa
4. API convention: REST, `/api/v1/...`, JWT Bearer, lỗi theo RFC 7807 (problem+json)

---

## 2. Timeline tổng quan (8-10 tuần, chạy song song)

```
Tuần:        1    2    3    4    5    6    7    8    9    10
Agent A   [Schema+Migrate][Backfill+Optimize][Connectors ERP/MES/CSV][Dashboard]
Agent B   [Mock data+CEP design][Flink/Drools setup][ML models][RCA engine]
Agent C   [Asset schema+seed][Asset CRUD API][Health score][Access control]
Agent D   [Mock API+UI shell][Asset Browser][Dashboards+Charts][E2E+Perf+Sec test]

Checkpoint:  ▲Kickoff        ▲Sync W2        ▲Sync W5        ▲Integration W8  ▲Go-live W10
```


---

## 3. AGENT A — Data Platform Engineer
**Phụ trách:** TimescaleDB migration + Data Integration (ERP/MES/CSV connectors)
**Nguồn gốc:** Phase 1 + Phase 4 trong roadmap gốc

### Sprint A1 (Tuần 1-2): TimescaleDB Schema & Migration
- [x] Setup TimescaleDB instance (Docker, dev/staging)
- [x] Design hypertable schema cho `telemetry` (chunk interval 1 ngày)
- [x] Viết migration script từ PostgreSQL hiện tại
- [x] Implement dual-write middleware (ghi đồng thời cả 2 DB trong giai đoạn chuyển tiếp)
- [x] Backfill script cho dữ liệu lịch sử (có progress tracking, resumable)

**Deliverables:** SQL migration script, dual-write middleware (C#/Python), backfill tool

### Sprint A2 (Tuần 3-4): Optimization & Continuous Aggregates
- [x] Continuous aggregates (rollup theo giờ/ngày)
- [x] Compression policy (columnstore after 7d; ratio target formal deferred)
- [x] Retention policy (raw 30 ngày, aggregate 1 năm)
- [x] Benchmark & tối ưu 3 query chậm nhất hiện tại: workload p95 292,50 ms;
      `EXPLAIN (ANALYZE, BUFFERS)` trên 1.008.000 điểm giảm hourly AVG
      340,955 → 5,062 ms, hourly MIN 304,633 → 4,349 ms và daily MAX
      232,453 → 2,022 ms, không sai lệch kết quả
- [ ] Cutover: chuyển toàn bộ read traffic sang TimescaleDB, deprecate PostgreSQL cũ

**Deliverables:** Compression config, benchmark report trước/sau, rollback plan

### Sprint A3 (Tuần 5-7): Data Integration Connectors
- [x] ERP connector: HTTP polling, incremental sync, canonical asset mapping và DLQ; nguồn ERP thật còn chờ managed staging
- [x] File watcher cho Excel/CSV: lifecycle, schema validation, asset mapping, dual-write test và live Timescale smoke
- [x] MES connector: hỗ trợ API/DB, canonical asset mapping và fail-closed; chỉ bật qua profile khi có nguồn thật
- [x] Error handling: database-first dead-letter queue, JSON fallback, retry/resolve API; email/Slack deferred

**Deliverables:** 2-3 connector services (Python), cấu hình, mapping documentation

### Sprint A4 (Tuần 8): Integration Dashboard
- [x] API quản lý connector (status, last sync, start/stop/sync, DLQ retry/resolve) với API-key fail-closed
- [x] Hiển thị trạng thái ERP/MES/File Watcher trên System Monitor qua backend proxy giữ API key

**Bàn giao cho các agent khác:**
- Schema `telemetry` (Tuần 1, để B/C/D mock theo)
- Connector status API (Tuần 7, để D làm dashboard)


---

## 4. AGENT B — Event Processing & AI/ML Engineer
**Phụ trách:** Complex Event Processing, Predictive Alerts, ML models, Root Cause Analysis
**Nguồn gốc:** Phase 2 + Phase 5 trong roadmap gốc

### Sprint B1 (Tuần 1-2): Thiết kế CEP & Mock Data
- [x] Không chờ Agent A — dùng **mock telemetry stream** theo schema đã chốt Ngày 1
- [x] Đánh giá Apache Flink vs Drools (ma trận ưu/nhược điểm, quyết định kiến trúc)
- [x] Định nghĩa event schema (Avro/JSON): `event_id, timestamp, asset_id, type, severity, payload`
- [x] Viết 5-10 rule mẫu (VD: "3 máy cùng line lỗi trong 5 phút", "sản lượng giảm >20% so cùng giờ hôm qua")

**Deliverables:** Architecture decision doc, event schema, rule set mẫu — **đã giao** (`docs/superpowers/specs/2026-07-23-cep-architecture-decision.md`, `backend/Configuration/event-rules.json`)

### Sprint B2 (Tuần 3-4): Setup Engine & Alarm Migration
- [x] Setup CEP engine in-process (`EventRuleEngine`) — Flink/Drools staging deferred; ADR chốt path nhẹ hơn
- [x] Migrate ít nhất 5 threshold rule dùng metric đã normalize sang engine mới
- [x] Đo alert-query p95 3.79 ms trên local gate (mục tiêu <1s)
- [x] Tích hợp input thật từ Agent A khi TimescaleDB sẵn sàng (Tuần 3+)

**Deliverables:** CEP engine chạy in-process, rule bridge/persistence và latency evidence local đã giao

### Sprint B3 (Tuần 5-6): Predictive Alerting (ML)
- [ ] EDA trên dữ liệu sensor (temperature, vibration, current draw) 3 tháng
- [x] Feature engineering schema (rolling stats tables: `asset_features`, predictions) — SQL pipeline Phase 2; baseline Python tách đúng cửa sổ 1h/24h
- [ ] Huấn luyện model anomaly detection (Isolation Forest / Autoencoder) và/hoặc
      classification "failure trong 1 giờ tới" (mục tiêu precision >85%, recall >80%)
- [x] Inference baseline service (z-score anomaly + failure risk APIs; ML models deferred Phase 3)
      — `PredictiveService`, `PredictionController`
- [x] Sửa regression baseline Python: anomaly score không còn chuẩn hóa trên một mẫu,
      batch failure prediction tự chạy anomaly detector khi thiếu kết quả đầu vào

**Deliverables:** Baseline inference API và regression synthetic đã ship; EDA
3 tháng, model huấn luyện trên dữ liệu thật và metric precision/recall vẫn mở

### Sprint B4 (Tuần 7-8): Root Cause Analysis
- [x] Event correlation graph (backward tracing từ alarm về nguồn gốc) — `cep-service/app/rules/rca.py`
- [ ] Tích hợp LLM (dùng lại AI agent có sẵn trong `factory-ai-platform/gateway`) để giải thích bằng ngôn ngữ tự nhiên
- [x] API trả kết quả RCA cho Agent D hiển thị — CEP route + backend proxy
      `/api/v1/rca` có JWT, role `ADMIN`/`ENGINEER`, chỉ nhận `alertId`, lấy
      canonical event context từ Timescale, kiểm response shape và fail-closed

**Bàn giao cho các agent khác:**
- Event schema (Tuần 1)
- RCA API (Tuần 7, cho D làm UI) — **đã giao ở mức basic correlation; chưa có LLM**
- Alert/prediction API (Tuần 6, cho C tích hợp vào asset health score)


---

## 5. AGENT C — Asset Modeling & Core Backend Engineer
**Phụ trách:** Asset hierarchy schema, Asset CRUD API, Health Score, Access Control
**Nguồn gốc:** Phase 3 trong roadmap gốc + phần API nền tảng

### Sprint C1 (Tuần 1-2): Asset Schema (ưu tiên số 1 — mọi agent phụ thuộc vào đây)
- [x] Chốt schema `assets` và `asset_relationships` (xem chi tiết SQL trong `prompt-framework.md` mục 4.1)
- [x] Chốt schema `asset_documents` (metadata link; full RAG sync deferred)
- [x] Publish schema này cho A/B/D dùng làm `asset_id` reference **ngay trong buổi kick-off**
- [x] Thiết kế template import Excel + script import (`docs/asset-import-template.md`)
- [x] Seed data 50+ asset theo cây Plant → Line → Machine → Sensor: 50 asset
      production-like (1 plant, 3 line, 20 machine, 26 sensor); không tuyên bố là inventory MKZ đã xác minh
      và parent-type matrix được khóa tại business service cho cả API/Excel import

**Deliverables:** SQL schema, import template và catalog demo 50 asset đã giao;
inventory thiết bị MKZ thật vẫn cần owner dữ liệu xác minh

### Sprint C2 (Tuần 3-4): Asset CRUD API + Liên kết Document
- [x] REST API: `GET/POST/PUT/DELETE /api/assets` cho catalog-native asset
- [x] Tree query theo parent_id
- [x] Link document (manual, drawing, warranty) với asset — metadata API; pgvector binary sync deferred
- [x] Search asset theo tên/loại/metadata

**Deliverables:** API + unit test (xUnit) — **đã merge** (PR #16, #18, #19)

### Sprint C3 (Tuần 5-6): Asset Health Score
- [x] Công thức: Uptime 40% + Alarm frequency 30% + Performance vs baseline 20% + Maintenance overdue 10%
- [x] Job tính định kỳ (mỗi 15 phút), lưu vào `asset_metrics` (`HealthScoringJob`)
- [x] Kết hợp input alert/prediction từ Agent B (baseline z-score + alert frequency)
- [x] API: `GET /api/v1/assets/{id}/health` (+ history/compute, machine health)

**Deliverables:** Scheduled job, API, tài liệu công thức — **đã merge** (PR #20; phase2 services)

### Sprint C4 (Tuần 7-8): Access Control & Hardening
- [x] Role-based access control JWT (`ADMIN`/`ENGINEER`/`GUEST`) với authenticated fallback cho API và SignalR
- [x] Global/login/health rate limiting, trusted-proxy handling, input bounds và lỗi RFC 7807
- [x] Security contract tests + independent local code review; managed ingress/pentest vẫn thuộc D4/staging gate

**Bàn giao cho các agent khác:**
- Asset schema + `asset_id` (Ngày 1-3, gấp — mọi agent khác chờ cái này)
- Asset CRUD API (Tuần 4, cho D làm Asset Browser UI)
- Health score API (Tuần 6, cho D hiển thị badge)


---

## 6. AGENT D — Frontend & QA Engineer
**Phụ trách:** UI components (Asset Browser, Dashboards, Charts), Integration/Performance/Security testing
**Nguồn gốc:** Component prompts (mục 7) + Testing prompts (mục 8) trong `prompt-framework.md`

### Sprint D1 (Tuần 1-2): UI Shell + Mock Integration
- [x] Không chờ backend — dựng UI shell với **mock API** theo contract đã chốt (asset_id, telemetry, event schema)
- [x] Layout tổng: Dashboard, Asset Browser, Alarms, Reports (Operations React stack + shared SSO)
- [ ] Storybook setup cho các component tái sử dụng

**Deliverables:** UI shell + mock data — **đã có**; Storybook còn mở

### Sprint D2 (Tuần 3-4): Asset Browser UI
- [x] Tree view phân cấp asset, search theo tên/loại/metadata (`AssetBrowserPage`)
- [x] Panel chi tiết: metadata, telemetry/alarm surface, document liên kết (baseline)
- [x] Tích hợp Asset CRUD API thật từ Agent C khi sẵn sàng (Tuần 4)

**Deliverables:** Asset Browser đã merge (PR #19); Playwright E2E browser 1/1 pass

### Sprint D3 (Tuần 5-6): Dashboards & Charts
- [x] Health score badge dashboard (màu theo ngưỡng đỏ/vàng/xanh) + machine health UI
- [x] Tích hợp Predictive Alert panel và RCA UI qua backend API có xác thực;
      chỉ operator được gọi RCA, UI ghi rõ basic correlation/chưa có LLM
- [x] Alert Center actions (ack/resolve), CSV export + Asset Browser health roll-up
- [x] Structured alert evidence drill-down + health history chart

**Deliverables:** Dashboard alert/health/RCA slice + SSO demo; evidence/history/RCA
component tests đã pass, full-stack E2E thật vẫn thuộc D4

### Sprint D4 (Tuần 7-9): Testing toàn diện
- [x] **Performance test:** Query 1 tuần data / 50 máy / 10 metric — local
      database gate dùng pgbench với 1.008.500 điểm đạt p95 292,50 ms,
      247,42 query/s và 0 lỗi; HTTP/MQTT performance vẫn là boundary riêng
- [ ] **Integration test E2E:** PLC (mock) → Backend → TimescaleDB → Event → AI agent → Frontend (Docker Compose stack)
- [ ] **Security audit:** SQLi, XSS, CSRF, JWT, rate limiting, HTTPS, secrets (OWASP ZAP + manual pentest), phối hợp Agent C
- [ ] Tổng hợp báo cáo lỗi, ưu tiên fix trước go-live

**Deliverables:** Test suite đầy đủ, performance report, security audit report

### Sprint D5 (Tuần 10): Go-live support
- [ ] Regression test toàn hệ thống
- [ ] Tài liệu hướng dẫn người dùng (screenshots, use case, FAQ)


---

## 7. Điểm đồng bộ (Sync Checkpoints)

| Checkpoint | Deadline | Accountable owner | Deliverable bắt buộc để qua gate | Contributors | Status 2026-07-28 |
|---|---|---|---|---|---|
| **Sync W2** | Cuối tuần 2 | **C · Core backend** | Contract v1 cho asset/telemetry/event/API được versioned; A bàn giao telemetry schema thật; contract test pass. | A, B, D | ✅ Done (PR #16, #18, #19) |
| **Sync W5** | Cuối tuần 5 | **D · Frontend & QA** | Event/alert API (B) và Asset CRUD API (C) có trên integration environment; UI dùng API thật, kèm một E2E happy-path pass. | B, C | 🟡 Local pass — File Watcher/ERP/CEP/UI/Playwright/latency đã có evidence; managed staging còn mở |
| **Integration W8** | Cuối tuần 8 | **D · Frontend & QA** | PLC mock → Data → Event/AI → Backend → UI chạy end-to-end; báo cáo test và danh sách known risks được lưu. | A, B, C | ⬜ Planned |
| **Go-live W10** | Cuối tuần 10 | **Deployment Owner / Platform Operations Lead** | Regression pass; security và data/source owner sign-off; managed-staging acceptance; rollout và rollback owner được nêu tên. | A, B, C, D | ⬜ Needs approval / managed staging |

Owner chỉ đóng gate khi deliverable và link evidence đã được lưu; thiếu một mục thì checkpoint giữ trạng thái blocked.

**Quy tắc phối hợp:**
- Mỗi agent làm việc trên nhánh riêng (`feature/agent-a-timescaledb`, `feature/agent-b-cep`, ...), PR nhỏ, review chéo.
- Dùng mock/contract-first để không ai bị block chờ agent khác quá 2-3 ngày.
- Báo cáo tiến độ dạng ngắn mỗi cuối sprint (2 tuần): Done / Blocked / Next.

---

## 8. Rủi ro liên-agent cần theo dõi

| Rủi ro | Ảnh hưởng | Giảm thiểu |
|---|---|---|
| C chậm giao asset schema (Tuần 1-3) | Block cả A, B, D vì đều cần `asset_id` | Ưu tiên tuyệt đối Sprint C1, review draft schema trong 48h đầu |
| A migrate TimescaleDB lỗi dữ liệu | B/D dùng data sai để test | Dual-write + validation query trước khi cutover (Sprint A2) |
| B chọn sai Flink/Drools giữa chừng | Đổi event schema, ảnh hưởng D | Chốt kiến trúc cuối Sprint B1 (Tuần 2), không đổi sau đó |
| D test phát hiện lỗi bảo mật muộn (Tuần 8) | Delay go-live | D nên chạy security scan sớm hơn (từ Tuần 5) trên các API đã có, không chờ hết |

---

## 9. Tổng kết

- **Thời gian:** ~10 tuần (so với 18 tuần chạy tuần tự) nhờ chạy 4 luồng song song
- **Điều kiện thành công:** Chốt Shared Contracts ngay Ngày 1 và Agent C giao asset schema sớm (Tuần 1-3) vì đây là điểm nghẽn chung — **đã đạt** cho W2
- **Tiến độ 2026-07-28:** 4/4 implementation lane đã đạt local gate; bottleneck còn lại = ERP/MES thật, managed TLS/secrets/backup-restore và independent staging acceptance
- **Nguồn tham khảo chi tiết từng task:** xem `docs/cdf-features-analysis.md` (phân tích chức năng), `docs/prompt-framework.md` (prompt mẫu), `docs/roadmap.html` (status board), `docs/phase2-progress.md` (Phase 2 checklist)
