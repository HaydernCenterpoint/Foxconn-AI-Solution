# Build 4 component Word reports via officecli
$ErrorActionPreference = "Stop"
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
$OutDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $OutDir "..\..")

function New-ReportShell {
  param([string]$File, [string]$Title, [string]$Subtitle, [string]$Accent)
  if (Test-Path $File) { Remove-Item $File -Force }
  officecli create $File | Out-Null
  officecli open $File | Out-Null
  officecli set $File / --prop docDefaults.font=Calibri --prop docDefaults.fontSize=11pt | Out-Null

  $ops = @()
  $ops += @{ command="add"; parent="/body"; type="paragraph"; props=@{ text=$Title; style="Title"; size="26pt"; bold="true"; align="center"; color=$Accent; spaceBefore="48pt"; spaceAfter="10pt" } }
  $ops += @{ command="add"; parent="/body"; type="paragraph"; props=@{ text=$Subtitle; style="Subtitle"; size="16pt"; align="center"; color="2E86AB"; spaceAfter="16pt" } }
  $ops += @{ command="add"; parent="/body"; type="paragraph"; props=@{ text="FII AI / MKZ Factory Monitor — Component Technical Report"; size="11pt"; align="center"; color="555555"; spaceAfter="6pt" } }
  $ops += @{ command="add"; parent="/body"; type="paragraph"; props=@{ text="Document date: 5 August 2026 · Language: Vietnamese"; size="11pt"; align="center"; spaceAfter="4pt" } }
  $ops += @{ command="add"; parent="/body"; type="paragraph"; props=@{ text="Release posture: Staging candidate — NO-GO for production"; size="11pt"; bold="true"; align="center"; color="922B21"; spaceAfter="24pt" } }
  $ops += @{ command="add"; parent="/body"; type="paragraph"; props=@{ text="Sources: repository source code, README, PROJECT_PLAN.md, docs/PROJECT-GUIDE.vi.md, docs/release-evidence/."; size="10pt"; align="center"; color="666666"; spaceAfter="12pt"; pageBreakBefore="true" } }
  $ops += @{ command="add"; parent="/body"; type="paragraph"; props=@{ text="Mục lục"; style="Heading1"; size="20pt"; bold="true"; color=$Accent; spaceBefore="8pt"; spaceAfter="10pt" } }
  $ops += @{ command="add"; parent="/"; type="toc"; props=@{ levels="1-2"; title="" } }

  $tmp = Join-Path $env:TEMP ("officecli-shell-" + [guid]::NewGuid().ToString() + ".json")
  ($ops | ConvertTo-Json -Depth 8 -Compress) | Set-Content -Path $tmp -Encoding UTF8
  officecli batch $File --input $tmp | Out-Null
  Remove-Item $tmp -Force
}

function Add-Ops {
  param([string]$File, [array]$Ops)
  if ($Ops.Count -eq 0) { return }
  $tmp = Join-Path $env:TEMP ("officecli-ops-" + [guid]::NewGuid().ToString() + ".json")
  ($Ops | ConvertTo-Json -Depth 10) | Set-Content -Path $tmp -Encoding UTF8
  $result = officecli batch $File --input $tmp --json 2>&1 | Out-String
  Remove-Item $tmp -Force
  if ($result -notmatch '"failed": 0' -and $result -notmatch '"failed":0') {
    Write-Warning "Batch may have failures for $File"
    Write-Host ($result.Substring([Math]::Max(0, $result.Length - 1500)))
  }
}

function H1($t,$c="1B4F72",$break=$false) {
  $p = @{ text=$t; style="Heading1"; size="20pt"; bold="true"; color=$c; spaceBefore="16pt"; spaceAfter="10pt" }
  if ($break) { $p.pageBreakBefore = "true" }
  @{ command="add"; parent="/body"; type="paragraph"; props=$p }
}
function H2($t,$c="2E86AB") {
  @{ command="add"; parent="/body"; type="paragraph"; props=@{ text=$t; style="Heading2"; size="14pt"; bold="true"; color=$c; spaceBefore="12pt"; spaceAfter="8pt" } }
}
function P($t,$size="11pt") {
  @{ command="add"; parent="/body"; type="paragraph"; props=@{ text=$t; style="Normal"; size=$size; spaceAfter="6pt" } }
}
function Code($t) {
  @{ command="add"; parent="/body"; type="paragraph"; props=@{ text=$t; style="Normal"; size="10pt"; font="Consolas"; spaceAfter="2pt" } }
}
function Bullet($t) {
  @{ command="add"; parent="/body"; type="paragraph"; props=@{ text="• $t"; style="Normal"; size="11pt"; spaceAfter="3pt"; indent="360" } }
}
function Finish-Report {
  param([string]$File, [string]$Header)
  officecli add $File / --type header --prop type=default --prop text=$Header --prop size=9pt --prop color=666666 | Out-Null
  officecli set $File '/header[1]/p[1]' --prop align=right | Out-Null
  officecli add $File / --type footer --prop type=default --prop size=9pt --prop text="FII AI · Staging candidate · Trang " --prop field=page | Out-Null
  officecli set $File '/footer[1]/p[1]' --prop align=center | Out-Null
  officecli set $File /settings --prop updateFields=true | Out-Null
  officecli save $File | Out-Null
  officecli close $File 2>$null | Out-Null
  officecli validate $File | Out-Null
  Write-Host "OK: $File"
}

# ═══════════════════════════════════════════════════════════════
# 1) FRONTEND
# ═══════════════════════════════════════════════════════════════
$fe = "docs\component-reports\Frontend-Report.vi.docx"
Write-Host "Building Frontend report..."
New-ReportShell -File $fe -Title "Frontend — Operations UI" -Subtitle "Báo cáo kỹ thuật chi tiết" -Accent "1B4F72"

$ops = @()
$ops += H1 "1. Tóm tắt điều hành" "1B4F72" $true
$ops += P "Frontend của FII AI (MKZ Factory Monitor) là ứng dụng web Operations UI, viết bằng React 19 + TypeScript + Vite 8. Nó là lớp trình bày chính cho vận hành: dashboard KPI, production lines, machines, alarms, reports, simulation và các màn hình quản trị (users, audit, settings)."
$ops += P "Ứng dụng hỗ trợ ba vai trò ADMIN, ENGINEER và GUEST với bản đồ permission phía client; ranh giới bảo mật thật vẫn nằm ở backend (JWT cookie / API policy). Có chế độ demo (synthetic GET) để trình diễn UI không cần backend; thao tác ghi không được giả lập thành công."
$ops += P "Phạm vi thư mục: frontend/. Không chứa PLC, không ghi PostgreSQL trực tiếp — mọi dữ liệu vận hành đi qua REST API backend (và optional SignalR)."

