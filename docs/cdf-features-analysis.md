# Phân tích Chức năng Cognite Data Fusion cho MKZ Factory Monitor

> **Ngày phân tích:** 2026-07-09  
> **Dự án:** MKZ Factory Monitor - Factory AI Platform Integration  
> **Mục tiêu:** Xác định các chức năng CDF phù hợp để tích hợp vào hệ thống hiện tại

---

## 1. Tổng quan Kiến trúc Hiện tại

### 1.1. Hệ thống đã có

```
┌─────────────────────────────────────────────────────────────────┐
│                    MKZ Factory Monitor                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐       │
│  │  ClientPLC   │──▶│   Backend    │◀──│   Frontend   │       │
│  │  (WPF .NET)  │TCP│(ASP.NET Core)│API│  (React 19)  │       │
│  │              │MQTT│              │   │              │       │
│  │ - PLC Reader │   │ - PostgreSQL │   │ - Dashboard  │       │
│  │ - Real-time  │   │ - REST API   │   │ - Reports    │       │
│  │   Data       │   │ - Alarms     │   │ - Analytics  │       │
│  └──────────────┘   └──────────────┘   └──────────────┘       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                  Factory AI Platform                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐ │
│  │ Document Service│  │   AI Gateway    │  │ Report Service │ │
│  │                 │  │                 │  │                │ │
│  │ - pgvector RAG  │  │ - Data Agent    │  │ - MinIO        │ │
│  │ - PDF chunking  │  │ - Doc Agent     │  │ - Templates    │ │
│  │ - Semantic      │  │ - Report Agent  │  │ - Generation   │ │
│  │   search        │  │ - Engineering   │  │                │ │
│  └─────────────────┘  └─────────────────┘  └────────────────┘ │
│                                                                 │
│  ┌─────────────────┐                                           │
│  │Antigravity Bridge│                                          │
│  │ - Integration   │                                           │
│  └─────────────────┘                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        Odysseus                                 │
├─────────────────────────────────────────────────────────────────┤
│ AI Chat Platform với đầy đủ tính năng enterprise:              │
│ - Memory management (vector + ChromaDB)                        │
│ - Multi-modal AI (chat, research, image gen)                   │
│ - Calendar/Email/Contacts (CalDAV/CardDAV)                     │
│ - Task scheduling & automation                                 │
│ - MCP integration, Skills, API tokens                          │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2. Điểm mạnh hiện tại

✅ **Đã có:**
- Real-time data collection (ClientPLC → Backend via TCP/MQTT)
- PostgreSQL database với telemetry data
- REST API cho dashboard
- AI agents (data, document, report, engineering)
- Document RAG với pgvector
- Alarm system
- Production tracking
- Bottleneck detection
- Comprehensive UI platform (Odysseus)

---

## 2. So sánh với Cognite Data Fusion

### 2.1. CDF Core Capabilities vs MKZ Current State

| CDF Capability | Mô tả | Trạng thái MKZ | Mức độ cần thiết |
|---------------|-------|----------------|------------------|
| **Time Series DB** | Lưu trữ sensor data hiệu suất cao | ⚠️ PostgreSQL (basic) | 🔴 **HIGH** |
| **Asset Modeling** | Digital twin, asset hierarchy | ❌ Chưa có | 🟡 **MEDIUM** |
| **3D Visualization** | 3D plant layout | ❌ Chưa có | 🟢 **LOW** |
| **Data Integration** | Connectors, ETL pipelines | ⚠️ TCP/MQTT only | 🟡 **MEDIUM** |
| **Event Processing** | Stream processing, CEP | ⚠️ Basic alarm rules | 🔴 **HIGH** |
| **Document Management** | Manual storage, search | ✅ pgvector RAG | ✅ **DONE** |
| **ML/AI Workflows** | Model training, inference | ✅ AI agents | ✅ **DONE** |
| **Contextualization** | Asset-data linking | ❌ Chưa có | 🟡 **MEDIUM** |
| **Data Quality** | Validation, cleansing | ❌ Chưa có | 🟡 **MEDIUM** |
| **Access Control** | Fine-grained permissions | ⚠️ JWT basic | 🟡 **MEDIUM** |
| **API Gateway** | Unified API layer | ✅ Factory AI Gateway | ✅ **DONE** |
| **Semantic Search** | NLP over documents | ✅ pgvector | ✅ **DONE** |

---

## 3. Các Chức năng CDF Ưu tiên Cao

### 3.1. 🔴 Priority 1: Time Series Database

**Tại sao cần:**
- PostgreSQL không tối ưu cho time-series data (sensor readings, telemetry)
- Query chậm khi data lớn (>100M rows)
- Không có compression tự động
- Aggregation queries không hiệu quả

**Giải pháp đề xuất:**

#### Option A: TimescaleDB (Extension cho PostgreSQL)
```yaml
Ưu điểm:
  - Tương thích 100% với PostgreSQL hiện tại
  - Hypertables tự động partition theo thời gian
  - Compression tự động (90% giảm storage)
  - Continuous aggregates (pre-computed rollups)
  - Không cần thay đổi lớn architecture
  
