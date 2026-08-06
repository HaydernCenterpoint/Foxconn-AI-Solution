# FII AI / MKZ Factory Monitor — tài liệu dự án

> Tài liệu tổng hợp về mục tiêu, kiến trúc, chức năng, công nghệ, cách chạy và
> giới hạn vận hành của repository hiện tại.
>
> Cập nhật: **2026-08-05** · Phạm vi chính: **FII AI / MKZ Factory Monitor**.
> Odysseus/ được mô tả ở mức tích hợp tùy chọn và không phải thành phần lõi
> của FII theo PROJECT_PLAN.md.

## 1. Tóm tắt nhanh

FII AI (Foxconn AI Solution / MKZ Factory Monitor) là nền tảng giám sát nhà
máy triển khai tại chỗ. Hệ thống đọc dữ liệu từ PLC, chuyển qua MQTT, lưu dữ
liệu vận hành trong PostgreSQL và tùy chọn TimescaleDB, chạy luật sự kiện/CEP,
tính điểm sức khỏe và rủi ro hỏng, sau đó hiển thị trong Operations UI.

Luồng đồng bộ sang Open Data Fusion (ODF) nằm ngoài hot path MQTT: backend ghi
ý định vào transactional outbox, Fusion Adapter nhận lease và gửi bundle sang
ODF. ODF dừng hoặc lỗi không được làm dừng việc thu nhận telemetry cục bộ.

### Trạng thái phát hành

Repository hiện là **staging candidate, NO-GO cho production**. Bằng chứng local,
build hoặc test không thay thế được managed-staging gate. Nguồn quyết định hiện
hành là [docs/release-evidence/2026-07-31-go-nogo-status.md](release-evidence/2026-07-31-go-nogo-status.md)
và kế hoạch hợp nhất tại [PROJECT_PLAN.md](../PROJECT_PLAN.md).

Điều này có nghĩa:

- Có thể dùng demo, test, preview và integration rehearsal trong môi trường
  local/dev.
- Không được quảng bá hệ thống là production-ready chỉ vì các suite local
  pass.
- Production còn cần HTTPS ingress, secret manager, backup/restore, TLS/mTLS,
  retention, ERP/MES thật, 16 managed checks và independent reviewer approval.

## 2. Phạm vi repository

| Thư mục | Vai trò | Ghi chú |
| --- | --- | --- |
| backend/ | ASP.NET Core Operations API, MQTT broker, persistence, CEP, health và prediction | Thành phần trung tâm của đường dữ liệu vận hành |
| frontend/ | React + Vite Operations UI | Dashboard, lines, machines, alarms, reports, simulation, admin |
| ClientPLC/ | WPF desktop client | Đọc PLC, lưu cục bộ, gửi telemetry MQTT |
| fusion-contracts/ | Contract C# dùng chung | Contract v1, telemetry, event, asset catalog |
| contracts/v1/ | JSON Schema dùng chung | Asset, telemetry, event và quy ước API |
| fusion-adapter/ | Worker giao outbox sang ODF | Có retry, lease, dead-letter và metrics |
| infrastructure/ | Docker Compose, SQL migration, PowerShell runbook | TimescaleDB, ODF preview, demo, staging, connector |
| factory-ai-platform/ | AI Agent Gateway và các service dữ liệu | Plane AI bổ sung, kết nối backend/CEP/RAG/report |
| Open-Data-Fusion/ | Nền tảng data fusion độc lập trong workspace | Explorer, Canvas, ingest, governance, OIDC, PostgreSQL |
| third_party/open-data-fusion/ | Git submodule upstream ODF | Được ghim để chạy preview; không sửa trực tiếp cho cấu hình MKZ |
| Odysseus/ | AI workspace bên thứ ba | Có thể làm REST/RAG bridge; không thuộc scope lõi FII |
| may_data/, import.csv | Dữ liệu/mẫu import PLC | Không xem là dữ liệu production |
| obsidian-fii-ai/ | Knowledge base và runbook nội bộ | Tài liệu hỗ trợ, không phải runtime |

Có thể có các thư mục agent/, .omx/, graphify-out/ và cache phát sinh từ công cụ
phát triển. Chúng không phải runtime dependency của FII.

## 3. Kiến trúc tổng thể

