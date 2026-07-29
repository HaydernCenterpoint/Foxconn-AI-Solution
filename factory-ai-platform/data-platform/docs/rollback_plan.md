# TimescaleDB dual-write rollback runbook

**Last verified:** 2026-07-28

This runbook changes connector write routing only. It does not delete containers,
volumes, backups, or TimescaleDB data.

## Preconditions

- The legacy PostgreSQL database is reachable and still contains
  `machines` plus `machine_telemetry_history`.
- `LEGACY_POSTGRES_HOST`, `LEGACY_POSTGRES_PORT`, `LEGACY_POSTGRES_DB`,
  `LEGACY_POSTGRES_USER`, and `LEGACY_POSTGRES_PASSWORD` come from the
  deployment secret manager.
- The legacy database contains the same canonical machine UUIDs used by the
  connector input.
- A change owner and rollback evidence path have been assigned.

## Modes

| `DUAL_WRITE_MODE` | Telemetry destinations | Event behavior |
|---|---|---|
| `migration` | TimescaleDB only | TimescaleDB |
| `full` | TimescaleDB and legacy PostgreSQL | TimescaleDB |
| `rollback` | Legacy PostgreSQL only | Fails closed and remains queued because no legacy event sink is configured |

The Compose stack defaults to `migration`. MES is optional and runs only with
the `mes` profile.

## Rehearsal

1. Point the `LEGACY_POSTGRES_*` variables to an isolated legacy staging
   database.
2. Set `DUAL_WRITE_MODE=rollback`.
3. Render and review the resolved Compose configuration:

   ```bash
   docker compose config
   ```

4. Start only the File Watcher connector and its dependencies:

   ```bash
   docker compose up -d timescaledb file-watcher-connector
   ```

5. Import a uniquely identified CSV sample.
6. Prove the row exists in `machine_telemetry_history` and does not appear as a
   new Timescale telemetry row.
7. Restore `DUAL_WRITE_MODE=migration`, restart the connector, and prove a new
   sample reaches TimescaleDB.

Do not start ERP or MES event ingestion in `rollback` mode. Event writes fail
closed and are retained for retry/DLQ handling rather than being silently lost.

## Production rollback

1. Pause ERP/MES event connectors.
2. Verify legacy database health and available capacity.
3. Set `DUAL_WRITE_MODE=rollback` and inject the verified
   `LEGACY_POSTGRES_*` secrets.
4. Restart the File Watcher connector.
5. Run a uniquely identified telemetry probe and verify it in the legacy table.
6. Redirect read traffic only after the write proof succeeds.
7. Record timestamps, row identifiers, operator, and query evidence.

If the probe fails, stop the connector and restore the last known-good mode.
Do not decommission or delete TimescaleDB as part of the immediate rollback.

## Exit criteria

- Legacy write probe passed.
- No unresolved connector file was moved to `processed`.
- ERP/MES are paused or operating in a mode with an available event sink.
- The previous mode can be restored without changing code.
- Evidence is attached to the managed-staging gate under
  `dual-write-rollback`.
