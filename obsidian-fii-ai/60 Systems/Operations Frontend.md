---
tags: [system]
updated: 2026-08-13
---

# Operations Frontend

## Role
React + Vite factory console: dashboard, lines, machines, alarms, reports, admin, viewer slideshow.

## Repo path
`frontend/`

## Depends on
- Backend cookie session (no bearer in localStorage)
- [[50 Design/Design Source of Truth]]
- [[50 Design/Material Symbols]]

## Must not
- Call connector APIs with `VITE_*` secrets
- Merge with ODF or Odysseus shells
- Treat local Vitest as staging proof

## Related
- [[50 Design/Operations Chrome]]
- [[70 Conventions/SPA Boundaries]]