Nhược điểm:
  - Vẫn là PostgreSQL (limits về scale)
  
Chi phí: Miễn phí (Community Edition)
Thời gian: 1-2 tuần tích hợp
```

#### Option B: InfluxDB
```yaml
Ưu điểm:
  - Purpose-built cho time series
  - Compression cực tốt
  - Query language tối ưu (Flux)
  - Downsampling tự động
  
Nhược điểm:
  - Cần thêm database mới
  - Migration effort cao hơn
  
Chi phí: $500-2000/tháng (InfluxDB Cloud)
Thời gian: 3-4 tuần migration
```

**Recommendation:** 🎯 **TimescaleDB** cho phase đầu, migrate sang InfluxDB nếu scale >1TB data

---

### 3.2. 🔴 Priority 2: Advanced Event Processing

**Tại sao cần:**
- Alarm rules hiện tại quá đơn giản (threshold-based)
- Không có pattern detection (nhiều máy cùng lỗi)
- Không có predictive alerts
- Không có root cause analysis tự động

**Giải pháp đề xuất:**

```python
# Architecture mới
┌──────────────────────────────────────────────────────────┐
│                  Event Processing Layer                  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────┐ │
│  │   Ingestion  │──▶│  Processing  │──▶│   Actions   │ │
│  │              │   │              │   │             │ │
│  │ - MQTT       │   │ - Rules      │   │ - Notify    │ │
│  │ - TCP        │   │ - ML Models  │   │ - Auto fix  │ │
│  │ - Kafka      │   │ - Correlation│   │ - Escalate  │ │
│  └──────────────┘   └──────────────┘   └─────────────┘ │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Tính năng cần:**
1. **Complex Event Processing (CEP)**
   - Pattern matching: "Nếu 3 máy cùng line lỗi trong 5 phút"
   - Temporal rules: "Sản lượng giảm >20% so với cùng giờ hôm qua"
   - Cascading failures detection

2. **Predictive Alerts**
   - ML model dự đoán máy sắp lỗi (dựa vào vibration, temperature patterns)
   - Maintenance scheduling tự động

3. **Root Cause Analysis**
   - Trace alarm xuống nguồn gốc (PLC nào, sensor nào)
   - Suggest fix actions dựa vào historical data

**Stack đề xuất:**
- **Apache Flink** (stream processing) hoặc
- **Drools** (rules engine) + Python ML models

**Thời gian:** 4-6 tuần

---

### 3.3. 🟡 Priority 3: Asset Modeling & Digital Twin

**Tại sao cần:**
- Hiện tại chỉ có `lineCode`, `machineCode` (flat structure)
- Không có hierarchy (Plant → Line → Machine → Sensor)
- Không link được document với asset
- Không có asset metadata (model, vendor, install date, ...)

**Giải pháp đề xuất:**

```yaml
Asset Hierarchy:
  Plant: "MKZ Factory"
    Line: "LS18"
      Machine: "Press-001"
        Sensor: "Temperature-A1"
        Sensor: "Vibration-A1"
        Document: "Maintenance Manual.pdf"
      Machine: "Conveyor-002"
    Line: "LS19"
      ...
```

**Schema mới:**

