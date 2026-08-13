---
tags: [design, convention]
updated: 2026-08-13
---

# Three SPAs

Keep **three** apps. Shared visual language, not a merge.

| App | Path | Job |
|---|---|---|
| Operations | `frontend/` | Factory monitor |
| ODF | pin + workspace | Fusion explorer/canvas |
| Odysseus | `Odysseus/` | Assistant workspace |

## Rules
- Do not merge routes or shells
- Cookie session stays on Operations
- ODF pin vs workspace: [[30 Decisions/ODF Source Authority]]
- Odysseus: chrome tokens only

## Related
- [[70 Conventions/SPA Boundaries]]
- [[60 Systems/Operations Frontend]]
- [[60 Systems/Open Data Fusion]]
- [[60 Systems/Odysseus]]
