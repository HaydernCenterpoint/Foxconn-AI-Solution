-- ============================================================================
-- TimescaleDB Benchmark Suite — Factory AI Platform
-- Tests hypertable performance for telemetry, events, alerts, health, predictions
-- Run against the Timescale database (port 55433).
-- Write-throughput measurements run inside transactions and are rolled back, so
-- EXPLAIN ANALYZE does not retain benchmark-only rows.
-- ============================================================================

\set ON_ERROR_STOP on
\timing on
\echo '============================================================'
\echo '  Factory AI — TimescaleDB Benchmark Suite'
\echo '============================================================'

-- ============================================================================
-- 0. SEED DATA (idempotent — skip if already populated)
-- ============================================================================
\echo ''
\echo '>>> Phase 0: Seeding benchmark data...'

DO $$
DECLARE
  v_count BIGINT;
  v_events_seeded BOOLEAN;
  v_alerts_seeded BOOLEAN;
  v_metrics_seeded BOOLEAN;
  v_predictions_seeded BOOLEAN;
  v_asset_ids UUID[] := ARRAY[
    'a0000000-0000-0000-0000-000000000001'::UUID,
    'a0000000-0000-0000-0000-000000000002'::UUID,
    'a0000000-0000-0000-0000-000000000003'::UUID,
    'a0000000-0000-0000-0000-000000000004'::UUID,
    'a0000000-0000-0000-0000-000000000005'::UUID
  ];
  v_machine_ids UUID[] := ARRAY[
    'b0000000-0000-0000-0000-000000000001'::UUID,
    'b0000000-0000-0000-0000-000000000002'::UUID,
    'b0000000-0000-0000-0000-000000000003'::UUID
  ];
  v_severities TEXT[] := ARRAY['critical','high','medium','low'];
  v_event_types TEXT[] := ARRAY['threshold_breach','pattern_anomaly','rate_change','missing_heartbeat'];
