---
tags: [system]
updated: 2026-08-13
---

# Operations Backend

## Role
ASP.NET Core. MQTT broker, ingest, Operations PostgreSQL, CEP/alerts/health/prediction, REST for UI, fusion outbox.

## Repo path
`backend/`
Schema: `backend/db/migrations/` → [[30 Decisions/Operations Schema]]

## Depends on
- Operations PostgreSQL (SoT)
- Optional Timescale dual-write
- Secrets from manager, not git → [[70 Conventions/Secrets]]

## Must not
- Block MQTT hot path on ODF/AI failure
- Auto-mark unknown schemas as migrated
- Put production credentials in appsettings

## Related
- [[60 Systems/Operations Frontend]]
- [[60 Systems/Fusion Adapter]]
