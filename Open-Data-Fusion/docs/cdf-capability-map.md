# Bản đồ năng lực & API: Cognite Data Fusion → Open Data Fusion

> **Trạng thái:** Draft — tài liệu tham chiếu (không phải ADR phê duyệt triển khai).
> **Mục đích:** Xương sống để định hướng đưa ODF thành một *open equivalent* (tương đương mã nguồn mở) của CDF bằng phương pháp clean‑room. Không phải bản sao 1:1; mọi triển khai đều viết mới, dựa trên tài liệu công khai của CDF và giữ guardrail IP trong `README`/`NOTICE`.
> **Chú thích trạng thái ODF:** `✅ AVAILABLE` · `🟡 OPTIONAL` · `🧱 FOUNDATION` · `🚧 GATED` · `⬜ MISSING` (theo legend chính thức trong `Open-Data-Fusion/README.md`).
>
> **Tham chiếu khóa:** ADR [`0007-data-modeling-and-bounded-graph-query.md`](architecture/0007-data-modeling-and-bounded-graph-query.md) · plan [`superpowers/plans/2026-07-17-data-modeling-query.md`](superpowers/plans/2026-07-17-data-modeling-query.md) · pilot gate [`operations/production-pilot-gate.md`](operations/production-pilot-gate.md) · roadmap `README.md` § Roadmap.

---

## Tổng quan cấu trúc

| Phần | Nội dung |
| --- | --- |
| §1 | Bản đồ theo nhóm năng lực CDF → trạng thái ODF |
| §2 | Đối chiếu API cụ thể (endpoint CDF ↔ endpoint/giao thức ODF) |
| §3 | Khoảng cách lớn nhất (gaps) theo ưu tiên |
| §4 | Đề xuất thứ tự triển khai (phù hợp roadmap hiện tại) |

---

## §1 — Bản đồ năng lực CDF → ODF

Nguồn CDF: các nhóm API/năng lực công khai tại `docs.cognite.com`. Đây là mức *outcome-level*, không mô tả implementation của Cognite.

### Nhóm Dữ liệu công nghiệp (Industrial Data / Core)

| Năng lực CDF | Trạng thái ODF | Ghi chú ODF |
| --- | --- | --- |
| Assets (hệ thống cấp bậc tài sản) | ✅ AVAILABLE | `GET /api/v1/assets/:id`, hierarchy, properties |
| Time series + Data points (raw/latest/as-of/aggregate) | ✅ AVAILABLE | `telemetry/raw`, `/latest`, `/aggregate`; quality propagation |
| Events (time-window events, alarms) | ⬜ MISSING | Chưa có schema/API event chuyên dụng; alarms hiện qua context/review, không phải Events API |
| Sequences (mảng song song dữ liệu) | ⬜ MISSING | Chưa có kiểu sequence riêng |
| Files / Object storage (governed objects) | ✅ AVAILABLE | Upload/download phiên bản, SHA‑256, ETag, SSE; S3‑compatible trên PG |
| Relationships (industrial relations) + Provenance | ✅ AVAILABLE | Quan hệ + provenance trên ingest/Explorer; evidence bắt buộc |
| Advanced graph / relationship query | 🧱 FOUNDATION | Query chuyên sâu / graph traversal gắn Data Models (ADR 0007), chưa product-default |
| Labels / classification | 🧱 FOUNDATION | Có khái niệm property; chưa taxonomy mở như CDF |
| Data Models / Views (containers, views, data models, spaces) | 🧱 FOUNDATION | ADR 0007 + contracts/plan REST đã khóa; PG tables + compatibility routes; full ModelGraph service/UI cutover còn gated (`ODF_MODEL_GRAPH_API_ENABLED`). **Không GraphQL** (non-goal ADR 0007) |

### Nhóm Tích hợp & Biến đổi (Ingestion / Pipelines)

| Năng lực CDF | Trạng thái ODF | Ghi chú ODF |
| --- | --- | --- |
| Edge adapters (CSV / PostgreSQL / OPC UA) | 🟡 OPTIONAL | Read-only edge agent; cần cấu hình + pilot ngoài CI |
| Connector plugin framework / SDK | ⬜ MISSING | Chưa framework plugin mở để cộng đồng đóng góp adapter |
| Transformations (SQL-based) | 🚧 GATED | Surface "Pipelines" có version/trigger/run history nhưng scoped |
| Data Workflows (orchestration + retry + trigger) | 🚧 GATED | Chưa orchestrator đầy đủ |
| Functions (serverless jobs) | ⬜ MISSING | Chưa có |
| Raw extraction / raw store | ✅ AVAILABLE | Landing bất biến + replay + quarantine |
| Data pipelines (20230101) | 🧱 FOUNDATION | Khái niệm pipeline có, đầy đủ còn gated |

### Nhóm Contextualization & Giác quan (Spatial/3D/Vision)