```sql
-- Asset table (thay vì hardcode lineCode/machineCode)
CREATE TABLE assets (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'plant', 'line', 'machine', 'sensor'
    parent_id UUID REFERENCES assets(id),
    metadata JSONB, -- {model: "ABC-123", vendor: "Mitsubishi", ...}
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Time series linked to assets
CREATE TABLE telemetry (
    time TIMESTAMPTZ NOT NULL,
    asset_id UUID REFERENCES assets(id),
    metric VARCHAR(100) NOT NULL,
    value DOUBLE PRECISION,
    PRIMARY KEY (time, asset_id, metric)
);

-- Documents linked to assets
CREATE TABLE asset_documents (
    asset_id UUID REFERENCES assets(id),
    document_id VARCHAR(255) REFERENCES documents(id),
    relationship VARCHAR(50) -- 'manual', 'drawing', 'warranty', ...
);
```

**Tính năng:**
- Asset browser UI (tree view)
- Asset search (tìm tất cả máy của vendor X)
- Link document với asset (click vào máy → hiện manual PDF)
- Asset health score (dựa vào telemetry + alarms)

**Thời gian:** 3-4 tuần

---

### 3.4. 🟡 Priority 4: Data Integration Pipelines

**Tại sao cần:**
- Hiện tại chỉ có PLC data (qua ClientPLC)
- Cần thêm data sources: ERP, MES, SCADA, Excel reports, ...
- Cần ETL cho data cleansing

**Giải pháp đề xuất:**

```python
# Integration Architecture
┌─────────────────────────────────────────────────────────────┐
│                   Integration Layer                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │   PLC    │  │   ERP    │  │   MES    │  │   CSV    │  │
│  │ (ClientP)│  │  (API)   │  │  (DB)    │  │  (FTP)   │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
│       │             │             │             │         │
│       └─────────────┴─────────────┴─────────────┘         │
│                         │                                  │
│                    ┌────▼────┐                            │
│                    │  ETL    │                            │
│                    │ Engine  │                            │
│                    └────┬────┘                            │
│                         │                                  │
│                    ┌────▼────┐                            │
│                    │ Time    │                            │
│                    │ Series  │                            │
│                    │   DB    │                            │
│                    └─────────┘                            │
└─────────────────────────────────────────────────────────────┘
```

**Connectors cần:**
1. **ERP Connector** (SAP, Oracle)
   - Production orders
   - Material consumption
   - Downtime reasons

2. **MES Connector**
   - Work orders
   - Quality data
   - Operator shifts

3. **File Connector** (CSV, Excel)
   - Manual reports
   - Lab test results

4. **Database Connector** (SQL Server, Oracle)
   - Legacy systems

**Stack đề xuất:**
- **Apache NiFi** (visual ETL) hoặc
- **Airbyte** (pre-built connectors) hoặc
- **Custom Python pipelines** với Apache Airflow

**Thời gian:** 2-3 tuần per connector

---

## 4. Các Chức năng CDF Ưu tiên Thấp (Bỏ qua hoặc Sau này)

### ❌ 3D Visualization
- **Lý do:** Không cần thiết cho monitoring cơ bản
- **Khi nào cần:** Khi có yêu cầu VR/AR training, hoặc plant layout phức tạp
- **Alternative:** 2D floor plan với Konva.js hoặc D3.js

### ❌ Graph Database (như CDF's Knowledge Graph)
- **Lý do:** PostgreSQL with JSONB đủ cho asset relationships
- **Khi nào cần:** Khi có >100k assets với complex relationships

### ❌ Extraction Pipelines (NLP over unstructured data)
- **Lý do:** Đã có pgvector RAG, đủ cho document search
- **Khi nào cần:** Khi cần extract data từ scanned PDFs, handwritten notes

---

## 5. Roadmap Tích hợp CDF Features

### Phase 1: Time Series Foundation (Tuần 1-3)
```
- [ ] Migrate sang TimescaleDB
- [ ] Optimize telemetry schema
- [ ] Implement continuous aggregates
- [ ] Compression policies
- [ ] Retention policies (keep raw 30 days, aggregates 1 year)
```

