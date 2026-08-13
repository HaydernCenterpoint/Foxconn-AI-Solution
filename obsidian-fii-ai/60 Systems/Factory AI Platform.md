---
tags: [system]
updated: 2026-08-13
---

# Factory AI Platform

## Role
Optional AI plane: gateway, RAG, reports. Not required for PLC ingest.

## Repo path
`factory-ai-platform/`

## Depends on
- Backend REST when used
- Connector API key shared with backend (never `VITE_*`)

## Must not
- Become the source of truth for machine state
- Fail closed in a way that stops Operations ingest

## Related
- [[60 Systems/Operations Backend]]
- [[60 Systems/Odysseus]]
- [[70 Conventions/Secrets]]
