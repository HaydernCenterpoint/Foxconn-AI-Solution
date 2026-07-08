# MKZ Factory Monitor — Hệ thống Giám sát Nhà máy Thông minh

> **Phiên bản:** 1.0.0  
> **Ngày:** 2026-06-29  
> **Trạng thái:** 📋 Kế hoạch

---

## Tổng quan Hệ thống

MKZ Factory Monitor là giải pháp giám sát nhà máy toàn diện, bao gồm 3 thành phần chính:

```
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│   PLC Client    │───▶│    Backend       │◀───│    Frontend      │
│   (WPF App)     │    │  (ASP.NET Core)  │    │   (React SPA)    │
│                 │ TCP│                  │REST│                  │
│  Đọc dữ liệu    │MQTT│  Xử lý + Lưu trữ │API │  Hiển thị + Quản │
│  từ PLC thật    │    │  + Cảnh báo      │    │  trị + Báo cáo   │
└──────────────────┘    └──────────────────┘    └──────────────────┘
```

## 📂 Danh sách tài liệu Kế hoạch Dự án

| # | Tài liệu | Mô tả | Phase | Trạng thái |
|---|----------|-------|-------|------------|
| 1 | [Project Plan Backend](./project_plan_backend.md) | ASP.NET Core 9 Server — REST API + TCP/MQTT + PostgreSQL | 4 phases (8 tuần) | ✅ Hoàn thành |
| 2 | [Project Plan ClientPLC](./project_plan_clientplc.md) | WPF .NET 9 Desktop App — Giao tiếp PLC Mitsubishi | 4 phases (6 tuần) | ✅ Hoàn thành |
| 3 | [Project Plan Frontend](./project_plan_frontend.md) | React 19 + TypeScript 6 Web App — Dashboard & Management | 4 phases (6 tuần) | ✅ Hoàn thành |

## 📊 Tổng quan các Phase

```
          Tuần 1-2    Tuần 3-4    Tuần 5-6    Tuần 7-8
Backend   ┌──────────┐┌──────────┐┌──────────┐┌──────────┐
          │Phase 1   ││Phase 2   ││Phase 3   ││Phase 4   │
          │MVP       ││Core Feat ││Harden    ││Enterprise│
          └──────────┘└──────────┘└──────────┘└──────────┘

ClientPLC ┌──────────┐┌──────────┐┌──────────┐┌──────────┐
          │Phase 1   ││Phase 2   ││Phase 3   ││Phase 4   │
          │Engine    ││Full UI   ││Stability ││Extend    │
          └──────────┘└──────────┘└──────────┘└──────────┘

Frontend  ┌──────────┐┌──────────┐┌──────────┐┌──────────┐
          │Phase 1   ││Phase 2   ││Phase 3   ││Phase 4   │
          │MVP       ││Full Feat ││Polish    ││Advanced  │
          └──────────┘└──────────┘└──────────┘└──────────┘
```

## 🎯 Milestones chung

| Milestone | Tuần | Backend | ClientPLC | Frontend |
|-----------|------|---------|-----------|----------|
| **M1** — Core | 1 | Database + Auth | PLC Engine | Scaffold + Auth |
| **M2** — MVP 🎯 | 2 | TCP + Dashboard API | Dashboard UI | Dashboard Page |
| **M3** — Feature Complete 🚀 | 4 | All 28 endpoints | 30+ Pages complete | 12 Pages complete |
| **M4** — Hardening 🛡️ | 6 | Security + Load Test | 24/7 Stability | Zero `any` + Skeleton |
| **M5** — Production 🌟 | 8 | SignalR + Redis | Installer + Auto-update | SignalR + E2E Tests |

## 🔗 Liên kết giữa các dự án

| Dependency | Từ | Đến | Ghi chú |
|------------|----|-----|---------|
| API Contract | Backend | Frontend | Frontend cần API ổn định từ Phase 2 |
| TCP Protocol | Backend | ClientPLC | Cùng protocol spec (length-prefixed + AES-GCM) |
| MQTT Protocol | Backend | ClientPLC | Cùng topic structure |
| Login API | Backend | Frontend | JWT token format |
| Telemetry Data | ClientPLC → Backend → Frontend | Flow hoàn chỉnh |
| Alarm Rules | Backend | ClientPLC | Client có thể xử lý alarm local khi offline |

## 👨‍💼 Đội ngũ đề xuất

| Vai trò | Số lượng | Thời gian | Ghi chú |
|---------|----------|-----------|---------|
| Backend Developer | 1 | Full-time 8 tuần | Có kinh nghiệm ASP.NET + PostgreSQL |
| WPF Developer | 1 | Full-time 6 tuần | Có kinh nghiệm HslCommunication (ưu tiên) |
| Frontend Developer | 1 | Full-time 6 tuần | React + TypeScript + Tailwind |
| DevOps Engineer | 0.5 | Part-time 4 tuần | Docker, CI/CD, deploy |
| QA Engineer | 1 | Full-time 4 tuần | Integration + Performance testing |
| PLC Engineer | 0.5 | Part-time 2 tuần | Tư vấn giao thức, test với PLC thật |

## 🚀 Lộ trình triển khai

1. **Tuần 1-2**: Backend MVP + ClientPLC Engine → Test kết nối end-to-end
2. **Tuần 3-4**: Full features cả 3 dự án → Integration testing
3. **Tuần 5-6**: Hardening & Security → Staging deployment
4. **Tuần 7-8**: Enterprise features → Production deployment

## 📝 Lưu ý quan trọng

### Security (cần xử lý ngay Phase 1-2)
- ⚠️ AES key đang hardcode: `SHA256("PLC_MQTT_SECRET_KEY_2026_!@#")` — cần chuyển sang config
- ⚠️ Password hash SHA256 (không salt) — cần nâng cấp lên bcrypt/argon2
- ⚠️ CORS đang AllowAnyOrigin — cần whitelist trong production

### Technical Debt (cần clean Phase 3)
- Backend: Migration scripts thay vì auto-create schema
- Frontend: Xóa `any` types, xóa page wrappers cũ
- ClientPLC: Memory leak test 7 ngày

---

> **Tài liệu chi tiết:**  
> - [Project Plan Backend](./project_plan_backend.md)  
> - [Project Plan ClientPLC](./project_plan_clientplc.md)  
> - [Project Plan Frontend](./project_plan_frontend.md)