BEGIN
  SELECT count(*) INTO v_count
  FROM telemetry_points
  WHERE source_id BETWEEN 9000001 AND 9100000;

  IF v_count < 100000 THEN
    RAISE NOTICE 'Seeding 100K telemetry points...';
    INSERT INTO telemetry_points (occurred_at, source_id, machine_id, sequence, raw_json)
    SELECT
      NOW() - (g * INTERVAL '1 second'),
      9000000 + g,
      v_machine_ids[1 + (g % 3)],
      g,
      jsonb_build_object(
        'temperature', 20 + random() * 60,
        'vibration', random() * 10,
        'pressure', 90 + random() * 30,
        'current', 5 + random() * 20
      )
    FROM generate_series(1, 100000) AS g
    ON CONFLICT (occurred_at, source_id) DO NOTHING;
  ELSE
    RAISE NOTICE '100K telemetry benchmark rows already present.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM events
    WHERE source = 'timescale-benchmark'
  ) INTO v_events_seeded;
  IF NOT v_events_seeded THEN
    RAISE NOTICE 'Seeding 10K events...';
    INSERT INTO events (occurred_at, asset_id, event_type, severity, source, payload)
    SELECT
      NOW() - (g * INTERVAL '10 seconds'),
      v_asset_ids[1 + (g % 5)],
      v_event_types[1 + (g % 4)],
      v_severities[1 + (g % 4)],
      'timescale-benchmark',
      jsonb_build_object('metric', 'temperature', 'value', 50 + random() * 50, 'threshold', 80)
    FROM generate_series(1, 10000) AS g;
  ELSE
    RAISE NOTICE 'Benchmark events already present.';
  END IF;

  SELECT count(*) >= 2000 INTO v_alerts_seeded
  FROM alerts
  WHERE rule_id = 'timescale-benchmark';
  IF NOT v_alerts_seeded THEN
    RAISE NOTICE 'Seeding missing benchmark alerts...';
    INSERT INTO alerts (event_id, asset_id, rule_id, opened_at, status, severity, title, description)
    SELECT
      e.event_id,
      e.asset_id,
      'timescale-benchmark',
      e.occurred_at,
      CASE e.rn % 4 WHEN 0 THEN 'open' WHEN 1 THEN 'acknowledged' WHEN 2 THEN 'resolved' ELSE 'open' END,
      e.severity,
      'Benchmark alert #' || e.rn,
      'Auto-generated benchmark alert for performance testing'
    FROM (
      SELECT event_id, asset_id, severity, occurred_at,
             ROW_NUMBER() OVER (ORDER BY occurred_at DESC) AS rn
      FROM events
      WHERE source = 'timescale-benchmark'
      ORDER BY occurred_at DESC
      OFFSET (SELECT count(*) FROM alerts WHERE rule_id = 'timescale-benchmark')
      LIMIT 2000
    ) e;
  ELSE
    RAISE NOTICE '2K benchmark alerts already present.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM asset_metrics
    WHERE metadata->>'source' = 'timescale-benchmark'
  ) INTO v_metrics_seeded;
  IF NOT v_metrics_seeded THEN
    RAISE NOTICE 'Seeding 50K asset metrics...';
    INSERT INTO asset_metrics (asset_id, metric_type, value, metadata, measured_at)
    SELECT
      v_asset_ids[1 + (g % 5)],
      CASE g % 4
        WHEN 0 THEN 'uptime_pct'
        WHEN 1 THEN 'performance_ratio'
        WHEN 2 THEN 'maintenance_overdue_days'
        ELSE 'health_score'
      END,
      CASE g % 4
        WHEN 0 THEN 85 + random() * 15
        WHEN 1 THEN 70 + random() * 30
        WHEN 2 THEN floor(random() * 30)
        ELSE 60 + random() * 40
      END,
      '{"source":"timescale-benchmark"}'::jsonb,
      NOW() - (g * INTERVAL '2 seconds')
    FROM generate_series(1, 50000) AS g;
  ELSE
    RAISE NOTICE 'Benchmark metrics already present.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM asset_predictions
    WHERE model_id = 'timescale-benchmark'
  ) INTO v_predictions_seeded;
  IF NOT v_predictions_seeded THEN
    RAISE NOTICE 'Seeding 5K predictions...';
    INSERT INTO asset_predictions (asset_id, model_id, prediction_type, score, confidence, contributing_factors, prediction_window, valid_until)
    SELECT
      v_asset_ids[1 + (g % 5)],
      'timescale-benchmark',
      CASE g % 2 WHEN 0 THEN 'anomaly' ELSE 'failure_risk' END,
      random(),
      0.5 + random() * 0.5,
      '["temperature_spike","vibration_increase"]'::jsonb,
      INTERVAL '1 hour',
      NOW() + INTERVAL '1 hour'
    FROM generate_series(1, 5000) AS g;
  ELSE
    RAISE NOTICE 'Benchmark predictions already present.';
  END IF;

  RAISE NOTICE 'Benchmark seed verification completed.';
END;
$$;

-- ============================================================================
-- 1. TELEMETRY QUERIES
-- ============================================================================
\echo ''
\echo '>>> Benchmark 1: Telemetry Point Queries'

\echo '  1a. Latest 100 points for a machine (index scan):'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT occurred_at, raw_json->'temperature' AS temp, raw_json->'vibration' AS vib
FROM telemetry_points
WHERE machine_id = 'b0000000-0000-0000-0000-000000000001'
ORDER BY occurred_at DESC
LIMIT 100;

\echo '  1b. Hourly aggregation last 24h (continuous aggregate):'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT bucket, point_count
FROM telemetry_points_hourly
WHERE machine_id = 'b0000000-0000-0000-0000-000000000001'
  AND bucket >= NOW() - INTERVAL '24 hours'
ORDER BY bucket DESC;

