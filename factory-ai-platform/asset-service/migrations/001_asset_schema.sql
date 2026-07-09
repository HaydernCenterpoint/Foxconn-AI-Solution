-- ================================================================
-- MKZ Factory Monitor — Asset Schema Migration
-- Sprint C1: Asset Modeling & Digital Twin Foundation
-- =================================================================
-- BLOCKING ITEM: All other agents (A/B/D) depend on asset_id schema
-- Published: 2026-07-09
-- =================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =================================================================
-- ASSET TYPES
-- =================================================================
-- plant     : Top-level factory/plant
-- line      : Assembly/production line within a plant
-- machine   : Individual machine/equipment
-- sensor    : IoT sensor attached to a machine
-- =================================================================

CREATE TYPE asset_type AS ENUM ('plant', 'line', 'machine', 'sensor');

CREATE TYPE asset_status AS ENUM ('active', 'inactive', 'maintenance', 'decommissioned');

-- =================================================================
-- CORE: assets table
-- The asset_id (UUID) is THE BLOCKING CONTRACT for all other agents.
-- Telemetry and Events will reference this asset_id.
-- =================================================================
CREATE TABLE assets (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255) NOT NULL,
    type            asset_type   NOT NULL,
    parent_id       UUID         REFERENCES assets(id) ON DELETE SET NULL,
    status          asset_status NOT NULL DEFAULT 'active',

    -- Hierarchical path for efficient tree queries (e.g., 'MKZ-Plant/LS18/Press-001')
    path            VARCHAR(1000),

    -- Asset classification
    external_id     VARCHAR(255) UNIQUE,  -- Legacy code (e.g., machineCode, lineCode)
    manufacturer    VARCHAR(255),
    model_number    VARCHAR(255),
    serial_number   VARCHAR(255),

    -- Physical location
    location_zone   VARCHAR(100),
    location_area   VARCHAR(100),

    -- Flexible metadata (JSONB) for type-specific data
    -- Plant: {capacity, year_built, address, ...}
    -- Line: {cycle_time, target_output, shift_config, ...}
    -- Machine: {power_rating, spindle_hours, last_calibration, ...}
    -- Sensor: {sensor_type, unit, min_value, max_value, calibration_curve, ...}
    metadata        JSONB        NOT NULL DEFAULT '{}',

    -- Operational tags for filtering
    tags            TEXT[]       DEFAULT '{}',

    -- Timestamps
    installed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- Audit
    created_by      UUID,
    updated_by      UUID,

    CONSTRAINT valid_parent_type CHECK (
        CASE
            WHEN type = 'plant'     THEN parent_id IS NULL
            WHEN type = 'line'      THEN parent_id IS NOT NULL
            WHEN type = 'machine'   THEN parent_id IS NOT NULL
            WHEN type = 'sensor'    THEN parent_id IS NOT NULL
            ELSE TRUE
        END
    )
);

COMMENT ON TABLE assets IS 'Asset hierarchy: Plant → Line → Machine → Sensor';
COMMENT ON COLUMN assets.id          IS 'PRIMARY KEY — asset_id UUID. SHARED CONTRACT: All telemetry/events reference this. Published to agents A/B/D on 2026-07-09.';
COMMENT ON COLUMN assets.type        IS 'Asset type enum: plant, line, machine, sensor';
COMMENT ON COLUMN assets.parent_id    IS 'FK to assets(id). Null only for plant (root).';
COMMENT ON COLUMN assets.path        IS 'Materialized path for fast tree traversal. Format: root/parent1/parent2/...';
COMMENT ON COLUMN assets.external_id  IS 'Legacy code mapping (e.g., machineCode from PLC). Used for data migration compatibility.';
COMMENT ON COLUMN assets.metadata    IS 'Flexible JSONB for type-specific attributes. Structure varies by asset type.';

