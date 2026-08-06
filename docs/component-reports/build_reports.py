# -*- coding: utf-8 -*-
"""Build 4 detailed component Word reports via officecli."""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent


def run(args: list[str]) -> str:
    r = subprocess.run(
        args,
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if r.returncode != 0:
        msg = (r.stderr or r.stdout or "").strip()
        raise RuntimeError(f"Command failed ({r.returncode}): {' '.join(args)}\n{msg}")
    return r.stdout


def batch(file: str, ops: list[dict]) -> None:
    tmp = Path(tempfile.gettempdir()) / f"officecli-{uuid.uuid4().hex}.json"
    tmp.write_text(json.dumps(ops, ensure_ascii=False), encoding="utf-8")
    try:
        out = run(["officecli", "batch", file, "--input", str(tmp), "--json"])
        data = json.loads(out)
        summary = data.get("data", {}).get("summary") or data.get("summary") or {}
        failed = summary.get("failed", 0)
        if failed:
            raise RuntimeError(f"Batch failed for {file}: {summary}\n{out[-2000:]}")
    finally:
        tmp.unlink(missing_ok=True)


def h1(text: str, color: str = "1B4F72", page_break: bool = False) -> dict:
    props = {
        "text": text,
        "style": "Heading1",
        "size": "20pt",
        "bold": "true",
        "color": color,
        "spaceBefore": "16pt",
        "spaceAfter": "10pt",
    }
    if page_break:
        props["pageBreakBefore"] = "true"
    return {"command": "add", "parent": "/body", "type": "paragraph", "props": props}


def h2(text: str, color: str = "2E86AB") -> dict:
    return {
        "command": "add",
        "parent": "/body",
        "type": "paragraph",
        "props": {
            "text": text,
            "style": "Heading2",
            "size": "14pt",
            "bold": "true",
            "color": color,
            "spaceBefore": "12pt",
            "spaceAfter": "8pt",
        },
    }


def p(text: str, size: str = "11pt") -> dict:
    return {
        "command": "add",
        "parent": "/body",
        "type": "paragraph",
        "props": {"text": text, "style": "Normal", "size": size, "spaceAfter": "6pt"},
    }


def code(text: str) -> dict:
    return {
        "command": "add",
        "parent": "/body",
        "type": "paragraph",
        "props": {
            "text": text,
            "style": "Normal",
            "size": "10pt",
            "font": "Consolas",
            "spaceAfter": "2pt",
        },
    }


def bullet(text: str) -> dict:
    return {
        "command": "add",
        "parent": "/body",
        "type": "paragraph",
        "props": {
            "text": f"• {text}",
            "style": "Normal",
            "size": "11pt",
            "spaceAfter": "3pt",
            "indent": "360",
        },
    }


def shell(file: str, title: str, subtitle: str, accent: str) -> None:
    path = OUT / file
    if path.exists():
        path.unlink()
    rel = str(path.relative_to(ROOT))
    run(["officecli", "create", rel])
    run(["officecli", "open", rel])
    run(
        [
            "officecli",
            "set",
            rel,
            "/",
            "--prop",
            "docDefaults.font=Calibri",
            "--prop",
            "docDefaults.fontSize=11pt",
        ]
    )
    ops = [
        {
            "command": "add",
            "parent": "/body",
            "type": "paragraph",
            "props": {
                "text": title,
                "style": "Title",
                "size": "26pt",
                "bold": "true",
                "align": "center",
                "color": accent,
                "spaceBefore": "48pt",
                "spaceAfter": "10pt",
            },
        },
        {
            "command": "add",
            "parent": "/body",
            "type": "paragraph",
            "props": {
                "text": subtitle,
                "style": "Subtitle",
                "size": "16pt",
                "align": "center",
                "color": "2E86AB",
                "spaceAfter": "16pt",
            },
        },
        p("FII AI / MKZ Factory Monitor - Component Technical Report"),
        p("Document date: 5 August 2026 | Language: Vietnamese"),
        {
            "command": "add",
            "parent": "/body",
            "type": "paragraph",
            "props": {
                "text": "Release posture: Staging candidate - NO-GO for production",
                "size": "11pt",
                "bold": "true",
                "align": "center",
                "color": "922B21",
                "spaceAfter": "24pt",
            },
        },
        {
            "command": "add",
            "parent": "/body",
            "type": "paragraph",
            "props": {
                "text": "Sources: source code, README, PROJECT_PLAN.md, docs/PROJECT-GUIDE.vi.md, docs/release-evidence/.",
                "size": "10pt",
                "align": "center",
                "color": "666666",
                "spaceAfter": "12pt",
                "pageBreakBefore": "true",
            },
        },
        h1("Muc luc", accent),
        {"command": "add", "parent": "/", "type": "toc", "props": {"levels": "1-2", "title": ""}},
    ]
    # fix centered body on cover lines that used p() without align
    ops[2] = {
        "command": "add",
        "parent": "/body",
        "type": "paragraph",
        "props": {
            "text": "FII AI / MKZ Factory Monitor - Component Technical Report",
            "size": "11pt",
            "align": "center",
            "color": "555555",
            "spaceAfter": "6pt",
        },
    }
    ops[3] = {
        "command": "add",
        "parent": "/body",
        "type": "paragraph",
        "props": {
            "text": "Document date: 5 August 2026 | Language: Vietnamese",
            "size": "11pt",
            "align": "center",
            "spaceAfter": "4pt",
        },
    }
    batch(rel, ops)
    return rel  # type: ignore


def finish(rel: str, header: str) -> None:
    run(
        [
            "officecli",
            "add",
            rel,
            "/",
            "--type",
            "header",
            "--prop",
            "type=default",
            "--prop",
            f"text={header}",
            "--prop",
            "size=9pt",
            "--prop",
            "color=666666",
        ]
    )
    run(["officecli", "set", rel, "/header[1]/p[1]", "--prop", "align=right"])
    run(
        [
            "officecli",
            "add",
            rel,
            "/",
            "--type",
            "footer",
            "--prop",
            "type=default",
            "--prop",
            "size=9pt",
            "--prop",
            "text=FII AI | Staging candidate | Trang ",
            "--prop",
            "field=page",
        ]
    )
    run(["officecli", "set", rel, "/footer[1]/p[1]", "--prop", "align=center"])
    run(["officecli", "set", rel, "/settings", "--prop", "updateFields=true"])
    run(["officecli", "save", rel])
    try:
        run(["officecli", "close", rel])
    except RuntimeError:
        pass
    out = run(["officecli", "validate", rel])
    print(f"OK {rel}: {out.strip()}")


def frontend_ops(c: str) -> list[dict]:
    return [
        h1("1. Tom tat dieu hanh", c, True),
        p(
            "Frontend cua FII AI (MKZ Factory Monitor) la ung dung web Operations UI, viet bang React 19 + TypeScript + Vite 8. "
            "Day la lop trinh bay chinh cho van hanh: dashboard KPI, production lines, machines, alarms, reports, simulation "
            "va cac man hinh quan tri (users, audit, settings)."
        ),
        p(
            "Ung dung ho tro ba vai tro ADMIN, ENGINEER va GUEST voi ban do permission phia client; ranh gioi bao mat that van nam o backend "
            "(JWT cookie / API policy). Co che do demo (synthetic GET) de trinh dien UI khong can backend; thao tac ghi khong duoc gia lap thanh cong."
        ),
        p(
            "Pham vi thu muc: frontend/. Khong mo PLC, khong ghi PostgreSQL truc tiep - moi du lieu van hanh di qua REST API backend (va optional SignalR)."
        ),
        h1("2. Vai tro trong kien truc FII", c, True),
        p("Trong luong end-to-end, Frontend dung sau Operations backend:"),
        bullet("ClientPLC -> MQTT -> Backend ingest -> PostgreSQL / rules / health"),
        bullet("Frontend goi REST (Axios) + cookie credentials; Bearer token neu session co token"),
        bullet("Refresh theo scope (monitoring / all) qua routeMeta + React Query"),
        bullet("Khong thuoc hot path MQTT; ODF/Odysseus khong bat buoc de UI chay"),
        h2("2.1 Ranh gioi trach nhiem"),
        bullet(
            "Duoc phep: hien thi KPI, drill-down may, ack/resolve alarm (neu role du), cau hinh line/machine (role du), user/audit (ADMIN)."
        ),
        bullet(
            "Khong duoc: coi route guard frontend la bien bao mat duy nhat; khong commit secret; khong dung VITE_* cho credential production."
        ),
        bullet("Demo mode: chi synthetic GET; write khong gia success - tranh hieu nham demo la production."),
        h1("3. Kien truc thu muc va module", c, True),
        h2("3.1 Cau truc src/"),
        bullet("app/ - router, permissions, providers, i18n (en/vi/zh-CN), queryClient, routeMeta, theme CSS tokens"),
        bullet(
            "features/ - domain modules: auth, dashboard, alarms, alerts, machines, production-lines, health, predictions, admin, simulation, assets, system"
        ),
        bullet(
            "pages/ - page containers theo role (admin/, engineer/, viewer/) va shared pages (Lines, Machines, Alarms, Reports, Simulation, Login)"
        ),
        bullet("shared/ - layout (ModernShell, AppLayout, ViewerLayout), UI kit, apiClient, stores (Zustand), types, hooks"),
        bullet("test/ - setup Vitest + Testing Library utilities"),
        h2("3.2 Feature-first organization"),
        p(
            "Moi feature thuong co components/, services/*.api.ts va doi khi view-model/tests. API layer tach khoi UI; "
            "TanStack Query cache key tap trung o app/queryKeys.ts va queryOptions.ts."
        ),
        h1("4. Luong nguoi dung va routing", c, True),
        h2("4.1 Public / auth"),
        bullet("/login - LoginPage (SSO/JWT session)"),
        bullet("/logout - clear session + navigate login"),
        bullet("/403, /404 - Forbidden / Not Found"),
        h2("4.2 Viewer shell (GUEST va mac dinh viewer)"),
        bullet("/ - Dashboard overview (ModernDashboard)"),
        bullet("/lines - production lines + diagram"),
        bullet("/machines, /machines/:id - list + detail tabs (telemetry, health)"),
        bullet("/alarms - filter, detail, lifecycle (view; mutate theo permission)"),
        bullet("/production-analysis - phan tich san luong"),
        bullet("/settings - viewer settings"),
        bullet("/slideshow - presentation mode van hanh"),
        h2("4.3 Admin shell (/admin/*) - ADMIN + ENGINEER"),
        bullet("/admin - role-aware dashboard"),
        bullet("/admin/lines, machines, alarms, reports, simulation, settings"),
        bullet("/admin/users, /admin/audit-logs - ADMIN only"),
        p("Lazy loading (React.lazy + Suspense) giam initial bundle. ProtectedRoute kiem tra auth va allowedRoles."),
        h1("5. Chuc nang nghiep vu chi tiet", c, True),
        h2("5.1 Dashboard"),
        p(
            "ModernDashboard / SharedDashboardPage hien thi KPI grid, line operations, machine nodes, active alarms, predictive alerts, health bands. "
            "View-model (dashboardViewModel) chuan hoa payload API thanh UI state. Data polling/refresh theo scope monitoring."
        ),
        h2("5.2 Lines va diagram"),
        p(
            "LinesPage + DiagramEditor (React Flow / @xyflow/react) cho phep xem va cau hinh so do line-machine. "
            "Engineer/Admin co quyen configure; Guest chi view."
        ),
        h2("5.3 Machines"),
        p(
            "MachineListPage va MachineDetailPage voi tabs telemetry, health, hourly production. "
            "Machine detail CSS va iconography ho tro nhan dien trang thai RUNNING/IDLE/STOPPED/ERROR/OFFLINE."
        ),
        h2("5.4 Alarms / Alerts"),
        p(
            "AlarmPage + AlertCenter components: filter, detail, acknowledge/resolve. "
            "Alarms API va alerts API tach service; UI phan anh lifecycle backend."
        ),
        h2("5.5 Health and predictions"),
        p(
            "HealthScoreCard, HealthBadge, RiskGauge - hien thi health score/band va failure risk. "
            "PredictiveAlertPanel tren dashboard. Du lieu tu health.api / predictions.api / predictiveAlerts.api."
        ),
        h2("5.6 Reports and simulation"),
        p(
            "ReportsPage lay chart/report data tu backend. SimulationPage (Admin/Engineer) kich hoat synthetic data cho demo/kiem thu - "
            "khong thay production telemetry."
        ),
        h2("5.7 Admin"),
        p(
            "UserManagementPage, AuditLogPage, SettingsPage (role-aware). UserRoleBadge, SettingsSection. "
            "Permission users.manage / auditLogs.view chi ADMIN."
        ),
        h1("6. Stack cong nghe", c, True),
        bullet("Runtime UI: React 19.2, React DOM, TypeScript ~6"),
        bullet("Build: Vite 8, @vitejs/plugin-react, Tailwind CSS 4"),
        bullet("Routing: react-router-dom 7"),
        bullet("Data: TanStack React Query 5, Axios, Zustand"),
        bullet("Forms/validation: react-hook-form, Zod, @hookform/resolvers"),
        bullet("Charts/diagram: Recharts 3, @xyflow/react 12"),
        bullet("i18n: i18next + react-i18next (en, vi, zh-CN)"),
        bullet("Motion/icons: GSAP, lucide-react"),
        bullet("Test: Vitest, Testing Library, Playwright (e2e + e2e:live)"),
        bullet("Quality: ESLint 10, typescript-eslint, i18n:check script"),
        h1("7. Phan quyen (client map)", c, True),
        p(
            "permissions.ts dinh nghia Permission keys: dashboard.view, lines.view/configure, machines.view/configure, "
            "alarms.view/mutate, reports.view, users.manage, auditLogs.view, assets.configure."
        ),
        bullet("ADMIN: full set"),
        bullet("ENGINEER: full tru users.manage, auditLogs.view"),
        bullet("GUEST: view-only (dashboard, lines, machines, alarms, reports)"),
        p("usePermissions hook va ProtectedRoute dung map nay cho UX. Backend van enforce policy tren moi request ghi."),
        h1("8. Data layer va session", c, True),
        bullet("apiClient.ts - base URL tu VITE_API_URL (dev) hoac /api proxy; withCredentials; attach Bearer neu co"),
        bullet("apiClient.mock.ts + MODE=demo / VITE_ENABLE_API_MOCKS - mock GET"),
        bullet("auth.store (Zustand) - role, session, logout"),
        bullet("session.service / validation.service - chuan hoa session va payload"),
        bullet("errors.ts - map loi RFC 7807 problem+json sang UI message"),
        bullet("openDataFusion.ts - config lien quan surface ODF (neu bat), khong phai hot path"),
        h1("9. Theming va UX", c, True),
        p(
            "Theme tokens (theme-tokens.css), dark/light themes, modern-shell.css, industrial dashboard CSS (modern-dashboard.css). "
            "Shared UI: Badge, Button, Modal, DataState, EmptyState, PageHeader, StatCard, StatusBadge, ToastContainer, "
            "TechBackground/TechPanel. LanguageSelector ho tro da ngon ngu."
        ),
        h1("10. Chay, build, kiem thu", c, True),
        h2("10.1 Demo UI khong backend"),
        code("npm --prefix frontend ci"),
        code("npm --prefix frontend run demo"),
        p("Mo http://127.0.0.1:3000 - synthetic GET only."),
        h2("10.2 Dev voi backend"),
        code("set VITE_API_URL=http://localhost:5166/api"),
        code("npm --prefix frontend run dev"),
        h2("10.3 Quality gates"),
        code("npm --prefix frontend run test:run"),
        code("npm --prefix frontend run type-check"),
        code("npm --prefix frontend run lint"),
        code("npm --prefix frontend run build"),
        code("npm --prefix frontend run e2e"),
        code("npm --prefix frontend run i18n:check"),
        h1("11. Rui ro, gioi han va khuyen nghi", c, True),
        bullet("Route guard frontend khong thay the authorization backend."),
        bullet("Demo mode de gay hieu nham production-ready - luon label moi truong."),
        bullet("Refresh polling can can bang load; uu tien scope monitoring dung route."),
        bullet("Bundle size: giu lazy routes; dung analyze khi nghi ngo regression."),
        bullet("i18n: moi chuoi UI qua key; chay i18n:check truoc merge."),
        bullet("Truoc staging: e2e:live chong backend that, khong chi unit."),
        h1("12. Ket luan", c, True),
        p(
            "Frontend la be mat van hanh chinh cua FII AI: feature-first, role-aware, da ngon ngu, co demo path an toan. "
            "Do tin cay production phu thuoc backend auth, contract on dinh va evidence e2e/live - khong chi green unit test. "
            "Component nay staging-ready cho demo va integration rehearsal; khong tu nang release claim len production."
        ),
        h1("Phu luc A. Route map tom tat", c, True),
        p("Viewer: /, /lines, /machines, /machines/:id, /alarms, /settings, /production-analysis, /slideshow"),
        p(
            "Admin: /admin, /admin/lines, /admin/machines, /admin/alarms, /admin/reports, /admin/simulation, "
            "/admin/settings, /admin/users, /admin/audit-logs"
        ),
        p("Auth: /login, /logout, /403, /404"),
        h1("Phu luc B. Nguon tham chieu", c),
        bullet("frontend/package.json, src/app/router.tsx, permissions.ts, routeMeta.ts"),
        bullet("features/dashboard, features/auth, shared/services/apiClient.ts"),
        bullet("docs/PROJECT-GUIDE.vi.md muc 4.4; README.md muc 4.3"),
    ]


def backend_ops(c: str) -> list[dict]:
    return [
        h1("1. Tom tat dieu hanh", c, True),
        p(
            "Backend FII AI la dich vu ASP.NET Core tren .NET 9 - trung tam cua duong du lieu van hanh. "
            "No nhan telemetry MQTT tu ClientPLC, ghi PostgreSQL (authoritative), optional dual-write TimescaleDB, "
            "danh gia event rules/CEP, quan ly alarm lifecycle, health score, prediction, REST API cho UI, SignalR hub, "
            "sync ClientPLC, simulation, reports, va ghi fusion_outbox khi bat capture ODF."
        ),
        p(
            "Backend fail-closed voi nhieu secret bat buoc (JWT key, MQTT encryption key, tenant id, connection string). "
            "Local green khong thay the managed staging gate."
        ),
        h1("2. Vai tro trong kien truc", c, True),
        bullet("PLC/Operations boundary: tiep tuc ingest/serve khi ODF hoac AI plane down."),
        bullet("PostgreSQL Operations: nguon su that; migrations backend/db/migrations/0001-0006."),
        bullet("Timescale: mirror/query path rieng (infrastructure/timescaledb); khong gop migration."),
        bullet("Secondary delivery: outbox transactional; Fusion Adapter process rieng (Dispatch)."),
        bullet("AI/Odysseus: doc REST; khong inject vao MQTT hot path."),
        h1("3. Thanh phan runtime", c, True),
        h2("3.1 Controllers (REST surface)"),
        bullet("AuthController - login/session/logout SSO-JWT"),
        bullet("DashboardController - KPI summary"),
        bullet("MachineController, ProductionLineController, AssetController - catalog va hierarchy"),
        bullet("TelemetryController, TelemetryQueryController - live/log/query/Timescale"),
        bullet("AlarmsController, AlertController, EventLogController, EventRulesController"),
        bullet("AssetHealthController, MachineHealthController, PredictionController, RcaController"),
        bullet("SyncController - ClientPLC register/upload"),
        bullet("UsersController, AuditLogController - admin"),
        bullet("ReportsController, SimulationController, ConnectorIntegrationController"),
        h2("3.2 Services va background jobs"),
        bullet("TelemetryIngestionService + TelemetryStore - chuan hoa va persistence"),
        bullet("MqttServerService - embedded MQTT broker (MQTTnet Server)"),
        bullet("EventRuleEngine - threshold rules tu Configuration/event-rules.json"),
        bullet("AlertService - open/ack/resolve, dedup, suppression"),
        bullet("HealthScoringService + HealthScoringJob - multi-factor score/band"),
        bullet("PredictiveService + BatchPredictionJob - anomaly/risk batch"),
        bullet("TimescaleTelemetryService + TimescaleBackfillRunner - dual-write va backfill"),
        bullet("CepStagingPublisher - staging CEP events"),
        bullet("SyncService, SimulationService, AuditService, DatabaseService"),
        bullet("OperationalDatabaseMigrationService - apply SQL migrations"),
        h2("3.3 Security package"),
        bullet("FiiSso, JWT Bearer, ApiKeyAuthHandler (service accounts, hash storage)"),
        bullet("MqttDeviceTokenValidator, CryptoHelper, PasswordHasher (BCrypt)"),
        bullet("ApiProblemResponse - RFC 7807 problem+json"),
        bullet("ExceptionHandlingMiddleware, ProblemDetailsResultFilter"),
        h2("3.4 Realtime"),
        p("Hubs/TelemetryHub.cs - SignalR cho push canh bao/telemetry quan trong (kem authorization)."),
        h1("4. Luong telemetry end-to-end", c, True),
        p("1) ClientPLC publish MQTT payload (optional TLS, device token, encrypted payload)."),
        p("2) MqttServerService authenticate/authorize topic ownership."),
        p("3) TelemetryIngestionService validate schema -> write PostgreSQL trong transaction."),
        p("4) Neu Timescale:Enabled, dual-write sau transaction nguon."),
        p("5) EventRuleEngine evaluate -> event_log + alerts."),
        p("6) Health/Prediction jobs dinh ky cap nhat score/risk."),
        p("7) UI doc REST; critical alerts co the push SignalR."),
        p("8) Neu OpenDataFusion:CaptureEnabled, ghi fusion_outbox cung intent."),
        h1("5. Mo hinh du lieu va migration", c, True),
        bullet("0001_operational_baseline - lines, machines, assets, users, alarms, simulation baseline"),
        bullet("0002_ingress_receipts_and_catalog_normalization - receipts + catalog"),
        bullet("0003_projection_and_history_integrity - history integrity"),
        bullet("0004_secondary_delivery_leases_and_history - outbox leases"),
        bullet("0005_approval_sequence_and_delivery_truth - approval/delivery truth"),
        bullet("0006_service_account_api_key - API key hash (raw key one-time)"),
        p(
            "CLI modes: --database-preflight, --database-migrate, --timescale-backfill "
            "(yeu cau Timescale enabled + 2 connection strings)."
        ),
        h1("6. Event rules, alerts, intelligence", c, True),
        p(
            "event-rules.json dinh nghia rule threshold tao THRESHOLD_BREACH, ALARM, STATUS_CHANGE, MAINTENANCE_DUE, v.v. "
            "Rule danh dau DEFERRED chi la khai bao - khong mo ta nhu runtime-complete."
        ),
        p("Alert lifecycle: open -> acknowledge -> resolve, co history, deduplication, suppression window."),
        p(
            "Health scoring ket hop availability, alarm, performance, operational signals. "
            "PredictiveService: anomaly (z-score style), failure risk; RCA context gated (RcaController)."
        ),
        h1("7. AuthN / AuthZ", c, True),
        bullet("Interactive: HttpOnly cookie session (FII SSO/JWT); browser khong luu bearer trong storage mac dinh."),
        bullet("Service-to-service: X-API-Key / service account; raw key chi tra mot lan; persist SHA-256 hash."),
        bullet("Roles: ADMIN, ENGINEER, GUEST - enforce bang policy backend."),
        bullet("Jwt:TenantId / FII_TENANT_ID bat buoc khi issue token (fail-closed). users table hien single-tenant boundary."),
        bullet("Rate limiting (global/login/db-health); ForwardedHeaders chi trust proxy cau hinh."),
        h1("8. Open Data Fusion capture", c, True),
        p(
            "OpenDataFusionCaptureOptions: CaptureEnabled (ghi outbox). Dispatch do fusion-adapter process rieng. "
            "Capture false = khong tich luy intent; Dispatch false khi tenant/project/identity chua san sang. "
            "Khong xoa outbox khi rollback - sua ket noi roi replay."
        ),
        h1("9. Cau hinh quan trong", c, True),
        code("ConnectionStrings__DefaultConnection=<operations-postgres>"),
        code("ConnectionStrings__Timescale=<timescale-url>"),
        code("Jwt__Key=<secret >= 32 bytes>"),
        code("Jwt__TenantId=<tenant>"),
        code("Mqtt__EncryptionKey=<mqtt key>"),
        code("MqttServer__Port=1883"),
        code("MqttServer__Tls__Enabled=true|false"),
        code("Timescale__Enabled=false|true"),
        code("OpenDataFusion__CaptureEnabled=false|true"),
        p("Backend khong tu load file .env root; dung env vars / user-secrets / secret manager. Nested key dung __."),
        h1("10. Stack phu thuoc", c, True),
        bullet(".NET 9 / ASP.NET Core Web"),
        bullet("MQTTnet + MQTTnet.Server 5.1"),
        bullet("Npgsql 10, HealthChecks.NpgSql"),
        bullet("Microsoft.AspNetCore.Authentication.JwtBearer 9"),
        bullet("Swashbuckle (Swagger Development)"),
        bullet("BCrypt.Net-Next"),
        bullet("ProjectReference: fusion-contracts (Fusion.Contracts)"),
        h1("11. API map dinh huong", c, True),
        code("GET  /api/health"),
        code("POST /api/auth/login  |  GET /api/auth/session  |  POST /api/auth/logout"),
        code("GET  /api/dashboard/summary"),
        code("GET  /api/machines  |  GET /api/machines/{id}"),
        code("GET  /api/production-lines"),
        code("GET  /api/alarms  |  POST .../acknowledge  |  POST .../resolve"),
        code("GET  /api/telemetry/live|log|query"),
        code("GET  /api/v1/assets  |  .../health  |  POST /api/v1/predictions/anomaly"),
        code("POST /api/v1/rca  |  GET /api/v1/predictions/risk/{assetId}"),
        code("POST /api/sync/register  |  POST /api/sync/upload"),
        code("GET  /hubs/telemetry  (SignalR)"),
        p("Swagger Development; contract chinh thuc o controller + fusion-contracts/contracts/v1."),
        h1("12. Chay va kiem thu", c, True),
        code("dotnet run --project backend/backend.csproj -- --database-preflight"),
        code("dotnet run --project backend/backend.csproj -- --database-migrate"),
        code("dotnet run --project backend/backend.csproj"),
        code("dotnet test backend.Tests/backend.Tests.csproj"),
        code("dotnet test fusion-adapter.Tests/Fusion.Adapter.Tests.csproj"),
        p("Full demo: infrastructure/demo/Start-FullDemo.ps1 (UI 3001, backend 5166, ...)."),
        h1("13. Van hanh va troubleshooting", c, True),
        bullet("Khong start: preflight connection string, Mqtt encryption key, port conflict, CORS/forwarded headers."),
        bullet("Khong thay telemetry: ClientPLC token/topic, MQTT auth, receipts, offline queue edge."),
        bullet("Timescale loi: nguon PostgreSQL van phai nhan; backfill sau khi target healthy."),
        bullet("Alert thieu: rule enabled? DEFERRED? metric/unit?"),
        bullet("Outbox backlog: giu Capture; tat Dispatch neu identity chua san sang; khong truncate outbox."),
        h1("14. Rui ro va khuyen nghi", c, True),
        bullet("Managed staging bat buoc: HTTPS ingress, secret manager, TLS/mTLS MQTT, backup/restore, retention."),
        bullet("Doc lap migration Timescale vs Operations - checklist cutover rieng."),
        bullet("DEFERRED rules khong duoc marketing nhu feature live."),
        bullet("Service account least privilege; rotate key; audit moi admin action."),
        bullet("Load test bounded telemetry query truoc pilot."),
        h1("15. Ket luan", c, True),
        p(
            "Backend la trai tim operations path: MQTT ingest, truth store, rules, intelligence, API/UI bridge, optional ODF capture. "
            "Thiet ke boundary-first va fail-closed la diem manh. Production NO-GO cho den khi managed evidence "
            "(security, recovery, connector, independent review) hoan tat."
        ),
        h1("Phu luc - Nguon", c),
        bullet("backend/Program.cs, Controllers/, Services/, Security/, db/migrations/"),
        bullet("backend/Configuration/event-rules.json, OpenDataFusionCaptureOptions.cs"),
        bullet("backend.csproj, fusion-contracts/, docs/PROJECT-GUIDE.vi.md"),
    ]


def odysseus_ops(c: str) -> list[dict]:
    return [
        h1("1. Tom tat dieu hanh", c, True),
        p(
            "Odysseus la self-hosted AI workspace (chat, agents, research, documents, email, notes, calendar, local models, MCP). "
            "Trong monorepo FII, Odysseus la thanh phan TUY CHON - khong thuoc core scope FII operations. "
            "No khong thay backend, khong doc DB nha may truc tiep, va khong duoc phep chan MQTT hot path."
        ),
        p(
            "Tich hop FII: REST bridge /api/mkz/* (admin-only) va MCP plc server doc FII backend qua MKZ_BACKEND_URL "
            "(+ optional MKZ_BACKEND_TOKEN). Profile fii-chat thu gon pack ca nhan (email/gallery/calendar) de tap trung chat + factory Q&A."
        ),
        p("License upstream: AGPL-3.0-or-later. Default UI port: 7000."),
        h1("2. Ranh gioi voi FII", c, True),
        bullet("Ngoai core: PROJECT_PLAN va README neu ro Odysseus optional / third-party AI workspace."),
        bullet("Data path: Odysseus -> HTTP REST FII backend -> (backend) PostgreSQL. Khong connection string nha may trong Odysseus."),
        bullet(
            "Secrets tach: OPENAI_API_KEY (model provider) khac MKZ_BACKEND_TOKEN (factory API). "
            "Khong dua provider key ra frontend/MCP config/prompts."
        ),
        bullet("Audit logs FII co y khong expose qua bridge cho den khi co least-privilege audit-read policy."),
        bullet("AUTH_ENABLED=false chi trusted-local; khong expose remote."),
        h1("3. Kien truc noi bo Odysseus", c, True),
        h2("3.1 Lop ung dung"),
        bullet("app.py / launcher - FastAPI entry, uvicorn"),
        bullet("core/ - auth, database, session, middleware, FII SSO helper, models"),
        bullet("routes/ - chat, models, memory, MCP, documents, research, mkz_*, auth, admin, ..."),
        bullet("src/ - LLM core, agent loop/tools, RAG, embeddings, MCP manager, security (prompt/url/tool)"),
        bullet("services/ - memory, research, search, STT/TTS, shell, hwfit, docs"),
        bullet("mcp_servers/ - email, image_gen, memory, rag, plc_mcp_server"),
        bullet("static/ - SPA UI (app.js, modules), login, themes"),
        bullet("data/ - app.db, sessions, settings, chroma/rag caches, mkz_exports (local only)"),
        h2("3.2 Agent va tools"),
        p(
            "Agent loop ho tro tools (shell, files, web, MCP), policy/security layers "
            "(tool_policy, tool_security, prompt_security, url_safety). Skills, presets, memory vector, "
            "context budget/compactor kiem soat context window."
        ),
        h2("3.3 RAG va embeddings"),
        p(
            "ChromaDB optional (CHROMADB_DISABLED=true cho fii-chat dev). FastEmbed local ONNX; "
            "HF_HUB_DISABLE_XET=1 tranh hang download dev. scripts/index_documents.py, verify_mkz_rag.py, "
            "sync_mkz_to_odysseus.py ho tro knowledge factory docs."
        ),
        h1("4. Tinh nang san pham (upstream + FII)", c, True),
        bullet("Chat + Agents - local/API models, tools, MCP, files, shell, skills, memory"),
        bullet("Cookbook - goi y model theo hardware, download/serve"),
        bullet("Deep Research - multi-step web research + report"),
        bullet("Compare - blind side-by-side model test"),
        bullet("Documents - editor AI-assisted (Markdown/HTML/CSV)"),
        bullet("Email / Notes / Tasks / Calendar - personal productivity (co the tat bang fii-chat profile)"),
        bullet("Gallery, themes, uploads, web search, 2FA, webhooks"),
        bullet("FII bridge: dashboard, machines, lines, alarms, telemetry, production reports, system-info"),
        bullet("Companion pairing (companion/) - device pairing flows"),
        h1("5. FII REST bridge va MCP", c, True),
        h2("5.1 Endpoints bridge (admin session hoac internal trusted tool path)"),
        code("GET /api/mkz/health"),
        code("GET /api/mkz/dashboard"),
        code("GET /api/mkz/machines"),
        code("GET /api/mkz/production-lines"),
        code("GET /api/mkz/alarms"),
        code("GET /api/mkz/reports/production"),
        code("GET /api/mkz/telemetry"),
        code("GET /api/mkz/system-info"),
        p("Unauthenticated /api/mkz/health -> HTTP 401 (ke ca localhost). /api/mkz/gateway/... co policy rieng."),
        h2("5.2 Token transport"),
        p(
            "MKZ_BACKEND_TOKEN chi gui HTTPS cho backend non-loopback; HTTP chi loopback (localhost/127.0.0.1/::1). "
            "Tu choi remote plaintext + token."
        ),
        h2("5.3 MCP PLC"),
        p(
            "mcp_servers/plc_mcp_server.py + plc_mcp_config.json - tools doc factory qua backend URL. "
            "Shared MCP khong multi-tenant per-browser-user trong setup hien tai -> bridge admin-only."
        ),
        h1("6. Profile fii-chat (khuyen nghi monorepo)", c, True),
        code("ODYSSEUS_PROFILE=fii-chat"),
        code("CHROMADB_DISABLED=true"),
        code("HF_HUB_DISABLE_XET=1"),
        code("MKZ_BACKEND_URL=http://localhost:5166"),
        code("FII_SSO_ENABLED=true"),
        p(
            "Profile bo email/cookbook/gallery/calendar packs; giu chat, models, memory, MCP, MKZ routes. "
            "Bat Chroma khi can RAG: docker compose up chromadb + CHROMADB_DISABLED=false."
        ),
        h1("7. Chay local", c, True),
        code("cd Odysseus"),
        code(".\\launch-windows.ps1"),
        code("# hoac: .\\venv\\Scripts\\python.exe -m uvicorn app:app --host 127.0.0.1 --port 7000"),
        p(
            "Docker: docker compose up -d --build; mo http://localhost:7000; admin password trong logs. "
            "GPU: docker-compose.gpu-nvidia.yml / gpu-amd.yml. Setup chi tiet: Odysseus/docs/setup.md."
        ),
        h1("8. Bao mat", c, True),
        bullet("Giu auth enabled; khong public raw model ports."),
        bullet("Private data ngoai Git; settings_scrub / secret_storage cho keys."),
        bullet("Tool/shell policy - han che destructive tools tren host production."),
        bullet("THREAT_MODEL.md, SECURITY.md, security-ci docs - doc truoc expose."),
        bullet("Rate limiter, session manager, log_safety redaction."),
        bullet("Khong coi Odysseus la compliance boundary cho OT network."),
        h1("9. Kiem thu", c, True),
        p(
            "Odysseus/tests/ quy mo lon (hang tram test modules). Chay theo subset lien quan integration FII "
            "(mkz routes, auth, MCP). Monorepo full-demo co the start Odysseus cung stack (port 7000)."
        ),
        h1("10. Rui ro, gioi han, roadmap su dung trong FII", c, True),
        bullet("Optional: su co Odysseus khong duoc lam fail operations path."),
        bullet("Admin-only bridge han che multi-user least privilege - can model auth tot hon truoc production chat-for-all."),
        bullet("RAG factory docs: verify_mkz_rag + sync scripts; content governance bat buoc."),
        bullet("AGPL implications neu distribute modifications - legal review."),
        bullet("Hallucination risk: agent answers khong thay sensor truth; UI/ops van authoritative."),
        bullet("Khuyen nghi: staging lab only; SSO; no OT write tools; audit prompts/tools."),
        h1("11. Ket luan", c, True),
        p(
            "Odysseus bo sung plane AI/chat/RAG cho FII nhung khong phai loi giam sat nha may. "
            "Dung dung ranh gioi REST/MCP read-only, secrets tach, profile fii-chat, va khong nang release claim FII "
            "dua tren chat demo. Production operations go-live doc lap voi Odysseus readiness."
        ),
        h1("Phu luc - Nguon", c),
        bullet("Odysseus/README.md, INTEGRATION.md, docs/setup.md, THREAT_MODEL.md"),
        bullet("routes/mkz_routes.py, mkz_gateway_routes.py, mcp_servers/plc_mcp_server.py"),
        bullet("scripts/sync_mkz_to_odysseus.py, verify_mkz_rag.py"),
    ]


def odf_ops(c: str) -> list[dict]:
    return [
        h1("1. Tom tat dieu hanh", c, True),
        p(
            "Open Data Fusion (ODF) la nen tang open-source (Apache-2.0) cho governed industrial data integration, "
            "contextualization va visual collaboration. Trong workspace FII co hai be mat: Open-Data-Fusion/ (product day du) "
            "va third_party/open-data-fusion/ (submodule upstream pin cho preview MKZ). ODF pre-release - khong noi OT production "
            "/ khong thuc thi industrial control khi chua review an toan doc lap."
        ),
        p(
            "Voi FII: du lieu vao ODF qua Fusion Adapter + transactional outbox tu backend - ngoai hot path MQTT. "
            "Capture va Dispatch la hai co doc lap. ODF down khong duoc dung telemetry local."
        ),
        h1("2. Vai tro trong he sinh thai FII", c, True),
        bullet("Secondary data product plane: hierarchy Plant->Line->Machine, time series, datapoints, provenance."),
        bullet("External ID convention: mkz:plant:*, mkz:line:*, mkz:machine:*, mkz:ts:*"),
        bullet("fusion-adapter map bundle + lease/retry/dead-letter tren outbox backend."),
        bullet("Preview loopback: infrastructure/open-data-fusion/Start|Test-OpenDataFusionPreview.ps1"),
        bullet("Khong dual-write authoritative giua SQLite product ODF va PostgreSQL; chon mot ODF_DATA_PERSISTENCE."),
        h1("3. Nguyen tac thiet ke", c, True),
        bullet("Evidence before convenience - provenance, correlation, model version, audit."),
        bullet("Review before truth - contextualization/matching = candidates, khong silent fact."),
        bullet("One source of truth - projections rebuildable; no dual-write authoritative stores."),
        bullet("Fail closed - thieu identity/project/policy/approval/executor -> block."),
        bullet("Local-first, production-aware - SQLite dev don gian; Postgres multi-instance path."),
        bullet("Clean-room - khong affiliate Cognite Data Fusion; branding doc lap."),
        h1("4. Kien truc san pham", c, True),
        h2("4.1 Apps"),
        bullet("apps/web - React + Vite Asset Explorer + Industrial Canvas"),
        bullet("apps/api - TypeScript REST API, auth, industrial persistence"),
        bullet("apps/edge-agent - CSV / PostgreSQL / OPC UA read-only collection, checkpoint, queue, retry"),
        bullet("apps/outbox-worker - publish committed Postgres events -> Redis Streams"),
        bullet("apps/pipeline-worker - scoped/gated pipelines"),
        h2("4.2 Packages"),
        bullet("packages/contracts - shared contracts"),
        bullet("packages/platform-core - modeling va platform core"),
        bullet("packages/postgres-runtime - Postgres adapters, RLS-aware runtime"),
        h2("4.3 Infra"),
        bullet("infra/postgres/migrations - industrial + canvas + admin schemas"),
        bullet("infra/keycloak - local OIDC realm"),
        bullet("infra/minio - S3-compatible object store bootstrap"),
        bullet("infra/observability - Prometheus, Grafana, OTEL collector, alerts/SLO"),
        bullet("infra/security - mTLS rehearsal, Envoy, network policies, secret contract"),
        bullet("infra/ci - production-like smoke, backup/restore, edge mTLS, gate validator"),
        bullet("docker-compose.yml + production-like + identity + security-rehearsal profiles"),
        h1("5. Nang luc san pham (capability map)", c, True),
        bullet("Asset Explorer (Available) - hierarchy search, telemetry, documents, relations, lineage"),
        bullet("Industrial Canvas (Available) - compose assets/telemetry/docs, revisions, undo/redo, rollback"),
        bullet("Collaboration (Available) - owner/editor/reviewer/viewer, presence, SSE updates, optimistic concurrency"),
        bullet("Ingestion (Available) - project-scoped atomic idempotent bundles + provenance (SQLite|Postgres)"),
        bullet("Governed objects (Available) - versioned upload/download, SHA-256, ETag; Postgres + shared S3"),
        bullet("Telemetry serving (Available) - raw, latest/as-of, bounded aggregates + quality"),
        bullet("Tenant/project discovery (Available) - membership-scoped"),
        bullet("Platform admin/catalogs (Optional) - Postgres administration, datasets, connectors, write-back ledger"),
        bullet("Contextualization / diagrams / matching / spatial (Gated) - candidates + review evidence"),
        bullet("Industrial write-back (Gated) - dry-run, allowlist, SoD approvals, external executor"),
        bullet("OIDC/Keycloak (Optional) - Auth Code+PKCE, JWT, permission claims"),
        bullet("Edge collection (Optional) - checkpointed read-only sources"),
        bullet("Workers/broker (Optional) - outbox -> Redis Streams multi-instance"),
        bullet("Observability (Optional) - metrics, traces, alerts, Grafana"),
        h1("6. Persistence profiles", c, True),
        p(
            "ODF_DATA_PERSISTENCE=sqlite|postgres - mot backend authoritative moi process. Postgres: industrial core, Canvas, "
            "tenant/project admin, catalogs, advanced product, search projection, write-back records dung Postgres + forced RLS "
            "where applicable. Khong fallback silent sang SQLite cho authoritative product records. Shared object bytes: "
            "private S3-compatible; metadata RLS-scoped."
        ),
        p("ODF_SEED=true chi opt-in fixture UI/collaboration - clean start = empty durable DB."),
        h1("7. Tich hop FII (outbox path)", c, True),
        h2("7.1 Capture (backend)"),
        p(
            "OpenDataFusion__CaptureEnabled=true -> backend ghi fusion_outbox trong transaction nghiep vu khi telemetry/event hop le."
        ),
        h2("7.2 Dispatch (adapter)"),
        p(
            "OpenDataFusion__DispatchEnabled + tenant/project/identity -> fusion-adapter claim lease, map OpenDataFusionBundleMapper, "
            "POST ODF ingest, retry/dead-letter. Local preview truoc khi bat dispatch."
        ),
        h2("7.3 Preview an toan"),
        code("git submodule update --init --recursive"),
        code(".\\infrastructure\\open-data-fusion\\Start-OpenDataFusionPreview.ps1"),
        code(".\\infrastructure\\open-data-fusion\\Test-OpenDataFusionPreview.ps1"),
        p(
            "Default loopback: API 54310, web 58088, Postgres 55432, Redis 56379, Grafana 53000, Prometheus 59090. "
            "Synthetic tenant/project - khong phai staging provisioning."
        ),
        h2("7.4 Rollback local"),
        p("Capture=false truoc restart backend; dung adapter; giu pending outbox; sua identity/network; bat lai dispatch khi san sang."),
        h1("8. Bao mat va governance", c, True),
        bullet("OIDC; server-side authorization; tenant/project membership"),
        bullet("Postgres RLS forced cho multi-tenant data plane"),
        bullet("Write-back: policy allowlist + independent approvals + external executor only"),
        bullet("Edge agent read-only by design; mTLS rehearsal scripts"),
        bullet("Secret contract; no production secrets in repo"),
        bullet("docs/security/authentication.md, production-ingress-security.md"),
        bullet("Pre-release warning: independent security/safety review truoc OT"),
        h1("9. Van hanh, cutover, pilot", c, True),
        bullet("SQLite->Postgres cutover: preflight CLI, dry-run import, checksum, explicit apply gate"),
        bullet("Outbox dead-letter recovery runbook"),
        bullet("Postgres backup/restore rehearsal"),
        bullet("Production-like compose + smoke + observability smoke"),
        bullet("pilot-gate / validate-production-gates.py - evidence-driven go/no-go"),
        bullet("SLO docs: docs/operations/observability-slos.md"),
        h1("10. Chay standalone product", c, True),
        code("cd Open-Data-Fusion"),
        code("npm install"),
        code("npm run dev"),
        p(
            "Production-like: docker-compose.production-like.yml + identity profile. Node.js 24+. "
            "Tests: vitest per app/package. CI workflows: ci, infra-validate, security."
        ),
        h1("11. Rui ro va khuyen nghi cho FII", c, True),
        bullet("Luon tach Operations path vs ODF path trong incident response."),
        bullet("Khong bat Dispatch truoc tenant/project/OIDC proven."),
        bullet("Khong sua third_party submodule de chua secret MKZ."),
        bullet("Contextualization candidates can human review truoc trust."),
        bullet("Write-back executor production = change-control formal."),
        bullet("FII release gate doc lap: ODF preview green khong dong nghia FII production GO."),
        h1("12. Ket luan", c, True),
        p(
            "ODF cung cap plane du lieu cong nghiep co provenance, Explorer/Canvas, governance va duong multi-instance Postgres. "
            "Trong FII, ODF la secondary delivery target qua outbox - thiet ke dung khi Capture/Dispatch tach va operations van song "
            "neu ODF down. Pre-release: dung preview/staging evidence, khong over-claim production OT readiness."
        ),
        h1("Phu luc - Nguon", c),
        bullet("Open-Data-Fusion/README.md, docs/architecture/*, docs/operations/*, docs/cdf-capability-map.md"),
        bullet("fusion-adapter/, infrastructure/open-data-fusion/"),
        bullet("third_party/open-data-fusion/ (pin), docs/PROJECT-GUIDE.vi.md muc 4.5-4.7"),
    ]


def main() -> int:
    reports = [
        (
            "Frontend-Report.vi.docx",
            "Frontend - Operations UI",
            "Bao cao ky thuat chi tiet",
            "1B4F72",
            "FII AI | Frontend Operations UI | Bao cao ky thuat",
            frontend_ops,
        ),
        (
            "Backend-Report.vi.docx",
            "Backend - Operations API",
            "Bao cao ky thuat chi tiet",
            "0E6655",
            "FII AI | Backend Operations API | Bao cao ky thuat",
            backend_ops,
        ),
        (
            "Odysseus-Report.vi.docx",
            "Odysseus - AI Workspace",
            "Bao cao ky thuat chi tiet (optional plane)",
            "6C3483",
            "FII AI | Odysseus AI Workspace | Bao cao ky thuat",
            odysseus_ops,
        ),
        (
            "ODF-Report.vi.docx",
            "Open Data Fusion (ODF)",
            "Bao cao ky thuat chi tiet",
            "B9770E",
            "FII AI | Open Data Fusion | Bao cao ky thuat",
            odf_ops,
        ),
    ]

    for file, title, subtitle, accent, header, ops_fn in reports:
        print(f"Building {file}...")
        rel = shell(file, title, subtitle, accent)
        batch(rel, ops_fn(accent))
        finish(rel, header)

    print("\nDone. Files:")
    for pth in sorted(OUT.glob("*.docx")):
        print(f"  {pth.name} ({pth.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