| Năng lực CDF | Trạng thái ODF | Ghi chú ODF |
| --- | --- | --- |
| Contextualization (entity matching + review) | 🚧 GATED | Candidate assertion, score/evidence, approve/reject; đúng triết lý review trước tin cậy |
| Entity Matching (matching proposal) | 🚧 GATED | Precision/recall/F1, tự động đề xuất, approve thủ công |
| P&ID / Diagram annotation (CV) | ⬜ MISSING | ODF dùng text/tag, **không có computer vision** |
| 3D / Reveal (industry visualization) | ⬜ MISSING | Spatial chỉ là review workflow transform 4×4, không phải engine 3D |
| AR / VR | ⬜ MISSING | — |

### Nhóm AI & Hợp tác (AI / Collaboration)

| Năng lực CDF | Trạng thái ODF | Ghi chú ODF |
| --- | --- | --- |
| Industrial AI agents / Copilot | ⬜ MISSING | Ngoài phạm vi ODF (Odysseus/Factory AI trong monorepo khác) |
| Collaborative Canvas | ✅ AVAILABLE | Canvas phiên bản, optimistic concurrency, undo/redo, revision, rollback |
| Real-time collaboration (SSE/presence) | ✅ AVAILABLE | SSE `workspace.updated`, presence, roles owner/editor/reviewer/viewer |

### Nhóm Nền tảng & Vận hành (Governance / Platform)

| Năng lực CDF | Trạng thái ODF | Ghi chú ODF |
| --- | --- | --- |
| Access control (RBAC/ABAC, groups, capabilities) | 🟡 OPTIONAL | OIDC + PKCE, JWT bearer, server-side auth, project-scoped |
| Row-Level Security / tenancy | 🟡 OPTIONAL | Forced RLS trên PostgreSQL, membership-scoped discovery |
| Audit log | ✅ AVAILABLE | Append-only, event + revision histories |
| Tenants / projects / datasets | ✅ AVAILABLE | Tenants, projects, datasets; bootstrap tách biệt |
| Write-back (industrial action) | 🚧 GATED | Dry-run, allowlist, approval, external executor |
| Observability (metrics/logs/traces) | 🟡 OPTIONAL | Prometheus, OTLP traces, Grafana, redacted logs |

---

## §2 — Đối chiếu API cụ thể

> Endpoint CDF được liệt kê theo **khái niệm** của tài liệu công khai; không copy schema hay tên chính xác của nền tảng thương mại. Cột ODF ghi endpoint/giao thức **thực tế trong repo** (`apps/api`, `apps/web`).
>
> §2 là **partial map** — mở rộng theo từng slice; không phải inventory đầy đủ mọi surface.

### 2.1 Assets & hierarchy

| CDF (khái niệm) | ODF (thực tế) | Trạng thái |
| --- | --- | --- |
| Assets CRUD + hierarchy | `GET /api/v1/assets/:id`, ingest qua `POST /api/v1/ingest/bundle` | ✅ |
| Asset search / browse | `GET /api/v1/platform/search` + `explorer` | ✅ |

### 2.2 Time series & data points

| CDF (khái niệm) | ODF (thực tế) | Trạng thái |
| --- | --- | --- |
| List time series on asset | `GET /api/v1/assets/:id/telemetry/latest` | ✅ |
| Raw data points | `GET /api/v1/assets/:id/telemetry/raw` | ✅ |
| Aggregates (avg/max/min...) | `GET /api/v1/assets/:id/telemetry/aggregate` | ✅ |
| Write datapoints | qua `ingest/bundle` (idempotent) | ✅ |

### 2.3 Ingestion & evidence

| CDF (khái niệm) | ODF (thực tế) | Trạng thái |
| --- | --- | --- |
| Idempotent ingest / extraction run | `POST /api/v1/ingest/bundle` (runId, `already_processed`, 409) | ✅ |
| Raw landing + replay | raw store + `content-<sha256>` keys | ✅ |
| Governed objects upload/download | streamed, SHA‑256, ETag, ranges | ✅ |

### 2.4 Canvas & collaboration

| CDF (khái niệm) | ODF (thực tế) | Trạng thái |
| --- | --- | --- |
| Workspace CRUD | `POST /api/v1/workspaces` | ✅ |
| Semantic operations (batch) | `POST .../operations` (move/add/update/remove node & edge) | ✅ |
| Optimistic concurrency | `expectedVersion`, stale → 409 | ✅ |
| Revision & rollback | immutable revision, append-only rollback | ✅ |
| Live updates | SSE `workspace.updated`, presence | ✅ |

### 2.5 Platform & governance

| CDF (khái niệm) | ODF (thực tế) | Trạng thái |
| --- | --- | --- |
| Tenants / projects discovery | `GET /api/v1/platform/tenants`, `/projects` (membership-scoped) | ✅ |
| Admin (create) | `POST /api/v1/platform/tenants` + bootstrap | 🟡 |
| Search across surfaces | `GET /api/v1/platform/search` | ✅ |
| Contextualization review | surface `context`, `matching`, `diagrams`, `spatial` | 🚧 |
| Write-back | surface `writeback` (policy-gated, external executor) | 🚧 |
| Audit | surface `audit` | ✅ |

