# Operations schema inventory

Captured from baseline commit `79e2fc7e72c02904599478c207f5c7b36ec54965`.

## Effective authority before WP2

- `backend/Services/DatabaseService.cs` performs constructor-time DDL, data
  compatibility updates, trigger creation and simulation-config seeding.
- `backend/db/init.sql` is a historical `pg_dump` data fixture. It contains no
  `CREATE TABLE`, `ALTER TABLE`, index, function or trigger authority.
- `backend/Services/TimescaleTelemetryService.cs` owns a separate Timescale
  lineage and must not be folded into the Operations migration ledger.

## Known conflicts

- `telemetry_data` is declared twice with incompatible constraint/index shapes.
- `event_log` is declared twice with incompatible defaults/index shapes.
- Runtime construction can mutate schema before a read-only preflight has
  proven the expected migration head.

WP2 must preserve existing data, converge clean install and supported upgrade
to the same catalog fingerprint, and remove constructor-time DDL.
