# Dashboard Command Center Redesign

## Context

MKZ Factory Monitor already exposes a shared production dashboard for viewer, engineer, and admin roles. The current dashboard loads summary, production-line, and machine data through React Query, converts it into one shared view model, and renders charts, line status, alarms, search, and navigation.

The redesign changes only the dashboard page. The shared application shell, routes, API contracts, query behavior, permissions, translations, and dashboard view model remain unchanged.

## Goals

- Present production health as a dark industrial control-room interface.
- Make the most urgent operational information readable at a glance on desktop and monitoring displays.
- Preserve all existing dashboard data and interactions.
- Improve loading, error, empty, keyboard, and responsive states.
- Reuse the existing React, TypeScript, CSS, Recharts, and Lucide stack.

## Non-goals

- Redesigning the shared sidebar or header.
- Changing API endpoints, polling intervals, permissions, routes, or data normalization.
- Adding a new component library, chart library, animation library, or font dependency.
- Introducing a new production-map data source or React Flow canvas on the dashboard.
- Rewriting dashboard copy or information architecture.

## Design direction

### Design read

This is a production-monitoring dashboard for factory operators and supervisors. It uses a dark control-room language with high information density, clear state hierarchy, and restrained motion.

### Dials

- `DESIGN_VARIANCE: 6`: asymmetric desktop composition with a dominant monitoring area and a narrower operational rail.
- `MOTION_INTENSITY: 3`: static data presentation with hover, focus, pressed, and state transitions only.
- `VISUAL_DENSITY: 8`: compact panels, tabular numbers, and efficient use of a 16:9 desktop viewport.

### Visual system

- Page background: near-black blue-charcoal, never pure black.
- Primary surface: cool dark charcoal with a subtle cyan-tinted border.
- Primary accent: restrained cyan for focus, live state, selected controls, and chart emphasis.
- Semantic colors: amber for attention and red for alarms or faults only.
- Text: cool off-white primary text with blue-gray secondary text.
- Shape rule: small technical radii for panels and controls; pill shapes only for compact status values.
- Typography: keep the existing local system stack and enable tabular figures for operational numbers.
- Icons: keep Lucide because it is already installed and used throughout the project.

## Layout

### Dashboard header

The header keeps the current welcome text, page title, username, and global dashboard search. It becomes more compact and reads as an operational heading instead of a marketing hero.

### KPI instrument strip

The three existing KPI values remain directly below the header:

1. Total production
2. Production efficiency
3. Active alarms

Each KPI uses the same structural pattern and tabular number treatment. Cyan is the default instrumentation accent. Alarm color is applied only when the value represents an attention state.

### Main command area

The desktop layout uses a twelve-column grid:

- Eight columns for production monitoring.
- Four columns for operational status and actions.

The production area contains:

- Production by hour as the dominant chart.
- Hourly peak, good output, and active-line supporting metrics.
- Production trend.
- Defect-rate summary.

The operational rail contains:

- Current line status.
- Recent alarms with the existing active-only filter.
- Top machine production.
- Existing links to machines, lines, and alarms.

No panel is added unless it is backed by the current `DashboardViewModel`.

## Interaction behavior

- Dashboard search continues to filter lines, alarms, and machines.
- The active-alert control remains a real toggle with `aria-pressed`.
- Existing links retain their current role-aware paths.
- Interactive elements receive visible keyboard focus, hover, and pressed feedback.
- Transitions affect only color, opacity, and transform.
- No perpetual animation, scroll listener, or decorative live-data pulse is added.
- Reduced-motion users receive the same information without motion-dependent cues.

## Data flow

`ModernDashboardPage` continues to load dashboard summary, lines, and machines through the existing React Query hooks. `createDashboardViewModel` remains the single transformation boundary. `ModernDashboard` stays a presentational component and receives the same props.

The redesign must not duplicate calculations in the component or introduce a second dashboard data model.

## Loading, error, and empty states

- Loading: show layout-matched skeleton surfaces for the KPI strip and primary panels while preserving page dimensions.
- Error: show a contextual status panel above the dashboard content without hiding any cached data that is still available.
- Empty charts: retain translated empty messages inside the relevant panel.
- Empty search results: retain separate translated messages for lines, alarms, and machines.
- No new untranslated visible strings are introduced unless an implementation requirement makes them necessary.

## Responsive behavior

- `>= 1200px`: full command-center grid with the operational rail on the right.
- `768px-1199px`: production area first, operational panels in a two-column row below it.
- `< 768px`: one-column reading order, full-width search, two-column KPI grid where space permits.
- `< 480px`: one-column KPI layout when needed, horizontally scrollable alarm table, and touch targets at least 44px high.

The layout uses CSS Grid and stable content dimensions. It does not use `h-screen` or viewport-locked panel heights.

## Accessibility

- Preserve the existing chart descriptions and table caption.
- Keep heading levels semantic and panel titles discoverable.
- Maintain WCAG AA contrast for text, controls, focus rings, and semantic states.
- Never encode line or alarm state by color alone; translated status text remains visible.
- Search keeps its explicit accessible label.
- Decorative icons remain hidden from assistive technology.

## Implementation scope

Primary files:

- `src/features/dashboard/components/ModernDashboard.tsx`
- `src/features/dashboard/components/modern-dashboard.css`
- `src/features/dashboard/components/ModernDashboard.test.tsx`

Additional files may change only if a required translated state is missing. The preferred implementation introduces no new files and no new dependencies.

## Verification

- Extend the existing dashboard component test only where behavior or state markup changes.
- Run the targeted dashboard test.
- Run the full Vitest suite.
- Run ESLint.
- Run TypeScript type checking.
- Run the production build.
- Inspect the dashboard at desktop, tablet, and mobile widths.
- Confirm search, alert filtering, role-aware links, loading, error, and empty states.

## Acceptance criteria

- The dashboard has a cohesive dark industrial command-center appearance.
- Existing data, filtering, navigation, localization, and role behavior still work.
- The app shell and non-dashboard pages are visually and functionally unchanged.
- The dashboard is usable at desktop, tablet, and mobile widths.
- Loading, error, and empty states are visible and accessible.
- No new runtime dependency is added.
- Targeted tests, full tests, lint, type checking, and build pass, or any pre-existing failure is documented with evidence.
