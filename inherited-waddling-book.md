# Plan: Factory AI Platform — Biến Mock thành Hệ Thống Chạy Thật

## Context

`factory-ai-platform/` là một AI gateway (OpenAI-compatible) với kiến trúc đúng hướng (Atlas AI pattern: Gateway → Intent Router → Specialized Agents), nhưng **toàn bộ logic hiện tại là mock/hardcoded**. Mục tiêu là biến nó thành hệ thống thật: đọc dữ liệu thật từ backend .NET, gọi LLM để phân tích, tạo báo cáo file thật, lưu và tra cứu tài liệu kỹ thuật.

Đồng thời dọn sạch 2 đường kết nối song song nguy hiểm đang tồn tại trong `Odysseus/` (psycopg2 trực tiếp vào Postgres, không qua auth).

---

## Phase 1 — Data Tools: Nối vào .NET Backend REST API

**Vấn đề:** `data_tools.py` đọc từ dict Python hardcode. Postgres thật ở backend .NET đã có đầy đủ endpoints, phần lớn là `AllowAnonymous`:
- `GET /api/dashboard/summary` — tổng quan máy, sản lượng, alarm
- `GET /api/reports/query?timeRange=today&lineId=all&groupBy=hour` — sản lượng chi tiết theo giờ/ngày
- `GET /api/telemetry/live` — snapshot realtime tất cả PLC client
- `GET /api/telemetry/log?count=50` — log cuộn 50 message gần nhất
- `GET /api/production-lines` — danh sách dây chuyền
- `GET /api/alarms?status=ACTIVE` — cần JWT (role bất kỳ)

**Việc cần làm:**

### 1a. Thêm env vars vào docker-compose và gateway
File: `factory-ai-platform/infrastructure/docker-compose.yml`, service `factory-ai-gateway`:
```yaml
environment:
  - BACKEND_URL=http://host.docker.internal:5000  # địa chỉ .NET backend
  - LLM_API_URL=http://host.docker.internal:7000/v1  # Odysseus hoặc LLM khác
  - LLM_API_KEY=your-api-key
  - LLM_MODEL=gpt-4o-mini
```
File `factory-ai-platform/infrastructure/env.example`: thêm 3 biến trên.

### 1b. Viết `app/services/backend_client.py`
File mới: `factory-ai-platform/gateway/app/services/backend_client.py`
- Class `BackendClient` với `httpx.AsyncClient`
- Methods: `get_dashboard_summary()`, `get_production_report(timeRange, lineId, groupBy)`, `get_active_alarms()`, `get_telemetry_live()`, `get_production_lines()`
- Alarms endpoint cần Bearer token — tạo service account (xem Phase 5b)

### 1c. Refactor `data_tools.py` hoàn toàn
File: `factory-ai-platform/gateway/app/tools/data_tools.py`
- Xóa `MOCK_PRODUCTION_DATA` và `MOCK_ALARMS`
- `execute_tool()` trở thành async, gọi `BackendClient`
- Map tool names → backend calls:
  - `get_production_history` → `GET /api/reports/query?timeRange={interval}&lineId={lineGuid}`  
    Bài toán: `lineCode` trong gateway là string (ví dụ "LS18"), nhưng backend dùng UUID. Cần thêm tool `resolve_line_id` hoặc lấy danh sách từ `GET /api/production-lines` rồi cache.
  - `get_active_alarms` → `GET /api/alarms?status=ACTIVE`
  - `find_bottleneck_machine` → `GET /api/telemetry/live` rồi tính max cycle_time trong Python (vì backend không có endpoint bottleneck analysis sẵn)

### 1d. Refactor `data_agent.py`
File: `factory-ai-platform/gateway/app/agents/data_agent.py`
- Xóa hardcode `"LS18"` — extract line code từ message dùng regex hoặc để LLM xác định (Phase 2)
- `execute()` trở thành async

---

## Phase 2 — LLM Client: Thêm Não Cho Các Agent

**Vấn đề:** Agent hiện tại chỉ format string cứng, không phân tích thật. Cần LLM để đọc data và sinh text analysis.

### 2a. Tạo `app/services/llm_client.py`
File mới: `factory-ai-platform/gateway/app/services/llm_client.py`
- `async def chat_complete(system_prompt, user_message, context_data)` → string
- Gọi OpenAI-compatible endpoint (Odysseus, hoặc trực tiếp Anthropic/OpenAI)
- Timeout 60s, retry 1 lần