~~~mermaid
flowchart LR
    PLC["PLC / thiết bị"] --> Client["ClientPLC WPF"]
    Client -->|"HSL đọc PLC + MQTT TLS"| MQTT["MQTT broker trong backend"]
    MQTT --> Ingest["TelemetryIngestionService"]
    Ingest --> Ops[("PostgreSQL Operations")]
    Ingest -. "dual-write tùy chọn" .-> TS[("TimescaleDB")]
    Ingest --> Rules["EventRuleEngine / CEP"]
    Rules --> Alerts["Alerts + event_log"]
    Alerts --> UI["React Operations UI"]
    Ops <--> UI
    TS --> UI
    Alerts -. "SignalR / polling" .-> UI
    Ops --> Outbox["fusion_outbox"]
    Outbox --> Adapter["Fusion Adapter"]
    Adapter --> ODF["Open Data Fusion"]
    Backend["Backend REST API"] <--> AI["Factory AI Gateway"]
    Backend -. "đọc tài liệu tùy chọn" .-> RAG["Document RAG"]
    AI --> RAG
    AI --> Report["Report Service"]
    AI --> Bridge["Antigravity Bridge"]
~~~

### Các ranh giới dữ liệu quan trọng

1. **PLC/Operations boundary:** ClientPLC và backend phải tiếp tục thu nhận,
   lưu và phục vụ dữ liệu ngay cả khi ODF, RAG hoặc AI plane không sẵn sàng.
2. **Operations database:** PostgreSQL là nguồn sự thật vận hành; migration nằm
   trong backend/db/migrations/.
3. **Timescale target:** infrastructure/timescaledb/ có lineage riêng; không
   được coi một lần migrate Operations là đã migrate Timescale.
4. **Secondary delivery:** outbox ghi cùng ý định với transaction nghiệp vụ;
   adapter giao lại idempotent, retry theo lease và dead-letter khi quá số lần.
5. **AI plane:** Gateway/CEP/RAG/report là dịch vụ bổ sung; không gọi trực tiếp
   từ MQTT hot path.

### Luồng telemetry end-to-end

1. PLCPollingService đọc tag theo profile máy và xác định trạng thái máy.
2. TelemetryPayloadBuilder tạo payload; ClientPLC ghi SQLite và xếp hàng khi
   mất mạng.
3. MqttTransport gửi payload tới MqttServerService bằng MQTT, có thể bật TLS.
4. TelemetryIngestionService kiểm tra, chuẩn hóa và ghi PostgreSQL; nếu bật
   Timescale:Enabled, bản ghi được ghi bổ sung sang Timescale sau transaction
   nguồn.
5. EventRuleEngine đánh giá rule threshold, tạo event/alert bền vững và đẩy
   cảnh báo quan trọng tới SignalR.
6. HealthScoringJob và BatchPredictionJob định kỳ tính health/risk.
7. Frontend lấy dữ liệu qua REST, refresh theo scope và hiển thị dashboard.
8. Nếu bật capture, telemetry hợp lệ tạo fusion_outbox; Fusion Adapter map
   thành ODF bundle và giao ở process riêng.

## 4. Chức năng nghiệp vụ

### 4.1 Thu nhận và vận hành PLC

- Kết nối nhiều loại PLC qua HslCommunication và tên driver cấu hình động.
- Đọc địa chỉ theo profile, theo dõi heartbeat, CPU/RAM/uptime và production.
- Chuẩn hóa trạng thái RUNNING, IDLE, STOPPED, ERROR, OFFLINE.
- Phát hiện cạnh alarm, lưu lịch sử lỗi và tổng hợp theo ca.
- Lưu telemetry, cấu hình, lịch sử đơn vị và offline queue trong SQLite cục bộ.
- Gửi payload qua MQTT với QoS phù hợp; hỗ trợ reconnect và application
  acknowledgement.
- Import cấu hình máy/alarm từ file Excel/JSON tùy profile.

Các điểm vào chính: ClientPLC/ClientPLC.Infrastructure/PLC/,
ClientPLC/ClientPLC.Infrastructure/Network/,
ClientPLC/ClientPLC.Infrastructure/Database/ và ClientPLC/ClientPLC.Core/.

### 4.2 Operations backend

Backend net9.0 cung cấp REST API, MQTT server, SignalR hub, database
migrations, health check và các background service:

- quản lý production lines, machines và asset catalog;
- đọc telemetry live, log, query và Timescale rollup;
- quản lý alarms/events, acknowledge/resolve và audit log;
- quản lý user, service account và session SSO;
- đồng bộ ClientPLC qua /api/sync;
- báo cáo, simulation và connector integration;
- health score, failure risk, anomaly detection và RCA context;
- CEP staging publisher và transactional outbox.

Controller được nhóm trong backend/Controllers/. Service quan trọng được
đăng ký trong backend/Program.cs, gồm TelemetryIngestionService,
MqttServerService, EventRuleEngine, AlertService,
HealthScoringService, PredictiveService, TimescaleTelemetryService,
CepStagingPublisher và SyncService.

### 4.3 Cảnh báo, CEP và product intelligence

- Rule threshold trong backend/Configuration/event-rules.json có thể tạo
  THRESHOLD_BREACH, ALARM, STATUS_CHANGE, MAINTENANCE_DUE và các event
  liên quan.
- Alert có lifecycle mở → acknowledge → resolve, có history, deduplication và
  suppression window.
- HealthScoringService kết hợp availability, alarm, performance, event và
  các tín hiệu vận hành để tạo score/band.
- PredictiveService cung cấp anomaly/risk; BatchPredictionJob chạy định kỳ.
- Một số rule trong JSON được đánh dấu DEFERRED; không mô tả chúng như đã có
  evaluator runtime nếu code chưa triển khai.

### 4.4 Operations UI

Frontend dùng React Router, lazy loading, Axios, Zustand, React Query, Recharts,
GSAP, i18next, Zod và Tailwind/Vite. Các luồng người dùng chính:

| Luồng | Route tiêu biểu | Chức năng |
| --- | --- | --- |
| Dashboard | /, /admin | KPI, trạng thái line/machine, health, production, active alarms |
| Lines | /lines, /admin/lines | Xem/cấu hình production line và thứ tự máy |
| Machines | /machines, /machines/:id | Danh sách, drill-down, telemetry, health, hourly production |
| Alarms | /alarms, /admin/alarms | Lọc, xem chi tiết, acknowledge/resolve |
| Reports | /admin/reports | Báo cáo và chart data |
| Production analysis | /production-analysis | Phân tích sản lượng phía viewer |
| Simulation | /admin/simulation | Dữ liệu synthetic để trình diễn/kiểm thử |
| Admin | /admin/users, /admin/audit-logs, /admin/settings | User, audit và cấu hình quản trị |
| Presentation | /slideshow | Slideshow cho demo vận hành |

Role hiện có:

- ADMIN: toàn quyền quản trị, user, audit, cấu hình line/machine/asset và
  thao tác alarm.
- ENGINEER: xem và cấu hình vận hành, thao tác alarm, không quản lý user/audit
  ở mức ADMIN.
- GUEST: chỉ xem dashboard, line, machine, alarm và report.

frontend/src/app/permissions.ts, frontend/src/app/router.tsx và
backend/Security/ là nơi kiểm tra quyền ở hai biên. Không coi route guard
frontend là biên bảo mật duy nhất; backend vẫn phải xác thực mọi request.

### 4.5 Đồng bộ Open Data Fusion

Hai cờ độc lập:

| Cờ | Tác dụng | Khi bật |
| --- | --- | --- |
| OpenDataFusion__CaptureEnabled | Ghi intent vào fusion_outbox cùng flow backend | Khi muốn tích lũy backlog local |
| OpenDataFusion__DispatchEnabled | Cho Fusion Adapter claim và giao outbox sang ODF | Chỉ sau khi ODF có tenant/project/identity |

Fusion Adapter dùng OpenDataFusionBundleMapper để tạo hierarchy Plant → Line
→ Machine, time series và datapoint. External ID có dạng mkz:plant:*,
mkz:line:*, mkz:machine:*, mkz:ts:*. Lỗi tạm thời được retry; lỗi vĩnh
viễn hoặc vượt MaxAttempts đi vào dead state. Không xóa outbox khi rollback.

### 4.6 Factory AI Platform

factory-ai-platform/ là plane AI/microservice dành cho các use case nâng cao:

