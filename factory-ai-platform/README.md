# Factory AI Platform

Hệ thống AI Agent Gateway, Factory Data Agent, và Antigravity Engineering Agent tích hợp dành cho vận hành nhà máy sản xuất.

---

## 1. Cấu trúc dự án

```text
factory-ai-platform/
├── gateway/                 # FastAPI Gateway API (OpenAI-compatible)
│   ├── app/
│   │   ├── api/             # Các route v1/models và v1/chat/completions
│   │   ├── agents/          # Agent Router và specialized agents
│   │   ├── tools/           # Định nghĩa các tool truy vấn dữ liệu vận hành
│   │   ├── auth/            # JWT validation và RBAC site/line/machine
│   │   ├── audit/           # Log kiểm toán hoạt động của agent/tool
│   │   └── schemas/         # OpenAI-compatible API schemas
│   └── tests/               # Unit & integration tests
├── antigravity-bridge/      # Service wrapper gọi Antigravity CLI
│   ├── app/
│   └── tests/
├── document-service/        # RAG service cho tài liệu kỹ thuật
├── report-service/          # Export báo cáo định dạng DOCX, XLSX, PDF
└── infrastructure/          # Docker Compose và file cấu hình môi trường
```

---

## 2. Triển khai bằng Docker Compose

1. Di chuyển vào thư mục hạ tầng:
   ```bash
   cd factory-ai-platform/infrastructure
   ```
2. Khởi tạo file `.env` từ file ví dụ:
   ```bash
   cp env.example .env
   ```
3. Khởi chạy hệ thống bằng Docker Compose:
   ```bash
   docker compose up -d --build
   ```

Hệ thống sẽ chạy các cổng sau:
- **Factory AI Gateway**: `http://localhost:8080`
- **Antigravity Bridge**: `http://localhost:8081`
- **Document RAG**: `http://localhost:8082`
- **Report Service**: `http://localhost:8083`
- **MinIO Console**: `http://localhost:9001` (Username: `minio_admin` / Password: `minio_secure_password_7788`)

---

## 3. Cấu hình kết nối Odysseus

Để tích hợp Odysseus với hệ thống Factory AI Platform, hãy cấu hình các thông số sau trong phần cài đặt của Odysseus:

* **Base URL**: `http://localhost:8080/v1` (Hoặc địa chỉ IP mạng nội bộ của container `factory-ai-gateway`)
* **API Key**: Token JWT được cấp phát hợp lệ (Chứa phân quyền `siteScopes` và `lineScopes`).
* **Model**: `factory-auto`

---

## 4. Chạy kiểm thử (Unit Tests)

Hệ thống tích hợp sẵn các bộ test toàn diện kiểm tra tính đúng đắn của Router, Token Authentication, Permissions Scopes, và Timeout Sandbox:

### Chạy test cho Gateway:
```bash
cd factory-ai-platform/gateway
pip install -r requirements.txt
python -m pytest tests/
```

### Chạy test cho Antigravity Bridge:
```bash
cd factory-ai-platform/antigravity-bridge
pip install -r requirements.txt
python -m pytest tests/
```