\echo '  1c. Time-range scan — last 1 hour raw points count:'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT count(*)
FROM telemetry_points
WHERE occurred_at >= NOW() - INTERVAL '1 hour';

\echo '  1d. Cross-machine comparison (last 6h avg temperature):'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT machine_id,
       AVG((raw_json->>'temperature')::numeric) AS avg_temp,
       MAX((raw_json->>'temperature')::numeric) AS max_temp,
       COUNT(*) AS samples
FROM telemetry_points
WHERE occurred_at >= NOW() - INTERVAL '6 hours'
GROUP BY machine_id;

-- ============================================================================
-- 2. EVENTS & ALERTS
-- ============================================================================
\echo ''
\echo '>>> Benchmark 2: Event & Alert Queries'

\echo '  2a. Open alerts by severity (partial index):'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT alert_id, asset_id, severity, title, opened_at
FROM alerts
WHERE status = 'open'
ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         opened_at DESC
LIMIT 50;

\echo '  2b. Alert stats — open counts by severity (last 7d):'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT severity, count(*) AS cnt
FROM alerts
WHERE status = 'open' AND opened_at >= NOW() - INTERVAL '7 days'
GROUP BY severity;

\echo '  2c. Alert timeline for asset (index scan):'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT alert_id, severity, title, opened_at, closed_at, status
FROM alerts
WHERE asset_id = 'a0000000-0000-0000-0000-000000000001'
ORDER BY opened_at DESC
LIMIT 20;

\echo '  2d. Event rate per hour (time_bucket):'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT time_bucket('1 hour', occurred_at) AS hour_bucket,
       event_type,
       count(*) AS event_count
FROM events
WHERE occurred_at >= NOW() - INTERVAL '24 hours'
GROUP BY hour_bucket, event_type
ORDER BY hour_bucket DESC, event_count DESC;

-- ============================================================================
-- 3. HEALTH SCORES
-- ============================================================================
\echo ''
\echo '>>> Benchmark 3: Health Score Queries'

\echo '  3a. Compute health score (PL/pgSQL function):'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT compute_asset_health_score('a0000000-0000-0000-0000-000000000001');

\echo '  3b. Health score history (metric lookup):'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT measured_at, value AS health_score
FROM asset_metrics
WHERE asset_id = 'a0000000-0000-0000-0000-000000000001'
  AND metric_type = 'health_score'
  AND measured_at >= NOW() - INTERVAL '7 days'
ORDER BY measured_at DESC;

\echo '  3c. All assets uptime average (continuous aggregate):'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT asset_id, AVG(avg_uptime) AS avg_uptime_24h
FROM asset_uptime_24h
WHERE bucket >= NOW() - INTERVAL '24 hours'
GROUP BY asset_id
ORDER BY avg_uptime_24h ASC;

\echo '  3d. Alert frequency aggregate (7d rolling):'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT asset_id,
       SUM(critical_high_count) AS total_critical_high,
       SUM(total_alert_count) AS total_alerts
FROM asset_alert_frequency_7d
WHERE bucket >= NOW() - INTERVAL '7 days'
GROUP BY asset_id
ORDER BY total_critical_high DESC;

-- ============================================================================
-- 4. PREDICTIONS
-- ============================================================================
\echo ''
\echo '>>> Benchmark 4: Prediction Queries'

\echo '  4a. High-risk assets (score > 0.7, last 1h):'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT asset_id, score, confidence, contributing_factors
FROM asset_predictions
WHERE prediction_type = 'failure_risk'
  AND predicted_at >= NOW() - INTERVAL '1 hour'
  AND score > 0.7
ORDER BY score DESC;

\echo '  4b. Anomaly detection results for asset:'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT prediction_id, score, confidence, predicted_at
FROM asset_predictions
WHERE asset_id = 'a0000000-0000-0000-0000-000000000002'
  AND prediction_type = 'anomaly'
ORDER BY predicted_at DESC
LIMIT 20;

