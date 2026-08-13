---
tags: [system]
updated: 2026-08-13
---

# Fusion Adapter

## Role
Worker. Lease `fusion_outbox` rows, retry, dead-letter, push bundles to ODF.

## Repo path
`fusion-adapter/`
Contracts: `fusion-contracts/`, `contracts/v1/`

## Depends on
- Operations DB outbox written by [[60 Systems/Operations Backend]]
- [[60 Systems/Open Data Fusion]] ingest

## Must not
- Sit on the MQTT ingest path
- Make Operations fail when ODF is down (outbox stays, ingest continues)

## Related
- [[30 Decisions/ODF Source Authority]]
