# Thiết kế Asset Catalog và Shared Contracts

**Ngày:** 2026-07-21
**Trạng thái:** Đã được chấp thuận để triển khai
**Phạm vi:** Chốt định danh asset dùng chung, thêm catalog asset tương thích với Operations hiện có, seed idempotent, và API CRUD/search tối thiểu.

## Mục tiêu

Mở khóa Asset Browser, telemetry và cảnh báo bằng một định danh `asset_id` UUID ổn định, nhưng không thay thế hoặc làm gián đoạn `machines`, `production_lines`, MQTT, dashboard, hay demo full-stack đang chạy.

## Bối cảnh hiện tại

- `machines` và `production_lines` đã là dữ liệu vận hành thật; `line_machines` cho phép một máy thuộc nhiều line.
- `TelemetryFusionEvent` đã mang `MachineSnapshot.Id` và `LineSnapshot.Id` là UUID.
- Backend dùng Npgsql và DDL idempotent trong `DatabaseService`; không có ORM hay migration framework.

## Các phương án đã cân nhắc

1. **Catalog tương thích (được chọn):** thêm `assets` và đồng bộ UUID với line/machine hiện có. Không phá API và demo.
2. Đổi toàn bộ `machines`/`production_lines` sang `assets`: mô hình sạch hơn, nhưng phá telemetry/API/UI hiện có và không phù hợp cho lát cắt đầu tiên.
3. Không có catalog, chỉ gọi `machines.id` là `asset_id`: nhỏ nhất nhưng không biểu diễn được plant, sensor và quan hệ nhiều-nhiều.

## Quyết định

`assets` là catalog dùng chung, không phải nguồn vận hành thay thế trong pha này.

- `assets.id == machines.id` cho asset loại `MACHINE`.
- `assets.id == production_lines.id` cho asset loại `LINE`.
- `TelemetryFusionEvent.Machine.Id` là `asset_id` chuẩn cho mọi telemetry của machine; không thêm trường `AssetId` trùng lặp.
- Telemetry logic vẫn là `(time, asset_id, metric, value)`, nhưng không tạo bảng telemetry thứ hai trong pha này; `machine_telemetry*` tiếp tục là store vận hành.
- Event generic cho CEP chưa được thêm. Contract telemetry đã versioned hiện tại là đủ cho lát cắt Asset.

## Schema

```sql
CREATE TABLE IF NOT EXISTS assets (
    id UUID PRIMARY KEY,
    type VARCHAR(32) NOT NULL CHECK (type IN ('PLANT', 'AREA', 'LINE', 'MACHINE', 'SENSOR')),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(255) NOT NULL UNIQUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS asset_relationships (
    parent_asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    child_asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    relationship_type VARCHAR(32) NOT NULL DEFAULT 'CONTAINS',
    PRIMARY KEY (parent_asset_id, child_asset_id, relationship_type),
    CHECK (parent_asset_id <> child_asset_id)
);
```

Quan hệ thay cho `parent_id`: một machine có thể thuộc nhiều line như dữ liệu hiện tại, không tạo hai nguồn hierarchy. V1 chỉ tạo quan hệ cha khi tạo asset mới và không cho đổi cha ở `PUT`; trigger legacy chỉ tạo `LINE --CONTAINS--> MACHINE`. Vì vậy API v1 không thể tạo cycle mà không cần thêm thuật toán graph.

Không có `asset_documents`, health score, document byte sync, hoặc bảng telemetry mới trong phạm vi này.

## Đồng bộ và seed

DDL và trigger PostgreSQL là điểm đồng bộ duy nhất, thay vì thêm logic vào mọi controller và MQTT path:

1. Seed idempotent một asset `PLANT` mã `MKZ-PLANT`.
2. Backfill tất cả `production_lines` thành `LINE` có cùng UUID và mã `line:<uuid>`, rồi tạo `MKZ-PLANT --CONTAINS--> LINE`.
3. Backfill tất cả `machines` thành `MACHINE` có cùng UUID và mã `machine:<uuid>`.
4. Backfill `line_machines` thành `LINE --CONTAINS--> MACHINE`.
5. Trigger trên `machines`, `production_lines`, và `line_machines` giữ catalog đồng bộ khi dữ liệu vận hành thay đổi.

Asset do API tạo cho `PLANT`, `AREA`, hoặc `SENSOR` thuộc catalog. `LINE` và `MACHINE` tiếp tục được tạo/sửa/xóa qua endpoint hiện có để giữ một nguồn dữ liệu vận hành.

## API v1

| Endpoint | Hành vi |
| --- | --- |
| `GET /api/assets?q=&type=&parentId=` | Danh sách catalog phẳng, search `name`, `code`, metadata text và lọc theo quan hệ cha. Không phân trang ở v1 vì seed demo nhỏ. |
| `GET /api/assets/{id}` | Một asset và các quan hệ trực tiếp. |
| `POST /api/assets` | Tạo `PLANT`, `AREA`, hoặc `SENSOR`; nhận `name`, `type`, `code`, `metadata`, `parentId` tùy chọn. |
| `PUT /api/assets/{id}` | Sửa `name`, `code`, và `metadata` của asset do catalog sở hữu; không đổi quan hệ cha ở v1. |
| `DELETE /api/assets/{id}` | Xóa asset do catalog sở hữu không có child; từ chối root plant, `LINE`, và `MACHINE`. |

Đọc được ẩn danh như API machine hiện tại. Ghi yêu cầu role `ADMIN` hoặc `ENGINEER`. Mã, khóa ngoại, hoặc asset type không hợp lệ trả `400`; mã trùng hoặc xóa asset còn child trả `409`; ID không tồn tại trả `404`.

## Kiểm thử và điều kiện nghiệm thu

TDD theo từng lát cắt:

1. Test contract đỏ xác nhận `MachineSnapshot.Id` là asset UUID chuẩn và không cần trường `AssetId` mới.
2. Test integration chống trùng `code`, quan hệ không tự tham chiếu, đồng bộ line/machine dùng cùng UUID.
3. Test API đỏ cho create/search/update/delete asset catalog và các lỗi `400/404/409`.
4. Mở rộng `Test-FullDemo.ps1` để assert machine smoke đã có asset catalog cùng UUID; smoke demo hiện hữu vẫn PASS.

Chấp nhận khi catalog hiển thị plant, line và machine hiện hữu; search theo name/code/metadata hoạt động; CRUD chỉ làm thay đổi asset do catalog sở hữu; và `Test-FullDemo.ps1` vẫn PASS không cần thay đổi flow MQTT/SSO/ODF.

## Rollback

Thay đổi là additive. Khi cần rollback, dừng tạo API Asset và bỏ trigger/catalog mới; các bảng và API vận hành hiện có không bị đổi cấu trúc hoặc đổi ID.