\echo '  4c. Feature drift monitoring scan:'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT model_id, feature_name, drift_score, alert_threshold_exceeded
FROM feature_drift_monitoring
WHERE checked_at >= NOW() - INTERVAL '24 hours'
  AND alert_threshold_exceeded = TRUE
ORDER BY drift_score DESC;

-- ============================================================================
-- 5. WRITE THROUGHPUT
-- ============================================================================
\echo ''
\echo '>>> Benchmark 5: Write Throughput'

\echo '  5a. Bulk insert 10K telemetry points (simulates 10s burst at 1K/s; rolled back):'
BEGIN;
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
INSERT INTO telemetry_points (occurred_at, source_id, machine_id, sequence, raw_json)
SELECT
  NOW() - (g * INTERVAL '1 millisecond'),
  90000000 + g,
  'b0000000-0000-0000-0000-000000000001'::UUID,
  90000000 + g,
  '{"temperature":72.5,"vibration":3.2,"pressure":101.3}'::jsonb
FROM generate_series(1, 10000) AS g;
ROLLBACK;

\echo '  5b. Bulk insert 1K events (rolled back):'
BEGIN;
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
INSERT INTO events (occurred_at, asset_id, event_type, severity, payload)
SELECT
  NOW() - (g * INTERVAL '100 milliseconds'),
  'a0000000-0000-0000-0000-000000000001'::UUID,
  'threshold_breach',
  CASE g % 4 WHEN 0 THEN 'critical' WHEN 1 THEN 'high' WHEN 2 THEN 'medium' ELSE 'low' END,
  '{"metric":"temperature","value":95.0,"threshold":80}'::jsonb
FROM generate_series(1, 1000) AS g;
ROLLBACK;

-- ============================================================================
-- 6. DATA SIZE & COMPRESSION
-- ============================================================================
\echo ''
\echo '>>> Benchmark 6: Data Size & Compression Stats'

SELECT
  hypertable_name,
  pg_size_pretty(hypertable_size(format('%I.%I', hypertable_schema, hypertable_name)::regclass)) AS total_size,
  pg_size_pretty(pg_total_relation_size(format('%I.%I', hypertable_schema, hypertable_name)::regclass)) AS total_with_indexes,
  num_chunks
FROM timescaledb_information.hypertables
ORDER BY hypertable_name;

\echo ''
\echo '  Columnstore policy status:'
SELECT
  hypertable_name,
  proc_name,
  schedule_interval,
  config
FROM timescaledb_information.jobs
WHERE proc_name = 'policy_compression'
   OR proc_name = 'policy_columnstore'
ORDER BY hypertable_name, proc_name;

\echo '  Columnstore chunk status:'
SELECT
  hypertable_name,
  chunk_name,
  pg_size_pretty(pg_total_relation_size(format('%I.%I', chunk_schema, chunk_name)::regclass)) AS total_with_indexes
FROM timescaledb_information.chunks
WHERE is_compressed = TRUE
ORDER BY hypertable_name, chunk_name
LIMIT 20;

\echo ''
\echo '  Continuous aggregate status:'
SELECT
  view_name,
  materialization_hypertable_name
FROM timescaledb_information.continuous_aggregates;

-- ============================================================================
-- 7. SUMMARY
-- ============================================================================
\echo ''
\echo '============================================================'
\echo '  Benchmark Complete'
\echo '============================================================'

SELECT
  'telemetry_points' AS table_name,
  count(*) AS row_count
FROM telemetry_points
UNION ALL
SELECT 'events', count(*) FROM events
UNION ALL
SELECT 'alerts', count(*) FROM alerts
UNION ALL
SELECT 'asset_metrics', count(*) FROM asset_metrics
UNION ALL
SELECT 'asset_predictions', count(*) FROM asset_predictions
ORDER BY table_name;

\echo ''
\echo 'Run with: psql -h localhost -p 55433 -U postgres -d plc_timescale -f benchmark.sql'
