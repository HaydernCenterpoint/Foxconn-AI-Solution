# Frontend audit - current state and phased hardening

## Scope inspected

- React/Vite entry points: `src/main.tsx`, `src/App.tsx`, `src/index.css`
- Layout and auth foundation: `src/components/layout/*`, `src/components/auth/ProtectedRoute.tsx`, `src/store/auth.store.ts`
- API modules: `src/api/*`
- Monitoring pages: `src/pages/LinesPage.tsx`, `src/pages/MachinesPage.tsx`, `src/pages/ReportsPage.tsx`, `src/pages/LineConfigPage.tsx`, `src/pages/LoginPage.tsx`

## Key findings

1. Architecture is still page-centric. Routing, QueryClient setup, and permissions are concentrated in `App.tsx` and layout components instead of `src/app/*`.
2. The current design language is dark/industrial, not the requested Google Enterprise light system.
3. A CDN font import and the default Vite sample `App.css` are still present.
4. `LinesPage`, `MachinesPage`, and `ReportsPage` depend on a hardcoded `VITE_LINE_ID` fallback.
5. `lines.api.ts` and `productionLines.api.ts` duplicate the same backend area with inconsistent types.
6. `any` is still present in page error handlers and a few telemetry/report flows.
7. Permissions are partly centralized in routes, but not yet enforced consistently at mutation points.
8. i18n, route-level lazy loading, SignalR realtime, and shared enterprise table primitives are not implemented yet.
9. `ReportsPage` currently performs an N+1 hourly-production fetch loop when loading whole-line reports.
10. The repository still uses inline UI strings and emoji iconography in several screens.

## Phase 1 changes targeted in this pass

- Add shared foundation modules for query client, query keys, permissions, API error normalization, and domain typing
- Remove duplicate production-line API module
- Remove fixed line UUID dependency and switch to URL-backed line selection
- Replace Vite sample documentation and create a project-specific audit note
- Move the visual foundation toward the requested light token set without rewriting all screens at once

## Remaining roadmap after this pass

1. Feature-based folder migration under `src/features/*`
2. `react-i18next` setup for vi/en/zh and removal of inline UI strings
3. Shared design-system primitives and a reusable data table
4. Lazy routes, route metadata, and responsive app-shell upgrades
5. SignalR provider with React Query cache updates and reconnect state
6. Aggregate backend reporting endpoints to replace page-level N+1 fetching
7. Unit, integration, and Playwright coverage for critical workflows
