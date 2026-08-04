# Bản đồ năng lực & API: Cognite Data Fusion → Open Data Fusion

> **Trạng thái:** Draft — tài liệu tham chiếu (không phải ADR phê duyệt triển khai).
> **Mục đích:** Xương sống để định hướng đưa ODF thành một *open equivalent* (tương đương mã nguồn mở) của CDF bằng phương pháp clean‑room. Không phải bản sao 1:1; mọi triển khai đều viết mới, dựa trên tài liệu công khai của CDF và giữ guardrail IP trong `README`/`NOTICE`.
> **Chú thích trạng thái ODF:** `✅ AVAILABLE` · `🟡 OPTIONAL` · `🧱 FOUNDATION` · `🚧 GATED` · `⬜ MISSING` (theo legend chính thức trong `Open-Data-Fusion/README.md`).

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
| Events (time-window events, alarms) | 🧱 FOUNDATION | Nằm trong RG/context; chưa có API event chuyên dụng riêng |
| Sequences (mảng song song dữ liệu) | ⬜ MISSING | Chưa có kiểu sequence riêng |
| Files / Object storage (governed objects) | ✅ AVAILABLE | Upload/download phiên bản, SHA‑256, ETag, SSE; S3‑compatible trên PG |
| Relationships & Provenance | 🟡 OPTIONAL | Quan hệ + provenance có; query chuyên sâu còn gated |
| Labels / classification | 🧱 FOUNDATION | Có khái niệm nhưng chưa phải taxonomy mở như CDF |
| Data Models / Views (containers, views, data models, spaces) | ✅ AVAILABLE | ADR `0007`: model version (immutable), views, instances, filter/query/traversal/aggregate REST module, SQLite + PostgreSQL (RLS/outbox). Chưa schema canvas/GraphQL |

### Nhóm Tích hợp & Biến đổi (Ingestion / Pipelines)

| Năng lực CDF | Trạng thái ODF | Ghi chú ODF |
| --- | --- | --- |
| Extraction Pipelines (connector framework) | 🟡 OPTIONAL | Edge agent chỉ đọc CSV/PostgreSQL/OPC UA; chưa framework plugin mở |
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
| Industrial AI agents / Copilot | ⬜ MISSING | Ngoài phạm vi ODF (có ở monorepo khác như Odysseus/Factory AI, không thuộc ODF) |
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


---

## §3 — Khoảng cách lớn nhất (gaps) theo ưu tiên

**Ưu tiên cao (đóng góp nhiều giá trị nhất cho "open equivalent"):**

1. 🟥 **Connector framework plugin** — hiện chỉ 3 edge adapter cứng (CSV/PostgreSQL/OPC UA); cần SDK plugin + registry để cộng đồng đóng góp adapter. Đây là gap code-level lớn nhất còn trống.
2. 🟧 **Transformations / Data Workflows** — pipeline đang `🚧 GATED`; cần orchestrator + retry + run history hoàn chỉnh để sánh luồng "data op" của CDF.
3. 🟨 **Schema canvas / GraphQL facade cho Data Models** — core Data Models đã có (ADR 0007, `✅`); phần còn thiếu là UI trực quan hoá schema & query GraphQL.

**Ưu tiên trung bình:**

4. 🟨 **Entity Matching / Contextualization tự động** (mở rộng từ score rule-based → ML) — nhưng vẫn giữ "review trước tin cậy".
5. 🟨 **Events & Sequences** — mở rộng loại bản ghi thời gian của core.
6. 🟨 **Labels/taxonomy** — phân loại tài sản thuộc tính mở.

**Ưu tiên thấp / viễn cảnh (nên để pilot-gated theo đúng roadmap):**

7. ⬜ P&ID vision, OCR, 3D/Reveal, AR/VR.
8. ⬜ Industrial AI copilot.
9. ⬜ Serverless Functions.

> Lưu ý: việc *thu hẹp khoảng cách* không bắt buộc theo thứ tự trên; ODF chủ trương **chất lượng/độ sâu trên tập con** hơn là đua độ rộng. Khuyến nghị giữ nguyên các box "intentionally gated" hiện tại (3D, vision, write-back, ML autonomous) cho tới khi có pilot thực tế.

---

## §4 — Đề xuất thứ tự triển khai (phù hợp roadmap hiện tại)

**Giai đoạn A — Hoàn thiện core đang có (không thêm tính năng lớn):**
- Đóng các managed-staging gate đang còn trong `README` (backup/restore ngoài CI, connector thật ngoài CI, ingress mTLS, secret manager, retention).
- Ổn định PostgreSQL + RLS + outbox cho toàn bộ surface hiện tại.

**Giai đoạn B — Nền tảng mở (đầu ra chiến lược):**
1. **Connector framework**: plugin SDK + registry connector; giữ checkpoint/idempotency/audit. *(Data Models core đã xong — ADR 0007.)*
2. **Transformations/Workflows**: orchestrate SQL/dbt-style job, retry, deterministic run history.
3. **Data Models bổ sung**: schema canvas UI + GraphQL facade (tuỳ nhu cầu).

**Giai đoạn C — Mở rộng có điều kiện (có pilot mới làm):**
- Matching/contextualization nâng cao (ML), Events/Sequences, Labels taxonomy.
- 3D/vision/AI copilot chỉ sau khi core ổn định và có nhu cầu thực tế chứng minh.

---

## Ràng buộc IP & License (bắt buộc khi triển khai mọi phần trên)

- Không copy mã/SDK/UI/branding của Cognite; chỉ dùng tài liệu công khai ở mức *outcome-level*.
- Implementation clean-room, có ADR ghi nguồn/quyết định cho mọi thay đổi public API/persistence/model.
- Apache-2.0, SBOM/SPDX scan, NOTICE, security scan trước phát hành.
- Tham chiếu: `docs/architecture/0003-clean-room-branding.md`, `NOTICE`, `open-data-fusion-technical-report-source.md` (phần "Guardrails sở hữu trí tuệ và giấy phép").
