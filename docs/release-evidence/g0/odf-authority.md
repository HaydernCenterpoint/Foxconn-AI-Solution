# G0 Open Data Fusion source authority

Captured: 2026-08-02 11:26 +07:00  
Parent: `79e2fc7e72c02904599478c207f5c7b36ec54965`

## Decision

`third_party/open-data-fusion` is the sole candidate source authority at commit
`29dc16acb464529c35ac2a5627a095b4b940bd79`, tree
`5c68155d5337e7719ec6ddb8045d352c3d91b95c`.

The tracked `Open-Data-Fusion/` tree is not deployable authority. It is a
divergent embedded fork-like snapshot, tree
`e29c34a3605d5eab1a2dd079768e47f7aa5aaf4c`.

## Full-tree inventory

- Embedded files: 392.
- Submodule files: 380.
- Identical paths/blobs: 343.
- Changed same-path files: 34.
- Embedded-only files: 15.
- Submodule-only files: 3.

The 15 embedded-only files implement annotations, events, labels,
relationships and sequences across API routes, tests and contracts. They have
now been reconciled into the submodule working tree together with three wiring
changes, while preserving the newer upstream authentication, logout and
migration behavior. The resulting candidate has no embedded-only path left.

The candidate passed 39 focused feature tests, 492 workspace tests and 82
infrastructure/production-gate tests. It is nevertheless a **dirty, unreviewed
working tree**, not a release pin. G0 remains NO-GO until those changes are
reviewed in the ODF repository, committed there, and the parent gitlink,
manifest commit/tree and inventory hash are updated to that reviewed commit.
No release script may silently deploy the embedded tree or the dirty candidate.

Submodule-only upstream files that must be preserved are:

- `apps/web/nginx.conf`
- `apps/web/src/components/AuthBoundary.test.tsx`
- `infra/postgres/migrations/016_legacy_model_normalized_sync.sql`

FII-specific configuration remains under `infrastructure/open-data-fusion/`.

## Exit condition

1. Review and commit the reconciled candidate in the ODF repository.
2. Reconcile the remaining 33 same-path differences as intentional authority-side changes.
3. Update all CI/deploy/current docs to the authority path.
4. Remove or explicitly archive the embedded tree outside the release.
5. Record reviewer identity/reference and the final commit/tree in `release-manifest.json`.