$ops += H1 "2. Vai trò trong kiến trúc FII" "1B4F72" $true
$ops += P "Trong luồng end-to-end, Frontend đứng sau Operations backend:"
$ops += Bullet "ClientPLC → MQTT → Backend ingest → PostgreSQL / rules / health"
$ops += Bullet "Frontend gọi REST (Axios) + cookie credentials; Bearer token nếu session có token"
$ops += Bullet "Refresh theo scope (monitoring / all) qua routeMeta + React Query"
$ops += Bullet "Không thuộc hot path MQTT; ODF/Odysseus không bắt buộc để UI chạy"

$ops += H2 "2.1 Ranh giới trách nhiệm"
$ops += Bullet "Được phép: hiển thị KPI, drill-down máy, ack/resolve alarm (nếu role đủ), cấu hình line/machine (role đủ), user/audit (ADMIN)."
$ops += Bullet "Không được: coi route guard frontend là biên bảo mật duy nhất; không commit secret; không dùng VITE_* cho credential production."
$ops += Bullet "Demo mode: chỉ synthetic GET; write không giả success — tránh hiểu nhầm demo là production."

$ops += H1 "3. Kiến trúc thư mục và module" "1B4F72" $true
$ops += H2 "3.1 Cấu trúc src/"
$ops += Bullet "app/ — router, permissions, providers, i18n (en/vi/zh-CN), queryClient, routeMeta, theme CSS tokens"
$ops += Bullet "features/ — domain modules: auth, dashboard, alarms, alerts, machines, production-lines, health, predictions, admin, simulation, assets, system"
$ops += Bullet "pages/ — page containers theo role (admin/, engineer/, viewer/) và shared pages (Lines, Machines, Alarms, Reports, Simulation, Login)"
$ops += Bullet "shared/ — layout (ModernShell, AppLayout, ViewerLayout), UI kit, apiClient, stores (Zustand), types, hooks"
$ops += Bullet "test/ — setup Vitest + Testing Library utilities"

$ops += H2 "3.2 Feature-first organization"
$ops += P "Mỗi feature thường có components/, services/* .api.ts và đôi khi view-model/tests. API layer tách khỏi UI; TanStack Query cache key tập trung ở app/queryKeys.ts và queryOptions.ts."

$ops += H1 "4. Luồng người dùng và routing" "1B4F72" $true
$ops += H2 "4.1 Public / auth"
$ops += Bullet "/login — LoginPage (SSO/JWT session)"
$ops += Bullet "/logout — clear session + navigate login"
$ops += Bullet "/403, /404 — Forbidden / Not Found"

$ops += H2 "4.2 Viewer shell (GUEST và mặc định viewer)"
$ops += Bullet "/ — Dashboard overview (ModernDashboard)"
$ops += Bullet "/lines — production lines + diagram"
$ops += Bullet "/machines, /machines/:id — list + detail tabs (telemetry, health)"
$ops += Bullet "/alarms — filter, detail, lifecycle (view; mutate theo permission)"
$ops += Bullet "/production-analysis — phân tích sản lượng"
$ops += Bullet "/settings — viewer settings"
$ops += Bullet "/slideshow — presentation mode vận hành"

$ops += H2 "4.3 Admin shell (/admin/*) — ADMIN + ENGINEER"
$ops += Bullet "/admin — role-aware dashboard"
$ops += Bullet "/admin/lines, machines, alarms, reports, simulation, settings"
$ops += Bullet "/admin/users, /admin/audit-logs — ADMIN only"
$ops += P "Lazy loading (React.lazy + Suspense) giảm initial bundle. ProtectedRoute kiểm tra auth và allowedRoles."

$ops += H1 "5. Chức năng nghiệp vụ chi tiết" "1B4F72" $true
$ops += H2 "5.1 Dashboard"
$ops += P "ModernDashboard / SharedDashboardPage hiển thị KPI grid, line operations, machine nodes, active alarms, predictive alerts, health bands. View-model (dashboardViewModel) chuẩn hóa payload API thành UI state. Data polling/refresh theo scope monitoring."
$ops += H2 "5.2 Lines và diagram"
$ops += P "LinesPage + DiagramEditor (React Flow / @xyflow/react) cho phép xem và cấu hình sơ đồ line–machine. Engineer/Admin có quyền configure; Guest chỉ view."
$ops += H2 "5.3 Machines"
$ops += P "MachineListPage và MachineDetailPage với tabs telemetry, health, hourly production. Machine detail CSS và iconography hỗ trợ nhận diện trạng thái RUNNING/IDLE/STOPPED/ERROR/OFFLINE."
$ops += H2 "5.4 Alarms / Alerts"
$ops += P "AlarmPage + AlertCenter components: filter, detail, acknowledge/resolve. Alarms API và alerts API tách service; UI phản ánh lifecycle backend."
$ops += H2 "5.5 Health & predictions"
$ops += P "HealthScoreCard, HealthBadge, RiskGauge — hiển thị health score/band và failure risk. PredictiveAlertPanel trên dashboard. Dữ liệu từ health.api / predictions.api / predictiveAlerts.api."
$ops += H2 "5.6 Reports & simulation"
$ops += P "ReportsPage lấy chart/report data từ backend. SimulationPage (Admin/Engineer) kích hoạt synthetic data cho demo/kiểm thử — không thay production telemetry."
$ops += H2 "5.7 Admin"
$ops += P "UserManagementPage, AuditLogPage, SettingsPage (role-aware). UserRoleBadge, SettingsSection. Permission users.manage / auditLogs.view chỉ ADMIN."

$ops += H1 "6. Stack công nghệ" "1B4F72" $true
$ops += Bullet "Runtime UI: React 19.2, React DOM, TypeScript ~6"
$ops += Bullet "Build: Vite 8, @vitejs/plugin-react, Tailwind CSS 4 (@tailwindcss/vite)"
$ops += Bullet "Routing: react-router-dom 7"
$ops += Bullet "Data: TanStack React Query 5, Axios, Zustand"
$ops += Bullet "Forms/validation: react-hook-form, Zod, @hookform/resolvers"
$ops += Bullet "Charts/diagram: Recharts 3, @xyflow/react 12"
$ops += Bullet "i18n: i18next + react-i18next (en, vi, zh-CN)"
$ops += Bullet "Motion/icons: GSAP, @gsap/react, lucide-react"
$ops += Bullet "Test: Vitest, Testing Library, Playwright (e2e + e2e:live)"
$ops += Bullet "Quality: ESLint 10, typescript-eslint, i18n:check script"

