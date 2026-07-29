-- Phase 2: CEP & Alerting - Event and Alert Persistence
-- Idempotent migration for TimescaleDB
-- Run this on the Timescale database after 001 and 002

-- ============================================================================
-- EVENTS TABLE - Raw events from CEP engine
-- ============================================================================
CREATE TABLE IF NOT EXISTS events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at TIMESTAMPTZ NOT NULL,
    asset_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
    source VARCHAR(100) NOT NULL DEFAULT 'cep-engine',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Events stay as a regular table so event_id remains a stable FK target.
-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_events_asset_time ON events (asset_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_type_time ON events (event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_severity_time ON events (severity, occurred_at DESC);

-- ============================================================================
-- ALERTS TABLE - Managed alerts with lifecycle
-- ============================================================================
CREATE TABLE IF NOT EXISTS alerts (
    alert_id UUID NOT NULL DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    asset_id UUID NOT NULL,
    rule_id VARCHAR(100) NOT NULL,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'suppressed')),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
    title TEXT NOT NULL,
    description TEXT,
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    acknowledged_by VARCHAR(100),
    acknowledged_at TIMESTAMPTZ,
    resolved_by VARCHAR(100),
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    suppression_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (alert_id, opened_at)
);

-- Hypertable for alerts
SELECT create_hypertable(
    'alerts',
    by_range('opened_at', INTERVAL '1 day'),
    if_not_exists => TRUE
);

-- Indexes for alert queries
CREATE INDEX IF NOT EXISTS idx_alerts_asset_status ON alerts (asset_id, status, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_status_severity ON alerts (status, severity, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_rule ON alerts (rule_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_open ON alerts (opened_at DESC) WHERE status = 'open';

-- ============================================================================
-- ALERT_HISTORY TABLE - Audit trail for alert state changes
-- ============================================================================
CREATE TABLE IF NOT EXISTS alert_history (
    id BIGSERIAL PRIMARY KEY,
    alert_id UUID NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    changed_by VARCHAR(100),
    old_status VARCHAR(20),
    new_status VARCHAR(20) NOT NULL,
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_alert_history_alert ON alert_history (alert_id, changed_at DESC);

-- ============================================================================
-- ALERT_DEDUPLICATION TABLE - Track deduplication windows
-- ============================================================================
CREATE TABLE IF NOT EXISTS alert_deduplication (
    id BIGSERIAL PRIMARY KEY,
    asset_id UUID NOT NULL,
    rule_id VARCHAR(100) NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    alert_count INT NOT NULL DEFAULT 1,
    last_alert_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (asset_id, rule_id, window_start)
);

CREATE INDEX IF NOT EXISTS idx_dedup_lookup ON alert_deduplication (asset_id, rule_id, window_end DESC);

-- ============================================================================
-- ALERT_SUPPRESSION_RULES TABLE - Maintenance windows and suppression config
-- ============================================================================
CREATE TABLE IF NOT EXISTS alert_suppression_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    asset_id UUID,  -- NULL means global
    rule_id VARCHAR(100),  -- NULL means all rules for asset
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    reason TEXT NOT NULL,
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_suppression_lookup ON alert_suppression_rules (asset_id, active, start_time, end_time);

-- ============================================================================
-- RETENTION POLICIES
-- ============================================================================
-- Keep alerts for 1 year (they are lightweight)
SELECT add_retention_policy('alerts', INTERVAL '365 days', if_not_exists => TRUE);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to check if an alert should be suppressed
CREATE OR REPLACE FUNCTION check_alert_suppression(
    p_asset_id UUID,
    p_rule_id VARCHAR,
    p_check_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
)
RETURNS BOOLEAN AS $$
DECLARE
    v_suppressed BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM alert_suppression_rules
        WHERE active = TRUE
          AND (asset_id IS NULL OR asset_id = p_asset_id)
          AND (rule_id IS NULL OR rule_id = p_rule_id)
          AND p_check_time >= start_time
          AND p_check_time <= end_time
    ) INTO v_suppressed;
    
    RETURN v_suppressed;
END;
$$ LANGUAGE plpgsql;

-- Function to update alert updated_at on changes
CREATE OR REPLACE FUNCTION update_alert_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trg_alerts_update_timestamp ON alerts;
CREATE TRIGGER trg_alerts_update_timestamp
    BEFORE UPDATE ON alerts
    FOR EACH ROW
    EXECUTE FUNCTION update_alert_timestamp();

-- ============================================================================
-- SAMPLE QUERIES (commented, for reference)
-- ============================================================================

-- Get open alerts by severity:
-- SELECT alert_id, asset_id, severity, title, opened_at
-- FROM alerts
-- WHERE status = 'open'
-- ORDER BY severity DESC, opened_at DESC;

-- Get alert history for specific alert:
-- SELECT * FROM alert_history
-- WHERE alert_id = 'xxx'
-- ORDER BY changed_at DESC;

-- Check if new alert should be deduplicated (5 min window):
-- SELECT last_alert_id FROM alert_deduplication
-- WHERE asset_id = 'xxx' AND rule_id = 'yyy'
--   AND window_end >= CURRENT_TIMESTAMP - INTERVAL '5 minutes'
-- ORDER BY window_end DESC LIMIT 1;