### 2b. Cập nhật từng agent để dùng LLM
Pattern cho mỗi agent `execute()`:
```python
async def execute(self, message, conversation_id):
    data = await fetch_relevant_data(message)       # gọi backend tools
    return await llm_client.chat_complete(
        system=AGENT_SYSTEM_PROMPT,
        user=message,
        context=json.dumps(data, ensure_ascii=False)
    )
```
Files cần sửa:
- `factory-ai-platform/gateway/app/agents/data_agent.py`
- `factory-ai-platform/gateway/app/agents/report_agent.py`
- `factory-ai-platform/gateway/app/agents/document_agent.py`

### 2c. System prompts cho từng agent
Mỗi agent có system prompt riêng (viết trong file agent hoặc tách ra `app/prompts/`):
- **DataAgent**: "Bạn là chuyên gia phân tích OEE, đọc dữ liệu từ JSON context và trả lời bằng tiếng Việt..."
- **ReportAgent**: "Bạn viết báo cáo ca sản xuất dạng markdown có đầu mục..."
- **DocumentAgent**: "Bạn tra cứu tài liệu bảo trì và hướng dẫn xử lý lỗi máy..."

---

## Phase 3 — Report Service: Xuất File Thật

**Vấn đề:** `report-service/app/main.py` chỉ trả tên file giả. Cần tạo DOCX/XLSX thật và lưu vào MinIO.

### 3a. Cài thêm dependencies
File: `factory-ai-platform/report-service/requirements.txt`
Thêm: `python-docx==1.1.2`, `openpyxl==3.1.5`, `minio==7.2.9`

### 3b. Tạo `app/generators/docx_generator.py` và `xlsx_generator.py`
- DOCX: dùng `python-docx` — table KPI, biểu đồ ASCII/placeholder, danh sách alarm
- XLSX: dùng `openpyxl` — sheet "Summary", sheet "Hourly Production", sheet "Alarms"

### 3c. Tạo `app/storage/minio_client.py`
- Upload file vào bucket `factory-reports`
- Trả về presigned URL 24h

### 3d. Sửa endpoint `/report/export`
File: `factory-ai-platform/report-service/app/main.py`
- Thật sự generate file từ `request` body
- Upload lên MinIO
- Trả `downloadUrl` là presigned URL thật

### 3e. Sửa `report_agent.py`
File: `factory-ai-platform/gateway/app/agents/report_agent.py`
- Bước 1: Gọi DataAgent logic để lấy dữ liệu sản lượng thật
- Bước 2: Gọi LLM để viết tóm tắt/recommendations
- Bước 3: POST tới `report-service/report/export` với structured data
- Bước 4: Trả về link download

---

## Phase 4 — Document Service: RAG Thật Với pgvector

**Vấn đề:** `document-service/app/main.py` là stub hoàn toàn. pgvector đã có sẵn trong Postgres.

### 4a. Cài thêm dependencies
File: `factory-ai-platform/document-service/requirements.txt`
Thêm: `pypdf==4.3.1`, `sentence-transformers==3.3.1` (hoặc dùng API), `psycopg2-binary==2.9.9`, `minio==7.2.9`

### 4b. Tạo bảng `document_chunks` trong Postgres
Migration (chạy khi service start):
```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS document_chunks (
    id SERIAL PRIMARY KEY,
    document_id TEXT,
    filename TEXT,
    machine_code TEXT,
    line_code TEXT,
    document_type TEXT,
    chunk_index INT,
    content TEXT,
    embedding VECTOR(384),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_doc_chunks_embedding ON document_chunks USING ivfflat (embedding vector_cosine_ops);
```
(dùng 384 dims cho `all-MiniLM-L6-v2` — model nhỏ, offline)

### 4c. Implement `/document/upload`
- Parse PDF với `pypdf`
- Chunk 500 chars, 100 overlap
- Embed từng chunk với sentence-transformers
- Insert vào pgvector

### 4d. Implement `/document/search`
- Embed query string
- `SELECT ... ORDER BY embedding <=> $1 LIMIT 5`
- Trả list chunks với score

### 4e. Sửa `document_agent.py`
File: `factory-ai-platform/gateway/app/agents/document_agent.py`
- Gọi `document-service/document/search?query={message}`
- Pass kết quả cho LLM để synthesize câu trả lời

---

## Phase 5 — Security & Bridge Consolidation

### 5a. Xóa direct DB bridges trong Odysseus
Hai file vi phạm security boundary:
- `Odysseus/routes/mkz_routes.py` — thay psycopg2 bằng httpx gọi tới `factory-ai-gateway/v1/chat/completions`
- `Odysseus/mcp_servers/plc_mcp_server.py` — thay psycopg2 bằng httpx gọi tới backend REST API qua gateway

