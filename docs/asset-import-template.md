# Asset Import Template

## Hướng dẫn

File này mô tả format CSV/JSON để import asset hàng loạt qua API `POST /api/assets/import`.

### CSV Format

```csv
type,name,code,parentCode,metadata
plant,MKZ Factory,MKZ-PLANT,,{}
area,SMT Workshop,area:smt,MKZ-PLANT,"{""floor"":""1F"",""building"":""B1""}"
area,Assembly Workshop,area:assembly,MKZ-PLANT,"{""floor"":""1F"",""building"":""B2""}"
line,Dây chuyền L1,line:L1,area:smt,"{""description"":""Lắp ráp điện tử""}"
machine,Trạm cấp liệu 1,machine:MC-01,line:L1,"{""machineCode"":""MC-01""}"
sensor,Temperature Sensor,sensor:temp:MC-01,machine:MC-01,"{""unit"":""°C"",""range_min"":0,""range_max"":120}"
```

### JSON Format (API payload)

```json
[
  {
    "type": "area",
    "name": "SMT Workshop",
    "code": "area:smt",
    "parentCode": "MKZ-PLANT",
    "metadata": { "floor": "1F", "building": "B1" }
  },
  {
    "type": "sensor",
    "name": "Temperature Sensor",
    "code": "sensor:temp:MC-01",
    "parentCode": "machine:MC-01",
    "metadata": { "unit": "°C", "range_min": 0, "range_max": 120 }
  }
]
```

### Quy tắc

| Cột | Bắt buộc | Mô tả |
|---|---|---|
| `type` | ✅ | Một trong: `plant`, `area`, `line`, `machine`, `sensor` |
| `name` | ✅ | Tên hiển thị của asset |
| `code` | ✅ | Mã duy nhất, dùng làm tham chiếu (ví dụ: `area:smt`) |
| `parentCode` | ❌ | Mã code của asset cha. Để trống cho root (plant) |
| `metadata` | ❌ | JSON object chứa thông tin mở rộng |

### Thứ tự import

Import **từ trên xuống theo hierarchy**: Plant → Area → Line → Machine → Sensor.
Asset cha phải tồn tại trước khi import asset con (hoặc nằm ở dòng trước trong cùng file).

### API Response

```json
{
  "created": 5,
  "skipped": 1,
  "errors": ["Parent không tìm thấy: invalid-code (code: sensor:orphan)"]
}
```
