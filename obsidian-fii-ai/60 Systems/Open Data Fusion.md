---
tags: [system]
updated: 2026-08-13
---

# Open Data Fusion

## Role
Independent fusion platform: Explorer, Canvas, ingest, governance.

## Repo path
- Pin (demos): `third_party/open-data-fusion/`
- Workspace: `Open-Data-Fusion/`

Authority: [[30 Decisions/ODF Source Authority]]

## Depends on
- Bundles from [[60 Systems/Fusion Adapter]]
- Own PostgreSQL lineage (not Operations schema)

## Must not
- Become a hard dependency of telemetry ingest
- Be deployed from the embedded workspace by accident

## Related
- [[50 Design/Three SPAs]]