### 2.6 Data Models (REST — theo ADR 0007 / plan)

| CDF (khái niệm) | ODF (thực tế / planned contract) | Trạng thái |
| --- | --- | --- |
| Data model versions + views | `GET/POST /api/v1/platform/data-models…` (compatibility + ModelGraph) | 🧱 |
| Instance upsert | `POST .../instances/upsert` | 🧱 |
| Bounded query / traverse / aggregate | `POST .../instances/{query,traverse,aggregate}` | 🧱 |
| GraphQL / arbitrary client schema | — | ⬜ intentionally out (ADR 0007 non-goal) |

---

## §3 — Khoảng cách lớn nhất (gaps) theo ưu tiên

**Ưu tiên cao (đóng góp nhiều giá trị nhất cho "open equivalent"):**

1. 🟥 **Data Models service product cutover** — contract REST + ADR 0007 đã khóa; cần wire persistence/UI/default enable theo plan, **không** thêm GraphQL. Hiện `🧱 FOUNDATION`.
2. 🟥 **Connector plugin framework** — edge 3 adapter cứng; cần SDK + registry để cộng đồng đóng góp adapter (`⬜ MISSING`).
3. 🟧 **Transformations / Data Workflows** — pipeline `🚧 GATED`; orchestrator + retry + deterministic run history.

**Ưu tiên trung bình:**

4. 🟨 **Entity Matching / Contextualization** nâng cao (rule → ML) — vẫn "review trước tin cậy".
5. 🟨 **Events & Sequences** — mở rộng loại bản ghi thời gian core.
6. 🟨 **Labels / taxonomy** — phân loại thuộc tính mở.

**Ưu tiên thấp / viễn cảnh (pilot-gated theo roadmap):**

7. ⬜ P&ID vision, OCR, 3D/Reveal, AR/VR.
8. ⬜ Industrial AI copilot (ngoài ODF).
9. ⬜ Serverless Functions.
10. ⬜ GraphQL facade / schema canvas (chỉ khi pilot yêu cầu; không block core).

> Lưu ý: *thu hẹp khoảng cách* không bắt buộc theo thứ tự trên; ODF chủ trương **chất lượng/độ sâu trên tập con** hơn đua độ rộng. Giữ các box "intentionally gated" (3D, vision, write-back, ML autonomous) cho tới pilot thực tế.

---

## §4 — Đề xuất thứ tự triển khai (phù hợp roadmap hiện tại)

**Giai đoạn A — Hoàn thiện core đang có (không thêm tính năng lớn):**

- Đóng managed-staging gates còn trong `README` (backup/restore ngoài CI, connector thật ngoài CI, ingress mTLS, secret manager, retention) — xem [`production-pilot-gate.md`](operations/production-pilot-gate.md).
- Ổn định PostgreSQL + RLS + outbox cho toàn bộ surface hiện tại.

**Exit A:** 16 managed pilot checks attested; không synthetic-only.

**Giai đoạn B — Nền tảng mở (đầu ra chiến lược), tuần tự:**

1. **Data Models service (REST)** — theo ADR 0007 / plan 2026-07-17.
   - *Exit B1:* publish model version + views; atomic instance upsert; bounded query/traverse/aggregate trên SQLite **và** PostgreSQL; auth/RLS/audit/outbox; Model Explorer tabs; **không** GraphQL/Neo4j.
2. **Connector framework** — plugin SDK + registry; giữ checkpoint/idempotency/audit; pilot vẫn validate 3 adapter built-in.
   - *Exit B2:* 1 plugin mẫu ngoài 3 adapter built-in; registry + audit path.
3. **Transformations / Workflows** — SQL/dbt-style job, retry, deterministic run history.
   - *Exit B3:* run history deterministic; retry; không cần full CDF Functions.

**Giai đoạn C — Mở rộng có điều kiện (có pilot mới làm):**

- Matching/contextualization nâng cao (ML), Events/Sequences, Labels taxonomy.
- 3D/vision/AI copilot / GraphQL / schema canvas chỉ sau core ổn và nhu cầu thực chứng minh.

---

## Ràng buộc IP & License (bắt buộc khi triển khai mọi phần trên)

- Không copy mã/SDK/UI/branding của Cognite; chỉ dùng tài liệu công khai ở mức *outcome-level*.
- Implementation clean-room, có ADR ghi nguồn/quyết định cho mọi thay đổi public API/persistence/model.
- Apache-2.0, SBOM/SPDX scan, NOTICE, security scan trước phát hành.
- Tham chiếu: `docs/architecture/0003-clean-room-branding.md`, `NOTICE`, `open-data-fusion-technical-report-source.md` (phần "Guardrails sở hữu trí tuệ và giấy phép").