| Service | Cổng Compose | Chức năng |
| --- | ---: | --- |
| gateway | 8080 | FastAPI OpenAI-compatible /v1/models, /v1/chat/completions, agent router, tool access và JWT |
| antigravity-bridge | 8081 | Chạy engineering agent trong sandbox, /agent/run |
| document-service | 8082 | Upload PDF, chunk, embedding/pgvector và /document/search |
| report-service | 8083 | Xuất DOCX/XLSX, idempotency, local single-replica storage và signed download |
| asset-service | 8084 | Asset CRUD, tree, relationship, document link và health score |
| cep-service | 8085 bên ngoài / 8084 trong container | Event ingest, rules, alerts, RCA và ML anomaly/failure |
| data-platform | theo Compose | ERP/MES/file watcher, dual-write, Timescale query, DLQ và connector API |

Gateway có thể gọi backend, CEP, document và report; các URL/key bắt buộc phải
đến từ environment/secret manager. factory-ai-platform/infrastructure/docker-compose.yml
là nguồn chính cho topology, health check và biến cấu hình.

### 4.7 Open Data Fusion

Open-Data-Fusion/ là nền tảng data product riêng trong workspace, với các
surface chính:

- Asset Explorer và Industrial Canvas;
- ingest bundle idempotent, provenance, audit, telemetry raw/latest/aggregate;
- contextualization candidate cần review trước khi thành relation;
- governed objects, search, documents, diagrams, matching và spatial;
- tenant/project scope, OIDC/Keycloak, PostgreSQL RLS, Redis Streams, outbox;
- edge agent CSV/PostgreSQL/OPC UA có checkpoint, store-and-forward và retry;
- write-back chỉ cho phép qua policy, approval và external executor.

third_party/open-data-fusion/ là submodule upstream dùng cho preview của MKZ.
Không trộn hai migration lineage và không sửa submodule để chứa secret hay cấu
hình riêng của MKZ.

## 5. Contract và mô hình dữ liệu

### Contract v1

contracts/v1/ và fusion-contracts/ cùng chốt các quy ước:

| Contract | Trường cốt lõi |
| --- | --- |
| Asset | id, type, name, code, parentId, metadata, timestamps |
| Telemetry | (time, assetId, metric, value); có thể có unit/source/tags |
| Event | eventId, timestamp, assetId, type, severity, payload, source/correlation |
| API | REST /api/v1, JSON camelCase, JWT Bearer, lỗi RFC 7807 application/problem+json |

Metric chuẩn trong TelemetrySchemaContract: production_quantity,
production_time, uph, oee, yield_rate, cpu_percent, ram_percent,
temperature, pressure, speed, cycle_time, vibration.

Event type chuẩn gồm ALARM, TELEMETRY, STATUS_CHANGE,
MAINTENANCE_DUE, THRESHOLD_BREACH, PRODUCTION_MILESTONE; severity gồm
INFO, WARNING, CRITICAL, EMERGENCY.

### Operations PostgreSQL

Migration authority là backend/db/migrations/0001_* đến 0006_*:

- line/machine/asset/catalog, users, audit, alarms và simulation;
- telemetry/event canonicalization và ingress receipts;
- projection/history integrity, secondary delivery leases;
- approval sequence/delivery truth;
- service-account API-key hash (raw key chỉ trả một lần khi tạo/rotate).

### TimescaleDB

Migration authority độc lập là infrastructure/timescaledb/001_* đến 004_*:

- raw telemetry hypertable và backfill progress;
- hourly/daily rollup và lifecycle policy;
- events, alerts, alert history, dedup/suppression;
- asset metrics, health và prediction records.

PostgreSQL Operations vẫn là nguồn authoritative trong giai đoạn dual-write.
Chỉ thực hiện read cutover sau khi reconcile count, watermark, duplicate source
ID, refresh aggregate và có rollback evidence.

## 6. Công nghệ và dependency chính

