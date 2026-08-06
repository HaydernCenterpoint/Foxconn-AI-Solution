# RFC 02 — ODF 50% CDF (half Cognite Data Fusion)

**Trạng thái:** Live — không cần migration mới. **Đã 55-60% CDF.**
**Scope ponytail:** dùng đồ có sẵn, không thêm service/DB mới.

## Hiện trạng (không cần đoán — check DB live 2026-08-06)

| CDF pillar | ODF hiện tại | Evidence |
|---|---|---|
| Asset hierarchy | ✅ `assets(plant/area/line/machine/sensor)` + `code` unique | `assets` 3 rows: MKZ-PLANT → Demo Line → Demo Integration Machine, `assets_type_check`, `assets_code_key` |
| Relationships | ✅ `asset_relationships(parent_asset_id, child_asset_id, relationship_type=CONTAINS)` | 2 rows, `asset_id/related_asset_id` cho edge tùy ý |
| Time series contextualized | ✅ `telemetry_data(asset_id, metric, time, value)` + BRIN + unique `(time,asset_id,metric)` | 15 rows, `event_log(asset_id)` 1 row |
| Search | ⚠️ `GET /api/assets?q=` (ILIKE name/code/metadata) — chưa Chroma | `AssetController.List` limit 500, chưa index vector |
| Transform lineage | ✅ `telemetry_receipts` + `telemetry_secondary_deliveries` + `fusion_outbox` + `machine_hourly_production` | ingest → receipt → delivery → rollup đã có |

→ **Kết luận:** bảo "làm 50% CDF" thì repo này **đã qua mốc**, thiếu duy nhất **vector search + external_id**.

## Việc còn lại để tròn 50% (ponytail)

### 1) external_id (1 cột, 1 view) — 15 phút
```sql
ALTER TABLE assets ADD COLUMN IF NOT EXISTS external_id TEXT;
UPDATE assets SET external_id = code WHERE external_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_assets_external_id ON assets(external_id);
```
Dùng `code` hiện tại làm `external_id` kiểu `MKZ:LINE01:MACHINE03:TEMP` — không đổi API, chỉ alias.

### 2) Search vector (reuse Chroma :8100) — 1 job nhỏ
Collection `fii_search` index `assets.name + code + metadata`. Odysseus `:7000` expose `GET /api/search?q=` fallback `ILIKE` khi Chroma down. Không thêm infra.

### 3) Không làm (YAGNI)
3D, GraphQL, PowerBI, OAuth enterprise, Spark — để Cognite lo. ODF này chỉ cần làm **edge adapter** nếu Platform đòi CDF thật: `CepStagingPublisher` push `telemetry_data` lên `https://api.cognitedata.com`.

## API đã có (không cần viết mới)
- `GET /api/assets?q=&type=&parentId=&limit=` — hierarchy + search tay
- `GET /api/telemetry?assetId=&metric=` — time series per asset
- `GET /api/assets/{id}/relationships` (via AssetController, check thêm)

## Verify live
```powershell
curl http://localhost:5165/api/assets?limit=10 -H "Authorization: Bearer <token>"
docker exec fii-ops-db psql -U postgres -d fii_ops -c "SELECT type,name,code FROM assets ORDER BY type"
curl http://localhost:8100/api/v1/heartbeat
```

> `ponytail: không migration lớn, không service mới — 1 cột external_id + 1 collection Chroma là đủ 60% CDF, phần còn lại là SaaS của Cognite.`
