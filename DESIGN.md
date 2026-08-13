# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-08-13
- Primary product surfaces: Operations (`frontend/`), ODF Explorer/Canvas, Odysseus chrome
- Evidence reviewed: `theme-tokens.css`, `modern-shell.css`, ODF `premium.css`, Odysseus `style.css`
- Direction: **Google Material 3** (Cloud Console + Gemini dark), not Cyber Industrial, not charcoal/red ModernShell

## Brand
- Personality: Google industrial console. Calm, dense, product-like. Foxconn logo stays; Google is the *system*, not the brand mark.
- Trust signals: Material color roles, Google Blue interaction, status color only for machine state.
- Avoid: neon cyan, L-brackets, navy cyber `#050B14`, ModernShell red `#ef4444`, One Dark editor chrome, Material default purple, Cabinet Grotesk, glass grid overlays.

## Product goals
- Goals: one Material 3 token family across Operations, ODF, Odysseus chrome.
- Non-goals: `@material/web` rewrite; restyle Odysseus 40k-line editor; merge three SPAs; Google logo.
- Success: shell looks like Cloud Console / Gemini, not a sci-fi HUD.

## Personas and jobs
- Operators, engineers, ODF stewards, occasional assistant users.
- Control-room desktop 1920×1080, 8–12h shifts.

## Information architecture
- Unchanged routes. Shared chrome language only.

## Design principles
- Material 3 roles (`primary`, `surface-container-*`, `on-surface`, `outline`).
- Google Blue is interaction. Crimson/green/amber are telemetry status only.
- Light analysis canvas for ODF. Dark chrome for Operations and Odysseus.
- No glow except alarm.

## Visual language

Dials: variance 3, motion 2, density 8 / 6 / 5.

### Color (Material 3, seed Google Blue `#0B57D0`)

Dark (Operations / Odysseus default):

| Role | Hex |
| --- | --- |
| background / surface-dim | `#131314` |
| surface-container | `#1E1F20` |
| surface-container-high | `#282A2C` |
| on-surface | `#E3E3E3` |
| on-surface-variant | `#C4C7C5` |
| outline | `#444746` |
| primary | `#A8C7FA` |
| on-primary | `#062E6F` |
| primary-container | `#0842A0` |
| error | `#F2B8B5` |

Light (ODF canvas + Operations light theme):

| Role | Hex |
| --- | --- |
| background | `#F8FAFD` |
| surface | `#FFFFFF` |
| surface-container | `#E9EEF6` |
| on-surface | `#1F1F1F` |
| primary | `#0B57D0` |
| on-primary | `#FFFFFF` |
| primary-container | `#D3E3FD` |
| error | `#B3261E` |

Status (unchanged function): running `#10B981`, warn `#F59E0B`, idle `#8AB4F8`, offline `#8E918F`. Alarm uses error role, not brand red fill on nav.

### Typography
- UI: Google Sans → Be Vietnam Pro (vi) → Roboto → Noto Sans SC.
- Mono: Roboto Mono.
- No Outfit, Cabinet Grotesk, Inter-as-display.

### Shape
- Controls 8px, panels 12px, nav active indicator 28px (M3 drawer).
- Flush app rail (Cloud Console), not floating 24px islands.

### Motion
- 200ms standard easing. No grid overlay, no cyan hover translate.

## Components
- Reuse: `theme-tokens.css` names. Repoint hex to M3 Google.
- Change: `modern-shell.css` maps `--modern-shell-*` to tokens; delete glass/red premium layer.
- Done: ODF `--accent: #0B57D0`; Odysseus default `dark`/`light` + `:root` chrome; Operations chrome and pages use Material Symbols.
- Icons: Material Symbols Outlined. Do not add `@material/web`.

## Accessibility
- WCAG AA. Focus ring `0 0 0 3px rgba(11, 87, 208, 0.40)`.
- Alarm never color-only.

## Responsive behavior
- Desktop-first. Rail collapses &lt;1040px. Drawer &lt;760px.

## Interaction states
- Loading: skeleton. Empty: one sentence. Error: error-container. Selected nav: primary-container + primary text, not filled red.

## Content voice
- Operator-short. No marketing verbs. No em-dash.

## Implementation constraints
- Tailwind 4 + CSS variables. Do not add `@material/web` until a dedicated component migration.
- ODF authority: `third_party/open-data-fusion`.
- Odysseus: override `:root`, do not edit `style.css` body.

## Open questions
- [x] Visual family: Google Material 3.
- [x] ODF + Odysseus token pass (after Operations shell).
- [x] Material Symbols on Operations chrome (ModernShell).
- [x] Material Symbols on remaining Operations pages.