| Lớp | Công nghệ đang dùng |
| --- | --- |
| Backend | .NET 9, ASP.NET Core, MQTTnet 5.1, Npgsql, JWT Bearer, SignalR, Swagger, BCrypt |
| Desktop PLC | .NET 9 Windows Desktop/WPF, HslCommunication 7.0.1, MQTTnet, Microsoft.Data.Sqlite, Serilog |
| Frontend | React 19, TypeScript 6, Vite 8, React Router 7, Axios, Zustand, React Query, Recharts, GSAP, i18next, Zod, Tailwind 4 |
| Operations DB | PostgreSQL; migration SQL immutable theo version |
| Time-series | TimescaleDB; hypertable, continuous aggregate, retention/columnstore policy |
| AI services | Python, FastAPI, Pydantic, SQLAlchemy/asyncpg, scikit-learn, pandas, pgvector, MinIO |
| ODF | Node.js 24, Express 5, React/Vite, TypeScript, PostgreSQL 17, Redis Streams, OIDC/Keycloak |
| Test | xUnit/.NET test, Vitest/Testing Library, Playwright, pytest, integration PowerShell |
| Delivery | Docker Compose, PowerShell runbook, CI, CodeQL, dependency review, SBOM |

Các version ở trên lấy từ các manifest hiện tại; khi nâng version, cập nhật
manifest và tài liệu này cùng một thay đổi.
## 7. Cấu hình và secret

ASP.NET Core dùng nested environment key bằng dấu __; backend **không tự đọc
.env**. Dùng shell, user-secrets hoặc secret manager.

### Biến backend thường dùng

~~~text
ConnectionStrings__DefaultConnection=<operations-postgres-url>
ConnectionStrings__Timescale=<timescale-postgres-url>
Jwt__Key=<unique-random-secret-at-least-32-bytes>
Jwt__TenantId=<configured-tenant-id>
Mqtt__EncryptionKey=<unique-mqtt-encryption-key>
MqttServer__Port=1883
MqttServer__Tls__Enabled=true|false
MqttServer__Tls__CertificatePath=<pfx-or-cert-path>
Timescale__Enabled=false|true
OpenDataFusion__CaptureEnabled=false|true
OpenDataFusion__DispatchEnabled=false|true
~~~

Các nhóm khác: TelemetryIngress, CepStaging, ConnectorApi,
RateLimiting, ForwardedHeaders, HealthScoring, BatchPrediction.
Xem backend/appsettings.json, .env.example và
infrastructure/open-data-fusion/.env.example để biết default local.

### Quy tắc secret

- Không commit password, token, PFX, client secret, customer/plant data hoặc
  connection string thật.
- Dùng service-account API key cho service-to-service; chỉ lưu SHA-256 hash.
- Cookie production phải Secure, domain và forwarded-header phải được xác
  định từ ingress tin cậy.
- ODF/Factory AI dùng secret manager; application-preview chỉ là loopback,
  SQLite/local mapping proof.

## 8. Cách chạy

Các lệnh dưới đây là local/dev. Dùng PowerShell trên Windows; thay placeholder
<...> bằng giá trị thật trong máy phát triển.

### 8.1 Demo UI không cần backend

~~~powershell
npm --prefix frontend ci
npm --prefix frontend run demo
~~~

Mở http://127.0.0.1:3000. Demo dùng synthetic GET data; thao tác ghi không
được giả lập thành công. Luồng demo ngắn: Dashboard → Lines → Machines →
Machine detail → Alarms → Slideshow.

### 8.2 Full demo stack

Sau khi chạy Odysseus/launch-windows.ps1 một lần nếu cần virtual environment:

~~~powershell
.\\infrastructure\\demo\\Start-FullDemo.ps1
.\\infrastructure\\demo\\Test-FullDemo.ps1
~~~

Default launcher dùng Operations UI 3001, backend 5166, Odysseus 7000,
ODF web 58088, ODF API 54310; dùng các tham số port của script nếu môi
trường đã chiếm cổng. Thêm -WithClientPlc để mở WPF client. Log nằm trong
.runtime-logs/.

### 8.3 Chạy backend trực tiếp

~~~powershell
$env:ConnectionStrings__DefaultConnection = '<operations-connection-string>'
$env:Jwt__Key = '<unique-random-secret-at-least-32-bytes>'
$env:Jwt__TenantId = '<tenant-id>'
$env:Mqtt__EncryptionKey = '<unique-mqtt-encryption-key>'
dotnet run --project backend/backend.csproj
~~~

Các mode quản trị hữu ích:

~~~powershell
dotnet run --project backend/backend.csproj -- --database-preflight
dotnet run --project backend/backend.csproj -- --database-migrate
dotnet run --project backend/backend.csproj -- --timescale-backfill
~~~

--timescale-backfill yêu cầu Timescale__Enabled=true và hai connection
string hợp lệ.

### 8.4 Chạy frontend với backend

