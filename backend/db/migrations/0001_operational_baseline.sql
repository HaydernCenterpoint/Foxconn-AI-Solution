-- Immutable operational PostgreSQL migration. Never edit after release; add a new version.
-- TimescaleDB has an independent lineage under infrastructure/timescaledb.

CREATE TABLE IF NOT EXISTS production_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS machines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    ip VARCHAR(50),
    status VARCHAR(50) DEFAULT 'offline',
    plc_connected BOOLEAN DEFAULT FALSE,
    last_plc_data TEXT,
    client_id VARCHAR(100) UNIQUE,
    approval_status VARCHAR(20) NOT NULL DEFAULT 'APPROVED',
    cpu_percent DOUBLE PRECISION DEFAULT 0,
    ram_percent DOUBLE PRECISION DEFAULT 0,
    uptime_seconds BIGINT DEFAULT 0,
    last_heartbeat TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE machines ADD COLUMN IF NOT EXISTS client_id VARCHAR(100);
ALTER TABLE machines ADD COLUMN IF NOT EXISTS plc_connected BOOLEAN DEFAULT FALSE;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS machine_code VARCHAR(50);
ALTER TABLE machines ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) NOT NULL DEFAULT 'APPROVED';
ALTER TABLE machines ADD COLUMN IF NOT EXISTS cpu_percent DOUBLE PRECISION DEFAULT 0;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS ram_percent DOUBLE PRECISION DEFAULT 0;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS uptime_seconds BIGINT DEFAULT 0;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'unique_client_id'
          AND conrelid = 'public.machines'::regclass
    ) THEN
        ALTER TABLE machines ADD CONSTRAINT unique_client_id UNIQUE (client_id);
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS line_machines (
    line_id UUID REFERENCES production_lines(id) ON DELETE CASCADE,
    machine_id UUID REFERENCES machines(id) ON DELETE CASCADE,
    sequence_order INT NOT NULL,
    PRIMARY KEY (line_id, machine_id)
);

CREATE TABLE IF NOT EXISTS assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(32) NOT NULL CHECK (type IN ('plant', 'area', 'line', 'machine', 'sensor')),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(255) NOT NULL UNIQUE,
    parent_id UUID REFERENCES assets(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'asset_type') THEN
        EXECUTE 'ALTER TYPE asset_type ADD VALUE IF NOT EXISTS ''area''';
    END IF;
END;
$$;

ALTER TABLE assets ADD COLUMN IF NOT EXISTS code VARCHAR(255);
WITH root_plant AS (
    SELECT id FROM assets WHERE type::text = 'plant' ORDER BY created_at, id LIMIT 1
)
UPDATE assets asset
SET code = CASE asset.type::text
    WHEN 'plant' THEN CASE WHEN asset.id = (SELECT id FROM root_plant)
        THEN 'MKZ-PLANT' ELSE 'plant:' || asset.id::text END
    WHEN 'line' THEN 'line:' || asset.id::text
    WHEN 'machine' THEN 'machine:' || asset.id::text
    WHEN 'sensor' THEN 'sensor:' || asset.id::text
    WHEN 'station' THEN 'station:' || asset.id::text
    WHEN 'plc_tag' THEN 'plc-tag:' || asset.id::text
    ELSE 'asset:' || asset.id::text
END
WHERE asset.code IS NULL OR btrim(asset.code) = '';
ALTER TABLE assets ALTER COLUMN code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS assets_code_key ON assets(code);

CREATE TABLE IF NOT EXISTS asset_relationships (
    parent_asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    child_asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
    related_asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
    relationship_type VARCHAR(32) NOT NULL DEFAULT 'CONTAINS',
    PRIMARY KEY (parent_asset_id, child_asset_id, relationship_type),
    CHECK (parent_asset_id <> child_asset_id)
);

ALTER TABLE asset_relationships ADD COLUMN IF NOT EXISTS parent_asset_id UUID;
ALTER TABLE asset_relationships ADD COLUMN IF NOT EXISTS child_asset_id UUID;
ALTER TABLE asset_relationships ADD COLUMN IF NOT EXISTS asset_id UUID;
ALTER TABLE asset_relationships ADD COLUMN IF NOT EXISTS related_asset_id UUID;
UPDATE asset_relationships
SET parent_asset_id = asset_id,
    child_asset_id = related_asset_id
