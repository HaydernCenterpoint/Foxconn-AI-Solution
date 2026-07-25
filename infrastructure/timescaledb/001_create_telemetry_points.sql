-- Idempotent TimescaleDB migration for the raw, append-only telemetry stream.
-- Apply to the Timescale target database, not the primary operations database.

CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS telemetry_points (
    occurred_at TIMESTAMPTZ NOT NULL,
    source_id BIGINT NOT NULL,
    machine_id UUID NOT NULL,
    sequence BIGINT NOT NULL,
    raw_json JSONB NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (occurred_at, source_id)
);

SELECT create_hypertable(
    'telemetry_points',
    by_range('occurred_at', INTERVAL '1 day'),
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_telemetry_points_machine_time
    ON telemetry_points (machine_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS telemetry_backfill_progress (
    stream VARCHAR(100) PRIMARY KEY,
    last_source_id BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
