# TimescaleDB Migration Scripts for MKZ Factory Monitor
# Version: 1.0.0
# Target: TimescaleDB 2.x on PostgreSQL 16
# Run order: 001_base_extensions.sql -> 002_telemetry_schema.sql -> 003_policies.sql -> 004_continuous_aggregates.sql

-- ============================================================
-- MIGRATION 001: Enable TimescaleDB Extension
-- ============================================================
-- Description: Enable TimescaleDB extension and verify version
-- Prerequisite: PostgreSQL 14+, TimescaleDB 2.x installed
-- Run as: superuser or user with CREATE EXTENSION privilege

BEGIN;

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Verify TimescaleDB is loaded
SELECT extversion FROM pg_extension WHERE extname = 'timescaledb';

-- Set search_path to include timescaledb commands
SET search_path TO public, timescaledb_information, timescaledb_experimental;

COMMIT;

-- ============================================================
-- MIGRATION 002: Core Telemetry & Event Schema
-- ============================================================
-- Description: Create hypertable for telemetry + event schema
-- Adheres to shared contract:
--   telemetry: (time, asset_id, metric, value)
--   event: (event_id, timestamp, asset_id, type, severity, payload)

BEGIN;

-- ─────────────────────────────────────────────────────────
-- PART A: Telemetry Schema (TimescaleDB hypertable)
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS telemetry (
    time        TIMESTAMPTZ NOT NULL,
    asset_id    UUID NOT NULL,
    metric      VARCHAR(100) NOT NULL,
    value       DOUBLE PRECISION,
    tags        JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Hypertable with 1-day chunk interval
-- Chunks older than 30 days will be compressed
SELECT create_hypertable(
    'telemetry',
    'time',
    chunk_time_interval => INTERVAL '1 day',
    migrate_data => TRUE,
    if_not_exists => TRUE
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_telemetry_asset_metric
    ON telemetry (asset_id, metric, time DESC);

CREATE INDEX IF NOT EXISTS idx_telemetry_metric_time
    ON telemetry (metric, time DESC);

CREATE INDEX IF NOT EXISTS idx_telemetry_asset_time
    ON telemetry (asset_id, time DESC);

-- Tags GIN index for JSONB filtering
CREATE INDEX IF NOT EXISTS idx_telemetry_tags
    ON telemetry USING GIN (tags);

-- ─────────────────────────────────────────────────────────
-- PART B: Event Schema (JSONB, no hypertable needed)
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS events (
    event_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    asset_id     UUID NOT NULL,
    type         VARCHAR(100) NOT NULL,  -- e.g. 'alarm', 'status_change', 'production'
    severity     VARCHAR(20) NOT NULL DEFAULT 'info',  -- info, warning, error, critical
    payload      JSONB DEFAULT '{}',
    source       VARCHAR(50),  -- 'plc', 'erp', 'mes', 'manual'
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_asset_time
    ON events (asset_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_events_type_time
    ON events (type, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_events_severity
    ON events (severity) WHERE severity IN ('error', 'critical');

CREATE INDEX IF NOT EXISTS idx_events_payload
    ON events USING GIN (payload);

CREATE INDEX IF NOT EXISTS idx_events_timestamp
    ON events (timestamp DESC);

-- ─────────────────────────────────────────────────────────
-- PART C: Asset Reference Table (optional but useful)
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS assets (
    id          UUID PRIMARY KEY,
    name        VARCHAR(255),
    type        VARCHAR(50),  -- machine, sensor, line, plant
    parent_id   UUID REFERENCES assets(id),
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assets_parent
    ON assets (parent_id) WHERE parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assets_type
    ON assets (type);

-- Foreign key from telemetry to assets (deferrable for migration)
ALTER TABLE telemetry
    ADD CONSTRAINT fk_telemetry_asset
    FOREIGN KEY (asset_id) REFERENCES assets(id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE events
    ADD CONSTRAINT fk_events_asset
    FOREIGN KEY (asset_id) REFERENCES assets(id)
    DEFERRABLE INITIALLY DEFERRED;

-- ─────────────────────────────────────────────────────────
-- PART D: Migration Tracking Table
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS _migration_progress (
    step        VARCHAR(50) PRIMARY KEY,
    applied_at  TIMESTAMPTZ DEFAULT NOW(),
    status      VARCHAR(20) DEFAULT 'applied',
    details     JSONB DEFAULT '{}'
);

INSERT INTO _migration_progress (step, status)
VALUES ('002_telemetry_schema', 'applied')
ON CONFLICT (step) DO NOTHING;

COMMIT;

-- ============================================================
-- MIGRATION 003: Compression & Retention Policies
-- ============================================================
-- Target: >80% storage reduction on compressed chunks

BEGIN;

-- Mark step as applied
INSERT INTO _migration_progress (step, status)
VALUES ('003_policies', 'applied')
ON CONFLICT (step) DO NOTHING;

COMMIT;

-- ─────────────────────────────────────────────────────────
-- PART A: Compression Policy
-- Chunk interval 1 day, compress after 7 days (recent data stays uncompressed)
-- ─────────────────────────────────────────────────────────

SELECT add_compression_policy(
    'telemetry',
    INTERVAL '7 days',
    if_not_exists => TRUE
);

-- Use segmentby for asset_id + metric (common query pattern)
ALTER TABLE telemetry SET (
    timescaledb.compression,
    timescaledb.compression.segmentby = 'asset_id, metric',
    timescaledb.compression.orderby = 'time DESC'
);

-- ─────────────────────────────────────────────────────────
-- PART B: Retention Policy
-- Keep raw data 30 days, drop older chunks
-- ─────────────────────────────────────────────────────────

SELECT add_retention_policy(
    'telemetry',
    INTERVAL '30 days',
    if_not_exists => TRUE
);

-- Events retention: 1 year (longer for compliance)
SELECT add_retention_policy(
    'events',
    INTERVAL '1 year',
    if_not_exists => TRUE
);

-- ─────────────────────────────────────────────────────────
-- PART C: Reorder Policy (keep hot chunks optimized)
-- ─────────────────────────────────────────────────────────

SELECT add_reorder_policy(
    'telemetry',
    'idx_telemetry_asset_metric',
    if_not_exists => TRUE
);

COMMIT;

-- ============================================================
-- MIGRATION 004: Continuous Aggregates
-- ============================================================
-- Pre-compute hourly and daily rollups for fast dashboards

BEGIN;

INSERT INTO _migration_progress (step, status)
VALUES ('004_continuous_aggregates', 'applied')
ON CONFLICT (step) DO NOTHING;

COMMIT;

-- ─────────────────────────────────────────────────────────
-- PART A: Hourly Rollup (5-minute granularity)
-- ─────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS telemetry_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    asset_id,
    metric,
    COUNT(*)       AS count,
    AVG(value)     AS avg_value,
    MIN(value)     AS min_value,
    MAX(value)     AS max_value,
    STDDEV(value)  AS stddev_value,
    -- Percentiles using ordered set aggregate
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY value) AS p50,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY value) AS p95,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY value) AS p99
FROM telemetry
GROUP BY 1, 2, 3
WITH NO DATA;

-- Refresh policy: continuous, 1 hour lag
SELECT add_continuous_aggregate_policy(
    'telemetry_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset   => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

-- Create indexes on the materialized view
CREATE INDEX IF NOT EXISTS idx_telemetry_hourly_asset_metric
    ON telemetry_hourly (asset_id, metric, bucket DESC);

CREATE INDEX IF NOT EXISTS idx_telemetry_hourly_bucket
    ON telemetry_hourly (bucket DESC);

-- ─────────────────────────────────────────────────────────
-- PART B: Daily Rollup (hourly granularity)
-- ─────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS telemetry_daily
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) AS bucket,
    asset_id,
    metric,
    COUNT(*)       AS count,
    AVG(value)     AS avg_value,
    MIN(value)     AS min_value,
    MAX(value)     AS max_value,
    STDDEV(value)  AS stddev_value,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY value) AS p50,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY value) AS p95,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY value) AS p99,
    -- Additional daily stats
    SUM(value)     AS sum_value,
    -- First/last values
    FIRST(value, time) AS first_value,
    LAST(value, time)  AS last_value
FROM telemetry
GROUP BY 1, 2, 3
WITH NO DATA;

SELECT add_continuous_aggregate_policy(
    'telemetry_daily',
    start_offset => INTERVAL '3 days',
    end_offset   => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_telemetry_daily_asset_metric
    ON telemetry_daily (asset_id, metric, bucket DESC);

CREATE INDEX IF NOT EXISTS idx_telemetry_daily_bucket
    ON telemetry_daily (bucket DESC);

-- Retention for aggregates: 1 year
SELECT add_retention_policy(
    'telemetry_hourly',
    INTERVAL '1 year',
    if_not_exists => TRUE
);

SELECT add_retention_policy(
    'telemetry_daily',
    INTERVAL '1 year',
    if_not_exists => TRUE
);

-- ─────────────────────────────────────────────────────────
-- PART C: Event Aggregates by Severity (for dashboard)
-- ─────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS events_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', timestamp) AS bucket,
    type,
    severity,
    COUNT(*) AS event_count,
    COUNT(DISTINCT asset_id) AS unique_assets
FROM events
GROUP BY 1, 2, 3
WITH NO DATA;

SELECT add_continuous_aggregate_policy(
    'events_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset   => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_events_hourly_bucket
    ON events_hourly (bucket DESC);

CREATE INDEX IF NOT EXISTS idx_events_hourly_severity
    ON events_hourly (severity, bucket DESC);

COMMIT;

-- ============================================================
-- VERIFICATION QUERIES (run after migrations)
-- ============================================================

-- Check hypertable
-- SELECT * FROM timescaledb_information.hypertables WHERE hypertable_name = 'telemetry';

-- Check compression stats
-- SELECT * FROM timescaledb_information.compression_stats WHERE hypertable_name = 'telemetry';

-- Check continuous aggregates
-- SELECT * FROM timescaledb_information.continuous_aggregates;

-- Check policies
-- SELECT * FROM timescaledb_information.jobs WHERE application_name LIKE '%policy%';
