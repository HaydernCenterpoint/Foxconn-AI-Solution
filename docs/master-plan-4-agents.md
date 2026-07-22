# Kế hoạch Tổng hợp: Xây dựng Industrial IoT Platform (MKZ Factory Monitor)
## Chia việc cho 4 Sub-agent làm song song

> **Ngày:** 2026-07-09
> **Nguồn:** Tổng hợp từ `cdf-features-analysis.md` + `prompt-framework.md`
> **Mục tiêu:** Chia 18 tuần roadmap thành 4 luồng công việc chạy song song, giảm thời gian còn ~8-10 tuần

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
1. `asset_id`: UUID — **đã chốt** (`fusion-contracts/AssetCatalogContract.cs`): MACHINE/LINE id = ops UUID; root plant code `MKZ-PLANT`; catalog-owned: PLANT/AREA/SENSOR
2. `telemetry` schema: `(time, asset_id, metric, value)` — `asset_id` = `Machine.Id` (chưa đổi bảng telemetry trong slice này)
3. `event` schema (Avro/JSON): `(event_id, timestamp, asset_id, type, severity, payload)` — Agent B định nghĩa (chưa freeze production CEP)
4. API convention: REST, `/api/assets` (v1 catalog), JWT Bearer cho write; list/get AllowAnonymous

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
- [ ] Setup TimescaleDB instance (Docker, dev/staging)
- [ ] Design hypertable schema cho `telemetry` (chunk interval 1 ngày)
- [ ] Viết migration script từ PostgreSQL hiện tại
- [ ] Implement dual-write middleware (ghi đồng thời cả 2 DB trong giai đoạn chuyển tiếp)
- [ ] Backfill script cho dữ liệu lịch sử (có progress tracking, resumable)

