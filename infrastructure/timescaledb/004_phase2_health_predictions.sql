-- Phase 2: Asset Health & Predictions
-- Idempotent migration for TimescaleDB
-- Run this on the Timescale database after 003

-- ============================================================================
-- ASSET_METRICS TABLE - Time-series metrics for assets
-- ============================================================================
CREATE TABLE IF NOT EXISTS asset_metrics (
    asset_id UUID NOT NULL,
    metric_type VARCHAR(100) NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    measured_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Hypertable for metrics
SELECT create_hypertable(
    'asset_metrics',
    by_range('measured_at', INTERVAL '1 day'),
    if_not_exists => TRUE
);

-- Indexes for metric queries
CREATE INDEX IF NOT EXISTS idx_asset_metrics_lookup ON asset_metrics (asset_id, metric_type, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_asset_metrics_type ON asset_metrics (metric_type, measured_at DESC);

-- ============================================================================
-- ASSET_FEATURES TABLE - ML features for predictive models
-- ============================================================================
CREATE TABLE IF NOT EXISTS asset_features (
    asset_id UUID NOT NULL,
    feature_type VARCHAR(100) NOT NULL,
    feature_vector JSONB NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Hypertable for features
SELECT create_hypertable(
    'asset_features',
    by_range('window_end', INTERVAL '1 day'),
    if_not_exists => TRUE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_asset_features_lookup ON asset_features (asset_id, feature_type, window_end DESC);

-- ============================================================================
-- ASSET_PREDICTIONS TABLE - ML model predictions
-- ============================================================================
CREATE TABLE IF NOT EXISTS asset_predictions (
    prediction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL,
    model_id VARCHAR(100) NOT NULL,
    prediction_type VARCHAR(50) NOT NULL,  -- 'anomaly', 'failure_risk', etc.
    score DOUBLE PRECISION NOT NULL,
    confidence DOUBLE PRECISION,
    contributing_factors JSONB DEFAULT '{}'::jsonb,
    prediction_window INTERVAL,  -- e.g., '1 hour', '24 hours'
    predicted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_until TIMESTAMPTZ
);

-- Hypertable for predictions
SELECT create_hypertable(
    'asset_predictions',
    by_range('predicted_at', INTERVAL '1 day'),
    if_not_exists => TRUE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_predictions_asset ON asset_predictions (asset_id, predicted_at DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_type ON asset_predictions (prediction_type, score DESC, predicted_at DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_valid ON asset_predictions (asset_id, valid_until) WHERE valid_until > CURRENT_TIMESTAMP;

-- ============================================================================
-- ML_MODELS TABLE - Model metadata and versioning
-- ============================================================================
CREATE TABLE IF NOT EXISTS ml_models (
    model_id VARCHAR(100) PRIMARY KEY,
    model_name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    model_type VARCHAR(50) NOT NULL,  -- 'anomaly_detection', 'failure_prediction', etc.
    training_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,  -- precision, recall, F1, etc.
    artifact_path TEXT,
    trained_at TIMESTAMPTZ NOT NULL,
    deployed_at TIMESTAMPTZ,
    retired_at TIMESTAMPTZ,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ml_models_active ON ml_models (model_type, active, deployed_at DESC);

-- ============================================================================
-- FEATURE_DRIFT_MONITORING TABLE - Track feature distribution drift
-- ============================================================================
CREATE TABLE IF NOT EXISTS feature_drift_monitoring (
    id BIGSERIAL PRIMARY KEY,
    model_id VARCHAR(100) NOT NULL,
    feature_name VARCHAR(100) NOT NULL,
    drift_score DOUBLE PRECISION NOT NULL,
    baseline_stats JSONB NOT NULL,
    current_stats JSONB NOT NULL,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    alert_threshold_exceeded BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_drift_monitoring ON feature_drift_monitoring (model_id, checked_at DESC);

-- ============================================================================
-- CONTINUOUS AGGREGATES - Health Score Components
-- ============================================================================

-- Uptime aggregate (24h rolling)
CREATE MATERIALIZED VIEW IF NOT EXISTS asset_uptime_24h
WITH (timescaledb.continuous) AS
SELECT 
    asset_id,
    time_bucket('1 hour', measured_at) AS bucket,
    AVG(CASE WHEN metric_type = 'uptime_pct' THEN value ELSE NULL END) as avg_uptime,
    COUNT(*) as sample_count
FROM asset_metrics
WHERE metric_type = 'uptime_pct'
GROUP BY asset_id, bucket
WITH NO DATA;

-- Refresh policy for uptime aggregate
SELECT add_continuous_aggregate_policy('asset_uptime_24h',
    start_offset => INTERVAL '2 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

-- Alert frequency aggregate (7d rolling)
CREATE MATERIALIZED VIEW IF NOT EXISTS asset_alert_frequency_7d
WITH (timescaledb.continuous) AS
SELECT 
    asset_id,
    time_bucket('1 day', opened_at) AS bucket,
    COUNT(*) FILTER (WHERE severity IN ('critical', 'high')) as critical_high_count,
    COUNT(*) as total_alert_count
FROM alerts
GROUP BY asset_id, bucket
WITH NO DATA;

-- Refresh policy
SELECT add_continuous_aggregate_policy('asset_alert_frequency_7d',
    start_offset => INTERVAL '8 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

-- ============================================================================
-- RETENTION POLICIES
-- ============================================================================

-- Keep metrics for 90 days (raw), aggregate to daily after 30 days
SELECT add_retention_policy('asset_metrics', INTERVAL '90 days', if_not_exists => TRUE);

-- Keep features for 30 days (they can be recomputed)
SELECT add_retention_policy('asset_features', INTERVAL '30 days', if_not_exists => TRUE);

-- Keep predictions for 90 days
SELECT add_retention_policy('asset_predictions', INTERVAL '90 days', if_not_exists => TRUE);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to compute health score (called by scheduled job)
CREATE OR REPLACE FUNCTION compute_asset_health_score(
    p_asset_id UUID,
    p_check_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
)
RETURNS DOUBLE PRECISION AS $$
DECLARE
    v_uptime_pct DOUBLE PRECISION := 0;
    v_alarm_score DOUBLE PRECISION := 0;
    v_performance_score DOUBLE PRECISION := 0;
    v_maintenance_score DOUBLE PRECISION := 0;
    v_health_score DOUBLE PRECISION;
    v_alarm_count INT;
BEGIN
    -- Uptime (40%): last 24h average
    SELECT COALESCE(AVG(value), 0) INTO v_uptime_pct
    FROM asset_metrics
    WHERE asset_id = p_asset_id
      AND metric_type = 'uptime_pct'
      AND measured_at >= p_check_time - INTERVAL '24 hours';
    
    -- Alarm frequency (30%): inverse of critical/high alert count last 7d, normalized to 0-100
    SELECT COUNT(*) INTO v_alarm_count
    FROM alerts
    WHERE asset_id = p_asset_id
      AND severity IN ('critical', 'high')
      AND opened_at >= p_check_time - INTERVAL '7 days';
    
    -- Simple inverse: 100 if 0 alarms, decrease by 10 per alarm, floor at 0
    v_alarm_score := GREATEST(0, 100 - (v_alarm_count * 10));
    
    -- Performance (20%): actual vs baseline throughput (placeholder: default 80 if no data)
    SELECT COALESCE(AVG(value), 80) INTO v_performance_score
    FROM asset_metrics
    WHERE asset_id = p_asset_id
      AND metric_type = 'performance_ratio'
      AND measured_at >= p_check_time - INTERVAL '24 hours';
    
    -- Maintenance (10%): days overdue (placeholder: default 100 if no data)
    SELECT COALESCE(100 - AVG(value) * 2, 100) INTO v_maintenance_score
    FROM asset_metrics
    WHERE asset_id = p_asset_id
      AND metric_type = 'maintenance_overdue_days'
      AND measured_at >= p_check_time - INTERVAL '7 days';
    
    -- Cap at 100
    v_maintenance_score := LEAST(100, GREATEST(0, v_maintenance_score));
    
    -- Weighted sum
    v_health_score := (v_uptime_pct * 0.4) + (v_alarm_score * 0.3) + (v_performance_score * 0.2) + (v_maintenance_score * 0.1);
    
    -- Ensure 0-100 range
    v_health_score := LEAST(100, GREATEST(0, v_health_score));
    
    RETURN v_health_score;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SAMPLE QUERIES (commented, for reference)
-- ============================================================================

-- Get current health score for an asset:
-- SELECT compute_asset_health_score('asset-uuid-here');

-- Get health score history:
-- SELECT measured_at, value as health_score, metadata
-- FROM asset_metrics
-- WHERE asset_id = 'xxx' AND metric_type = 'health_score'
-- ORDER BY measured_at DESC LIMIT 100;

-- Get latest predictions for at-risk assets:
-- SELECT asset_id, score, confidence, contributing_factors
-- FROM asset_predictions
-- WHERE prediction_type = 'failure_risk'
--   AND predicted_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
--   AND score > 0.7
-- ORDER BY score DESC;