$ops += H1 "7. Phân quyền (client map)" "1B4F72" $true
$ops += P "permissions.ts định nghĩa Permission keys: dashboard.view, lines.view/configure, machines.view/configure, alarms.view/mutate, reports.view, users.manage, auditLogs.view, assets.configure."
$ops += Bullet "ADMIN: full set"
$ops += Bullet "ENGINEER: full trừ users.manage, auditLogs.view"
$ops += Bullet "GUEST: view-only (dashboard, lines, machines, alarms, reports)"
$ops += P "usePermissions hook và ProtectedRoute dùng map này cho UX. Backend vẫn enforce policy trên mọi request ghi."

$ops += H1 "8. Data layer và session" "1B4F72" $true
$ops += Bullet "apiClient.ts — base URL từ VITE_API_URL (dev) hoặc /api proxy; withCredentials; attach Bearer nếu có"
$ops += Bullet "apiClient.mock.ts + MODE=demo / VITE_ENABLE_API_MOCKS — mock GET"
$ops += Bullet "auth.store (Zustand) — role, session, logout"
$ops += Bullet "session.service / validation.service — chuẩn hóa session & payload"
$ops += Bullet "errors.ts — map lỗi RFC 7807 problem+json sang UI message"
$ops += Bullet "openDataFusion.ts — config liên quan surface ODF (nếu bật), không phải hot path"

$ops += H1 "9. Theming và UX" "1B4F72" $true
$ops += P "Theme tokens (theme-tokens.css), dark/light themes, modern-shell.css, industrial dashboard CSS (modern-dashboard.css). Shared UI: Badge, Button, Modal, DataState, EmptyState, PageHeader, StatCard, StatusBadge, ToastContainer, TechBackground/TechPanel. LanguageSelector hỗ trợ đa ngôn ngữ."

$ops += H1 "10. Chạy, build, kiểm thử" "1B4F72" $true
$ops += H2 "10.1 Demo UI không backend"
$ops += Code "npm --prefix frontend ci"
$ops += Code "npm --prefix frontend run demo"
$ops += P "Mở http://127.0.0.1:3000 — synthetic GET only."
$ops += H2 "10.2 Dev với backend"
$ops += Code "`$env:VITE_API_URL = 'http://localhost:5166/api'"
$ops += Code "npm --prefix frontend run dev"
$ops += H2 "10.3 Quality gates"
$ops += Code "npm --prefix frontend run test:run"
$ops += Code "npm --prefix frontend run type-check"
$ops += Code "npm --prefix frontend run lint"
$ops += Code "npm --prefix frontend run build"
$ops += Code "npm --prefix frontend run e2e"
$ops += Code "npm --prefix frontend run i18n:check"

$ops += H1 "11. Rủi ro, giới hạn và khuyến nghị" "1B4F72" $true
$ops += Bullet "Route guard frontend không thay thế authorization backend."
$ops += Bullet "Demo mode dễ gây hiểu nhầm production-ready — luôn label môi trường."
$ops += Bullet "Refresh polling cần cân bằng load; ưu tiên scope monitoring đúng route."
$ops += Bullet "Bundle size: giữ lazy routes; dùng analyze khi nghi ngờ regression."
$ops += Bullet "i18n: mọi chuỗi UI qua key; chạy i18n:check trước merge."
$ops += Bullet "Trước staging: e2e:live chống backend thật, không chỉ unit."

$ops += H1 "12. Kết luận" "1B4F72" $true
$ops += P "Frontend là bề mặt vận hành chính của FII AI: feature-first, role-aware, đa ngôn ngữ, có demo path an toàn. Độ tin cậy production phụ thuộc backend auth, contract ổn định và evidence e2e/live — không chỉ green unit test. Component này staging-ready cho demo và integration rehearsal; không tự nâng release claim lên production."

$ops += H1 "Phụ lục A. Route map tóm tắt" "1B4F72" $true
$ops += P "Viewer: /, /lines, /machines, /machines/:id, /alarms, /settings, /production-analysis, /slideshow"
$ops += P "Admin: /admin, /admin/lines, /admin/machines, /admin/alarms, /admin/reports, /admin/simulation, /admin/settings, /admin/users, /admin/audit-logs"
$ops += P "Auth: /login, /logout, /403, /404"

$ops += H1 "Phụ lục B. Nguồn tham chiếu" "1B4F72"
$ops += Bullet "frontend/package.json, src/app/router.tsx, permissions.ts, routeMeta.ts"
$ops += Bullet "features/dashboard, features/auth, shared/services/apiClient.ts"
$ops += Bullet "docs/PROJECT-GUIDE.vi.md §4.4; README.md §4.3"

Add-Ops $fe $ops
Finish-Report $fe "FII AI · Frontend Operations UI · Báo cáo kỹ thuật"

# ═══════════════════════════════════════════════════════════════
# 2) BACKEND
# ═══════════════════════════════════════════════════════════════
$be = "docs\component-reports\Backend-Report.vi.docx"
Write-Host "Building Backend report..."
New-ReportShell -File $be -Title "Backend — Operations API" -Subtitle "Báo cáo kỹ thuật chi tiết" -Accent "0E6655"

$ops = @()
$ops += H1 "1. Tóm tắt điều hành" "0E6655" $true
$ops += P "Backend FII AI là dịch vụ ASP.NET Core trên .NET 9 — trung tâm của đường dữ liệu vận hành. Nó nhận telemetry MQTT từ ClientPLC, ghi PostgreSQL (authoritative), optional dual-write TimescaleDB, đánh giá event rules/CEP, quản lý alarm lifecycle, health score, prediction, REST API cho UI, SignalR hub, sync ClientPLC, simulation, reports, và ghi fusion_outbox khi bật capture ODF."
$ops += P "Backend fail-closed với nhiều secret bắt buộc (JWT key, MQTT encryption key, tenant id, connection string). Local green không thay thế managed staging gate."

