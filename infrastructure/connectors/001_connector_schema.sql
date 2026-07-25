-- Phase 2: Data Connectors
-- Idempotent migration for PostgreSQL (operational database)
-- Run this on the main backend database

-- ============================================================================
-- CONNECTOR_DEFINITIONS TABLE - Connector configuration
-- ============================================================================
CREATE TABLE IF NOT EXISTS connector_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    connector_type VARCHAR(50) NOT NULL,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) NOT NULL DEFAULT 'system'
);

-- ============================================================================
-- CONNECTOR_STATE TABLE - Cursor/watermark persistence
-- ============================================================================
CREATE TABLE IF NOT EXISTS connector_state (
    connector_id UUID PRIMARY KEY REFERENCES connector_definitions(id) ON DELETE CASCADE,
    last_sync_at TIMESTAMPTZ,
    cursor_value TEXT,
    records_processed BIGINT NOT NULL DEFAULT 0,
    last_error TEXT,
    last_error_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- CONNECTOR_DLQ TABLE - Dead Letter Queue for failed records
-- ============================================================================
CREATE TABLE IF NOT EXISTS connector_dlq (
    id BIGSERIAL PRIMARY KEY,
    connector_id UUID NOT NULL REFERENCES connector_definitions(id) ON DELETE CASCADE,
    failed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reason VARCHAR(255) NOT NULL,
    record_data JSONB NOT NULL,
    retry_count INT NOT NULL DEFAULT 0,
    last_retry_at TIMESTAMPTZ,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    resolved_by VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_dlq_connector ON connector_dlq (connector_id, failed_at DESC);
CREATE INDEX IF NOT EXISTS idx_dlq_unresolved ON connector_dlq (connector_id, resolved, failed_at DESC) WHERE NOT resolved;

-- ============================================================================
-- ASSET_MAPPING_RULES TABLE - Map external IDs to asset_id
-- ============================================================================
CREATE TABLE IF NOT EXISTS asset_mapping_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connector_id UUID REFERENCES connector_definitions(id) ON DELETE CASCADE,
    external_system VARCHAR(100) NOT NULL,
    external_id VARCHAR(255) NOT NULL,
    asset_id UUID NOT NULL,
    mapping_type VARCHAR(50) NOT NULL DEFAULT 'exact',
    pattern_config JSONB,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (connector_id, external_system, external_id)
);

CREATE INDEX IF NOT EXISTS idx_mapping_lookup ON asset_mapping_rules (external_system, external_id, active);
