---
tags: [decision, schema]
decision: proposed
updated: 2026-08-13
---

# Operations Schema

## Decision
`backend/db/migrations/` is the only Operations PostgreSQL schema authority. Checksums in `schema_migrations`. Startup preflight is read-only.

Timescale, connector, and ODF databases have **separate** lineages.

## Status
ADR-002 is **proposed**. G0 stays NO-GO until `schema-decision.json` records authorized approvers.

## Source
`docs/release-evidence/g0/adr-002-operations-schema.md`

## Related
- [[60 Systems/Operations Backend]]
- [[30 Decisions/Go No-Go 2026-07-31]]
