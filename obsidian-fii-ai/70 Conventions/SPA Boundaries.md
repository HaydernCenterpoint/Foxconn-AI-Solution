---
tags: [convention]
updated: 2026-08-13
---

# SPA Boundaries

Three SPAs stay separate. [[50 Design/Three SPAs]]

| App | Session | Style authority |
|---|---|---|
| Operations | HttpOnly cookie | `theme-tokens.css` |
| ODF | Own auth | Pin CSS + seed `#0B57D0` |
| Odysseus | Own | `:root` only |

Do not share a merged router, a shared Material Web bundle, or one CSS file across all three.

## Related
- [[70 Conventions/Git and Pins]]
- [[30 Decisions/Design Material 3]]
