# Prompt Framework - Xây dựng Industrial IoT Platform

> **Mục đích:** Bộ khung prompt để hướng dẫn AI/Developer xây dựng từng component của hệ thống  
> **Ngày tạo:** 2026-07-09  
> **Phiên bản:** 1.0

---

## 📚 Mục lục

1. [Master System Prompt](#1-master-system-prompt)
2. [Phase 1: TimescaleDB Migration](#2-phase-1-timescaledb-migration)
3. [Phase 2: Event Processing](#3-phase-2-event-processing)
4. [Phase 3: Asset Modeling](#4-phase-3-asset-modeling)
5. [Phase 4: Data Integration](#5-phase-4-data-integration)
6. [Phase 5: ML/AI Workflows](#6-phase-5-mlai-workflows)
7. [Component Prompts](#7-component-prompts)
8. [Testing & Validation Prompts](#8-testing--validation-prompts)

---

## 1. Master System Prompt

### 1.1. Architecture Context

```markdown
# MKZ Factory Monitor - Industrial IoT Platform

## System Overview
Bạn đang xây dựng một Industrial IoT platform tương tự Cognite Data Fusion cho nhà máy sản xuất.

## Current Architecture
- **Backend:** ASP.NET Core 9 + PostgreSQL
- **Frontend:** React 19 + TypeScript
- **PLC Client:** WPF .NET 9 (đọc dữ liệu PLC Mitsubishi qua TCP/MQTT)
- **AI Platform:** Python FastAPI với AI agents (data, document, report, engineering)
- **Document Service:** pgvector RAG cho semantic search
- **UI Platform:** Odysseus (comprehensive AI chat platform)

## Technology Stack
- Database: PostgreSQL → TimescaleDB
- Backend: ASP.NET Core 9 (C#)
- AI Services: Python FastAPI
- Frontend: React 19 + TypeScript + Tailwind CSS
- Real-time: TCP/MQTT protocols
- Storage: MinIO (S3-compatible)
- Message Queue: (TBD - Kafka/RabbitMQ)

## Coding Standards
- C# Backend: Clean Architecture, CQRS pattern, Entity Framework Core
- Python: FastAPI, async/await, type hints
- TypeScript: Strict mode, functional components, React hooks
- Database: Migrations-first, no auto-create schema
- API: RESTful + OpenAPI/Swagger docs
- Security: JWT authentication, role-based access control

## Data Flow
PLC → ClientPLC (WPF) → Backend (TCP/MQTT) → TimescaleDB → AI Agents → Frontend

## Key Principles
1. Real-time first: Sub-second latency cho critical metrics
2. Fault tolerance: System phải hoạt động khi một service down
3. Scalability: Design cho 1000+ PLCs, 10M+ data points/hour
4. Security: Industrial-grade security (no public internet exposure)
5. Maintainability: Clear separation of concerns, comprehensive logging
