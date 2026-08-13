---
tags: [decision, design]
decision: google-material-3
updated: 2026-08-13
---

# Design Material 3

## Decision
Visual family = **Google Material 3**, seed Google Blue `#0B57D0`. Not Cyber Industrial, not Cabinet Grotesk, not glass/cyan HUD.

## Why
Control-room density. One token family across Operations, ODF chrome, Odysseus `:root`.

## Allowed
- Tokens in `frontend/src/app/styles/theme-tokens.css`
- Material Symbols Outlined
- Odysseus `:root` / `:root.light` overrides only

## Forbidden
- `@material/web` this pass
- Merge three SPAs
- Rewrite Odysseus `style.css` body (~40k lines)
- Outfit, neon cyan, ModernShell red as brand

## Source
Root `DESIGN.md`. [[50 Design/Design Source of Truth]]

## Related
- [[50 Design/Three SPAs]]
- [[50 Design/Material Symbols]]
