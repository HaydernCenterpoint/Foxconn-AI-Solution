# ADR-002 — Operations database schema authority

Status: proposed; external architecture/release approval pending.

## Decision

`backend/db/migrations/` becomes the only Operations PostgreSQL schema
authority. Each immutable migration has a version, name and SHA-256 recorded in
`schema_migrations`. The explicit `--database-migrate` command applies changes;
normal application startup and `--database-preflight` are read-only and fail
closed when the migration head or checksum is missing or has drifted.

Existing databases may be baselined only after their catalog fingerprint
matches an explicitly supported fingerprint. Unknown schemas are never marked
migrated automatically.

Rollback uses expand/contract and forward recovery. A down migration is allowed
only when a dedicated test proves it does not destroy retained data.

Timescale, connector and Open Data Fusion databases remain separate migration
lineages and are not included in the Operations schema fingerprint.

## Approval

No approval identity or reference has been supplied. Gate G0 remains NO-GO
until `schema-decision.json` records authorized approvers, an approval time and
an immutable approval reference.
