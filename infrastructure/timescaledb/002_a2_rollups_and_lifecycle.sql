-- A2 lifecycle migration for the raw telemetry hypertable created by 001.
-- Keep this migration immutable: use a new numbered migration for policy changes.

CREATE MATERIALIZED VIEW IF NOT EXISTS telemetry_points_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket(INTERVAL '1 hour', occurred_at) AS bucket,
    machine_id,
    count(*) AS point_count,
    min(sequence) AS first_sequence,
    max(sequence) AS last_sequence
FROM telemetry_points
GROUP BY bucket, machine_id
WITH NO DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS telemetry_points_daily
WITH (timescaledb.continuous) AS
SELECT
    time_bucket(INTERVAL '1 day', occurred_at) AS bucket,
    machine_id,
    count(*) AS point_count,
    min(sequence) AS first_sequence,
    max(sequence) AS last_sequence
FROM telemetry_points
GROUP BY bucket, machine_id
WITH NO DATA;

ALTER MATERIALIZED VIEW telemetry_points_hourly
    SET (timescaledb.materialized_only = false);
ALTER MATERIALIZED VIEW telemetry_points_daily
    SET (timescaledb.materialized_only = false);

SELECT add_continuous_aggregate_policy(
    'telemetry_points_hourly',
    start_offset => INTERVAL '29 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '15 minutes',
    if_not_exists => TRUE
);
SELECT add_continuous_aggregate_policy(
    'telemetry_points_daily',
    start_offset => INTERVAL '29 days',
    end_offset => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

ALTER TABLE telemetry_points SET (
    timescaledb.enable_columnstore,
    timescaledb.orderby = 'occurred_at DESC',
    timescaledb.segmentby = 'machine_id'
);
CALL add_columnstore_policy(
    'telemetry_points',
    after => INTERVAL '7 days',
    if_not_exists => TRUE
);

SELECT add_retention_policy('telemetry_points', drop_after => INTERVAL '30 days', if_not_exists => TRUE);
SELECT add_retention_policy('telemetry_points_hourly', drop_after => INTERVAL '365 days', if_not_exists => TRUE);
SELECT add_retention_policy('telemetry_points_daily', drop_after => INTERVAL '365 days', if_not_exists => TRUE);