~~~powershell
npm --prefix frontend install
$env:VITE_API_URL = 'http://localhost:5166/api'
npm --prefix frontend run dev
~~~

Frontend mặc định dùng /api, gửi cookie credentials và tự đính kèm Bearer nếu
session/token có mặt. MODE=demo hoặc VITE_ENABLE_API_MOCKS=true bật mock GET.

### 8.5 Chạy ClientPLC

ClientPLC chỉ chạy đúng trên Windows có .NET 9 Windows Desktop SDK và cấu hình
PLC/MQTT phù hợp:

~~~powershell
dotnet run --project ClientPLC/ClientPLC.App/ClientPLC.App.csproj
~~~

Profile máy, địa chỉ PLC và MQTT phải được nạp trước. Nếu không có PLC thật,
dùng simulation/full demo hoặc test của ClientPLC.Tests thay vì trỏ bừa vào
thiết bị sản xuất.

### 8.6 ODF preview an toàn

Khởi tạo submodule nếu checkout mới:

~~~powershell
git submodule update --init --recursive
.\\infrastructure\\open-data-fusion\\Start-OpenDataFusionPreview.ps1
.\\infrastructure\\open-data-fusion\\Test-OpenDataFusionPreview.ps1
~~~

Preview mặc định loopback: ODF API 54310, web 58088, PostgreSQL 55432,
Redis 56379, Grafana 53000, Prometheus 59090. Nếu PostgreSQL bị chiếm,
chọn -PostgresPort <free-port> và chạy lại cả start/test. Script test tạo
tenant/project synthetic và kiểm tra datapoint mẫu; đó không phải provisioning
staging.

Sau khi preview pass mới bật capture và, khi identity/project đã sẵn sàng, bật
dispatch:

~~~powershell
$env:OpenDataFusion__CaptureEnabled = 'true'
dotnet run --project backend/backend.csproj

$env:OpenDataFusion__DispatchEnabled = 'true'
$env:OpenDataFusion__TenantId = '<odf-tenant-id>'
$env:OpenDataFusion__ProjectId = '<odf-project-id>'
dotnet run --project fusion-adapter/Fusion.Adapter.csproj
~~~

Để rollback adapter local, đặt capture false trước khi restart backend và dừng
adapter; giữ nguyên outbox pending.

### 8.7 Factory AI Platform

~~~powershell
Push-Location factory-ai-platform/infrastructure
Copy-Item env.example .env
# Điền secret manager/local secret vào .env, không commit file này.
docker compose up -d --build
Pop-Location
~~~

Các service chính có health endpoint; xem factory-ai-platform/README.md và
Compose để cấu hình BACKEND_URL, LLM_API_URL, JWT, report key, database,
MinIO và workspace sandbox. Gateway dùng http://localhost:8080/v1; chỉ bật
mock/local-demo khi đúng profile, không dùng mock trong production.

### 8.8 Open Data Fusion standalone

Để chạy product ODF trong Open-Data-Fusion/, xem README của thư mục đó. Hai
profile chính là SQLite local-first và PostgreSQL production-like:

~~~powershell
Push-Location Open-Data-Fusion
npm install
npm run dev
Pop-Location
~~~

Trong deployment thật, chọn đúng một authoritative backend qua
ODF_DATA_PERSISTENCE=sqlite|postgres, dùng OIDC/Keycloak, PostgreSQL RLS,
shared object store và Redis khi cần multi-instance. Không dual-write
authoritative record giữa SQLite và PostgreSQL.

## 9. Kiểm tra, build và validation

### Bộ kiểm tra lõi của FII

~~~powershell
dotnet test backend.Tests/backend.Tests.csproj
dotnet test fusion-adapter.Tests/Fusion.Adapter.Tests.csproj
dotnet test ClientPLC/ClientPLC.Tests/ClientPLC.Tests.csproj
npm --prefix frontend run test:run
npm --prefix frontend run type-check
npm --prefix frontend run build
npm --prefix frontend run lint
~~~

E2E frontend:

~~~powershell
npm --prefix frontend run e2e:install
npm --prefix frontend run e2e
npm --prefix frontend run e2e:live
~~~

### Factory AI Platform

~~~powershell
Push-Location factory-ai-platform/gateway
python -m pytest tests/
Pop-Location