-- =================================================================
-- INDEXES for assets
-- =================================================================
CREATE INDEX idx_assets_parent_id     ON assets(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_assets_type           ON assets(type);
CREATE INDEX idx_assets_status        ON assets(status);
CREATE INDEX idx_assets_external_id   ON assets(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_assets_path          ON assets(path varchar_pattern_ops);
CREATE INDEX idx_assets_tags          ON assets USING GIN(tags);
CREATE INDEX idx_assets_metadata      ON assets USING GIN(metadata);
CREATE INDEX idx_assets_created_at    ON assets(created_at DESC);

-- =================================================================
-- ASSET RELATIONSHIPS (non-hierarchical)
-- =================================================================
-- Captures additional relationships beyond parent-child:
-- - Machine A is upstream of Machine B
-- - Sensor X monitors Machine Y (beyond simple parent-child)
-- - Spare part relationships
-- =================================================================
CREATE TABLE asset_relationships (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id        UUID        NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    related_asset_id UUID       NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    relationship_type VARCHAR(100) NOT NULL,
    description     TEXT,
    metadata        JSONB       NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT no_self_reference CHECK (asset_id != related_asset_id),
    CONSTRAINT unique_asset_relationship UNIQUE (asset_id, related_asset_id, relationship_type)
);

COMMENT ON TABLE asset_relationships IS 'Non-hierarchical relationships between assets (upstream/downstream, monitors, spare_parts, etc.)';

CREATE INDEX idx_asset_rel_asset_id        ON asset_relationships(asset_id);
CREATE INDEX idx_asset_rel_related_asset  ON asset_relationships(related_asset_id);
CREATE INDEX idx_asset_rel_type            ON asset_relationships(relationship_type);

-- =================================================================
-- ASSET DOCUMENTS (link documents to assets via pgvector)
-- =================================================================
-- Uses existing document_service document IDs (doc-uuid format)
-- Relationship types: manual, drawing, warranty, certificate, report, specification
-- =================================================================
CREATE TABLE asset_documents (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id        UUID        NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    document_id     VARCHAR(255) NOT NULL,
    relationship    VARCHAR(50)  NOT NULL DEFAULT 'related',
    title           VARCHAR(500),
    version         VARCHAR(50),
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    uploaded_by     UUID,

    CONSTRAINT unique_asset_document UNIQUE (asset_id, document_id)
);

COMMENT ON TABLE asset_documents IS 'Links pgvector documents to assets. document_id references document-service.';
CREATE INDEX idx_asset_doc_asset_id   ON asset_documents(asset_id);
CREATE INDEX idx_asset_doc_document   ON asset_documents(document_id);

-- =================================================================
-- ASSET METRICS (historical health & performance data)
-- =================================================================
-- Stores computed health scores, uptime, alarm counts
-- Updated every 15 minutes by the health score job
-- =================================================================
CREATE TABLE asset_metrics (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id        UUID        NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    metric_name     VARCHAR(100) NOT NULL,
    metric_value    DOUBLE PRECISION,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_asset_metric_time UNIQUE (asset_id, metric_name, recorded_at)
);

COMMENT ON TABLE asset_metrics IS 'Historical computed metrics per asset (health_score, uptime_pct, alarm_count, etc.)';

CREATE INDEX idx_asset_metrics_asset_id  ON asset_metrics(asset_id);
CREATE INDEX idx_asset_metrics_name     ON asset_metrics(metric_name);
CREATE INDEX idx_asset_metrics_time      ON asset_metrics(recorded_at DESC);
CREATE INDEX idx_asset_metrics_asset_time ON asset_metrics(asset_id, recorded_at DESC);

-- =================================================================
-- TRIGGER: auto-update updated_at
-- =================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_assets_updated_at
    BEFORE UPDATE ON assets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =================================================================
-- TRIGGER: auto-update materialized path on insert/update
-- =================================================================
CREATE OR REPLACE FUNCTION compute_asset_path()
RETURNS TRIGGER AS $$
DECLARE
    parent_path VARCHAR(1000);
BEGIN
    IF NEW.parent_id IS NULL THEN
        NEW.path = NEW.name;
    ELSE
        SELECT path INTO parent_path FROM assets WHERE id = NEW.parent_id;
        NEW.path = COALESCE(parent_path || '/' || NEW.name, NEW.name);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_assets_path
    BEFORE INSERT OR UPDATE OF name, parent_id ON assets
    FOR EACH ROW EXECUTE FUNCTION compute_asset_path();

-- =================================================================
-- MIGRATION HELPERS: mark migration as applied
-- =================================================================
CREATE TABLE IF NOT EXISTS schema_migrations (
    version    VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    description TEXT
);

INSERT INTO schema_migrations (version, description)
VALUES ('001_asset_schema', 'Initial asset hierarchy schema — Sprint C1')
ON CONFLICT (version) DO NOTHING;
