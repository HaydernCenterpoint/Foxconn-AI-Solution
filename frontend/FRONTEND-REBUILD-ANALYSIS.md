# Phân tích chức năng & rebuild frontend

> Cập nhật: 2026-07-14
>
> Phạm vi triển khai: `frontend/` — ứng dụng React đang kết nối trực tiếp tới ASP.NET Core backend.

## 1. Quyết định phạm vi

Repository có hai frontend:

| Ứng dụng | Trạng thái | Quyết định |
| --- | --- | --- |
| `frontend/` | Ứng dụng sản phẩm chính: JWT, RBAC, API thật, dashboard, vận hành, quản trị | Được rebuild trong đợt này |
| `factory-ai-platform/frontend/` | Prototype riêng dùng mock data, chưa được Docker Compose deploy và chưa kết nối API thật | Không thay đổi để tránh nhầm sản phẩm đang vận hành |

Rebuild giữ nguyên React/Vite, React Query, Zustand, React Router, backend REST và mô hình quyền hiện có. Không thay dữ liệu thật bằng mock hoặc KPI tự sinh.

## 2. Bản đồ chức năng

### Chế độ xem công khai

| Route | Chức năng |
| --- | --- |
| `/` | Dashboard tổng quan: trạng thái line/máy, sản lượng do backend trả về, alarms, drill-down telemetry |
| `/lines` | Tổng quan line ở chế độ chỉ xem |
| `/machines`, `/machines/:id` | Danh sách máy và chi tiết PLC, lịch sử sản lượng giờ, alarm theo máy |
| `/alarms` | Theo dõi và lọc cảnh báo chỉ đọc |
| `/production-analysis` | Phân tích dữ liệu report do backend trả về |
| `/slideshow` | Trình chiếu theo line, chỉ hiển thị dữ liệu API có sẵn |
| `/settings` | Ngôn ngữ, dark/light theme, reduced motion |
| `/system` | Health của backend, snapshot telemetry và raw telemetry log |

### Vận hành và quản trị

| Route | Quyền và chức năng |
| --- | --- |
| `/admin` | Dashboard theo role |
| `/admin/lines` | CRUD line, thành viên line, sơ đồ luồng, sắp thứ tự máy |
| `/admin/machines`, `/admin/machines/:id` | CRUD máy, approve/reject/revoke, phân line, chi tiết PLC/alarm |
| `/admin/alarms` | Acknowledge/resolve alarm với ghi chú |
| `/admin/reports` | Bộ lọc report và export CSV từ các `tableLogs` backend đã tải |
| `/admin/simulation` | Bật/tắt/reset cấu hình simulation hiện có |
| `/admin/system` | System Monitor |
| `/admin/settings` | Preferences, thông tin system, preview user/audit |
| `/admin/users` | Tạo/xóa user và role |
| `/admin/audit-logs` | Xem audit log |

## 3. API được giữ và hiển thị

- Auth: `/api/auth/login`
- Dashboard: `/api/dashboard/summary`
- Lines và membership: `/api/production-lines/*`
- Machines và hourly production: `/api/machines/*`
- Alarms: `/api/alarms/*`
- Reports: `/api/reports/query`
- Simulation: `/api/simulation/*`
- User/audit: `/api/users`, `/api/audit-logs`
- System monitor mới: `/api/health`, `/api/telemetry/live`, `/api/telemetry/log`

Mutation không còn tự retry. Mock fallback chỉ có thể bật tường minh trong development qua `VITE_ENABLE_API_MOCKS=true`, chỉ cho request đọc; mutation không thể báo thành công giả khi backend lỗi.

## 4. Những thay đổi rebuild đã hoàn tất

### Một design system thống nhất

- Enterprise Dark bình tĩnh, token-driven, phân biệt rõ status `running`, `warning`, `error`, `offline`.
- Bỏ nền canvas/rAF, neon/corner bracket và ticker hệ thống giả trên application shell.
- Thêm `Button`, `IconButton`, `Surface`, `PageHeader`, `DataState`, `LanguageControl`, `LocalizedDateTime`.
- Hoàn thiện modal focus management, dropdown bàn phím, status badge và toast live region.
- Dark/light theme là hai giá trị hợp lệ duy nhất; không còn các palette giả không được CSS hỗ trợ.

### Responsive và accessibility

- Sidebar trở thành drawer trên viewport dưới `1280px`, có overlay, Escape, focus trap và tự đóng khi điều hướng.
- Header, bảng, dashboard, form và action layout được tối ưu cho các breakpoint 375/768/1280.
- Các trang dữ liệu có ba trạng thái tách biệt: loading, error + retry, empty.

### Workflow vận hành

- Dashboard, line editor, danh sách/chi tiết máy, alarms, reports, simulation, admin/user/audit và viewer được thay UI đồng bộ.
- Xóa các metric vận hành được tự sinh trên dashboard/machine detail/slideshow; trạng thái thiếu dữ liệu được hiển thị rõ.
- Report export tạo CSV từ rows thực tế đã tải.
- Các thao tác xóa/reject/revoke/reset dùng `ConfirmDialog`, có pending/success/error feedback.
- Line diagram vẫn tương thích dữ liệu kết nối cũ được serialize trong `production_lines.description`; không gọi endpoint layout chưa tồn tại ở backend.

### Localization

- Hoàn thiện bản dịch vi/en/zh-CN cho các màn rebuild.
- `i18n:check` xác minh 1.771 key locale và 755 key dùng trong source.

## 5. Rủi ro/khoảng trống cần xử lý ở backend hoặc phase kế tiếp

1. **SignalR chưa được frontend dùng.** Backend đã có `/hubs/telemetry`; hiện tại frontend vẫn poll để tránh đưa transport mới vào đợt UI rebuild. Nên bổ sung cache updates, reconnect state và visibility-aware polling fallback.
2. **Raw telemetry store có thể trống.** System Monitor hiển thị empty state chính xác nếu `TelemetryStore` chưa được pipeline ingestion ghi dữ liệu. Cần xác nhận `TelemetryStore.Save(...)` được gọi trong luồng ingest trước khi coi endpoint là nguồn telemetry chuẩn.
3. **Diagram layout chưa có API backend.** Node position không có nơi lưu riêng; hiện chỉ lưu map kết nối trong `description` theo behavior cũ. Cần endpoint/versioned layout nếu muốn persist vị trí node.
4. **Quyền engineer cần đối chiếu backend.** Một số interaction line có thể gặp `403` nếu backend chỉ cho ADMIN cập nhật line. Server phải là nguồn quyền cuối cùng.
5. **Report table filter cần kiểm tra backend.** Backend hiện có thể không áp line/machine filter cho toàn bộ `tableLogs`, dù KPI/chart đã lọc.
6. **Simulation service chưa chạy nền.** Cấu hình có thể lưu được nhưng telemetry mô phỏng không xuất hiện nếu hosted simulation service vẫn bị tắt ở backend.

## 6. Validation

Đã chạy trong `frontend/`:

```sh
npm run lint
npm run type-check
npm run i18n:check
npm run test:run
npm run build
git diff --check -- frontend
```

Tất cả đều pass tại thời điểm bàn giao.