$ops += H1 "2. Vai trò trong kiến trúc" "0E6655" $true
$ops += Bullet "PLC/Operations boundary: tiếp tục ingest/serve khi ODF hoặc AI plane down."
$ops += Bullet "PostgreSQL Operations: nguồn sự thật; migrations backend/db/migrations/0001–0006."
$ops += Bullet "Timescale: mirror/query path riêng (infrastructure/timescaledb); không gộp migration."
$ops += Bullet "Secondary delivery: outbox transactional; Fusion Adapter process riêng (Dispatch)."
$ops += Bullet "AI/Odysseus: đọc REST; không inject vào MQTT hot path."

$ops += H1 "3. Thành phần runtime" "0E6655" $true
$ops += H2 "3.1 Controllers (REST surface)"
$ops += Bullet "AuthController — login/session/logout SSO-JWT"
$ops += Bullet "DashboardController — KPI summary"
$ops += Bullet "MachineController, ProductionLineController, AssetController — catalog & hierarchy"
$ops += Bullet "TelemetryController, TelemetryQueryController — live/log/query/Timescale"
$ops += Bullet "AlarmsController, AlertController, EventLogController, EventRulesController"
$ops += Bullet "AssetHealthController, MachineHealthController, PredictionController, RcaController"
$ops += Bullet "SyncController — ClientPLC register/upload"
$ops += Bullet "UsersController, AuditLogController — admin"
$ops += Bullet "ReportsController, SimulationController, ConnectorIntegrationController"

$ops += H2 "3.2 Services & background jobs"
$ops += Bullet "TelemetryIngestionService + TelemetryStore — chuẩn hóa & persistence"
$ops += Bullet "MqttServerService — embedded MQTT broker (MQTTnet Server)"
$ops += Bullet "EventRuleEngine — threshold rules từ Configuration/event-rules.json"
$ops += Bullet "AlertService — open/ack/resolve, dedup, suppression"
$ops += Bullet "HealthScoringService + HealthScoringJob — multi-factor score/band"
$ops += Bullet "PredictiveService + BatchPredictionJob — anomaly/risk batch"
$ops += Bullet "TimescaleTelemetryService + TimescaleBackfillRunner — dual-write & backfill"
$ops += Bullet "CepStagingPublisher — staging CEP events"
$ops += Bullet "SyncService, SimulationService, AuditService, DatabaseService"
$ops += Bullet "OperationalDatabaseMigrationService — apply SQL migrations"

$ops += H2 "3.3 Security package"
$ops += Bullet "FiiSso, JWT Bearer, ApiKeyAuthHandler (service accounts, hash storage)"
$ops += Bullet "MqttDeviceTokenValidator, CryptoHelper, PasswordHasher (BCrypt)"
$ops += Bullet "ApiProblemResponse — RFC 7807 problem+json"
$ops += Bullet "ExceptionHandlingMiddleware, ProblemDetailsResultFilter"

$ops += H2 "3.4 Realtime"
$ops += P "Hubs/TelemetryHub.cs — SignalR cho push cảnh báo/telemetry quan trọng (kèm authorization)."

$ops += H1 "4. Luồng telemetry end-to-end" "0E6655" $true
$ops += P "1) ClientPLC publish MQTT payload (optional TLS, device token, encrypted payload)."
$ops += P "2) MqttServerService authenticate/authorize topic ownership."
$ops += P "3) TelemetryIngestionService validate schema → write PostgreSQL trong transaction."
$ops += P "4) Nếu Timescale:Enabled, dual-write sau transaction nguồn."
$ops += P "5) EventRuleEngine evaluate → event_log + alerts."
$ops += P "6) Health/Prediction jobs định kỳ cập nhật score/risk."
$ops += P "7) UI đọc REST; critical alerts có thể push SignalR."
$ops += P "8) Nếu OpenDataFusion:CaptureEnabled, ghi fusion_outbox cùng intent."

$ops += H1 "5. Mô hình dữ liệu và migration" "0E6655" $true
$ops += Bullet "0001_operational_baseline — lines, machines, assets, users, alarms, simulation baseline"
$ops += Bullet "0002_ingress_receipts_and_catalog_normalization — receipts + catalog"
$ops += Bullet "0003_projection_and_history_integrity — history integrity"
$ops += Bullet "0004_secondary_delivery_leases_and_history — outbox leases"
$ops += Bullet "0005_approval_sequence_and_delivery_truth — approval/delivery truth"
$ops += Bullet "0006_service_account_api_key — API key hash (raw key one-time)"
$ops += P "CLI modes: --database-preflight, --database-migrate, --timescale-backfill (yêu cầu Timescale enabled + 2 connection strings)."

$ops += H1 "6. Event rules, alerts, intelligence" "0E6655" $true
$ops += P "event-rules.json định nghĩa rule threshold tạo THRESHOLD_BREACH, ALARM, STATUS_CHANGE, MAINTENANCE_DUE, v.v. Rule đánh dấu DEFERRED chỉ là khai báo — không mô tả như runtime-complete."
$ops += P "Alert lifecycle: open → acknowledge → resolve, có history, deduplication, suppression window."
$ops += P "Health scoring kết hợp availability, alarm, performance, operational signals. PredictiveService: anomaly (z-score style), failure risk; RCA context gated (RcaController)."

$ops += H1 "7. AuthN / AuthZ" "0E6655" $true
$ops += Bullet "Interactive: HttpOnly cookie session (FII SSO/JWT); browser không lưu bearer trong storage mặc định."
$ops += Bullet "Service-to-service: X-API-Key / service account; raw key chỉ trả một lần; persist SHA-256 hash."
$ops += Bullet "Roles: ADMIN, ENGINEER, GUEST — enforce bằng policy backend."
$ops += Bullet "Jwt:TenantId / FII_TENANT_ID bắt buộc khi issue token (fail-closed). users table hiện single-tenant boundary."
$ops += Bullet "Rate limiting (global/login/db-health); ForwardedHeaders chỉ trust proxy cấu hình."

$ops += H1 "8. Open Data Fusion capture" "0E6655" $true
$ops += P "OpenDataFusionCaptureOptions: CaptureEnabled (ghi outbox). Dispatch do fusion-adapter process riêng (DispatchEnabled ở adapter/env). Capture false = không tích lũy intent; Dispatch false khi tenant/project/identity chưa sẵn sàng. Không xóa outbox khi rollback — sửa kết nối rồi replay."

