---
tags: [project, scope]
updated: 2026-08-13
---

# Product Scope

FII AI = MKZ Factory Monitor. On-prem. Operations phải chạy nếu ODF hoặc AI chết.

## In
- PLC ingest qua [[60 Systems/ClientPLC]]
- MQTT + [[60 Systems/Operations Backend]] + PostgreSQL Operations (source of truth)
- Timescale dual-write (optional)
- CEP / alerts / health / prediction
- [[60 Systems/Operations Frontend]]
- `fusion_outbox` → [[60 Systems/Fusion Adapter]] → [[60 Systems/Open Data Fusion]]

## Out of FII core
- [[60 Systems/Odysseus]] (optional assistant)
- Trained ML replacement, LLM RCA, causal graph
- Merging the three SPAs

## Hard boundaries
1. Do not block MQTT hot path
2. ODF is outbox-only
3. Postgres Operations is SoT
4. Secrets never enter git / appsettings / images → [[70 Conventions/Secrets]]
5. Local tests ≠ managed staging → [[30 Decisions/Go No-Go 2026-07-31]]
6. ODF pin = `third_party/open-data-fusion`, not `Open-Data-Fusion/` → [[30 Decisions/ODF Source Authority]]

## Related
- [[10 Project/Architecture Map]]
- [[10 Project/Repo Map]]
- `docs/PROJECT-GUIDE.vi.md`