**Lý do:** Hiện tại là unauthenticated direct SQL — bypass toàn bộ RBAC. Sau khi sửa, mọi data request đều đi qua gateway, được log đầy đủ.

### 5b. Tạo AI service account trong .NET backend
File: `backend/Services/DatabaseService.cs` (hàm `SeedUsersAsync`)
- Thêm user `ai_service` với role `GUEST` và bcrypt password ngẫu nhiên
- Gateway lấy token bằng `POST /api/auth/login` với credentials từ env vars `AI_SERVICE_USER` / `AI_SERVICE_PASSWORD`
- Cache token trong memory, refresh khi hết hạn (token expire 2h theo `AuthController.cs`)

### 5c. Đổi JWT secret trong production
- `backend/appsettings.json`: thêm `"Jwt": { "Key": "..." }` — bắt buộc, không để fallback `SUPER_SECRET_KEY_FOR_DEVELOPMENT`
- `factory-ai-platform/infrastructure/env.example`: thêm chú thích bắt buộc đổi `JWT_SECRET`

---

## Phase 6 — Odysseus Integration (Final Wiring)

Sau khi gateway chạy thật (Phase 1-4), cấu hình Odysseus:
- **Settings → Custom Endpoint**: Base URL = `http://localhost:8080/v1`
- **API Key**: JWT token từ gateway (tạo bằng `GET /v1/models` không cần auth, nhưng chat cần token)
- **Model**: `factory-auto`

Hoặc dùng MCP server (`plc_mcp_server.py` sau khi đã sửa ở Phase 5a) để Odysseus truy cập data như một tool.

---

## Thứ Tự Thực Hiện (Dependency Order)

```
Phase 1 (Data real)
    ↓
Phase 2 (LLM client)
    ↓
Phase 3 (Report file)  ←→  Phase 4 (Document RAG)  [song song]
    ↓
Phase 5 (Security cleanup)
    ↓
Phase 6 (Odysseus wiring)
```

Phase 1 + 2 là bắt buộc trước. Phase 3 và 4 độc lập nhau, có thể làm song song. Phase 5 và 6 làm sau cùng.

---

## Files Cần Tạo Mới

| File | Mục đích |
|---|---|
| `gateway/app/services/backend_client.py` | HTTP client gọi .NET backend |
| `gateway/app/services/llm_client.py` | OpenAI-compatible LLM caller |
| `report-service/app/generators/docx_generator.py` | Tạo file DOCX |
| `report-service/app/generators/xlsx_generator.py` | Tạo file XLSX |
| `report-service/app/storage/minio_client.py` | Upload/presigned URL |
| `document-service/app/db/pgvector_client.py` | pgvector embed + search |

## Files Cần Sửa

| File | Thay đổi |
|---|---|
| `gateway/app/tools/data_tools.py` | Xóa mock → gọi backend_client |
| `gateway/app/agents/data_agent.py` | Dùng LLM, không hardcode LS18 |
| `gateway/app/agents/report_agent.py` | Gọi data + report-service thật |
| `gateway/app/agents/document_agent.py` | Gọi document-service search thật |
| `gateway/app/agents/engineering_agent.py` | Giữ nguyên (đã dùng bridge client) |
| `report-service/app/main.py` | Implement thật thay stub |
| `document-service/app/main.py` | Implement thật thay stub |
| `infrastructure/docker-compose.yml` | Thêm BACKEND_URL, LLM_API_URL, AI_SERVICE_* |
| `Odysseus/routes/mkz_routes.py` | Thay psycopg2 → httpx → gateway |
| `Odysseus/mcp_servers/plc_mcp_server.py` | Thay psycopg2 → httpx → backend API |

---

## Verification

1. `cd factory-ai-platform/infrastructure && docker compose up -d --build`
2. `cd factory-ai-platform/gateway && pytest tests/` — tất cả 4 test hiện tại phải pass
3. Gọi thử: `POST http://localhost:8080/v1/chat/completions` với message "Cho tôi biết sản lượng hôm nay" → response phải chứa số thật từ Postgres, không phải 595 hardcode
4. Upload 1 file PDF maintenance manual lên `POST http://localhost:8082/document/upload`, sau đó search
5. Gọi "Viết báo cáo ca sáng" → phải trả về presigned URL MinIO tải được
6. Cấu hình Odysseus → model `factory-auto` → chat thử "Dây chuyền nào có alarm?" → Odysseus phải trả lời bằng dữ liệu thật