**Deliverables:** SQL migration script, dual-write middleware (C#/Python), backfill tool

### Sprint A2 (Tuần 3-4): Optimization & Continuous Aggregates
- [ ] Continuous aggregates (rollup theo giờ/ngày)
- [ ] Compression policy (mục tiêu >80%)
- [ ] Retention policy (raw 30 ngày, aggregate 1 năm)
- [ ] Benchmark & tối ưu 3 query chậm nhất hiện tại (mục tiêu <500ms p95)
- [ ] Cutover: chuyển toàn bộ read traffic sang TimescaleDB, deprecate PostgreSQL cũ

**Deliverables:** Compression config, benchmark report trước/sau, rollback plan

### Sprint A3 (Tuần 5-7): Data Integration Connectors
- [ ] ERP connector (poll API, incremental sync theo `last_modified_at`)
- [ ] File watcher cho báo cáo Excel/CSV thủ công (thư mục mạng, validate, import)
- [ ] MES connector (nếu có sẵn API/DB truy cập được)
- [ ] Error handling: dead-letter queue, retry logic, thông báo lỗi (email/Slack)

**Deliverables:** 2-3 connector services (Python), cấu hình, mapping documentation

### Sprint A4 (Tuần 8): Integration Dashboard
- [ ] API quản lý connector (status, last sync, retry/pause)
- [ ] Phối hợp với Agent D để hiển thị dashboard tình trạng tích hợp

**Bàn giao cho các agent khác:**
- Schema `telemetry` (Tuần 1, để B/C/D mock theo)
- Connector status API (Tuần 7, để D làm dashboard)


---

## 4. AGENT B — Event Processing & AI/ML Engineer
**Phụ trách:** Complex Event Processing, Predictive Alerts, ML models, Root Cause Analysis
**Nguồn gốc:** Phase 2 + Phase 5 trong roadmap gốc

### Sprint B1 (Tuần 1-2): Thiết kế CEP & Mock Data
- [ ] Không chờ Agent A — dùng **mock telemetry stream** theo schema đã chốt Ngày 1
- [ ] Đánh giá Apache Flink vs Drools (ma trận ưu/nhược điểm, quyết định kiến trúc)
- [ ] Định nghĩa event schema (Avro/JSON): `event_id, timestamp, asset_id, type, severity, payload`
- [ ] Viết 5-10 rule mẫu (VD: "3 máy cùng line lỗi trong 5 phút", "sản lượng giảm >20% so cùng giờ hôm qua")

**Deliverables:** Architecture decision doc, event schema, rule set mẫu

### Sprint B2 (Tuần 3-4): Setup Engine & Alarm Migration
- [ ] Setup Flink/Drools trên staging
- [ ] Migrate alarm rules cũ (threshold-based) sang engine mới
- [ ] Đo latency event→alert (mục tiêu <1s)
- [ ] Tích hợp input thật từ Agent A khi TimescaleDB sẵn sàng (Tuần 3+)

**Deliverables:** CEP engine chạy trên staging, migration report

### Sprint B3 (Tuần 5-6): Predictive Alerting (ML)
- [ ] EDA trên dữ liệu sensor (temperature, vibration, current draw) 3 tháng
- [ ] Feature engineering (rolling stats: mean/std/max theo 1h, 24h)
- [ ] Huấn luyện model anomaly detection (Isolation Forest / Autoencoder) và/hoặc
      classification "failure trong 1 giờ tới" (mục tiêu precision >85%, recall >80%)
- [ ] Inference service (FastAPI, latency <100ms)

**Deliverables:** Notebook EDA + training, inference API, model monitoring cơ bản

### Sprint B4 (Tuần 7-8): Root Cause Analysis
- [ ] Event correlation graph (backward tracing từ alarm về nguồn gốc)
- [ ] Tích hợp LLM (dùng lại AI agent có sẵn trong `factory-ai-platform/gateway`) để giải thích bằng ngôn ngữ tự nhiên
- [ ] API trả kết quả RCA cho Agent D hiển thị

**Bàn giao cho các agent khác:**
- Event schema (Tuần 1)
- RCA API (Tuần 7, cho D làm UI)
- Alert/prediction API (Tuần 6, cho C tích hợp vào asset health score)


---

## 5. AGENT C — Asset Modeling & Core Backend Engineer
**Phụ trách:** Asset hierarchy schema, Asset CRUD API, Health Score, Access Control
**Nguồn gốc:** Phase 3 trong roadmap gốc + phần API nền tảng

### Sprint C1 (Tuần 1-2): Asset Schema (ưu tiên số 1 — mọi agent phụ thuộc vào đây)
- [x] Chốt schema `assets` và `asset_relationships` (DDL + sync triggers trong `DatabaseService`; ops LINE/MACHINE mirror UUID)
- [ ] Chốt schema `asset_documents` (ngoài slice catalog v1)
- [x] Publish schema này cho A/B/D dùng làm `asset_id` reference (`AssetCatalogContract` + contract tests)
- [ ] Thiết kế template import Excel + script import
- [ ] Seed data 50+ asset thực tế (Plant → Line → Machine → Sensor) cho nhà máy MKZ — hiện seed/backfill từ ops + plant root

**Deliverables:** SQL schema final, Excel template, seed data — **giao Ngày 1-3, gấp nhất**

### Sprint C2 (Tuần 3-4): Asset CRUD API + Liên kết Document
- [x] REST API: `GET/POST/PUT/DELETE /api/assets` cho catalog-native asset (PLANT/AREA/SENSOR); LINE/MACHINE qua ops API
- [ ] Tree query theo parent_id (filter parentId trên list đã có; endpoint tree riêng deferred)
- [ ] Link document (manual, drawing, warranty) với asset — tận dụng `document-service` (pgvector) đã có
- [x] Search asset theo tên/loại/metadata (`GET /api/assets?q=&type=&parentId=`)

**Deliverables:** API + Swagger docs, unit test (xUnit)

### Sprint C3 (Tuần 5-6): Asset Health Score
- [ ] Công thức: Uptime 40% + Alarm frequency 30% + Performance vs baseline 20% + Maintenance overdue 10%
- [ ] Job tính định kỳ (mỗi 15 phút), lưu vào `asset_metrics`
- [ ] Kết hợp input alert/prediction từ Agent B (Tuần 6+)
- [ ] API: `GET /api/v1/assets/{id}/health`

**Deliverables:** Scheduled job, API, tài liệu công thức

### Sprint C4 (Tuần 7-8): Access Control & Hardening
- [ ] Role-based access control (JWT + scopes) cho toàn bộ API asset/telemetry
- [ ] Rate limiting, input validation, chuẩn hóa lỗi RFC 7807
- [ ] Phối hợp Agent D cho security testing (mục 8.3 trong `prompt-framework.md`)

**Bàn giao cho các agent khác:**
- Asset schema + `asset_id` (Ngày 1-3, gấp — mọi agent khác chờ cái này)
- Asset CRUD API (Tuần 4, cho D làm Asset Browser UI)
- Health score API (Tuần 6, cho D hiển thị badge)


---

## 6. AGENT D — Frontend & QA Engineer
**Phụ trách:** UI components (Asset Browser, Dashboards, Charts), Integration/Performance/Security testing
**Nguồn gốc:** Component prompts (mục 7) + Testing prompts (mục 8) trong `prompt-framework.md`

### Sprint D1 (Tuần 1-2): UI Shell + Mock Integration
- [ ] Không chờ backend — dựng UI shell với **mock API** theo contract đã chốt (asset_id, telemetry, event schema)
- [ ] Layout tổng: Dashboard, Asset Browser, Alarms, Reports (tận dụng Odysseus/React 19 stack có sẵn)
- [ ] Storybook setup cho các component tái sử dụng

**Deliverables:** UI shell chạy được với mock data, Storybook

### Sprint D2 (Tuần 3-4): Asset Browser UI
- [ ] Tree view phân cấp asset (react-arborist), search theo tên/loại/metadata
- [ ] Panel chi tiết: metadata, telemetry gần nhất (chart), alarm đang active, document liên kết
- [ ] Tích hợp Asset CRUD API thật từ Agent C khi sẵn sàng (Tuần 4)

**Deliverables:** Asset Browser hoàn chỉnh, E2E test cơ bản (Playwright)

### Sprint D3 (Tuần 5-6): Dashboards & Charts
- [ ] ProductionChart, DowntimeAnalysis, health score badge (màu theo ngưỡng đỏ/vàng/xanh)
- [ ] Tích hợp Predictive Alert + RCA UI (dùng API từ Agent B)
- [ ] Export CSV, drill-down khi click vào data point

**Deliverables:** Dashboard pages, unit test (Jest + RTL)

### Sprint D4 (Tuần 7-9): Testing toàn diện
- [ ] **Performance test:** Query 1 tuần data / 50 máy / 10 metric — mục tiêu <500ms p95, >100 query/s (dùng k6/JMeter, phối hợp Agent A)
- [ ] **Integration test E2E:** PLC (mock) → Backend → TimescaleDB → Event → AI agent → Frontend (Docker Compose stack)
- [ ] **Security audit:** SQLi, XSS, CSRF, JWT, rate limiting, HTTPS, secrets (OWASP ZAP + manual pentest), phối hợp Agent C
- [ ] Tổng hợp báo cáo lỗi, ưu tiên fix trước go-live

**Deliverables:** Test suite đầy đủ, performance report, security audit report

### Sprint D5 (Tuần 10): Go-live support
- [ ] Regression test toàn hệ thống
- [ ] Tài liệu hướng dẫn người dùng (screenshots, use case, FAQ)


---

## 7. Điểm đồng bộ (Sync Checkpoints)

| Checkpoint | Tuần | Nội dung | Ai tham gia |
|---|---|---|---|
| **Kickoff** | Ngày 1 | Chốt Shared Contracts (asset_id schema, telemetry schema, event schema, API convention) | A, B, C, D |
| **Sync W2** | Tuần 2 | C giao asset schema final cho A/B/D; A giao telemetry schema thật (thay mock) | A, C, D |
| **Sync W5** | Tuần 5 | B giao event/alert API; C giao Asset CRUD API; D bắt đầu tích hợp thật thay mock | B, C, D |
| **Integration W8** | Tuần 8 | Ghép nối toàn bộ: Data (A) → Event/AI (B) → Asset (C) → UI (D). Chạy thử end-to-end | A, B, C, D |
| **Go-live W10** | Tuần 10 | Regression test, security sign-off, deploy staging → production | A, B, C, D |

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
- **Điều kiện thành công:** Chốt Shared Contracts ngay Ngày 1 và Agent C giao asset schema sớm (Tuần 1-3) vì đây là điểm nghẽn chung
- **Nguồn tham khảo chi tiết từng task:** xem `docs/cdf-features-analysis.md` (phân tích chức năng) và `docs/prompt-framework.md` (prompt mẫu cho từng task)