$ops += H1 "9. Cấu hình quan trọng" "0E6655" $true
$ops += Code "ConnectionStrings__DefaultConnection=<operations-postgres>"
$ops += Code "ConnectionStrings__Timescale=<timescale-url>"
$ops += Code "Jwt__Key=<secret >= 32 bytes>"
$ops += Code "Jwt__TenantId=<tenant>"
$ops += Code "Mqtt__EncryptionKey=<mqtt key>"
$ops += Code "MqttServer__Port=1883"
$ops += Code "MqttServer__Tls__Enabled=true|false"
$ops += Code "Timescale__Enabled=false|true"
$ops += Code "OpenDataFusion__CaptureEnabled=false|true"
$ops += P "Backend không tự load file .env root; dùng env vars / user-secrets / secret manager. Nested key dùng __."

$ops += H1 "10. Stack phụ thuộc" "0E6655" $true
$ops += Bullet ".NET 9 / ASP.NET Core Web"
$ops += Bullet "MQTTnet + MQTTnet.Server 5.1"
$ops += Bullet "Npgsql 10, HealthChecks.NpgSql"
$ops += Bullet "Microsoft.AspNetCore.Authentication.JwtBearer 9"
$ops += Bullet "Swashbuckle (Swagger Development)"
$ops += Bullet "BCrypt.Net-Next"
$ops += Bullet "ProjectReference: fusion-contracts (Fusion.Contracts)"

$ops += H1 "11. API map định hướng" "0E6655" $true
$ops += Code "GET  /api/health"
$ops += Code "POST /api/auth/login  |  GET /api/auth/session  |  POST /api/auth/logout"
$ops += Code "GET  /api/dashboard/summary"
$ops += Code "GET  /api/machines  |  GET /api/machines/{id}"
$ops += Code "GET  /api/production-lines"
$ops += Code "GET  /api/alarms  |  POST .../acknowledge  |  POST .../resolve"
$ops += Code "GET  /api/telemetry/live|log|query"
$ops += Code "GET  /api/v1/assets  |  .../health  |  POST /api/v1/predictions/anomaly"
$ops += Code "POST /api/v1/rca  |  GET /api/v1/predictions/risk/{assetId}"
$ops += Code "POST /api/sync/register  |  POST /api/sync/upload"
$ops += Code "GET  /hubs/telemetry  (SignalR)"
$ops += P "Swagger Development; contract chính thức ở controller + fusion-contracts/contracts/v1."

$ops += H1 "12. Chạy và kiểm thử" "0E6655" $true
$ops += Code "dotnet run --project backend/backend.csproj -- --database-preflight"
$ops += Code "dotnet run --project backend/backend.csproj -- --database-migrate"
$ops += Code "dotnet run --project backend/backend.csproj"
$ops += Code "dotnet test backend.Tests/backend.Tests.csproj"
$ops += Code "dotnet test fusion-adapter.Tests/Fusion.Adapter.Tests.csproj"
$ops += P "Full demo: infrastructure/demo/Start-FullDemo.ps1 (UI 3001, backend 5166, …)."

$ops += H1 "13. Vận hành & troubleshooting" "0E6655" $true
$ops += Bullet "Không start: preflight connection string, Mqtt encryption key, port conflict, CORS/forwarded headers."
$ops += Bullet "Không thấy telemetry: ClientPLC token/topic, MQTT auth, receipts, offline queue edge."
$ops += Bullet "Timescale lỗi: nguồn PostgreSQL vẫn phải nhận; backfill sau khi target healthy."
$ops += Bullet "Alert thiếu: rule enabled? DEFERRED? metric/unit?"
$ops += Bullet "Outbox backlog: giữ Capture; tắt Dispatch nếu identity chưa sẵn sàng; không truncate outbox."

$ops += H1 "14. Rủi ro và khuyến nghị" "0E6655" $true
$ops += Bullet "Managed staging bắt buộc: HTTPS ingress, secret manager, TLS/mTLS MQTT, backup/restore, retention."
$ops += Bullet "Độc lập migration Timescale vs Operations — checklist cutover riêng."
$ops += Bullet "DEFERRED rules không được marketing như feature live."
$ops += Bullet "Service account least privilege; rotate key; audit mọi admin action."
$ops += Bullet "Load test bounded telemetry query trước pilot."

$ops += H1 "15. Kết luận" "0E6655" $true
$ops += P "Backend là trái tim operations path: MQTT ingest, truth store, rules, intelligence, API/UI bridge, optional ODF capture. Thiết kế boundary-first và fail-closed là điểm mạnh. Production NO-GO cho đến khi managed evidence (security, recovery, connector, independent review) hoàn tất."

$ops += H1 "Phụ lục — Nguồn" "0E6655"
$ops += Bullet "backend/Program.cs, Controllers/, Services/, Security/, db/migrations/"
$ops += Bullet "backend/Configuration/event-rules.json, OpenDataFusionCaptureOptions.cs"
$ops += Bullet "backend.csproj, fusion-contracts/, docs/PROJECT-GUIDE.vi.md"

Add-Ops $be $ops
Finish-Report $be "FII AI · Backend Operations API · Báo cáo kỹ thuật"

# ═══════════════════════════════════════════════════════════════
# 3) ODYSSEUS
# ═══════════════════════════════════════════════════════════════
$od = "docs\component-reports\Odysseus-Report.vi.docx"
Write-Host "Building Odysseus report..."
New-ReportShell -File $od -Title "Odysseus — AI Workspace" -Subtitle "Báo cáo kỹ thuật chi tiết (optional plane)" -Accent "6C3483"

$ops = @()
$ops += H1 "1. Tóm tắt điều hành" "6C3483" $true
$ops += P "Odysseus là self-hosted AI workspace (chat, agents, research, documents, email, notes, calendar, local models, MCP). Trong monorepo FII, Odysseus là thành phần TÙY CHỌN — không thuộc core scope FII operations. Nó không thay backend, không đọc DB nhà máy trực tiếp, và không được phép chặn MQTT hot path."
$ops += P "Tích hợp FII: REST bridge /api/mkz/* (admin-only) và MCP plc server đọc FII backend qua MKZ_BACKEND_URL (+ optional MKZ_BACKEND_TOKEN). Profile fii-chat thu gọn pack cá nhân (email/gallery/calendar) để tập trung chat + factory Q&A."
$ops += P "License upstream: AGPL-3.0-or-later. Default UI port: 7000."

