---
tags: [runbook, integration]
updated: 2026-08-13
---

# Local W8 Integration

Local no-fixture rehearsal. Not managed staging.

## Source
[[20 Evidence/W8 Local Integration]]
`infrastructure/demo/Test-LocalIntegrationW8.ps1`

## Typical commands
See `docs/release-evidence/2026-08-01-integration-w8-local.md` and [[10 Project/Next Actions]].

## Rules
- No `page.route` / API fixtures on live browser e2e
- Skip ODF/Odysseus only when the harness says so
- Pass here **does not** flip go/nogo