### Phase 2: Advanced Events (Tuần 4-6)
```
- [ ] Setup Apache Flink (hoặc Drools)
- [ ] Migrate alarm rules sang CEP engine
- [ ] Implement pattern detection
- [ ] Integrate with AI agents (predictive alerts)
- [ ] Dashboard cho event flows
```

### Phase 3: Asset Modeling (Tuần 7-10)
```
- [ ] Design asset schema
- [ ] Build asset importer (từ Excel/CSV)
- [ ] Asset browser UI
- [ ] Link documents với assets
- [ ] Asset health dashboard
```

### Phase 4: Data Integration (Tuần 11-14)
```
- [ ] Setup integration framework (Airbyte/NiFi)
- [ ] Build ERP connector
- [ ] Build MES connector
- [ ] Build file watcher (CSV/Excel)
- [ ] Data quality dashboard
```

### Phase 5: Advanced Analytics (Tuần 15+)
```
- [ ] ML model cho predictive maintenance
- [ ] Anomaly detection tự động
- [ ] Root cause analysis engine
- [ ] Advanced reporting
```

---

## 6. Technology Stack Đề xuất

### 6.1. Core Time Series
```yaml
Primary:
  - TimescaleDB (PostgreSQL extension)
  - InfluxDB (future scale)

Alternative:
  - Apache IoTDB (open source, high performance)
  - QuestDB (fast time-series DB)
```

### 6.2. Event Processing
```yaml
Primary:
  - Apache Flink (stream processing)
  - Drools (business rules engine)

Alternative:
  - Kafka Streams
  - Esper (CEP engine)
```

### 6.3. Data Integration
```yaml
Primary:
  - Airbyte (pre-built connectors)
  - Apache Airflow (orchestration)

Alternative:
  - Apache NiFi (visual ETL)
  - Meltano (Singer-based)
```

### 6.4. Visualization
```yaml
Primary:
  - Existing React frontend
  - Recharts / Victory (charts library)
  - D3.js (custom visualizations)

Asset Browser:
  - React Flow (node graph)
  - Tree view component
```

---

## 7. Cost Estimation

### 7.1. Development Cost

| Phase | Duration | Effort (người-tuần) | Chi phí (ước tính) |
|-------|----------|---------------------|-------------------|
| Phase 1: Time Series | 3 tuần | 1 Backend + 0.5 DevOps = 4.5 | $18,000 |
| Phase 2: Events | 3 tuần | 1 Backend + 0.5 Data Eng = 4.5 | $18,000 |
| Phase 3: Assets | 4 tuần | 1 Backend + 1 Frontend = 8 | $32,000 |
| Phase 4: Integration | 4 tuần | 1 Backend + 0.5 DevOps = 6 | $24,000 |
| Phase 5: ML/AI | 4 tuần | 1 ML Engineer = 4 | $20,000 |
| **Total** | **18 tuần** | **27 người-tuần** | **$112,000** |

### 7.2. Infrastructure Cost (Yearly)

| Component | Option | Cost/year |
|-----------|--------|-----------|
| TimescaleDB | Self-hosted | $0 |
| TimescaleDB | Cloud (1TB) | $12,000 |
| InfluxDB | Cloud (1TB) | $18,000 |
| Apache Flink | Self-hosted | $0 |
| Kafka | Self-hosted | $0 |
| Airbyte | Cloud | $6,000 |
| Storage | S3/MinIO (10TB) | $3,000 |
| **Total (Self-hosted)** | | **~$9,000** |
| **Total (Cloud)** | | **~$39,000** |

---

## 8. Rủi ro & Giảm thiểu

### 8.1. Technical Risks

| Rủi ro | Mức độ | Giảm thiểu |
|--------|--------|------------|
| TimescaleDB migration phức tạp | 🟡 MEDIUM | Dual-write during migration, rollback plan |
| Event processing latency | 🟡 MEDIUM | Benchmark early, tune batch sizes |
| Asset data quality kém | 🔴 HIGH | Validation rules, data cleansing pipeline |
| Integration failures | 🟡 MEDIUM | Retry logic, dead letter queues |

### 8.2. Operational Risks