Push-Location factory-ai-platform/antigravity-bridge
python -m pytest tests/
Pop-Location
~~~

Mỗi service có requirements.txt/requirements-dev.txt và test riêng. Data
Platform có benchmark Timescale, connector test, DLQ và smoke script; đọc
factory-ai-platform/data-platform/README.md trước khi chạy against database.

### Timescale workload

~~~powershell
$env:POSTGRES_PASSWORD = '<strong-local-password>'
docker compose -p mkz-timescale -f infrastructure/timescaledb/docker-compose.yml up -d
powershell -File infrastructure/test-timescale-workload.ps1
~~~

Chỉ coi kết quả benchmark là evidence hiệu năng local. Không dùng synthetic
benchmark để đóng managed production gate.

## 10. API map nhanh

Backend có Swagger ở môi trường Development và health công khai:

~~~text
GET  /api/health
GET  /api/auth/session
POST /api/auth/login
POST /api/auth/logout
GET  /api/dashboard/summary
GET  /api/machines
GET  /api/machines/{id}
GET  /api/production-lines
GET  /api/alarms
POST /api/alarms/{id}/acknowledge
POST /api/alarms/{id}/resolve
GET  /api/alerts, /api/v1/alerts
GET  /api/telemetry/live
GET  /api/telemetry/log
GET  /api/telemetry/query
GET  /api/v1/telemetry/timescale/{machineId}
GET  /api/v1/assets, /api/v1/assets/{id}
GET  /api/v1/assets/{assetId}/health
POST /api/v1/predictions/anomaly
GET  /api/v1/predictions/risk/{assetId}
POST /api/v1/rca
GET  /api/events
GET  /api/event-rules
POST /api/sync/register
POST /api/sync/upload
~~~

Đây là map định hướng; request/response chính thức nằm trong controller và
contract. Luôn xác thực role/authorization trước khi gọi route ghi.

## 11. Vận hành, rollback và troubleshooting

### Backend không khởi động

1. Kiểm tra ConnectionStrings:DefaultConnection và chạy
   --database-preflight.
2. Kiểm tra Mqtt:EncryptionKey; backend fail-closed nếu thiếu.
3. Kiểm tra port MQTT 1883/8883, PostgreSQL và CORS/forwarded headers.
4. Đọc log .runtime-logs/ hoặc log process; không tắt middleware lỗi để che
   nguyên nhân.

### Không thấy telemetry

1. Kiểm tra ClientPLC đang connected và topic/client ID có đúng ownership.
2. Kiểm tra MQTT authentication/device token và payload schema.
3. Kiểm tra /api/health, telemetry_receipts, event_log và timestamp.
4. Nếu mất mạng, kiểm tra SQLite offline queue và application acknowledgement.
5. Nếu Timescale lỗi, PostgreSQL nguồn vẫn phải nhận dữ liệu; chạy backfill sau
   khi target khỏe rồi mới cân nhắc read cutover.

### Outbox/ODF backlog

1. Giữ OpenDataFusion__CaptureEnabled=true để không mất intent local.
2. Để DispatchEnabled=false nếu tenant/project/identity chưa sẵn sàng.
3. Kiểm tra lease, attempts, retry/dead state và adapter metrics.
4. Không xóa fusion_outbox; sửa kết nối/quyền rồi cho worker replay.

### Alert không xuất hiện

1. Kiểm tra rule enabled, condition.type và metric/unit.
2. Nhớ rằng rule DEFERRED chỉ là khai báo, chưa có evaluator.
3. Kiểm tra dedup/suppression window và event_log trước alerts.
4. Kiểm tra SignalR chỉ là kênh đẩy; REST/polling vẫn là đường xác minh.

### ODF preview lỗi

1. Dùng đúng profile application-preview, chỉ URL loopback.
2. Kiểm tra submodule đã init và PostgreSQL preview port không bị chiếm.
3. Không tạo upstream .env bằng tay chứa secret trong repository.
4. Dừng ODF không dừng backend, ClientPLC hay Operations UI.
## 12. An toàn và ranh giới chưa hoàn tất

Các giới hạn hiện tại cần nói rõ khi demo hoặc bàn giao:

- NO-GO production theo managed evidence hiện hành.
- Critical write-back chưa thực thi tự động; write-back khác cần allowlist,
  dry-run, approval độc lập và external executor.
