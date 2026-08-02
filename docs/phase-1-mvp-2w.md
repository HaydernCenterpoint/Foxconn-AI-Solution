> ⚠️ **FILE NÀY ĐÃ BỊ THAY THẾ** — Source of truth mới là [`/PROJECT_PLAN.md`](../PROJECT_PLAN.md). File này chỉ giữ làm tham chiếu lịch sử (Phase 1 đã done).

# Phase 1 MVP — 2 tuần

> Chốt ngày: 2026-07-22
> Scope: Shared contracts + data/asset plane tối thiểu đóng gate
> Không làm: health score, predictive, connectors, production cutover, full security audit

## Mục tiêu

Contract v1 ổn định, Asset Browser dùng API thật, Timescale dual-write + rollup có evidence, CEP staging nhận event theo schema chốt, full demo không gãy.

## Đã có sẵn (đừng làm lại)

| Hạng mục | Evidence |
| --- | --- |
| Timescale A1 dual-write + backfill | `backend/Services/Timescale*`, `infrastructure/timescaledb/` |
| A2 SQL rollup/retention/columnstore | `infrastructure/timescaledb/002_a2_rollups_and_lifecycle.sql` |
| Asset CRUD/search/tree | `backend/Controllers/AssetController.cs` |
| Contract files | `contracts/v1/*`, `fusion-contracts/ContractV1.cs` |
| Asset Browser page | `frontend/src/pages/AssetBrowserPage.tsx` |
| CEP publisher + staging | `backend/Services/CepStagingPublisher.cs`, `infrastructure/cep-staging/` |
| Demo cover tree/Timescale/CEP | `infrastructure/demo/Start-FullDemo.ps1`, `Test-FullDemo.ps1` |

Master-plan checklist đang lệch thấp hơn code — khi đóng story, tick theo evidence.

## Cắt khỏi MVP (Phase 1.1 / full)

- CSV/Excel import
- Seed ≥50 assets formal
- Document link metadata đầy đủ
- Read-flag tách phức tạp (ADR "not yet" đủ)
- >5 CEP rules
- Compression % formal target

## Tuần 1

### P1-A Contracts

- [x] **A1** Publish/chốt Contract V1 (asset/telemetry/event/error) trong shared package + `contracts/v1`
- [x] **A2** Unit test bất biến: UUID ownership, type normalize, event required fields, telemetry identity → CI

**AC:** version cố định; đổi field bắt buộc = version bump; tests green.

### P1-B Timescale evidence

- [x] **B1** Confirm migration hypertable + CAGG + retention/compression idempotent
- [x] **B4** Proof endpoints raw + hourly khi enabled; disabled an toàn
- [x] **B5** Rollback drill: `Timescale:Enabled=false`, PG path intact, ghi evidence

**AC:** dual-write + rollup proof chạy được; rollback logged.

### P1-C Asset tối thiểu

- [x] **C1** Tree + filter type/code/name/parent ổn định (seed tối thiểu, không bắt ≥50)

**AC:** `/api/assets/tree` + browser load; machine/line UUID không đổi.

### P1-D CEP schema + publisher

- [x] **D1** Event schema v1 + mapping từ telemetry ops
- [x] **D2** Publisher queue/drop/log; never rollback primary

**AC:** schema documented; fail CEP không ảnh hưởng MQTT accept.

### P1-E Browser API thật

- [x] **E1** AssetBrowser tree/search/detail không mock happy-path

**AC:** chọn node → detail từ API; dashboard không phụ thuộc Timescale cutover.

## Tuần 2

### P1-B (tiếp)

- [x] **B2** Benchmark 3 query: 24h/1 machine, 7d/line, hourly multi-machine (p95 hoặc waiver+owner)
- [x] **B3** Reconcile checklist: count source/target, watermark, duplicate query (1 page)

### P1-D (tiếp)

- [x] **D3** Compose staging + **5 rules** (threshold, multi-event window, production drop)
- [x] **D4** Events API by asset_id + smoke MQTT→CEP
- [x] **D5** ADR 1 trang: giữ engine hiện tại vs Flink/Drools ở Phase 2

### P1-E (tiếp)

- [x] **E2** Telemetry gần nhất + active alarms theo asset
- [x] **E3** Role gate create/update/delete
- [x] **E4** empty/loading/error + i18n/tests; asset API fail không block dashboard

### P1-F Gate

- [x] **F1** Demo flags: asset UUID parity bắt buộc; Timescale/CEP optional/flagged
- [x] **F2** Contract tests trong CI
- [x] **F3** Close checklist + link evidence; sync tick `docs/master-plan-4-agents.md` cho mục đã chứng minh

## Definition of Done (MVP)

1. Contract v1 + tests CI green
2. Asset Browser usable trên API thật
3. Timescale dual-write + rollup proof + rollback evidence
4. CEP staging smoke theo schema chốt
5. Full demo pass (login/demo/ODF capture path không regress)

## Owner gợi ý

| Lane | Việc |
| --- | --- |
| A Data | B1–B5 |
| B Event | D1–D5 |
| C Backend | A1–A2, C1 |
| D FE/QA | E1–E4, F1–F3 |

## Sau MVP (không làm trong 2 tuần này)

- Phase 1.1: import CSV, seed ≥50, document links
- Phase 2: alerts/health/predictive/connectors
- Phase 3: hardening/E2E/pilot

## Gate ra quyết định

| Kết quả | Điều kiện |
| --- | --- |
| **Go Phase 2** | 5 DoD items có evidence |
| **Extend 1 tuần** | thiếu B evidence hoặc CEP smoke hoặc browser role gate |
| **No-go** | demo gãy / contract drift / dual-write phá hot path |
