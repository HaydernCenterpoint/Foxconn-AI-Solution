# Autopilot Cleanup Continuation Spec

## Objective

Continue repository cleanup autonomously after the verified 11-file artifact deletion batch, while preserving all active Phase 1/2 work. The next increment removes only a clean, isolated legacy frontend island with no route/import/test consumer.

## In scope

- Delete the disconnected legacy production-line flow editor subgraph under `frontend/src/features/production-lines/`.
- Delete its only external dependency, `frontend/src/features/simulation/services/mockSimulator.service.ts`.
- Delete `frontend/src/features/machines/components/EquipmentTable.tsx`, which has no route/import/test consumer.
- Preserve the active production-line implementation:
  - `frontend/src/pages/LinesPage.tsx`
  - `frontend/src/features/production-lines/components/DiagramEditor.tsx`
  - `frontend/src/features/production-lines/components/nodes/MachineNode.tsx`
  - `frontend/src/features/production-lines/services/lines.api.ts`

## Exclusions

- All currently modified/untracked Phase 1/2 files, especially router, dashboard, permissions, query keys, Vite config, asset browser and predictive alert files.
- Frontend package and lockfile dependency cleanup; handle separately.
- Obsolete dashboard panel family because the dashboard area is under active modification.
- Backend, ODF, Odysseus, ClientPLC source refactors.
- Skill projections, `skills-lock.json`, `graphify-out/`, and all unrelated untracked artifacts.
- The existing staged 11-file deletion batch must remain intact.

## Acceptance criteria

1. Only the explicit legacy frontend files are newly deleted.
2. Active `LinesPage` → `DiagramEditor` → `MachineNode` import chain remains intact.
3. No current modified/untracked Phase 2 path is changed or staged.
4. Frontend type-check, unit tests, i18n check, build, and lint pass, or any pre-existing failure is isolated and reported accurately.
5. Final diff contains no placeholders, skipped/only tests, or unrelated changes.
6. Independent functional, security, and quality reviewers approve the cleanup.