WHERE parent_asset_id IS NULL OR child_asset_id IS NULL;
UPDATE asset_relationships
SET asset_id = parent_asset_id,
    related_asset_id = child_asset_id
WHERE asset_id IS NULL OR related_asset_id IS NULL;
ALTER TABLE asset_relationships ALTER COLUMN parent_asset_id SET NOT NULL;
ALTER TABLE asset_relationships ALTER COLUMN child_asset_id SET NOT NULL;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'asset_relationships_parent_asset_id_fkey') THEN
        ALTER TABLE asset_relationships
            ADD CONSTRAINT asset_relationships_parent_asset_id_fkey
            FOREIGN KEY (parent_asset_id) REFERENCES assets(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'asset_relationships_child_asset_id_fkey') THEN
        ALTER TABLE asset_relationships
            ADD CONSTRAINT asset_relationships_child_asset_id_fkey
            FOREIGN KEY (child_asset_id) REFERENCES assets(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'asset_relationships_parent_child_not_same') THEN
        ALTER TABLE asset_relationships
            ADD CONSTRAINT asset_relationships_parent_child_not_same
            CHECK (parent_asset_id <> child_asset_id);
    END IF;
END;
$$;
CREATE UNIQUE INDEX IF NOT EXISTS asset_relationships_parent_child_type_key
    ON asset_relationships(parent_asset_id, child_asset_id, relationship_type);

