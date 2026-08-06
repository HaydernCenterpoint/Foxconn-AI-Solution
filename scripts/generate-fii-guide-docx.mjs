/**
 * Generate docs/FII-AI-Huong-Dan-Du-An.docx — professional Vietnamese project guide.
 * Run: node scripts/generate-fii-guide-docx.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  PageBreak,
} from "docx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outPath = path.join(root, "docs", "FII-AI-Huong-Dan-Du-An.docx");

// A4 content width: 11906 - 2*1134 ≈ 9638; use 9638
const PAGE_W = 11906;
const PAGE_H = 16838;
const MARGIN = 1134; // 0.79"
const CONTENT_W = PAGE_W - MARGIN * 2; // 9638

const C = {
  primary: "0B3D5C",
  accent: "0E7490",
  dark: "0F172A",
  muted: "475569",
  lightBg: "F0F9FF",
  headerBg: "0B3D5C",
  headerText: "FFFFFF",
  rowAlt: "F8FAFC",
  border: "CBD5E1",
  warnBg: "FEF3C7",
  warnText: "92400E",
  ok: "065F46",
  danger: "991B1B",
};

const thin = { style: BorderStyle.SINGLE, size: 4, color: C.border };
const borders = { top: thin, bottom: thin, left: thin, right: thin };
const noBorder = {
  style: BorderStyle.NONE,
  size: 0,
  color: "FFFFFF",
};
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

function r(text, o = {}) {
  return new TextRun({
    text,
    font: "Arial",
    size: o.size ?? 20,
    bold: o.bold,
    italics: o.italics,
    color: o.color ?? C.dark,
  });
}

function p(text, o = {}) {
  return new Paragraph({
    spacing: { after: o.after ?? 120, before: o.before ?? 0, line: 276 },
    alignment: o.align,
    children: [r(text, o)],
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 200 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 12, color: C.accent, space: 8 },
    },
    children: [r(text, { size: 32, bold: true, color: C.primary })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 140 },
    children: [r(text, { size: 26, bold: true, color: C.accent })],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 100 },
    children: [r(text, { size: 22, bold: true, color: C.primary })],
  });
}

function bullet(text, ref = "bullets") {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 80, line: 276 },
    children: [r(text, { size: 20 })],
  });
}

function num(text, ref = "numbers") {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 80, line: 276 },
    children: [r(text, { size: 20 })],
  });
}

function codeBlock(lines) {
  return lines.map(
    (line) =>
      new Paragraph({
        spacing: { after: 40, line: 240 },
        shading: { type: ShadingType.CLEAR, fill: "F1F5F9" },
        children: [r(line || " ", { size: 16, color: "334155", font: "Consolas" })],
      })
  );
}

function callout(title, body, bg = C.warnBg, color = C.warnText) {
  return [
    new Paragraph({
      spacing: { before: 160, after: 40 },
      shading: { type: ShadingType.CLEAR, fill: bg },
      children: [r(title, { size: 20, bold: true, color })],
    }),
    new Paragraph({
      spacing: { after: 160 },
      shading: { type: ShadingType.CLEAR, fill: bg },
      children: [r(body, { size: 19, color })],
    }),
  ];
}

function cell(text, width, o = {}) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: {
      type: ShadingType.CLEAR,
      fill: o.header ? C.headerBg : o.alt ? C.rowAlt : "FFFFFF",
    },
    margins: { top: 70, bottom: 70, left: 100, right: 100 },
    children: [
      new Paragraph({
        children: [
          r(text, {
            size: o.header ? 18 : 17,
            bold: o.header || o.bold,
            color: o.header ? C.headerText : C.dark,
          }),
        ],
      }),
    ],
  });
}

function table(headers, rows, widths) {
  const sum = widths.reduce((a, b) => a + b, 0);
  if (sum !== CONTENT_W) {
    // normalize silently — last col absorbs
    widths = widths.slice();
    widths[widths.length - 1] += CONTENT_W - sum;
  }
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({
        children: headers.map((h, i) => cell(h, widths[i], { header: true })),
      }),
      ...rows.map(
        (row, ri) =>
          new TableRow({
            children: row.map((c, i) =>
              cell(String(c), widths[i], { alt: ri % 2 === 1 })
            ),
          })
      ),
    ],
  });
}

function spacer(after = 200) {
  return new Paragraph({ spacing: { after }, children: [] });
}

const children = [];

// ── Cover ──────────────────────────────────────────────
children.push(
  spacer(1200),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [r("FOXCONN AI SOLUTION", { size: 22, bold: true, color: C.accent })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 18, color: C.primary, space: 12 },
    },
    children: [r("FII AI / MKZ Factory Monitor", { size: 44, bold: true, color: C.primary })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 280, after: 80 },
    children: [
      r(
        "Tài liệu giới thiệu dự án · Hướng dẫn sử dụng · Công nghệ · Chức năng · Bảo mật · Lộ trình",
        { size: 22, color: C.muted }
      ),
    ],
  }),
  spacer(400),
  table(
    ["Trường", "Giá trị"],
    [
      ["Phiên bản tài liệu", "1.0 — 2026-08-05"],
      ["Trạng thái phát hành", "NO-GO production · Staging candidate"],
      ["Tiến độ Phase 2", "~84% local · Managed staging pending"],
      ["Nguồn plan", "PROJECT_PLAN.md"],
      ["Đối tượng", "Developer · Operator · Reviewer · Stakeholder"],
    ],
    [3200, CONTENT_W - 3200]
  ),
  spacer(600),
  ...callout(
    "Cảnh báo phát hành",
    "Repository hiện là staging candidate. Local build/test/demo không thay thế managed HTTPS staging, secret manager, backup/restore, 16 managed checks và independent reviewer. Không claim production-ready."
  ),
  new Paragraph({ children: [new PageBreak()] })
);

// ── TOC-like outline ───────────────────────────────────
children.push(
  h1("Mục lục"),
  bullet("1. Tóm tắt dự án"),
  bullet("2. Phạm vi & thành phần"),
  bullet("3. Kiến trúc tổng thể"),
  bullet("4. Công nghệ sử dụng"),
  bullet("5. Chức năng chi tiết"),
  bullet("6. Bảo mật"),
  bullet("7. Hướng dẫn sử dụng"),
  bullet("8. API & kiểm thử"),
  bullet("9. Kế hoạch tương lai"),
  bullet("10. Thuật ngữ & tham chiếu"),
  new Paragraph({ children: [new PageBreak()] })
);

// ── 1 ──────────────────────────────────────────────────
children.push(
  h1("1. Tóm tắt dự án"),
  p(
    "FII AI (Foxconn AI Solution / MKZ Factory Monitor) là nền tảng giám sát công nghiệp triển khai tại chỗ (on-premises). Hệ thống đọc tín hiệu từ PLC, truyền telemetry qua MQTT, lưu dữ liệu vận hành trong PostgreSQL (và mirror tùy chọn sang TimescaleDB), đánh giá sự kiện/CEP/cảnh báo, tính health score và rủi ro hỏng hóc, rồi hiển thị qua Operations UI (React)."
  ),
  p(
    "Đồng bộ sang Open Data Fusion (ODF) nằm ngoài hot path MQTT: backend ghi intent vào transactional outbox; Fusion Adapter nhận lease và giao bundle. ODF hoặc AI plane dừng không được chặn việc thu nhận telemetry."
  ),
  h2("1.1 Giá trị mang lại"),
  table(
    ["Đối tượng", "Lợi ích"],
    [
      ["Vận hành", "Một màn hình theo dõi máy, line, sản lượng, alarm"],
      ["Kỹ sư", "Drill-down telemetry, health, anomaly, RCA context"],
      ["Quản trị", "User/role, audit log, simulation, báo cáo"],
      ["IT / Data", "Outbox → ODF, dual-write Timescale, connector ERP/MES"],
    ],
    [2400, CONTENT_W - 2400]
  ),
  spacer(160),
  h2("1.2 Trạng thái hiện tại"),
  table(
    ["Hạng mục", "Trạng thái"],
    [
      ["Phase 1 MVP", "Hoàn thành"],
      ["Phase 2 local (alert, health, prediction, RBAC)", "Local complete"],
      ["Integration W8 (MQTT → DB → UI)", "Có evidence local"],
      ["Managed staging (HTTPS, secrets, 16 checks)", "Pending"],
      ["Production / canary", "NO-GO"],
    ],
    [5200, CONTENT_W - 5200]
  )
);

// ── 2 ──────────────────────────────────────────────────
children.push(
  h1("2. Phạm vi & thành phần"),
  table(
    ["Thư mục", "Vai trò"],
    [
      ["backend/", "ASP.NET Core API, MQTT broker, CEP, alerts, health, prediction"],
      ["frontend/", "React Operations UI"],
      ["ClientPLC/", "WPF edge client đọc PLC, offline queue, MQTT"],
      ["fusion-contracts/, contracts/v1/", "Contract versioned (asset/telemetry/event/API)"],
      ["fusion-adapter/", "Dispatch outbox → Open Data Fusion"],
      ["infrastructure/", "Timescale, demo, staging gate, ODF preview"],
      ["factory-ai-platform/", "Gateway, CEP/ML, RAG, report, asset, data-platform"],
      ["Open-Data-Fusion/", "Data fusion product workspace"],
      ["third_party/open-data-fusion/", "Git submodule upstream (pin)"],
      ["Odysseus/", "AI assistant tùy chọn — ngoài scope lõi FII"],
    ],
    [3600, CONTENT_W - 3600]
  )
);

// ── 3 ──────────────────────────────────────────────────
children.push(
  h1("3. Kiến trúc tổng thể"),
  h2("3.1 Sơ đồ luồng"),
  p(
    "PLC → ClientPLC (HslCommunication) → MQTT broker (trong backend) → TelemetryIngestionService → PostgreSQL Operations (+ Timescale dual-write tùy chọn) → EventRuleEngine / Alerts → React UI. Song song: fusion_outbox → Fusion Adapter → ODF. Factory AI Gateway/RAG/report là plane bổ sung."
  ),
  h2("3.2 Ranh giới dữ liệu"),
  num("PLC/Operations boundary: thu nhận và UI phải sống khi ODF/AI down."),
  num("PostgreSQL Operations là nguồn sự thật vận hành (backend/db/migrations/)."),
  num("TimescaleDB có lineage riêng (infrastructure/timescaledb/) — không gộp với migrate Operations."),
  num("Outbox + lease + retry + dead-letter cho secondary delivery."),
  num("AI plane không gọi từ MQTT hot path."),
  h2("3.3 Luồng telemetry end-to-end"),
  num("ClientPLC poll tag, resolve trạng thái máy, ghi SQLite/offline queue."),
  num("MQTT gửi payload (TLS + device token + optional AES)."),
  num("Backend validate contract, ghi PostgreSQL; dual-write Timescale nếu bật."),
  num("EventRuleEngine tạo event/alert; jobs tính health/risk."),
  num("UI đọc REST / SignalR / polling."),
  num("Capture outbox → Adapter map hierarchy Plant→Line→Machine → ODF.")
);

// ── 4 ──────────────────────────────────────────────────
children.push(
  h1("4. Công nghệ sử dụng"),
  table(
    ["Lớp", "Stack chính"],
    [
      ["Backend", ".NET 9, ASP.NET Core, MQTTnet 5.1, Npgsql, JWT Bearer, SignalR, Swagger, BCrypt"],
      ["ClientPLC", ".NET 9 WPF, HslCommunication, MQTTnet, SQLite, Serilog"],
      ["Frontend", "React 19, TypeScript, Vite 8, Router 7, Axios, Zustand, React Query, Recharts, GSAP, i18next, Zod, Tailwind 4"],
      ["Data", "PostgreSQL (authoritative), TimescaleDB (hypertable, rollup, retention)"],
      ["AI services", "Python, FastAPI, Pydantic, scikit-learn, pandas, pgvector, MinIO"],
      ["ODF", "Node.js, Express, React/Vite, PostgreSQL, Redis Streams, OIDC/Keycloak"],
      ["QA / Delivery", "xUnit, Vitest, Playwright, pytest, Docker Compose, PowerShell, GitHub Actions"],
    ],
    [2400, CONTENT_W - 2400]
  ),
  spacer(160),
  h2("4.1 Shared contracts"),
  table(
    ["Contract", "Trường cốt lõi"],
    [
      ["Asset", "id, type, name, code, parentId, metadata, timestamps"],
      ["Telemetry", "(time, assetId, metric, value) ± unit/source/tags"],
      ["Event", "eventId, timestamp, assetId, type, severity, payload"],
      ["API", "REST /api/v1, JSON camelCase, JWT Bearer, RFC 7807 problem+json"],
    ],
    [2400, CONTENT_W - 2400]
  ),
  spacer(120),
  p(
    "Metric chuẩn gồm: production_quantity, production_time, uph, oee, yield_rate, cpu_percent, ram_percent, temperature, pressure, speed, cycle_time, vibration.",
    { size: 18, color: C.muted }
  )
);

// ── 5 ──────────────────────────────────────────────────
children.push(
  h1("5. Chức năng chi tiết"),
  h2("5.1 ClientPLC (edge)"),
  bullet("Kết nối nhiều loại PLC qua HslCommunication / profile động (27+ brand)."),
  bullet("Polling tag, heartbeat, production, CPU/RAM/uptime."),
  bullet("Trạng thái chuẩn: RUNNING, IDLE, STOPPED, ERROR, OFFLINE."),
  bullet("Alarm edge detection + lịch sử local; offline queue SQLite."),
  bullet("MQTT reconnect, device token (FII_MQTT_DEVICE_TOKEN), optional AES."),
  bullet("Import cấu hình máy/alarm từ Excel/JSON."),
  h2("5.2 Operations backend"),
  table(
    ["Nhóm", "Khả năng"],
    [
      ["Asset / Line / Machine", "CRUD, tree, search, catalog"],
      ["Telemetry", "Live, log, query, Timescale rollup"],
      ["Alerts / Alarms", "open → acknowledge → resolve; dedup; suppression"],
      ["Intelligence", "Health score, anomaly (z-score), failure risk, RCA context"],
      ["CEP", "event-rules.json, staging publisher"],
      ["Auth", "Cookie session, JWT, service-account API key (hash)"],
      ["Sync", "/api/sync cho ClientPLC"],
      ["Admin", "Users, audit, simulation, reports, connector proxy"],
    ],
    [2800, CONTENT_W - 2800]
  ),
  spacer(160),
  h2("5.3 Operations UI"),
  table(
    ["Luồng", "Route", "Mô tả"],
    [
      ["Dashboard", "/, /admin", "KPI, line/machine, health, alarms"],
      ["Lines", "/lines", "Production line & sơ đồ máy"],
      ["Machines", "/machines, /machines/:id", "Danh sách + drill-down"],
      ["Alarms", "/alarms", "Lọc, chi tiết, ack/resolve"],
      ["Reports", "/admin/reports", "Báo cáo & chart"],
      ["Analysis", "/production-analysis", "Phân tích sản lượng"],
      ["Simulation", "/admin/simulation", "Dữ liệu demo"],
      ["Admin", "/admin/users, audit, settings", "User, audit, cấu hình"],
      ["Slideshow", "/slideshow", "Presentation vận hành"],
    ],
    [2200, 3200, CONTENT_W - 5400]
  ),
  spacer(120),
  p("Vai trò: ADMIN (đầy đủ) · ENGINEER (vận hành/cấu hình) · GUEST (chỉ đọc). Route guard frontend chỉ hỗ trợ UX — backend policy là biên bảo mật thật."),
  h2("5.4 Product intelligence"),
  bullet("HealthScoringService: multi-factor (availability, alarm, performance, events)."),
  bullet("PredictiveService: anomaly/risk; BatchPredictionJob định kỳ."),
  bullet("Một số rule DEFERRED trong event-rules.json — chưa có evaluator runtime."),
  bullet("Prediction hiện heuristic (z-score), chưa ML production."),
  h2("5.5 Open Data Fusion"),
  bullet("CaptureEnabled: ghi fusion_outbox cùng transaction backend."),
  bullet("DispatchEnabled: Adapter claim/lease/retry/dead-letter sang ODF."),
  bullet("External ID: mkz:plant:*, mkz:line:*, mkz:machine:*, mkz:ts:*."),
  bullet("Write-back cần policy, approval và external executor."),
  h2("5.6 Factory AI Platform"),
  table(
    ["Service", "Chức năng"],
    [
      ["gateway", "OpenAI-compatible chat/completions, agent router, JWT"],
      ["antigravity-bridge", "Sandbox engineering agent"],
      ["document-service", "PDF chunk + embedding/pgvector search"],
      ["report-service", "Xuất DOCX/XLSX, signed download"],
      ["asset-service", "Asset CRUD, tree, health"],
      ["cep-service", "Event rules, alerts, RCA, ML anomaly"],
      ["data-platform", "ERP/MES/file watcher, dual-write, DLQ"],
    ],
    [2800, CONTENT_W - 2800]
  )
);

// ── 6 ──────────────────────────────────────────────────
children.push(
  h1("6. Bảo mật"),
  h2("6.1 Kiểm soát đang có"),
  table(
    ["Lớp", "Cơ chế"],
    [
      ["Web session", "HttpOnly cookie; không lưu bearer trong localStorage"],
      ["API", "JWT Bearer / service API key; raw key một lần; lưu hash"],
      ["RBAC", "ADMIN / ENGINEER / GUEST enforce backend"],
      ["MQTT", "Device token + client ID + topic ownership; TLS production"],
      ["Payload", "AES encryption khi cấu hình Mqtt__EncryptionKey"],
      ["Abuse", "Rate limit global + login + health; forwarded headers allow-list"],
      ["Secrets", "Secret manager; không commit; không VITE_* secrets"],
      ["Delivery", "Transactional outbox, lease, retry, dead state"],
      ["ODF write-back", "Policy + approval + executor"],
      ["Supply chain", "CI, dependency review, CodeQL, SBOM"],
    ],
    [2600, CONTENT_W - 2600]
  ),
  spacer(160),
  h2("6.2 Biến môi trường bắt buộc (backend)"),
  table(
    ["Biến", "Mục đích"],
    [
      ["ConnectionStrings__DefaultConnection", "PostgreSQL Operations"],
      ["ConnectionStrings__Timescale", "TimescaleDB"],
      ["Jwt__Key", "Ký JWT (≥ 32 bytes)"],
      ["Mqtt__EncryptionKey", "Mã hóa payload MQTT"],
      ["MqttServer__DeviceTokens__<client-id>", "Token gắn client ID"],
      ["MqttServer__Tls__CertificatePath / Password", "PFX TLS broker"],
      ["ConnectorApi__ApiKey", "Proxy connector (không expose VITE_*)"],
    ],
    [4200, CONTENT_W - 4200]
  ),
  spacer(120),
  ...callout(
    "Quy tắc secrets",
    "Không commit password, PFX, connection string, customer data. ClientPLC nhận token qua FII_MQTT_DEVICE_TOKEN, không ghi token vào JSON local. Production bật mqttUseTls=true."
  ),
  h2("6.3 Giới hạn chưa hoàn tất"),
  bullet("NO-GO production cho đến managed evidence."),
  bullet("Chưa claim backup/restore, broker outage drill, TLS/mTLS production nếu thiếu artifact."),
  bullet("ERP/MES thật + ML/LLM RCA còn pending."),
  bullet("Write-back critical chưa tự động; matching ODF là proposal-only.")
);

// ── 7 ──────────────────────────────────────────────────
children.push(
  h1("7. Hướng dẫn sử dụng"),
  h2("7.1 Yêu cầu môi trường"),
  bullet("Windows (bắt buộc cho ClientPLC) + .NET 9 Desktop SDK"),
  bullet(".NET 9 SDK, Node.js 20+, Docker Desktop"),
  bullet("PostgreSQL (hoặc container demo)"),
  h2("7.2 Demo UI không backend"),
  ...codeBlock([
    "npm --prefix frontend ci",
    "npm --prefix frontend run demo",
    "# Mở http://127.0.0.1:3000",
  ]),
  p("Chỉ mock GET. Luồng: Dashboard → Lines → Machines → Alarms → Slideshow."),
  h2("7.3 Full stack demo"),
  ...codeBlock([
    "git submodule update --init --recursive",
    ".\\infrastructure\\demo\\Start-FullDemo.ps1",
    ".\\infrastructure\\demo\\Test-FullDemo.ps1",
  ]),
  p(
    "Mặc định localhost: UI 3001, backend 5166, Odysseus 7000, ODF web 58088, ODF API 54310. Thêm -WithClientPlc khi cần. Log: .runtime-logs/."
  ),
  h2("7.4 Chạy backend"),
  ...codeBlock([
    "$env:ConnectionStrings__DefaultConnection = '<postgres-url>'",
    "$env:Jwt__Key = '<secret->=32-bytes>'",
    "$env:Mqtt__EncryptionKey = '<mqtt-key>'",
    "dotnet run --project backend/backend.csproj",
    "# --database-preflight | --database-migrate | --timescale-backfill",
  ]),
  h2("7.5 Chạy frontend"),
  ...codeBlock([
    "$env:VITE_API_URL = 'http://localhost:5166/api'",
    "npm --prefix frontend install",
    "npm --prefix frontend run dev",
  ]),
  h2("7.6 Chạy ClientPLC"),
  ...codeBlock(["dotnet run --project ClientPLC/ClientPLC.App/ClientPLC.App.csproj"]),
  h2("7.7 ODF preview & Adapter"),
  ...codeBlock([
    ".\\infrastructure\\open-data-fusion\\Start-OpenDataFusionPreview.ps1",
    ".\\infrastructure\\open-data-fusion\\Test-OpenDataFusionPreview.ps1",
    "$env:OpenDataFusion__CaptureEnabled = 'true'",
    "$env:OpenDataFusion__DispatchEnabled = 'true'",
    "dotnet run --project fusion-adapter/Fusion.Adapter.csproj",
  ]),
  p("application-preview chỉ loopback/SQLite — không dùng production.", {
    italics: true,
    color: C.muted,
  }),
  h2("7.8 Troubleshooting ngắn"),
  bullet("Backend không start: preflight connection string, Mqtt__EncryptionKey, port 1883/8883."),
  bullet("Không thấy telemetry: device token, topic ownership, schema payload, offline queue."),
  bullet("ODF backlog: giữ Capture=true; Dispatch=false nếu identity chưa sẵn; không xóa outbox."),
  bullet("Alert không ra: rule enabled? DEFERRED? dedup/suppression window?")
);

// ── 8 ──────────────────────────────────────────────────
children.push(
  h1("8. API & kiểm thử"),
  h2("8.1 API map nhanh"),
  ...codeBlock([
    "GET  /api/health",
    "POST /api/auth/login",
    "GET  /api/dashboard/summary",
    "GET  /api/machines/{id}",
    "GET  /api/alarms  ·  POST .../acknowledge  ·  POST .../resolve",
    "GET  /api/telemetry/live  ·  /api/telemetry/query",
    "GET  /api/v1/assets/{id}/health",
    "POST /api/v1/predictions/anomaly",
    "GET  /api/v1/predictions/risk/{assetId}",
    "POST /api/v1/rca",
    "POST /api/sync/upload",
  ]),
  p("Swagger bật ở Development. Shape chính thức: controller + contracts/v1/."),
  h2("8.2 Bộ kiểm thử lõi"),
  ...codeBlock([
    "dotnet test backend.Tests/backend.Tests.csproj",
    "dotnet test fusion-adapter.Tests/Fusion.Adapter.Tests.csproj",
    "dotnet test ClientPLC/ClientPLC.Tests/ClientPLC.Tests.csproj",
    "npm --prefix frontend run test:run",
    "npm --prefix frontend run type-check",
    "npm --prefix frontend run build",
    "npm --prefix frontend run e2e",
  ]),
  h2("8.3 Evidence local (tham chiếu)"),
  bullet("Backend ~122 tests · Frontend unit + Playwright live 1/1 (W8)"),
  bullet("Alert p95 ~3.8 ms · Prediction p95 ~9.4 ms (lab)"),
  bullet("Timescale workload: >1M điểm, p95 ~292 ms (local benchmark)")
);

// ── 9 ──────────────────────────────────────────────────
children.push(
  h1("9. Kế hoạch tương lai"),
  h2("9.1 Ngay bây giờ"),
  num("Ổn định Operations UI (không ship WIP xóa page core chưa review)."),
  num("Freeze baseline staging candidate; CI xanh trên PR nhỏ."),
  num("Handoff managed staging: hostname HTTPS, ingress CIDR, secret paths, owner + reviewer."),
  h2("9.2 Managed staging (trước go-live)"),
  num("HTTPS ingress + cookie Secure/SameSite + trusted forwarded headers."),
  num("Secret manager: JWT, MQTT PFX, DB TLS, device tokens, connector keys."),
  num("Backup / restore / retention drill."),
  num("Dual-write: migration → full → rollback → migration."),
  num("Một ERP/MES thật + asset_mapping_rules."),
  num("16 managed checks + independent reviewer (≤ 30 ngày)."),
  num("Test-ManagedStagingGate.ps1 với URL non-loopback HTTPS."),
  num("Canary decision — chỉ sau gate pass."),
  h2("9.3 Phase 3 (sau staging)"),
  bullet("LLM RCA / causal graph persistence."),
  bullet("EDA dài hạn + trained ML (Isolation Forest / Autoencoder)."),
  bullet("Mở rộng connector; SignalR realtime rộng hơn."),
  bullet("Storybook; OWASP ZAP + manual pentest."),
  bullet("ClientPLC: DI, structured logging, circuit breaker, integration tests."),
  spacer(120),
  ...callout(
    "Ranh giới claim",
    "Roadmap không thay đổi trạng thái phát hành. Hệ thống vẫn staging candidate / NO-GO cho đến khi managed gate pass với evidence bền vững."
  )
);

// ── 10 ─────────────────────────────────────────────────
children.push(
  h1("10. Thuật ngữ & tham chiếu"),
  h2("10.1 Từ điển"),
  table(
    ["Thuật ngữ", "Ý nghĩa"],
    [
      ["PLC", "Programmable Logic Controller"],
      ["MQTT", "Giao thức message telemetry ClientPLC ↔ backend"],
      ["Operations DB", "PostgreSQL authoritative vận hành"],
      ["TimescaleDB", "Time-series mirror / rollup"],
      ["CEP", "Complex Event Processing"],
      ["RCA", "Root Cause Analysis (context có kiểm soát)"],
      ["Outbox", "Intent giao phụ sau transaction nguồn"],
      ["ODF", "Open Data Fusion"],
      ["RLS", "Row-Level Security (tenant/project)"],
      ["DLQ / dead state", "Bản ghi không giao được sau retry"],
      ["Go / No-Go", "Quyết định phát hành theo managed evidence"],
    ],
    [2600, CONTENT_W - 2600]
  ),
  spacer(160),
  h2("10.2 Tài liệu nguồn"),
  bullet("PROJECT_PLAN.md — source of truth plan/progress"),
  bullet("docs/PROJECT-GUIDE.vi.md — hướng dẫn Markdown đầy đủ"),
  bullet("docs/security-secrets.md — secrets & MQTT TLS"),
  bullet("docs/release-evidence/ — Go/No-Go & W8 evidence"),
  bullet("infrastructure/staging/ — managed gate scripts"),
  bullet("infrastructure/open-data-fusion/README.md — ODF preview"),
  bullet("ClientPLC/PLAN.md — hardening edge client"),
  spacer(240),
  p(
    "Khi tài liệu mâu thuẫn với code hoặc evidence mới: ưu tiên runtime contract và release evidence hiện hành, rồi cập nhật tài liệu.",
    { italics: true, color: C.muted }
  ),
  spacer(400),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 400 },
    children: [r("— Kết thúc tài liệu —", { size: 18, color: C.muted, italics: true })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 80 },
    children: [
      r("FII AI / MKZ Factory Monitor · Staging candidate · 2026", {
        size: 16,
        color: C.muted,
      }),
    ],
  })
);

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: "Arial", size: 20, color: C.dark },
      },
    },
    paragraphStyles: [
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: C.primary },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 },
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: C.accent },
        paragraph: { spacing: { before: 280, after: 140 }, outlineLevel: 1 },
      },
      {
        id: "Heading3",
        name: "Heading 3",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 22, bold: true, font: "Arial", color: C.primary },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "•",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
      {
        reference: "numbers",
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: "%1.",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: PAGE_W, height: PAGE_H },
          margin: {
            top: MARGIN,
            right: MARGIN,
            bottom: MARGIN,
            left: MARGIN,
          },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              border: {
                bottom: { style: BorderStyle.SINGLE, size: 6, color: C.accent, space: 4 },
              },
              spacing: { after: 120 },
              children: [
                r("FII AI / MKZ Factory Monitor", {
                  size: 16,
                  bold: true,
                  color: C.primary,
                }),
                r("  ·  ", { size: 16, color: C.muted }),
                r("Hướng dẫn dự án", { size: 16, color: C.muted }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              border: {
                top: { style: BorderStyle.SINGLE, size: 4, color: C.border, space: 6 },
              },
              spacing: { before: 80 },
              tabStops: [
                {
                  type: "right",
                  position: CONTENT_W,
                },
              ],
              children: [
                r("NO-GO production · Staging candidate", {
                  size: 14,
                  color: C.muted,
                }),
                r("\t", { size: 14 }),
                r("Trang ", { size: 14, color: C.muted }),
                new TextRun({
                  children: [PageNumber.CURRENT],
                  font: "Arial",
                  size: 14,
                  color: C.muted,
                }),
                r(" / ", { size: 14, color: C.muted }),
                new TextRun({
                  children: [PageNumber.TOTAL_PAGES],
                  font: "Arial",
                  size: 14,
                  color: C.muted,
                }),
              ],
            }),
          ],
        }),
      },
      children,
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, buffer);
console.log("Wrote", outPath, `(${buffer.length} bytes)`);