- Matching là proposal-only; contextualization phải review accept/reject.
- Diagram extraction hiện dựa trên text/tag, không phải full P&ID computer vision.
- Spatial là lightweight review workflow, không phải 3D engine production.
- Optimistic concurrency được dùng cho Canvas; chưa phải CRDT/OT.
- Offline merge logic chưa là product runtime.
- ML/LLM RCA và dữ liệu ERP/MES thật còn cần managed-staging evidence.
- Chưa claim backup/restore, broker outage/dead-letter, TLS/mTLS và retention
  production nếu chưa có artifact tương ứng.

Biện pháp đang có: JWT/cookie/API key, role-based authorization, device token,
rate limiting, RFC 7807 errors, audit log, append-only history, dependency
review, CodeQL, license policy và SBOM.

## 13. Quy trình phát triển

1. Đọc PROJECT_PLAN.md để biết trạng thái/roadmap; đọc ADR hoặc runbook đúng
   boundary trước khi sửa persistence/security.
2. Sửa contract trước nếu thay đổi schema; cập nhật cả C# contract, JSON Schema,
   mapper, API và test.
3. Thêm test cho happy path, malformed input, authorization, duplicate delivery
   và schema evolution.
4. Không sửa migration đã phát hành; thêm migration đánh số mới.
5. Chạy test/lint/type-check/build tương ứng, ghi evidence vào docs release.
6. Không trộn staged WIP không liên quan vào thay đổi; giữ diff nhỏ và reviewable.

## 14. Từ điển thuật ngữ

| Thuật ngữ | Ý nghĩa |
| --- | --- |
| PLC | Programmable Logic Controller của máy/dây chuyền |
| MQTT | Giao thức truyền message telemetry giữa ClientPLC và backend |
| Operations DB | PostgreSQL authoritative cho vận hành MKZ |
| TimescaleDB | Target time-series chuyên dụng, hiện dùng cho dual-write/rollup |
| CEP | Complex Event Processing, đánh giá event/rule và tạo alert |
| RCA | Root Cause Analysis; hiện là context/correlation có kiểm soát |
| Outbox | Bản ghi intent giao phụ sang hệ thống khác sau transaction nguồn |
| ODF | Open Data Fusion, data product platform tích hợp phụ trợ |
| RLS | PostgreSQL Row-Level Security theo tenant/project |
| DLQ/dead state | Nơi giữ bản ghi không thể giao sau retry để điều tra/requeue |
| Go/No-Go | Quyết định phát hành dựa trên managed evidence, không chỉ local tests |

## 15. Tài liệu nguồn nên đọc tiếp

- [README.md](../README.md) — quick start, chức năng, bảo mật, roadmap (entry point).
- [FII-AI-Huong-Dan-Du-An.docx](FII-AI-Huong-Dan-Du-An.docx) — bản Word trình bày đầy đủ (tiếng Việt).
- [PROJECT-REPORT.en.docx](PROJECT-REPORT.en.docx) — báo cáo stakeholder tiếng Anh.
- [README.en.md](../README.en.md) — bản tiếng Anh của overview.
- [PROJECT_PLAN.md](../PROJECT_PLAN.md) — source of truth cho plan/progress.
- [backend/Program.cs](../backend/Program.cs) — wiring runtime backend.
- [backend/appsettings.json](../backend/appsettings.json) — default config local.
- [infrastructure/timescaledb/README.md](../infrastructure/timescaledb/README.md) — lineage và cutover Timescale.
- [infrastructure/open-data-fusion/README.md](../infrastructure/open-data-fusion/README.md) — preview và adapter ODF.
- [docs/PHASE2-DEPLOYMENT.md](PHASE2-DEPLOYMENT.md) — API/deployment Phase 2.
- [docs/release-evidence/](release-evidence/) — evidence và residual blockers.
- [factory-ai-platform/README.md](../factory-ai-platform/README.md) — AI plane.
- [Open-Data-Fusion/README.md](../Open-Data-Fusion/README.md) — ODF product/architecture.
- [ClientPLC/PLAN.md](../ClientPLC/PLAN.md) — kế hoạch hardening ClientPLC.

> Khi tài liệu này mâu thuẫn với code hoặc evidence mới, ưu tiên runtime contract
> và release evidence hiện hành; sau đó cập nhật tài liệu để tránh drift.
