# -*- coding: utf-8 -*-
"""Build 8 component reports: 4 Vietnamese + 4 English, with summary tables."""
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
        raise RuntimeError(f"FAIL {' '.join(args)}\n{(r.stderr or r.stdout).strip()}")
    return r.stdout


def batch(rel: str, ops: list[dict]) -> None:
    # chunk large batches
    CHUNK = 80
    for i in range(0, len(ops), CHUNK):
        part = ops[i : i + CHUNK]
        tmp = Path(tempfile.gettempdir()) / f"ocx-{uuid.uuid4().hex}.json"
        tmp.write_text(json.dumps(part, ensure_ascii=False), encoding="utf-8")
        try:
            out = run(["officecli", "batch", rel, "--input", str(tmp), "--json"])
            data = json.loads(out)
            s = (data.get("data") or {}).get("summary") or data.get("summary") or {}
            if s.get("failed", 0):
                raise RuntimeError(f"batch failed: {s}\n{out[-1500:]}")
        finally:
            tmp.unlink(missing_ok=True)


def h1(t, c="1B4F72", br=False):
    p = {
        "text": t,
        "style": "Heading1",
        "size": "20pt",
        "bold": "true",
        "color": c,
        "spaceBefore": "16pt",
        "spaceAfter": "10pt",
    }
    if br:
        p["pageBreakBefore"] = "true"
    return {"command": "add", "parent": "/body", "type": "paragraph", "props": p}


def h2(t, c="2E86AB"):
    return {
        "command": "add",
        "parent": "/body",
        "type": "paragraph",
        "props": {
            "text": t,
            "style": "Heading2",
            "size": "14pt",
            "bold": "true",
            "color": c,
            "spaceBefore": "12pt",
            "spaceAfter": "8pt",
        },
    }


def p(t, size="11pt"):
    return {
        "command": "add",
        "parent": "/body",
        "type": "paragraph",
        "props": {"text": t, "style": "Normal", "size": size, "spaceAfter": "6pt"},
    }


def code(t):
    return {
        "command": "add",
        "parent": "/body",
        "type": "paragraph",
        "props": {
            "text": t,
            "style": "Normal",
            "size": "10pt",
            "font": "Consolas",
            "spaceAfter": "2pt",
        },
    }


def bullet(t):
    return {
        "command": "add",
        "parent": "/body",
        "type": "paragraph",
        "props": {
            "text": f"• {t}",
            "style": "Normal",
            "size": "11pt",
            "spaceAfter": "3pt",
            "indent": "360",
        },
    }


def table(rows: list[list[str]], cols: int | None = None):
    """Create table then fill rows via separate ops returned as list."""
    n_cols = cols or max(len(r) for r in rows)
    n_rows = len(rows)
    ops = [
        {
            "command": "add",
            "parent": "/body",
            "type": "table",
            "props": {"rows": str(n_rows), "cols": str(n_cols), "header": "true"},
        }
    ]
    # Placeholder - table index unknown until after batch; use deferred fill
    return ops, rows, n_cols