$ops += H1 "2. Ranh giới với FII" "6C3483" $true
$ops += Bullet "Ngoài core: PROJECT_PLAN và README nêu rõ Odysseus optional / third-party AI workspace."
$ops += Bullet "Data path: Odysseus → HTTP REST FII backend → (backend) PostgreSQL. Không connection string nhà máy trong Odysseus."
$ops += Bullet "Secrets tách: OPENAI_API_KEY (model provider) ≠ MKZ_BACKEND_TOKEN (factory API). Không đưa provider key ra frontend/MCP config/prompts."
$ops += Bullet "Audit logs FII cố ý không expose qua bridge cho đến khi có least-privilege audit-read policy."
$ops += Bullet "AUTH_ENABLED=false chỉ trusted-local; không expose remote."

$ops += H1 "3. Kiến trúc nội bộ Odysseus" "6C3483" $true
$ops += H2 "3.1 Lớp ứng dụng"
$ops += Bullet "app.py / launcher — FastAPI entry, uvicorn"
$ops += Bullet "core/ — auth, database, session, middleware, FII SSO helper, models"
$ops += Bullet "routes/ — chat, models, memory, MCP, documents, research, mkz_*, auth, admin, …"
$ops += Bullet "src/ — LLM core, agent loop/tools, RAG, embeddings, MCP manager, security (prompt/url/tool)"
$ops += Bullet "services/ — memory, research, search, STT/TTS, shell, hwfit, docs"
$ops += Bullet "mcp_servers/ — email, image_gen, memory, rag, plc_mcp_server"
$ops += Bullet "static/ — SPA UI (app.js, modules), login, themes"
$ops += Bullet "data/ — app.db, sessions, settings, chroma/rag caches, mkz_exports (local only)"

$ops += H2 "3.2 Agent & tools"
$ops += P "Agent loop hỗ trợ tools (shell, files, web, MCP), policy/security layers (tool_policy, tool_security, prompt_security, url_safety). Skills, presets, memory vector, context budget/compactor kiểm soát context window."

$ops += H2 "3.3 RAG & embeddings"
$ops += P "ChromaDB optional (CHROMADB_DISABLED=true cho fii-chat dev). FastEmbed local ONNX; HF_HUB_DISABLE_XET=1 tránh hang download dev. scripts/index_documents.py, verify_mkz_rag.py, sync_mkz_to_odysseus.py hỗ trợ knowledge factory docs."

$ops += H1 "4. Tính năng sản phẩm (upstream + FII)" "6C3483" $true
$ops += Bullet "Chat + Agents — local/API models, tools, MCP, files, shell, skills, memory"
$ops += Bullet "Cookbook — gợi ý model theo hardware, download/serve"
$ops += Bullet "Deep Research — multi-step web research + report"
$ops += Bullet "Compare — blind side-by-side model test"
$ops += Bullet "Documents — editor AI-assisted (Markdown/HTML/CSV)"
$ops += Bullet "Email / Notes / Tasks / Calendar — personal productivity (có thể tắt bằng fii-chat profile)"
$ops += Bullet "Gallery, themes, uploads, web search, 2FA, webhooks"
$ops += Bullet "FII bridge: dashboard, machines, lines, alarms, telemetry, production reports, system-info"
$ops += Bullet "Companion pairing (companion/) — device pairing flows"

$ops += H1 "5. FII REST bridge & MCP" "6C3483" $true
$ops += H2 "5.1 Endpoints bridge (admin session hoặc internal trusted tool path)"
$ops += Code "GET /api/mkz/health"
$ops += Code "GET /api/mkz/dashboard"
$ops += Code "GET /api/mkz/machines"
$ops += Code "GET /api/mkz/production-lines"
$ops += Code "GET /api/mkz/alarms"
$ops += Code "GET /api/mkz/reports/production"
$ops += Code "GET /api/mkz/telemetry"
$ops += Code "GET /api/mkz/system-info"
$ops += P "Unauthenticated /api/mkz/health → HTTP 401 (kể cả localhost). /api/mkz/gateway/... có policy riêng."
$ops += H2 "5.2 Token transport"
$ops += P "MKZ_BACKEND_TOKEN chỉ gửi HTTPS cho backend non-loopback; HTTP chỉ loopback (localhost/127.0.0.1/::1). Từ chối remote plaintext + token."
$ops += H2 "5.3 MCP PLC"
$ops += P "mcp_servers/plc_mcp_server.py + plc_mcp_config.json — tools đọc factory qua backend URL. Shared MCP không multi-tenant per-browser-user trong setup hiện tại → bridge admin-only."

$ops += H1 "6. Profile fii-chat (khuyến nghị monorepo)" "6C3483" $true
$ops += Code "ODYSSEUS_PROFILE=fii-chat"
$ops += Code "CHROMADB_DISABLED=true"
$ops += Code "HF_HUB_DISABLE_XET=1"
$ops += Code "MKZ_BACKEND_URL=http://localhost:5166"
$ops += Code "FII_SSO_ENABLED=true"
$ops += P "Profile bỏ email/cookbook/gallery/calendar packs; giữ chat, models, memory, MCP, MKZ routes. Bật Chroma khi cần RAG: docker compose up chromadb + CHROMADB_DISABLED=false."

$ops += H1 "7. Chạy local" "6C3483" $true
$ops += Code "cd Odysseus"
$ops += Code ".\\launch-windows.ps1"
$ops += Code "# hoặc: .\\venv\\Scripts\\python.exe -m uvicorn app:app --host 127.0.0.1 --port 7000"
$ops += P "Docker: docker compose up -d --build; mở http://localhost:7000; admin password trong logs. GPU: docker-compose.gpu-nvidia.yml / gpu-amd.yml. Setup chi tiết: Odysseus/docs/setup.md."

$ops += H1 "8. Bảo mật" "6C3483" $true
$ops += Bullet "Giữ auth enabled; không public raw model ports."
$ops += Bullet "Private data ngoài Git; settings_scrub / secret_storage cho keys."
$ops += Bullet "Tool/shell policy — hạn chế destructive tools trên host production."
$ops += Bullet "THREAT_MODEL.md, SECURITY.md, security-ci docs — đọc trước expose."
$ops += Bullet "Rate limiter, session manager, log_safety redaction."
$ops += Bullet "Không coi Odysseus là compliance boundary cho OT network."

