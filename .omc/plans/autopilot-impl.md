# Autopilot implementation plan — legacy frontend cleanup

## Goal

Remove an isolated, clean legacy frontend subgraph without touching the active production-line editor, package metadata, active Phase 2 work, or the existing staged 11-file artifact cleanup.

## Preflight

1. Capture branch/HEAD, complete porcelain status, current staged list, and baseline outputs for frontend type-check, tests, i18n, build, and lint.
2. Confirm the existing staged list contains exactly the approved 11 artifact deletions.
3. Confirm all new deletion candidates are tracked, clean, present, and have no inbound import/lazy-import/test consumer outside the allowlist.
4. Hash/snapshot the protected active files: `LinesPage.tsx`, `DiagramEditor.tsx`, `MachineNode.tsx`, `lines.api.ts`.

## Exact deletion allowlist

Delete exactly these 18 files using literal pathspecs:

- `frontend/src/features/production-lines/components/CanvasToolbar.tsx`
- `frontend/src/features/production-lines/components/DiagramInteractionContext.tsx`
- `frontend/src/features/production-lines/components/DiagramNode.tsx`
- `frontend/src/features/production-lines/components/DiagramProperties.tsx`
- `frontend/src/features/production-lines/components/EquipmentLibrary.tsx`
- `frontend/src/features/production-lines/components/EquipmentNode.tsx`
- `frontend/src/features/production-lines/components/NodePropertiesBubble.tsx`
- `frontend/src/features/production-lines/components/edges/AnimatedEdge.tsx`
- `frontend/src/features/production-lines/components/edges/ButtonEdge.tsx`
- `frontend/src/features/production-lines/components/edges/index.ts`
- `frontend/src/features/production-lines/components/nodes/ProcessNode.tsx`
- `frontend/src/features/production-lines/components/nodes/SensorNode.tsx`
- `frontend/src/features/production-lines/components/nodes/index.ts`
- `frontend/src/features/production-lines/services/line-diagram.service.ts`
- `frontend/src/features/production-lines/store/diagram.store.ts`
- `frontend/src/features/production-lines/store/flow.store.ts`
- `frontend/src/features/simulation/services/mockSimulator.service.ts`
- `frontend/src/features/machines/components/EquipmentTable.tsx`

## Protected boundaries

- Preserve `frontend/src/pages/LinesPage.tsx`.
- Preserve `frontend/src/features/production-lines/components/DiagramEditor.tsx`.
- Preserve `frontend/src/features/production-lines/components/nodes/MachineNode.tsx`.
- Preserve `frontend/src/features/production-lines/services/lines.api.ts`.
- Do not edit package/lock files, router, dashboard, permissions, query keys, Vite config, backend, ODF, ClientPLC, Odysseus, skills, or untracked artifacts.
- Do not use broad reset, clean, restore, stash, recursive deletion, or wildcard pathspecs.

## QA

Run identical gates before and after deletion:

1. `npm --prefix frontend run type-check`
2. `npm --prefix frontend run test:run`
3. `npm --prefix frontend run i18n:check`
4. `npm --prefix frontend run build`
5. `npm --prefix frontend run lint`

A gate passes if green or if its failure is byte-for-byte/signature-equivalent to the pre-deletion baseline. No new diagnostic, failed test, or lint finding is acceptable.

## Final verification

- Existing 11 staged deletions remain unchanged.
- Exactly 18 new staged deletions are added; no staged addition/modification exists.
- All non-target working-tree status entries match preflight.
- Protected files remain byte-identical.
- No import of a deleted module remains.
- `git diff --cached --check` passes.
- No placeholder, skipped/focused test, or unrelated change is introduced.
- Functional, security, and quality reviewers independently approve.

## Rollback

If a new failure is caused by this increment, restore only the exact 18 paths from HEAD in staged and worktree state. Preserve the original 11 staged deletions and all unrelated working-tree changes.