def create_shell(rel: str, title: str, subtitle: str, accent: str, lang: str) -> None:
    path = ROOT / rel
    if path.exists():
        path.unlink()
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
    date_line = (
        "Document date: 5 August 2026 | Language: Vietnamese"
        if lang == "vi"
        else "Document date: 5 August 2026 | Language: English"
    )
    posture = (
        "Release posture: Staging candidate — NO-GO for production"
        if lang == "en"
        else "Release posture: Staging candidate — NO-GO cho production"
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
                "spaceBefore": "40pt",
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
                "spaceAfter": "14pt",
            },
        },
        {
            "command": "add",
            "parent": "/body",
            "type": "paragraph",
            "props": {
                "text": "FII AI / MKZ Factory Monitor — Component Technical Report",
                "size": "11pt",
                "align": "center",
                "color": "555555",
                "spaceAfter": "6pt",
            },
        },
        {
            "command": "add",
            "parent": "/body",
            "type": "paragraph",
            "props": {
                "text": date_line,
                "size": "11pt",
                "align": "center",
                "spaceAfter": "4pt",
            },
        },
        {
            "command": "add",
            "parent": "/body",
            "type": "paragraph",
            "props": {
                "text": posture,
                "size": "11pt",
                "bold": "true",
                "align": "center",
                "color": "922B21",
                "spaceAfter": "20pt",
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
        h1("Mục lục" if lang == "vi" else "Contents", accent),
        {"command": "add", "parent": "/", "type": "toc", "props": {"levels": "1-2", "title": ""}},
    ]
    batch(rel, ops)


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
            "text=FII AI | Staging candidate | Page ",
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
    print(run(["officecli", "validate", rel]).strip())


def fill_tables(rel: str, tables: list[list[list[str]]], accent: str = "1B4F72") -> None:
    """Fill tables in document order starting at tbl[1]."""
    ops = []
    for ti, rows in enumerate(tables, start=1):
        for ri, row in enumerate(rows, start=1):
            props = {f"c{i+1}": (row[i] if i < len(row) else "") for i in range(len(row))}
            if ri == 1:
                props["header"] = "true"
            ops.append(
                {
                    "command": "set",
                    "path": f"/body/tbl[{ti}]/tr[{ri}]",
                    "props": props,
                }
            )
        # header style
        for ci in range(1, len(rows[0]) + 1):
            ops.append(
                {
                    "command": "set",
                    "path": f"/body/tbl[{ti}]/tr[1]/tc[{ci}]",
                    "props": {"bold": "true", "fill": accent, "color": "FFFFFF", "size": "10pt"},
                }
            )
    if ops:
        batch(rel, ops)


def add_table_op(rows: int, cols: int) -> dict:
    return {
        "command": "add",
        "parent": "/body",
        "type": "table",
        "props": {"rows": str(rows), "cols": str(cols), "header": "true"},
    }


# ─── Content builders ─────────────────────────────────────────────


def frontend_content(lang: str, c: str) -> tuple[list[dict], list[list[list[str]]]]:
    vi = lang == "vi"
    tables: list[list[list[str]]] = []
    ops: list[dict] = []

    ops += [
        h1("1. " + ("Tóm tắt điều hành" if vi else "Executive summary"), c, True),
        p(
            "Frontend của FII AI (MKZ Factory Monitor) là ứng dụng web Operations UI viết bằng React 19, TypeScript và Vite 8. "
            "Đây là lớp trình bày chính cho vận hành: dashboard KPI, production lines, machines, alarms, reports, simulation "
            "và quản trị (users, audit, settings)."
            if vi
            else "The FII AI (MKZ Factory Monitor) frontend is the Operations UI web application built with React 19, TypeScript, and Vite 8. "
            "It is the primary presentation layer for operations: KPI dashboards, production lines, machines, alarms, reports, simulation, "
            "and administration (users, audit, settings)."
        ),
        p(
            "Ba vai trò ADMIN, ENGINEER, GUEST có bản đồ permission phía client; biên bảo mật thật nằm ở backend (JWT cookie / API policy). "
            "Chế độ demo dùng synthetic GET; thao tác ghi không được giả lập thành công."
            if vi
            else "Roles ADMIN, ENGINEER, and GUEST have a client-side permission map; the real security boundary is the backend (JWT cookie / API policy). "
            "Demo mode serves synthetic GET data only; write operations are never simulated as successful."
        ),
        h1("2. " + ("Vai trò trong kiến trúc FII" if vi else "Role in the FII architecture"), c, True),
        bullet("ClientPLC → MQTT → Backend → PostgreSQL / rules / health"),
        bullet("Frontend → REST (Axios) + cookie credentials (+ Bearer when present)"),
        bullet("Refresh theo routeMeta scope (monitoring / all) + React Query" if vi else "Refresh via routeMeta scopes (monitoring / all) + React Query"),
        bullet("Không thuộc MQTT hot path; ODF/Odysseus không bắt buộc" if vi else "Outside the MQTT hot path; ODF/Odysseus are optional"),
        h1("3. " + ("Bảng route map" if vi else "Route map table"), c, True),
        p("Route map theo shell Viewer và Admin:" if vi else "Route map for Viewer and Admin shells:"),
    ]
    route_rows = [
        ["Route", "Shell", "Roles", "Chức năng" if vi else "Purpose"],
        ["/", "Viewer", "ALL", "Dashboard overview"],
        ["/lines", "Viewer", "ALL", "Production lines + diagram"],
        ["/machines", "Viewer", "ALL", "Machine list"],
        ["/machines/:id", "Viewer", "ALL", "Machine detail / telemetry"],
        ["/alarms", "Viewer", "ALL", "Alarm filter + lifecycle"],
        ["/production-analysis", "Viewer", "GUEST+", "Production analysis"],
        ["/slideshow", "Special", "AUTH", "Ops presentation mode"],
        ["/admin", "Admin", "ADMIN/ENGINEER", "Role-aware dashboard"],
        ["/admin/reports", "Admin", "ADMIN/ENGINEER", "Reports / charts"],
        ["/admin/simulation", "Admin", "ADMIN/ENGINEER", "Synthetic demo data"],
        ["/admin/users", "Admin", "ADMIN", "User management"],
        ["/admin/audit-logs", "Admin", "ADMIN", "Audit log viewer"],
        ["/login", "Public", "—", "SSO / JWT login"],
    ]
    tables.append(route_rows)
    ops.append(add_table_op(len(route_rows), 4))

    ops += [
        h1("4. " + ("Bảng phân quyền" if vi else "Permission matrix"), c, True),
    ]
    perm_rows = [
        ["Permission", "ADMIN", "ENGINEER", "GUEST"],
        ["dashboard.view", "Yes", "Yes", "Yes"],
        ["lines.view / configure", "Yes / Yes", "Yes / Yes", "Yes / No"],
        ["machines.view / configure", "Yes / Yes", "Yes / Yes", "Yes / No"],
        ["alarms.view / mutate", "Yes / Yes", "Yes / Yes", "Yes / No"],
        ["reports.view", "Yes", "Yes", "Yes"],
        ["users.manage", "Yes", "No", "No"],
        ["auditLogs.view", "Yes", "No", "No"],
        ["assets.configure", "Yes", "Yes", "No"],
    ]
    tables.append(perm_rows)
    ops.append(add_table_op(len(perm_rows), 4))
    ops.append(
        p(
            "Lưu ý: map client chỉ phục vụ UX. Backend enforce policy trên mọi request ghi."
            if vi
            else "Note: the client map is UX only. The backend enforces policy on every mutating request."
        )
    )

    ops += [
        h1("5. " + ("Kiến trúc thư mục" if vi else "Directory architecture"), c, True),
        bullet("app/ — router, permissions, i18n (en/vi/zh-CN), queryClient, routeMeta, theme tokens"),
        bullet("features/ — auth, dashboard, alarms, machines, lines, health, predictions, admin, simulation"),
        bullet("pages/ — admin/, engineer/, viewer/ + shared pages"),
        bullet("shared/ — ModernShell, UI kit, apiClient, Zustand stores, types"),
        h1("6. " + ("Stack công nghệ" if vi else "Technology stack"), c, True),
    ]
    stack_rows = [
        ["Layer", "Technology"],
        ["UI runtime", "React 19.2, TypeScript ~6"],
        ["Build", "Vite 8, Tailwind CSS 4"],
        ["Routing", "react-router-dom 7"],
        ["Data", "TanStack Query 5, Axios, Zustand"],
        ["Forms", "react-hook-form, Zod"],
        ["Charts / diagram", "Recharts 3, @xyflow/react 12"],
        ["i18n", "i18next (en, vi, zh-CN)"],
        ["Test", "Vitest, Testing Library, Playwright"],
    ]
    tables.append(stack_rows)
    ops.append(add_table_op(len(stack_rows), 2))

    ops += [
        h1("7. " + ("Chạy, build, kiểm thử" if vi else "Run, build, test"), c, True),
    ]
    cmd_rows = [
        ["Command", "Mục đích" if vi else "Purpose"],
        ["npm --prefix frontend run demo", "UI demo, no backend"],
        ["npm --prefix frontend run dev", "Dev with VITE_API_URL"],
        ["npm --prefix frontend run test:run", "Unit / component tests"],
        ["npm --prefix frontend run type-check", "TypeScript project build"],
        ["npm --prefix frontend run lint", "ESLint"],
        ["npm --prefix frontend run build", "Production bundle"],
        ["npm --prefix frontend run e2e", "Playwright e2e"],
        ["npm --prefix frontend run i18n:check", "i18n key parity"],
    ]
    tables.append(cmd_rows)
    ops.append(add_table_op(len(cmd_rows), 2))

    ops += [
        h1("8. " + ("Rủi ro và khuyến nghị" if vi else "Risks and recommendations"), c, True),
        bullet("Route guard frontend ≠ authorization backend" if vi else "Frontend route guards are not the security boundary"),
        bullet("Label rõ demo vs live environment" if vi else "Label demo vs live environments clearly"),
        bullet("e2e:live trước staging, không chỉ unit green" if vi else "Run e2e:live before staging — unit green is insufficient"),
        bullet("Giữ lazy routes; kiểm tra bundle regression" if vi else "Keep lazy routes; watch bundle regressions"),
        h1("9. " + ("Kết luận" if vi else "Conclusion"), c, True),
        p(
            "Frontend là bề mặt vận hành chính: feature-first, role-aware, đa ngôn ngữ, có demo path an toàn. "
            "Độ tin cậy production phụ thuộc backend auth, contract ổn định và evidence e2e/live."
            if vi
            else "The frontend is the primary operations surface: feature-first, role-aware, multilingual, with a safe demo path. "
            "Production trust depends on backend auth, stable contracts, and e2e/live evidence."
        ),
        h1("Phụ lục — Nguồn" if vi else "Appendix — Sources", c),
        bullet("frontend/package.json, src/app/router.tsx, permissions.ts, routeMeta.ts"),
        bullet("features/dashboard, shared/services/apiClient.ts"),
        bullet("docs/PROJECT-GUIDE.vi.md §4.4"),
    ]
    return ops, tables


def backend_content(lang: str, c: str) -> tuple[list[dict], list[list[list[str]]]]:
    vi = lang == "vi"
    tables: list[list[list[str]]] = []
    ops: list[dict] = []

    ops += [
        h1("1. " + ("Tóm tắt điều hành" if vi else "Executive summary"), c, True),
        p(
            "Backend FII AI là dịch vụ ASP.NET Core trên .NET 9 — trung tâm đường dữ liệu vận hành: MQTT ingest từ ClientPLC, "
            "PostgreSQL authoritative, optional Timescale dual-write, event rules/CEP, alarm lifecycle, health/prediction, "
            "REST + SignalR cho UI, ClientPLC sync, simulation/reports, và fusion_outbox khi bật ODF capture."
            if vi
            else "The FII AI backend is an ASP.NET Core service on .NET 9 — the center of the operations data path: MQTT ingest from ClientPLC, "
            "authoritative PostgreSQL, optional Timescale dual-write, event rules/CEP, alarm lifecycle, health/prediction, "
            "REST + SignalR for the UI, ClientPLC sync, simulation/reports, and fusion_outbox when ODF capture is enabled."
        ),
        p(
            "Fail-closed với JWT key, MQTT encryption key, tenant id, connection string. Local green không thay managed staging gate."
            if vi
            else "Fail-closed for JWT key, MQTT encryption key, tenant id, and connection string. Local green does not replace the managed staging gate."
        ),
        h1("2. " + ("Controllers (REST surface)" if vi else "Controllers (REST surface)"), c, True),
    ]
    ctrl_rows = [
        ["Controller", "Domain"],
        ["AuthController", "Login / session / logout"],
        ["DashboardController", "KPI summary"],
        ["MachineController / ProductionLineController / AssetController", "Catalog & hierarchy"],
        ["TelemetryController / TelemetryQueryController", "Live / log / query / Timescale"],
        ["AlarmsController / AlertController / EventLogController / EventRulesController", "Events & alarms"],
        ["AssetHealthController / MachineHealthController / PredictionController / RcaController", "Intelligence"],
        ["SyncController", "ClientPLC register / upload"],
        ["UsersController / AuditLogController", "Admin"],
        ["ReportsController / SimulationController / ConnectorIntegrationController", "Reports & integration"],
    ]
    tables.append(ctrl_rows)
    ops.append(add_table_op(len(ctrl_rows), 2))

    ops += [
        h1("3. " + ("Services và background jobs" if vi else "Services and background jobs"), c, True),
    ]
    svc_rows = [
        ["Service / Job", "Trách nhiệm" if vi else "Responsibility"],
        ["TelemetryIngestionService + TelemetryStore", "Validate + persist telemetry"],
        ["MqttServerService", "Embedded MQTT broker (MQTTnet)"],
        ["EventRuleEngine", "Threshold rules (event-rules.json)"],
        ["AlertService", "Open / ack / resolve, dedup, suppression"],
        ["HealthScoringService + HealthScoringJob", "Multi-factor health score"],
        ["PredictiveService + BatchPredictionJob", "Anomaly / failure risk"],
        ["TimescaleTelemetryService + TimescaleBackfillRunner", "Dual-write + backfill"],
        ["CepStagingPublisher", "CEP staging events"],
        ["SyncService / SimulationService / AuditService", "Edge sync, demo, audit"],
        ["OperationalDatabaseMigrationService", "SQL migrations 0001–0006"],
    ]
    tables.append(svc_rows)
    ops.append(add_table_op(len(svc_rows), 2))

    ops += [
        h1("4. " + ("Luồng telemetry" if vi else "Telemetry flow"), c, True),
        bullet("1. ClientPLC publish MQTT (TLS / device token / optional payload encryption)"),
        bullet("2. MqttServerService auth + topic ownership"),
        bullet("3. Ingest → PostgreSQL transaction"),
        bullet("4. Optional Timescale dual-write"),
        bullet("5. EventRuleEngine → event_log + alerts"),
        bullet("6. Health / prediction jobs"),
        bullet("7. UI REST + SignalR push"),
        bullet("8. Optional fusion_outbox (CaptureEnabled)"),
        h1("5. " + ("Migration lineage" if vi else "Migration lineage"), c, True),
    ]
    mig_rows = [
        ["Migration", "Nội dung" if vi else "Contents"],
        ["0001_operational_baseline", "Lines, machines, assets, users, alarms, simulation"],
        ["0002_ingress_receipts_and_catalog_normalization", "Receipts + catalog normalization"],
        ["0003_projection_and_history_integrity", "Projection / history integrity"],
        ["0004_secondary_delivery_leases_and_history", "Outbox leases + history"],
        ["0005_approval_sequence_and_delivery_truth", "Approval / delivery truth"],
        ["0006_service_account_api_key", "Service-account API key hashes"],
    ]
    tables.append(mig_rows)
    ops.append(add_table_op(len(mig_rows), 2))

    ops += [
        h1("6. " + ("Biến môi trường quan trọng" if vi else "Key environment variables"), c, True),
    ]
    env_rows = [
        ["Variable", "Mô tả" if vi else "Description"],
        ["ConnectionStrings__DefaultConnection", "Operations PostgreSQL"],
        ["ConnectionStrings__Timescale", "Timescale URL"],
        ["Jwt__Key", "JWT secret (≥ 32 bytes)"],
        ["Jwt__TenantId", "Canonical tenant id (fail-closed)"],
        ["Mqtt__EncryptionKey", "MQTT payload encryption key"],
        ["MqttServer__Port", "Default 1883"],
        ["MqttServer__Tls__Enabled", "true | false"],
        ["Timescale__Enabled", "Dual-write switch"],
        ["OpenDataFusion__CaptureEnabled", "Write fusion_outbox intents"],
    ]
    tables.append(env_rows)
    ops.append(add_table_op(len(env_rows), 2))
    ops.append(
        p(
            "Backend không tự load file .env root; dùng env vars / user-secrets / secret manager. Nested key dùng __."
            if vi
            else "The backend does not auto-load a root .env file; use env vars / user-secrets / a secret manager. Nested keys use __."
        )
    )

    ops += [
        h1("7. " + ("API map định hướng" if vi else "Representative API map"), c, True),
    ]
    api_rows = [
        ["Endpoint", "Purpose"],
        ["GET /api/health", "Health"],
        ["POST /api/auth/login", "Interactive session"],
        ["GET /api/dashboard/summary", "Ops KPI"],
        ["GET /api/machines/{id}", "Machine detail"],
        ["GET /api/alarms", "Alarms"],
        ["POST /api/alarms/{id}/acknowledge|resolve", "Alarm lifecycle"],
        ["GET /api/telemetry/live|log|query", "Telemetry"],
        ["GET /api/v1/assets/{id}/health", "Asset health"],
        ["POST /api/v1/predictions/anomaly", "Anomaly"],
        ["POST /api/v1/rca", "RCA context (gated)"],
        ["POST /api/sync/upload", "ClientPLC sync"],
        ["GET /hubs/telemetry", "SignalR hub"],
    ]
    tables.append(api_rows)
    ops.append(add_table_op(len(api_rows), 2))

    ops += [
        h1("8. " + ("AuthN / AuthZ" if vi else "AuthN / AuthZ"), c, True),
        bullet("Interactive: HttpOnly cookie session (FII SSO/JWT)"),
        bullet("Service-to-service: API key, raw once, SHA-256 stored"),
        bullet("Roles: ADMIN, ENGINEER, GUEST — backend policy"),
        bullet("Rate limits + trusted ForwardedHeaders only"),
        h1("9. " + ("Chạy và kiểm thử" if vi else "Run and test"), c, True),
        code("dotnet run --project backend/backend.csproj -- --database-preflight"),
        code("dotnet run --project backend/backend.csproj -- --database-migrate"),
        code("dotnet run --project backend/backend.csproj"),
        code("dotnet test backend.Tests/backend.Tests.csproj"),
        h1("10. " + ("Rủi ro và kết luận" if vi else "Risks and conclusion"), c, True),
        bullet("Managed staging: HTTPS, secret manager, MQTT TLS/mTLS, backup/restore, retention"),
        bullet("Timescale migration lineage độc lập Operations" if vi else "Timescale migration lineage is independent of Operations"),
        bullet("DEFERRED rules ≠ live features"),
        p(
            "Backend là trái tim operations path với thiết kế boundary-first và fail-closed. Production NO-GO đến khi managed evidence hoàn tất."
            if vi
            else "The backend is the heart of the operations path with boundary-first, fail-closed design. Production remains NO-GO until managed evidence is complete."
        ),
        h1("Phụ lục — Nguồn" if vi else "Appendix — Sources", c),
        bullet("backend/Program.cs, Controllers/, Services/, Security/, db/migrations/"),
        bullet("backend/Configuration/event-rules.json, OpenDataFusionCaptureOptions.cs"),
        bullet("fusion-contracts/, docs/PROJECT-GUIDE.vi.md"),
    ]
    return ops, tables


def odysseus_content(lang: str, c: str) -> tuple[list[dict], list[list[list[str]]]]:
    vi = lang == "vi"
    tables: list[list[list[str]]] = []
    ops: list[dict] = []

    ops += [
        h1("1. " + ("Tóm tắt điều hành" if vi else "Executive summary"), c, True),
        p(
            "Odysseus là self-hosted AI workspace (chat, agents, research, documents, email, notes, calendar, local models, MCP). "
            "Trong monorepo FII, Odysseus là thành phần TÙY CHỌN — không thuộc core operations, không đọc DB nhà máy trực tiếp, "
            "không được chặn MQTT hot path."
            if vi
            else "Odysseus is a self-hosted AI workspace (chat, agents, research, documents, email, notes, calendar, local models, MCP). "
            "In the FII monorepo it is OPTIONAL — outside core operations, no direct factory DB access, and it must never block the MQTT hot path."
        ),
        p(
            "Tích hợp FII qua REST bridge /api/mkz/* (admin-only) và MCP PLC server đọc backend qua MKZ_BACKEND_URL. "
            "Profile fii-chat thu gọn pack cá nhân để tập trung chat + factory Q&A. License AGPL-3.0-or-later. Port mặc định 7000."
            if vi
            else "FII integration uses the /api/mkz/* REST bridge (admin-only) and a PLC MCP server that reads the backend via MKZ_BACKEND_URL. "
            "The fii-chat profile trims personal packs to focus on chat + factory Q&A. License AGPL-3.0-or-later. Default port 7000."
        ),
        h1("2. " + ("Ranh giới với FII" if vi else "Boundaries with FII"), c, True),
        bullet("Data path: Odysseus → HTTP REST backend → PostgreSQL (never direct DB)"),
        bullet("OPENAI_API_KEY ≠ MKZ_BACKEND_TOKEN — secrets tách biệt" if vi else "OPENAI_API_KEY ≠ MKZ_BACKEND_TOKEN — separate secrets"),
        bullet("Audit logs FII không expose qua bridge" if vi else "FII audit logs are not exposed through the bridge"),
        bullet("AUTH_ENABLED=false chỉ trusted-local" if vi else "AUTH_ENABLED=false is trusted-local only"),
        h1("3. " + ("Bảng bridge endpoints" if vi else "Bridge endpoint table"), c, True),
    ]
    br_rows = [
        ["Endpoint", "Mô tả" if vi else "Description"],
        ["GET /api/mkz/health", "Backend reachability"],
        ["GET /api/mkz/dashboard", "Dashboard KPIs"],
        ["GET /api/mkz/machines", "Machine list"],
        ["GET /api/mkz/production-lines", "Production lines"],
        ["GET /api/mkz/alarms", "Alarms"],
        ["GET /api/mkz/reports/production", "Production report"],
        ["GET /api/mkz/telemetry", "Live / recent telemetry"],
        ["GET /api/mkz/system-info", "Bridge routing info"],
    ]
    tables.append(br_rows)
    ops.append(add_table_op(len(br_rows), 2))
    ops.append(
        p(
            "Unauthenticated /api/mkz/health → HTTP 401 (kể cả localhost). /api/mkz/gateway/... có policy riêng."
            if vi
            else "Unauthenticated /api/mkz/health returns HTTP 401 even on localhost. /api/mkz/gateway/... has a separate policy."
        )
    )

    ops += [
        h1("4. " + ("Biến môi trường FII chat" if vi else "FII chat environment variables"), c, True),
    ]
    env_rows = [
        ["Variable", "Vai trò" if vi else "Role"],
        ["ODYSSEUS_PROFILE=fii-chat", "Skip email/gallery/calendar packs"],
        ["CHROMADB_DISABLED=true", "Chat without vector store spam"],
        ["HF_HUB_DISABLE_XET=1", "Avoid FastEmbed download hang (dev)"],
        ["MKZ_BACKEND_URL", "FII backend base URL"],
        ["MKZ_BACKEND_TOKEN", "Optional backend auth (HTTPS if remote)"],
        ["FII_SSO_ENABLED=true", "SSO integration with FII"],
        ["OPENAI_API_KEY", "Hosted model provider only (server-side)"],
        ["AUTH_ENABLED", "Must stay true outside trusted-local"],
    ]
    tables.append(env_rows)
    ops.append(add_table_op(len(env_rows), 2))

    ops += [
        h1("5. " + ("Kiến trúc nội bộ" if vi else "Internal architecture"), c, True),
        bullet("app.py / launcher — FastAPI + uvicorn"),
        bullet("core/ — auth, database, session, FII SSO helper"),
        bullet("routes/ — chat, models, memory, MCP, mkz_*, documents, research"),
        bullet("src/ — LLM core, agent tools, RAG, MCP manager, security"),
        bullet("mcp_servers/ — email, image_gen, memory, rag, plc_mcp_server"),
        bullet("static/ — SPA UI"),
        h1("6. " + ("Tính năng sản phẩm" if vi else "Product capabilities"), c, True),
    ]
    feat_rows = [
        ["Area", "Status trong FII" if vi else "Status in FII"],
        ["Chat + Agents + MCP", "Core for fii-chat"],
        ["Factory REST bridge", "Admin-only integration"],
        ["PLC MCP server", "Read-only via backend"],
        ["RAG / Chroma", "Optional (disabled by default in fii-chat)"],
        ["Email / Gallery / Calendar", "Disabled in fii-chat profile"],
        ["Deep Research / Documents", "Available upstream features"],
        ["Shell / tools", "Policy-gated; not for OT write"],
    ]
    tables.append(feat_rows)
    ops.append(add_table_op(len(feat_rows), 2))

    ops += [
        h1("7. " + ("Chạy local" if vi else "Local run"), c, True),
        code("cd Odysseus"),
        code(".\\launch-windows.ps1"),
        code("# or: .\\venv\\Scripts\\python.exe -m uvicorn app:app --host 127.0.0.1 --port 7000"),
        p("Docker: docker compose up -d --build → http://localhost:7000" if vi else "Docker: docker compose up -d --build → http://localhost:7000"),
        h1("8. " + ("Rủi ro và kết luận" if vi else "Risks and conclusion"), c, True),
        bullet("Sự cố Odysseus không được fail operations path" if vi else "Odysseus outages must not fail the operations path"),
        bullet("Admin-only bridge hạn chế multi-user least privilege" if vi else "Admin-only bridge limits multi-user least privilege"),
        bullet("Hallucination risk — sensor truth vẫn ở UI/backend" if vi else "Hallucination risk — sensor truth remains UI/backend"),
        bullet("AGPL implications if distributing modifications"),
        p(
            "Odysseus bổ sung plane AI/chat/RAG nhưng không phải lõi giám sát nhà máy. Production go-live FII độc lập với Odysseus readiness."
            if vi
            else "Odysseus adds an AI/chat/RAG plane but is not the factory monitoring core. FII production go-live is independent of Odysseus readiness."
        ),
        h1("Phụ lục — Nguồn" if vi else "Appendix — Sources", c),
        bullet("Odysseus/README.md, INTEGRATION.md, docs/setup.md, THREAT_MODEL.md"),
        bullet("routes/mkz_routes.py, mcp_servers/plc_mcp_server.py"),
        bullet("scripts/sync_mkz_to_odysseus.py, verify_mkz_rag.py"),
    ]
    return ops, tables


def odf_content(lang: str, c: str) -> tuple[list[dict], list[list[list[str]]]]:
    vi = lang == "vi"
    tables: list[list[list[str]]] = []
    ops: list[dict] = []

    ops += [
        h1("1. " + ("Tóm tắt điều hành" if vi else "Executive summary"), c, True),
        p(
            "Open Data Fusion (ODF) là nền tảng open-source (Apache-2.0) cho governed industrial data integration, contextualization "
            "và visual collaboration. Trong workspace FII: Open-Data-Fusion/ (product) và third_party/open-data-fusion/ (submodule pin). "
            "Pre-release — không nối OT production / không industrial control khi chưa review độc lập."
            if vi
            else "Open Data Fusion (ODF) is an open-source platform (Apache-2.0) for governed industrial data integration, contextualization, "
            "and visual collaboration. In the FII workspace: Open-Data-Fusion/ (product) and third_party/open-data-fusion/ (pinned submodule). "
            "Pre-release — do not connect production OT or execute industrial control without independent review."
        ),
        p(
            "Với FII, dữ liệu vào ODF qua Fusion Adapter + transactional outbox — ngoài MQTT hot path. Capture và Dispatch độc lập. "
            "ODF down không được dừng telemetry local."
            if vi
            else "For FII, data enters ODF via Fusion Adapter + transactional outbox — outside the MQTT hot path. Capture and Dispatch are independent. "
            "An ODF outage must not stop local telemetry."
        ),
        h1("2. " + ("Apps và packages" if vi else "Apps and packages"), c, True),
    ]
    app_rows = [
        ["Component", "Role"],
        ["apps/web", "React + Vite Asset Explorer + Industrial Canvas"],
        ["apps/api", "TypeScript REST API, auth, industrial persistence"],
        ["apps/edge-agent", "CSV / PostgreSQL / OPC UA read-only collection"],
        ["apps/outbox-worker", "Postgres outbox → Redis Streams"],
        ["apps/pipeline-worker", "Scoped / gated pipelines"],
        ["packages/contracts", "Shared contracts"],
        ["packages/platform-core", "Modeling + platform core"],
        ["packages/postgres-runtime", "Postgres adapters + RLS runtime"],
    ]
    tables.append(app_rows)
    ops.append(add_table_op(len(app_rows), 2))

    ops += [
        h1("3. " + ("Capability map" if vi else "Capability map"), c, True),
    ]
    cap_rows = [
        ["Area", "Status", "Ghi chú" if vi else "Notes"],
        ["Asset Explorer", "Available", "Hierarchy, telemetry, relations"],
        ["Industrial Canvas", "Available", "Revisions, undo/redo, rollback"],
        ["Collaboration", "Available", "Roles, presence, SSE"],
        ["Ingestion", "Available", "Idempotent bundles + provenance"],
        ["Governed objects", "Available", "Versioned bytes + SHA-256"],
        ["Telemetry serving", "Available", "Raw / latest / aggregates"],
        ["Contextualization", "Gated", "Candidates + human review"],
        ["Write-back", "Gated", "Policy + approvals + external executor"],
        ["OIDC / Keycloak", "Optional", "Auth Code + PKCE"],
        ["Edge collection", "Optional", "Checkpointed read-only sources"],
        ["Workers / Redis", "Optional", "Multi-instance event fan-out"],
        ["Observability", "Optional", "Prometheus / Grafana / OTEL"],
    ]
    tables.append(cap_rows)
    ops.append(add_table_op(len(cap_rows), 3))

    ops += [
        h1("4. " + ("Tích hợp FII — Capture / Dispatch" if vi else "FII integration — Capture / Dispatch"), c, True),
    ]
    int_rows = [
        ["Flag / Step", "Hành vi" if vi else "Behavior"],
        ["OpenDataFusion__CaptureEnabled=true", "Backend writes fusion_outbox with business txn"],
        ["OpenDataFusion__DispatchEnabled=true", "Adapter claims lease and POSTs ODF bundles"],
        ["Tenant / Project / Identity ready", "Prerequisite before Dispatch"],
        ["Preview scripts", "Start|Test-OpenDataFusionPreview.ps1 (loopback)"],
        ["Rollback", "Capture=false, stop adapter, keep pending outbox"],
        ["External IDs", "mkz:plant:* / mkz:line:* / mkz:machine:* / mkz:ts:*"],
    ]
    tables.append(int_rows)
    ops.append(add_table_op(len(int_rows), 2))

    ops += [
        h1("5. " + ("Cổng preview mặc định" if vi else "Default preview ports"), c, True),
    ]
    port_rows = [
        ["Service", "Port"],
        ["ODF API", "54310"],
        ["ODF Web", "58088"],
        ["PostgreSQL", "55432"],
        ["Redis", "56379"],
        ["Grafana", "53000"],
        ["Prometheus", "59090"],
    ]
    tables.append(port_rows)
    ops.append(add_table_op(len(port_rows), 2))

    ops += [
        h1("6. " + ("Nguyên tắc thiết kế" if vi else "Design principles"), c, True),
        bullet("Evidence before convenience"),
        bullet("Review before truth"),
        bullet("One source of truth (no dual-write authoritative stores)"),
        bullet("Fail closed on missing identity / policy / executor"),
        bullet("Local-first, production-aware (sqlite | postgres)"),
        bullet("Clean-room implementation (not Cognite Data Fusion)"),
        h1("7. " + ("Persistence" if vi else "Persistence"), c, True),
        p(
            "ODF_DATA_PERSISTENCE=sqlite|postgres — một backend authoritative mỗi process. Postgres dùng RLS forced cho multi-tenant; "
            "shared S3-compatible object store cho governed bytes. ODF_SEED=true chỉ fixture opt-in."
            if vi
            else "ODF_DATA_PERSISTENCE=sqlite|postgres — one authoritative backend per process. Postgres uses forced RLS for multi-tenant data; "
            "a shared S3-compatible object store holds governed bytes. ODF_SEED=true is opt-in fixture data only."
        ),
        h1("8. " + ("Chạy standalone" if vi else "Standalone run"), c, True),
        code("cd Open-Data-Fusion"),
        code("npm install"),
        code("npm run dev"),
        code("git submodule update --init --recursive"),
        code(".\\infrastructure\\open-data-fusion\\Start-OpenDataFusionPreview.ps1"),
        h1("9. " + ("Rủi ro và kết luận" if vi else "Risks and conclusion"), c, True),
        bullet("Tách Operations path vs ODF path trong incident response" if vi else "Separate Operations path vs ODF path in incident response"),
        bullet("Không bật Dispatch trước OIDC/tenant proven" if vi else "Do not enable Dispatch before OIDC/tenant is proven"),
        bullet("Không sửa third_party submodule để chứa secret MKZ" if vi else "Do not fork the third_party submodule for MKZ secrets"),
        bullet("ODF preview green ≠ FII production GO"),
        p(
            "ODF là secondary delivery plane có provenance, Explorer/Canvas và governance. Trong FII, thiết kế đúng khi Capture/Dispatch tách "
            "và operations vẫn sống nếu ODF down."
            if vi
            else "ODF is a secondary delivery plane with provenance, Explorer/Canvas, and governance. In FII the design is correct when Capture/Dispatch "
            "are separated and operations survive an ODF outage."
        ),
        h1("Phụ lục — Nguồn" if vi else "Appendix — Sources", c),
        bullet("Open-Data-Fusion/README.md, docs/architecture/*, docs/operations/*"),
        bullet("fusion-adapter/, infrastructure/open-data-fusion/"),
        bullet("third_party/open-data-fusion/, docs/PROJECT-GUIDE.vi.md §4.5–4.7"),
    ]
    return ops, tables


REPORTS = [
    # file, title, subtitle, accent, lang, builder, header
    (
        "Frontend-Report.vi.docx",
        "Frontend — Operations UI",
        "Báo cáo kỹ thuật chi tiết",
        "1B4F72",
        "vi",
        frontend_content,
        "FII AI | Frontend | Báo cáo kỹ thuật",
    ),
    (
        "Frontend-Report.en.docx",
        "Frontend — Operations UI",
        "Detailed technical report",
        "1B4F72",
        "en",
        frontend_content,
        "FII AI | Frontend | Technical Report",
    ),
    (
        "Backend-Report.vi.docx",
        "Backend — Operations API",
        "Báo cáo kỹ thuật chi tiết",
        "0E6655",
        "vi",
        backend_content,
        "FII AI | Backend | Báo cáo kỹ thuật",
    ),
    (
        "Backend-Report.en.docx",
        "Backend — Operations API",
        "Detailed technical report",
        "0E6655",
        "en",
        backend_content,
        "FII AI | Backend | Technical Report",
    ),
    (
        "Odysseus-Report.vi.docx",
        "Odysseus — AI Workspace",
        "Báo cáo kỹ thuật chi tiết (optional plane)",
        "6C3483",
        "vi",
        odysseus_content,
        "FII AI | Odysseus | Báo cáo kỹ thuật",
    ),
    (
        "Odysseus-Report.en.docx",
        "Odysseus — AI Workspace",
        "Detailed technical report (optional plane)",
        "6C3483",
        "en",
        odysseus_content,
        "FII AI | Odysseus | Technical Report",
    ),
    (
        "ODF-Report.vi.docx",
        "Open Data Fusion (ODF)",
        "Báo cáo kỹ thuật chi tiết",
        "B9770E",
        "vi",
        odf_content,
        "FII AI | ODF | Báo cáo kỹ thuật",
    ),
    (
        "ODF-Report.en.docx",
        "Open Data Fusion (ODF)",
        "Detailed technical report",
        "B9770E",
        "en",
        odf_content,
        "FII AI | ODF | Technical Report",
    ),
]


def main() -> int:
    for file, title, subtitle, accent, lang, builder, header in REPORTS:
        rel = f"docs/component-reports/{file}"
        print(f"Building {file}...")
        create_shell(rel, title, subtitle, accent, lang)
        ops, tables = builder(lang, accent)
        batch(rel, ops)
        fill_tables(rel, tables, accent)
        finish(rel, header)
        print(f"  OK {file}")

    print("\nAll reports:")
    for pth in sorted(OUT.glob("*.docx")):
        print(f"  {pth.name:30} {pth.stat().st_size:6} bytes")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