$ops += H1 "9. Kiểm thử" "6C3483" $true
$ops += P "Odysseus/tests/ chứa quy mô lớn (hàng trăm test modules). Chạy theo subset liên quan integration FII (mkz routes, auth, MCP). Monorepo full-demo có thể start Odysseus cùng stack (port 7000)."

$ops += H1 "10. Rủi ro, giới hạn, roadmap sử dụng trong FII" "6C3483" $true
$ops += Bullet "Optional: sự cố Odysseus không được làm fail operations path."
$ops += Bullet "Admin-only bridge hạn chế multi-user least privilege — cần model auth tốt hơn trước production chat-for-all."
$ops += Bullet "RAG factory docs: verify_mkz_rag + sync scripts; content governance bắt buộc."
$ops += Bullet "AGPL implications nếu distribute modifications — legal review."
$ops += Bullet "Hallucination risk: agent answers không thay sensor truth; UI/ops vẫn authoritative."
$ops += Bullet "Khuyến nghị: staging lab only; SSO; no OT write tools; audit prompts/tools."

$ops += H1 "11. Kết luận" "6C3483" $true
$ops += P "Odysseus bổ sung plane AI/chat/RAG cho FII nhưng không phải lõi giám sát nhà máy. Dùng đúng ranh giới REST/MCP read-only, secrets tách, profile fii-chat, và không nâng release claim FII dựa trên chat demo. Production operations go-live độc lập với Odysseus readiness."

$ops += H1 "Phụ lục — Nguồn" "6C3483"
$ops += Bullet "Odysseus/README.md, INTEGRATION.md, docs/setup.md, THREAT_MODEL.md"
$ops += Bullet "routes/mkz_routes.py, mkz_gateway_routes.py, mcp_servers/plc_mcp_server.py"
$ops += Bullet "scripts/sync_mkz_to_odysseus.py, verify_mkz_rag.py"

Add-Ops $od $ops
Finish-Report $od "FII AI · Odysseus AI Workspace · Báo cáo kỹ thuật"

# ═══════════════════════════════════════════════════════════════
# 4) ODF
# ═══════════════════════════════════════════════════════════════
$odf = "docs\component-reports\ODF-Report.vi.docx"
Write-Host "Building ODF report..."
New-ReportShell -File $odf -Title "Open Data Fusion (ODF)" -Subtitle "Báo cáo kỹ thuật chi tiết" -Accent "B9770E"

$ops = @()
$ops += H1 "1. Tóm tắt điều hành" "B9770E" $true
$ops += P "Open Data Fusion (ODF) là nền tảng open-source (Apache-2.0) cho governed industrial data integration, contextualization và visual collaboration. Trong workspace FII có hai bề mặt: Open-Data-Fusion/ (product đầy đủ) và third_party/open-data-fusion/ (submodule upstream pin cho preview MKZ). ODF pre-release — không nối OT production / không thực thi industrial control khi chưa review an toàn độc lập."
$ops += P "Với FII: dữ liệu vào ODF qua Fusion Adapter + transactional outbox từ backend — ngoài hot path MQTT. Capture và Dispatch là hai cờ độc lập. ODF down không được dừng telemetry local."

$ops += H1 "2. Vai trò trong hệ sinh thái FII" "B9770E" $true
$ops += Bullet "Secondary data product plane: hierarchy Plant→Line→Machine, time series, datapoints, provenance."
$ops += Bullet "External ID convention: mkz:plant:*, mkz:line:*, mkz:machine:*, mkz:ts:*"
$ops += Bullet "fusion-adapter map bundle + lease/retry/dead-letter trên outbox backend."
$ops += Bullet "Preview loopback: infrastructure/open-data-fusion/Start|Test-OpenDataFusionPreview.ps1"
$ops += Bullet "Không dual-write authoritative giữa SQLite product ODF và PostgreSQL; chọn một ODF_DATA_PERSISTENCE."

$ops += H1 "3. Nguyên tắc thiết kế" "B9770E" $true
$ops += Bullet "Evidence before convenience — provenance, correlation, model version, audit."
$ops += Bullet "Review before truth — contextualization/matching = candidates, không silent fact."
$ops += Bullet "One source of truth — projections rebuildable; no dual-write authoritative stores."
$ops += Bullet "Fail closed — thiếu identity/project/policy/approval/executor → block."
$ops += Bullet "Local-first, production-aware — SQLite dev đơn giản; Postgres multi-instance path."
$ops += Bullet "Clean-room — không affiliate Cognite Data Fusion; branding độc lập."

$ops += H1 "4. Kiến trúc sản phẩm" "B9770E" $true
$ops += H2 "4.1 Apps"
$ops += Bullet "apps/web — React + Vite Asset Explorer + Industrial Canvas"
$ops += Bullet "apps/api — TypeScript REST API (Express-style platform), auth, industrial persistence"
$ops += Bullet "apps/edge-agent — CSV / PostgreSQL / OPC UA read-only collection, checkpoint, queue, retry"
$ops += Bullet "apps/outbox-worker — publish committed Postgres events → Redis Streams"
$ops += Bullet "apps/pipeline-worker — scoped/gated pipelines"
$ops += H2 "4.2 Packages"
$ops += Bullet "packages/contracts — shared contracts"
$ops += Bullet "packages/platform-core — modeling & platform core"
$ops += Bullet "packages/postgres-runtime — Postgres adapters, RLS-aware runtime"
$ops += H2 "4.3 Infra"
$ops += Bullet "infra/postgres/migrations — industrial + canvas + admin schemas"
$ops += Bullet "infra/keycloak — local OIDC realm"
$ops += Bullet "infra/minio — S3-compatible object store bootstrap"
$ops += Bullet "infra/observability — Prometheus, Grafana, OTEL collector, alerts/SLO"
$ops += Bullet "infra/security — mTLS rehearsal, Envoy, network policies, secret contract"
$ops += Bullet "infra/ci — production-like smoke, backup/restore, edge mTLS, gate validator"
$ops += Bullet "docker-compose.yml + production-like + identity + security-rehearsal profiles"