CREATE TABLE IF NOT EXISTS asset_documents (
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    document_id VARCHAR(255) NOT NULL,
    relationship VARCHAR(32) NOT NULL CHECK (relationship IN ('manual', 'drawing', 'warranty')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (asset_id, document_id, relationship)
);
ALTER TABLE asset_documents ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
UPDATE asset_documents SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL;
ALTER TABLE asset_documents ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE asset_documents ALTER COLUMN created_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_asset_documents_asset_id ON asset_documents(asset_id);

INSERT INTO assets (id, type, name, code)
VALUES (gen_random_uuid(), 'plant', 'MKZ Factory', 'MKZ-PLANT')
ON CONFLICT (code) DO NOTHING;
INSERT INTO assets (id, type, name, code, parent_id, metadata)
SELECT pl.id, 'line', pl.name, 'line:' || pl.id::text, plant.id,
       jsonb_strip_nulls(jsonb_build_object('description', pl.description))
FROM production_lines pl
CROSS JOIN LATERAL (SELECT id FROM assets WHERE code = 'MKZ-PLANT') plant
ON CONFLICT (id) DO UPDATE SET
    type = EXCLUDED.type,
    name = EXCLUDED.name,
    code = EXCLUDED.code,
    parent_id = EXCLUDED.parent_id,
    metadata = EXCLUDED.metadata,
    updated_at = CURRENT_TIMESTAMP;
INSERT INTO assets (id, type, name, code, parent_id, metadata)
SELECT m.id, 'machine', m.name, 'machine:' || m.id::text,
       COALESCE(
           (SELECT line_id FROM line_machines WHERE machine_id = m.id ORDER BY line_id LIMIT 1),
           plant.id),
       jsonb_strip_nulls(jsonb_build_object('machineCode', m.machine_code, 'clientId', m.client_id))
FROM machines m
CROSS JOIN LATERAL (SELECT id FROM assets WHERE code = 'MKZ-PLANT') plant
ON CONFLICT (id) DO UPDATE SET
    type = EXCLUDED.type,
    name = EXCLUDED.name,
    code = EXCLUDED.code,
    parent_id = EXCLUDED.parent_id,
    metadata = EXCLUDED.metadata,
    updated_at = CURRENT_TIMESTAMP;
INSERT INTO asset_relationships
    (parent_asset_id, child_asset_id, asset_id, related_asset_id, relationship_type)
SELECT plant.id, line.id, plant.id, line.id, 'CONTAINS'
FROM assets plant CROSS JOIN production_lines line
WHERE plant.code = 'MKZ-PLANT'
ON CONFLICT DO NOTHING;
INSERT INTO asset_relationships
    (parent_asset_id, child_asset_id, asset_id, related_asset_id, relationship_type)
SELECT line_id, machine_id, line_id, machine_id, 'CONTAINS'
FROM line_machines
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION sync_line_asset() RETURNS trigger AS $$
DECLARE plant_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM assets WHERE id = OLD.id;
        RETURN OLD;
    END IF;
    SELECT id INTO plant_id FROM assets WHERE code = 'MKZ-PLANT';
    INSERT INTO assets (id, type, name, code, parent_id, metadata)
    VALUES (NEW.id, 'line', NEW.name, 'line:' || NEW.id::text, plant_id,
            jsonb_strip_nulls(jsonb_build_object('description', NEW.description)))
    ON CONFLICT (id) DO UPDATE SET
        type = EXCLUDED.type,
        name = EXCLUDED.name,
        code = EXCLUDED.code,
        parent_id = EXCLUDED.parent_id,
        metadata = EXCLUDED.metadata,
        updated_at = CURRENT_TIMESTAMP;
    IF plant_id IS NOT NULL THEN
        INSERT INTO asset_relationships
            (parent_asset_id, child_asset_id, asset_id, related_asset_id, relationship_type)
        VALUES (plant_id, NEW.id, plant_id, NEW.id, 'CONTAINS') ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_machine_asset() RETURNS trigger AS $$
DECLARE parent_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM assets WHERE id = OLD.id;
        RETURN OLD;
    END IF;
    SELECT line_id INTO parent_id FROM line_machines
    WHERE machine_id = NEW.id ORDER BY line_id LIMIT 1;
    IF parent_id IS NULL THEN
        SELECT id INTO parent_id FROM assets WHERE code = 'MKZ-PLANT';
    END IF;
    INSERT INTO assets (id, type, name, code, parent_id, metadata)
    VALUES (NEW.id, 'machine', NEW.name, 'machine:' || NEW.id::text, parent_id,
            jsonb_strip_nulls(jsonb_build_object('machineCode', NEW.machine_code, 'clientId', NEW.client_id)))
    ON CONFLICT (id) DO UPDATE SET
        type = EXCLUDED.type,
        name = EXCLUDED.name,
        code = EXCLUDED.code,
        parent_id = EXCLUDED.parent_id,
        metadata = EXCLUDED.metadata,
        updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_line_machine_asset_relationship() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM asset_relationships
        WHERE parent_asset_id = OLD.line_id
          AND child_asset_id = OLD.machine_id
          AND relationship_type = 'CONTAINS';
        RETURN OLD;
    END IF;
    INSERT INTO asset_relationships
        (parent_asset_id, child_asset_id, asset_id, related_asset_id, relationship_type)
    VALUES (NEW.line_id, NEW.machine_id, NEW.line_id, NEW.machine_id, 'CONTAINS')
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS production_lines_asset_sync ON production_lines;
CREATE TRIGGER production_lines_asset_sync
AFTER INSERT OR UPDATE OR DELETE ON production_lines
FOR EACH ROW EXECUTE FUNCTION sync_line_asset();
DROP TRIGGER IF EXISTS machines_asset_sync ON machines;
CREATE TRIGGER machines_asset_sync
AFTER INSERT OR UPDATE OR DELETE ON machines
FOR EACH ROW EXECUTE FUNCTION sync_machine_asset();
DROP TRIGGER IF EXISTS line_machines_asset_sync ON line_machines;
CREATE TRIGGER line_machines_asset_sync
AFTER INSERT OR DELETE ON line_machines
FOR EACH ROW EXECUTE FUNCTION sync_line_machine_asset_relationship();

CREATE TABLE IF NOT EXISTS machine_hourly_production (
    id BIGSERIAL PRIMARY KEY,
    machine_id UUID REFERENCES machines(id) ON DELETE CASCADE,
    prod_date DATE NOT NULL,
    prod_hour INT NOT NULL,
    produced_qty_start INT NOT NULL DEFAULT 0,
    produced_qty_end INT NOT NULL DEFAULT 0,
    hourly_qty INT NOT NULL DEFAULT 0,
    plc_run_time_start INT NOT NULL DEFAULT 0,
    plc_run_time_end INT NOT NULL DEFAULT 0,
    avg_cpu REAL,
    avg_ram REAL,
    last_raw_qty INT NOT NULL DEFAULT 0,
    oee_availability REAL DEFAULT 0,
    received_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_machine_hour UNIQUE (machine_id, prod_date, prod_hour)
);
ALTER TABLE machine_hourly_production ADD COLUMN IF NOT EXISTS last_raw_qty INT NOT NULL DEFAULT 0;
ALTER TABLE machine_hourly_production ADD COLUMN IF NOT EXISTS oee_availability REAL DEFAULT 0;

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'GUEST'
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    action VARCHAR(100) NOT NULL,
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS plc_clients (
    id BIGSERIAL PRIMARY KEY,
    client_id VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(200),
    ip_address VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'OFFLINE',
    approval_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    machine_id UUID REFERENCES machines(id) ON DELETE SET NULL,
    cpu_percent DOUBLE PRECISION DEFAULT 0,
    ram_percent DOUBLE PRECISION DEFAULT 0,
    uptime_seconds BIGINT DEFAULT 0,
    last_heartbeat TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE plc_clients ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) NOT NULL DEFAULT 'PENDING';
ALTER TABLE plc_clients ADD COLUMN IF NOT EXISTS machine_id UUID REFERENCES machines(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS alarms (
    id BIGSERIAL PRIMARY KEY,
    machine_id UUID REFERENCES machines(id) ON DELETE CASCADE,
    severity VARCHAR(20) NOT NULL DEFAULT 'LOW',
    message TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    acknowledged_by VARCHAR(100),
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS simulation_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id UUID UNIQUE NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT false,
    temperature_min DECIMAL(5,2) DEFAULT 20.0,
    temperature_max DECIMAL(5,2) DEFAULT 80.0,
    pressure_min DECIMAL(6,2) DEFAULT 1.0,
    pressure_max DECIMAL(6,2) DEFAULT 10.0,
    speed_min DECIMAL(6,2) DEFAULT 0.0,
    speed_max DECIMAL(6,2) DEFAULT 100.0,
    production_rate DECIMAL(8,2) DEFAULT 10.0,
    error_probability DECIMAL(3,2) DEFAULT 0.02,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS machine_telemetry_history (
    id BIGSERIAL PRIMARY KEY,
    machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    status VARCHAR(50),
    plc_connected BOOLEAN,
    production_count INT,
    cycle_time REAL,
    cpu_percent REAL,
    ram_percent REAL,
    uptime_seconds BIGINT,
    tags JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_telemetry_hist_machine_time
    ON machine_telemetry_history(machine_id, created_at DESC);

CREATE TABLE IF NOT EXISTS machine_telemetry (
    id BIGSERIAL PRIMARY KEY,
    machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    raw_json JSONB NOT NULL,
    sequence BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_machine_telemetry_machine_seq
    ON machine_telemetry(machine_id, sequence DESC);

-- Canonical operational definitions. These replace the duplicate constructor definitions.
CREATE TABLE IF NOT EXISTS telemetry_data (
    time TIMESTAMPTZ NOT NULL,
    asset_id UUID NOT NULL,
    metric VARCHAR(64) NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    unit VARCHAR(16),
    source VARCHAR(256)
);
CREATE INDEX IF NOT EXISTS idx_telemetry_data_asset_metric_time
    ON telemetry_data (asset_id, metric, time DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_data_time_brin
    ON telemetry_data USING BRIN (time) WITH (pages_per_range = 32);
CREATE INDEX IF NOT EXISTS idx_telemetry_data_query
    ON telemetry_data (asset_id, metric, time DESC);

CREATE TABLE IF NOT EXISTS event_log (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schema_version INTEGER NOT NULL DEFAULT 1,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    asset_id UUID NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    severity VARCHAR(16) NOT NULL,
    source VARCHAR(256),
    payload JSONB,
    correlation_id VARCHAR(256),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_event_log_asset_time
    ON event_log (asset_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_event_log_type_severity
    ON event_log (event_type, severity);
CREATE INDEX IF NOT EXISTS idx_event_log_query
    ON event_log (asset_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS fusion_outbox (
    id UUID PRIMARY KEY,
    schema_version INTEGER NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_key VARCHAR(512) NOT NULL UNIQUE,
    payload JSONB NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(16) NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    available_at TIMESTAMPTZ NOT NULL,
    locked_at TIMESTAMPTZ,
    lock_id UUID,
    delivered_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fusion_outbox_dispatch
    ON fusion_outbox (status, available_at, created_at);

-- Preserve the prior one-time bootstrap behavior without touching existing rows.
INSERT INTO simulation_configs
    (machine_id, enabled, temperature_min, temperature_max, pressure_min, pressure_max,
     speed_min, speed_max, production_rate, error_probability)
SELECT id, true, 20.0, 80.0, 1.0, 10.0, 0.0, 100.0, 15.0, 0.02
FROM machines
ON CONFLICT (machine_id) DO NOTHING;