| Rủi ro | Mức độ | Giảm thiểu |
|--------|--------|------------|
| Team thiếu kinh nghiệm time-series | 🟡 MEDIUM | Training, hire consultant |
| Production downtime during migration | 🔴 HIGH | Blue-green deployment |
| Storage costs vượt ngân sách | 🟡 MEDIUM | Compression, retention policies |

---

## 9. Success Metrics

### 9.1. Technical KPIs

```yaml
Time Series Performance:
  - Query response time < 100ms (p95)
  - Write throughput > 100k points/sec
  - Storage compression > 80%

Event Processing:
  - Event latency < 1 second (p99)
  - Pattern detection accuracy > 95%
  - False positive rate < 5%

Asset Modeling:
  - Asset search response < 500ms
  - Document retrieval < 2 seconds
  - Asset health score accuracy > 90%
```

### 9.2. Business KPIs

```yaml
Operational Impact:
  - Downtime giảm > 20%
  - MTTR (Mean Time To Repair) giảm > 30%
  - Predictive maintenance accuracy > 85%
  - False alarm rate giảm > 50%

User Adoption:
  - Daily active users > 80% team
  - Average session time > 30 minutes
  - User satisfaction > 4/5
```

---

## 10. Kết luận & Khuyến nghị

### 10.1. Tổng kết

Dự án **MKZ Factory Monitor** đã có nền tảng tốt với:
- ✅ Real-time data collection
- ✅ AI agents cho analysis
- ✅ Document RAG
- ✅ Basic alarming

Để nâng cấp lên tầm **Industrial IoT Platform** (tương tự CDF), cần:
- 🔴 **TimescaleDB** cho time-series performance
- 🔴 **Advanced Event Processing** cho smart alerts
- 🟡 **Asset Modeling** cho contextualization
- 🟡 **Data Integration** cho multiple sources

### 10.2. Khuyến nghị triển khai

**Phương án A: Nhanh & Ổn định (Recommended)**
```
1. TimescaleDB (3 tuần) → Immediate performance boost
2. Drools + ML alerts (3 tuần) → Smarter alarming
3. Stop & evaluate → Đánh giá ROI trước khi đầu tư tiếp
```

**Phương án B: Đầy đủ (High ambition)**
```
1-4. All phases (18 tuần) → Full CDF-like platform
Risk: High upfront cost, complex migration
```

**Phương án C: Hybrid (Best ROI)**
```
1. TimescaleDB (3 tuần)
2. Asset modeling (4 tuần)
3. Pause → Let users adopt
4. Phase 2 & 4 based on feedback
```

### 10.3. Next Steps

1. **Tuần này:**
   - Review document này với stakeholders
   - Chọn phương án A/B/C
   - Setup TimescaleDB sandbox cho benchmark

2. **Tuần tới:**
   - Kick-off Phase 1
   - Hire/train team members
   - Setup project tracking

3. **2 tuần:**
   - Prototype TimescaleDB migration
   - Demo performance gains
   - Go/No-go decision

---

## Phụ lục

### A. CDF vs MKZ Feature Matrix

| CDF Feature | MKZ Current | Priority | Effort | Value |
|-------------|-------------|----------|--------|-------|
| Time Series DB | PostgreSQL | 🔴 | Medium | High |
| Asset Hierarchy | Flat | 🟡 | High | Medium |
| 3D Viewer | ❌ | 🟢 | Very High | Low |
| Document RAG | ✅ | ✅ | - | - |
| AI Agents | ✅ | ✅ | - | - |
| Event Processing | Basic | 🔴 | Medium | High |
| Data Connectors | PLC only | 🟡 | Medium | Medium |
| ML Workflows | ✅ | ✅ | - | - |
| Access Control | JWT | 🟡 | Low | Medium |

### B. Tài liệu tham khảo

- [Cognite Data Fusion Docs](https://docs.cognite.com/)
- [TimescaleDB Best Practices](https://docs.timescale.com/)
- [Apache Flink CEP](https://nightlies.apache.org/flink/flink-docs-master/docs/libs/cep/)
- [Industrial IoT Architecture Patterns](https://learn.microsoft.com/en-us/azure/architecture/example-scenario/iiot-iot-architecture-patterns)

---

**Document Owner:** AI Analysis  
**Last Updated:** 2026-07-09  
**Version:** 1.0
