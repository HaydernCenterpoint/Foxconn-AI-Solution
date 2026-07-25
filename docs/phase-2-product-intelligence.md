# Phase 2 — Product Intelligence

> **Deadline:** 2026-08-05 (2 weeks)
> **Scope:** CEP persistence, predictive analytics, asset health scoring, connectors, intelligence UI, AI gateway integration
> **Prerequisites:** Phase 1 MVP complete (contracts v1, Asset Browser, Timescale dual-write, CEP staging)

## Objectives

Transform the platform from data collection to actionable intelligence:
- Persistent event/alert storage with lifecycle management
- Predictive failure/anomaly detection
- Automated asset health scoring
- External data source connectors (CSV/Excel, ERP/MES)
- Intelligence-driven frontend (predictive alerts, health badges, RCA)
- AI Gateway integration with real REST APIs

## Architecture Principles

- **Hot path protection:** CEP/prediction/connectors must never block MQTT telemetry ingestion
- **Graceful degradation:** All intelligence features fail-open with logged warnings
- **Contract compatibility:** Maintain PostgreSQL/Timescale schemas and asset UUID contracts from Phase 1
- **Pattern reuse:** Leverage existing services, utilities, and patterns; avoid new dependencies without explicit approval
- **No fake success:** Synthetic fallbacks only for development, clearly labeled

## Implementation Status

Started: 2026-07-22