$ops += H1 "5. Năng lực sản phẩm (capability map)" "B9770E" $true
$ops += Bullet "Asset Explorer (Available) — hierarchy search, telemetry, documents, relations, lineage"
$ops += Bullet "Industrial Canvas (Available) — compose assets/telemetry/docs, revisions, undo/redo, rollback"
$ops += Bullet "Collaboration (Available) — owner/editor/reviewer/viewer, presence, SSE updates, optimistic concurrency"
$ops += Bullet "Ingestion (Available) — project-scoped atomic idempotent bundles + provenance (SQLite|Postgres)"
$ops += Bullet "Governed objects (Available) — versioned upload/download, SHA-256, ETag, SSE encryption; Postgres + shared S3"
$ops += Bullet "Telemetry serving (Available) — raw, latest/as-of, bounded aggregates + quality"
$ops += Bullet "Tenant/project discovery (Available) — membership-scoped"
$ops += Bullet "Platform admin/catalogs (Optional) — Postgres administration, datasets, connectors, write-back ledger"
$ops += Bullet "Contextualization / diagrams / matching / spatial (Gated) — candidates + review evidence"
$ops += Bullet "Industrial write-back (Gated) — dry-run, allowlist, SoD approvals, external executor"
$ops += Bullet "OIDC/Keycloak (Optional) — Auth Code+PKCE, JWT, permission claims"
$ops += Bullet "Edge collection (Optional) — checkpointed read-only sources"
$ops += Bullet "Workers/broker (Optional) — outbox → Redis Streams multi-instance"
$ops += Bullet "Observability (Optional) — metrics, traces, alerts, Grafana"

$ops += H1 "6. Persistence profiles" "B9770E" $true
$ops += P "ODF_DATA_PERSISTENCE=sqlite|postgres — một backend authoritative mỗi process. Postgres: industrial core, Canvas, tenant/project admin, catalogs, advanced product, search projection, write-back records dùng Postgres + forced RLS where applicable. Không fallback silent sang SQLite replica-local cho authoritative product records. Shared object bytes: private S3-compatible; metadata RLS-scoped."
$ops += P "ODF_SEED=true chỉ opt-in fixture UI/collaboration — clean start = empty durable DB."

$ops += H1 "7. Tích hợp FII (outbox path)" "B9770E" $true
$ops += H2 "7.1 Capture (backend)"
$ops += P "OpenDataFusion__CaptureEnabled=true → backend ghi fusion_outbox trong transaction nghiệp vụ khi telemetry/event hợp lệ."
$ops += H2 "7.2 Dispatch (adapter)"
$ops += P "OpenDataFusion__DispatchEnabled + tenant/project/identity → fusion-adapter claim lease, map OpenDataFusionBundleMapper, POST ODF ingest, retry/dead-letter. Local preview trước khi bật dispatch."
$ops += H2 "7.3 Preview an toàn"
$ops += Code "git submodule update --init --recursive"
$ops += Code ".\\infrastructure\\open-data-fusion\\Start-OpenDataFusionPreview.ps1"
$ops += Code ".\\infrastructure\\open-data-fusion\\Test-OpenDataFusionPreview.ps1"
$ops += P "Default loopback: API 54310, web 58088, Postgres 55432, Redis 56379, Grafana 53000, Prometheus 59090. Synthetic tenant/project — không phải staging provisioning."
$ops += H2 "7.4 Rollback local"
$ops += P "Capture=false trước restart backend; dừng adapter; giữ pending outbox; sửa identity/network; bật lại dispatch khi sẵn sàng."

$ops += H1 "8. Bảo mật & governance" "B9770E" $true
$ops += Bullet "OIDC; server-side authorization; tenant/project membership"
$ops += Bullet "Postgres RLS forced cho multi-tenant data plane"
$ops += Bullet "Write-back: policy allowlist + independent approvals + external executor only"
$ops += Bullet "Edge agent read-only by design; mTLS rehearsal scripts"
$ops += Bullet "Secret contract; no production secrets in repo"
$ops += Bullet "docs/security/authentication.md, production-ingress-security.md"
$ops += Bullet "Pre-release warning: independent security/safety review trước OT"

$ops += H1 "9. Vận hành, cutover, pilot" "B9770E" $true
$ops += Bullet "SQLite→Postgres cutover: preflight CLI, dry-run import, checksum, explicit apply gate"
$ops += Bullet "Outbox dead-letter recovery runbook"
$ops += Bullet "Postgres backup/restore rehearsal"
$ops += Bullet "Production-like compose + smoke + observability smoke"
$ops += Bullet "pilot-gate / validate-production-gates.py — evidence-driven go/no-go"
$ops += Bullet "SLO docs: docs/operations/observability-slos.md"

$ops += H1 "10. Chạy standalone product" "B9770E" $true
$ops += Code "cd Open-Data-Fusion"
$ops += Code "npm install"
$ops += Code "npm run dev"
$ops += P "Production-like: docker-compose.production-like.yml + identity profile. Node.js 24+. Tests: vitest per app/package. CI workflows: ci, infra-validate, security."

$ops += H1 "11. Rủi ro và khuyến nghị cho FII" "B9770E" $true
$ops += Bullet "Luôn tách Operations path vs ODF path trong incident response."
$ops += Bullet "Không bật Dispatch trước tenant/project/OIDC proven."
$ops += Bullet "Không sửa third_party submodule để chứa secret MKZ."
$ops += Bullet "Contextualization candidates cần human review trước trust."
$ops += Bullet "Write-back executor production = change-control formal."
$ops += Bullet "FII release gate độc lập: ODF preview green ≠ FII production GO."

$ops += H1 "12. Kết luận" "B9770E" $true
$ops += P "ODF cung cấp plane dữ liệu công nghiệp có provenance, Explorer/Canvas, governance và đường multi-instance Postgres. Trong FII, ODF là secondary delivery target qua outbox — thiết kế đúng khi Capture/Dispatch tách và operations vẫn sống nếu ODF down. Pre-release: dùng preview/staging evidence, không over-claim production OT readiness."

$ops += H1 "Phụ lục — Nguồn" "B9770E"
$ops += Bullet "Open-Data-Fusion/README.md, docs/architecture/*, docs/operations/*, docs/cdf-capability-map.md"
$ops += Bullet "fusion-adapter/, infrastructure/open-data-fusion/"
$ops += Bullet "third_party/open-data-fusion/ (pin), docs/PROJECT-GUIDE.vi.md §4.5–4.7"

Add-Ops $odf $ops
Finish-Report $odf "FII AI · Open Data Fusion · Báo cáo kỹ thuật"

Write-Host "`nAll reports written to docs/component-reports/"
Get-ChildItem docs\component-reports\*.docx | Format-Table Name, Length, LastWriteTime
