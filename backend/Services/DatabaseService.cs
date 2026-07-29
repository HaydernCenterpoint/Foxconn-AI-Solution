using System;
using System.Data;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Mkz.Fusion.Contracts;
using Npgsql;
using NpgsqlTypes;

namespace backend.Services
{
    public class DatabaseService
    {
        private readonly string _connectionString;
        private readonly TimescaleTelemetryService _timescaleTelemetry;
        private readonly CepStagingPublisher _cepStagingPublisher;
        private static readonly JsonSerializerOptions FusionJsonSerializerOptions = new(JsonSerializerDefaults.Web);

        public DatabaseService(
            IConfiguration configuration,
            TimescaleTelemetryService timescaleTelemetry,
            CepStagingPublisher cepStagingPublisher)
        {
            _connectionString = configuration.GetConnectionString("DefaultConnection")
                ?? throw new ArgumentNullException("ConnectionStrings:DefaultConnection is missing in configuration.");
            _timescaleTelemetry = timescaleTelemetry;
            _cepStagingPublisher = cepStagingPublisher;

            // Initialize database schema and seed data synchronously during startup
            InitializeDatabase();
        }

        public NpgsqlConnection CreateConnection()
        {
            return new NpgsqlConnection(_connectionString);
        }

        private void InitializeDatabase()
        {
            try
            {
                using var conn = CreateConnection();
                conn.Open();

                // ─── 1. production_lines ────────────────────────────────────────────────
                ExecuteSync(conn, @"
                    CREATE TABLE IF NOT EXISTS production_lines (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        name VARCHAR(100) NOT NULL,
                        description TEXT,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );");

                // ─── 2. machines ────────────────────────────────────────────────────────
                ExecuteSync(conn, @"
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
                        last_heartbeat TIMESTAMP WITH TIME ZONE,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );");

                // Add missing columns to machines (migration for existing tables)
                ExecuteSync(conn, @"
                    DO $$
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='machines' AND column_name='client_id'
                        ) THEN
                            ALTER TABLE machines ADD COLUMN client_id VARCHAR(100);
                        END IF;
                        IF NOT EXISTS (
                            SELECT 1 FROM pg_constraint WHERE conname = 'unique_client_id'
                        ) THEN
                            ALTER TABLE machines ADD CONSTRAINT unique_client_id UNIQUE (client_id);
                        END IF;
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='machines' AND column_name='plc_connected'
                        ) THEN
                            ALTER TABLE machines ADD COLUMN plc_connected BOOLEAN DEFAULT FALSE;
                        END IF;
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='machines' AND column_name='machine_code'
                        ) THEN
                            ALTER TABLE machines ADD COLUMN machine_code VARCHAR(50);
                        END IF;
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='machines' AND column_name='approval_status'
                        ) THEN
                            ALTER TABLE machines ADD COLUMN approval_status VARCHAR(20) NOT NULL DEFAULT 'APPROVED';
                        END IF;
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='machines' AND column_name='cpu_percent'
                        ) THEN
                            ALTER TABLE machines ADD COLUMN cpu_percent DOUBLE PRECISION DEFAULT 0;
                        END IF;
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='machines' AND column_name='ram_percent'
                        ) THEN
                            ALTER TABLE machines ADD COLUMN ram_percent DOUBLE PRECISION DEFAULT 0;
                        END IF;
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='machines' AND column_name='uptime_seconds'
                        ) THEN
                            ALTER TABLE machines ADD COLUMN uptime_seconds BIGINT DEFAULT 0;
                        END IF;
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='machines' AND column_name='last_heartbeat'
                        ) THEN
                            ALTER TABLE machines ADD COLUMN last_heartbeat TIMESTAMP WITH TIME ZONE;
                        END IF;
                    END
                    $$;");

                // ─── 3. line_machines ───────────────────────────────────────────────────
                ExecuteSync(conn, @"
                    CREATE TABLE IF NOT EXISTS line_machines (
                        line_id UUID REFERENCES production_lines(id) ON DELETE CASCADE,
                        machine_id UUID REFERENCES machines(id) ON DELETE CASCADE,
                        sequence_order INT NOT NULL,
                        PRIMARY KEY (line_id, machine_id)
                    );");

                // Asset catalog mirrors legacy operational identifiers without replacing them.
                ExecuteSync(conn, $@"
                    CREATE TABLE IF NOT EXISTS assets (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        type VARCHAR(32) NOT NULL CHECK (type IN ('plant', 'area', 'line', 'machine', 'sensor')),
                        name VARCHAR(255) NOT NULL,
                        code VARCHAR(255) NOT NULL UNIQUE,
                        parent_id UUID REFERENCES assets(id) ON DELETE SET NULL,
                        metadata JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
                    );
                    CREATE TABLE IF NOT EXISTS asset_relationships (
                        parent_asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
                        child_asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
                        asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
                        related_asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
                        relationship_type VARCHAR(32) NOT NULL DEFAULT 'CONTAINS',
                        PRIMARY KEY (parent_asset_id, child_asset_id, relationship_type),
                        CHECK (parent_asset_id <> child_asset_id)
                    );");

                ExecuteSync(conn, $@"
                    DO $$
                    BEGIN
                        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'asset_type') THEN
                            EXECUTE 'ALTER TYPE asset_type ADD VALUE IF NOT EXISTS ''area''';
                        END IF;
                    END;
                    $$;
                    ALTER TABLE assets ADD COLUMN IF NOT EXISTS code VARCHAR(255);
                    WITH root_plant AS (
                        SELECT id
                        FROM assets
                        WHERE type::text = 'plant'
                        ORDER BY created_at, id
                        LIMIT 1
                    )
                    UPDATE assets asset
                    SET code = CASE asset.type::text
                        WHEN 'plant' THEN CASE WHEN asset.id = (SELECT id FROM root_plant)
                            THEN '{AssetCatalogContract.PlantCode}' ELSE 'plant:' || asset.id::text END
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
                ");

                ExecuteSync(conn, @"
                    ALTER TABLE asset_relationships ADD COLUMN IF NOT EXISTS parent_asset_id UUID;
                    ALTER TABLE asset_relationships ADD COLUMN IF NOT EXISTS child_asset_id UUID;
                    ALTER TABLE asset_relationships ADD COLUMN IF NOT EXISTS asset_id UUID;
                    ALTER TABLE asset_relationships ADD COLUMN IF NOT EXISTS related_asset_id UUID;
                    DO $$
                    BEGIN
                        IF EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_schema = 'public'
                              AND table_name = 'asset_relationships'
                              AND column_name = 'asset_id'
                        ) THEN
                            EXECUTE 'UPDATE asset_relationships
                                     SET parent_asset_id = asset_id,
                                         child_asset_id = related_asset_id
                                     WHERE parent_asset_id IS NULL OR child_asset_id IS NULL';
                        END IF;
                    END;
                    $$;
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
                ");

                // Document storage remains owned by its document system; the catalog stores only durable links.
                ExecuteSync(conn, @"
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
                ");

                ExecuteSync(conn, $@"
                    INSERT INTO assets (id, type, name, code)
                    VALUES (gen_random_uuid(), 'plant', 'MKZ Factory', '{AssetCatalogContract.PlantCode}')
                    ON CONFLICT (code) DO NOTHING;
                    INSERT INTO assets (id, type, name, code, parent_id, metadata)
                    SELECT pl.id, 'line', pl.name, 'line:' || pl.id::text, plant.id,
                           jsonb_strip_nulls(jsonb_build_object('description', pl.description))
                    FROM production_lines pl
                    CROSS JOIN LATERAL (
                        SELECT id FROM assets WHERE code = '{AssetCatalogContract.PlantCode}'
                    ) plant
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
                    CROSS JOIN LATERAL (
                        SELECT id FROM assets WHERE code = '{AssetCatalogContract.PlantCode}'
                    ) plant
                    ON CONFLICT (id) DO UPDATE SET
                        type = EXCLUDED.type,
                        name = EXCLUDED.name,
                        code = EXCLUDED.code,
                        parent_id = EXCLUDED.parent_id,
                        metadata = EXCLUDED.metadata,
                        updated_at = CURRENT_TIMESTAMP;
                    INSERT INTO asset_relationships (parent_asset_id, child_asset_id, asset_id, related_asset_id, relationship_type)
                    SELECT plant.id, line.id, plant.id, line.id, 'CONTAINS'
                    FROM assets plant CROSS JOIN production_lines line
                    WHERE plant.code = '{AssetCatalogContract.PlantCode}'
                    ON CONFLICT DO NOTHING;
                    INSERT INTO asset_relationships (parent_asset_id, child_asset_id, asset_id, related_asset_id, relationship_type)
                    SELECT line_id, machine_id, line_id, machine_id, 'CONTAINS' FROM line_machines
                    ON CONFLICT DO NOTHING;
                ");

                ExecuteSync(conn, $@"
                    CREATE OR REPLACE FUNCTION sync_line_asset() RETURNS trigger AS $$
                    DECLARE plant_id UUID;
                    BEGIN
                        IF TG_OP = 'DELETE' THEN
                            DELETE FROM assets WHERE id = OLD.id;
                            RETURN OLD;
                        END IF;

                        SELECT id INTO plant_id FROM assets WHERE code = '{AssetCatalogContract.PlantCode}';
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
                            INSERT INTO asset_relationships (parent_asset_id, child_asset_id, asset_id, related_asset_id, relationship_type)
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

                        SELECT line_id INTO parent_id
                        FROM line_machines
                        WHERE machine_id = NEW.id
                        ORDER BY line_id
                        LIMIT 1;
                        IF parent_id IS NULL THEN
                            SELECT id INTO parent_id FROM assets WHERE code = '{AssetCatalogContract.PlantCode}';
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

                        INSERT INTO asset_relationships (parent_asset_id, child_asset_id, asset_id, related_asset_id, relationship_type)
                        VALUES (NEW.line_id, NEW.machine_id, NEW.line_id, NEW.machine_id, 'CONTAINS') ON CONFLICT DO NOTHING;
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
                ");

                // ─── 4. machine_hourly_production ───────────────────────────────────────
                ExecuteSync(conn, @"
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
                        received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        CONSTRAINT unique_machine_hour UNIQUE (machine_id, prod_date, prod_hour)
                    );");

                // Migration: add new columns if not present (idempotent)
                ExecuteSync(conn, @"
                    DO $$
                    BEGIN
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                                       WHERE table_name='machine_hourly_production' AND column_name='last_raw_qty') THEN
                            ALTER TABLE machine_hourly_production ADD COLUMN last_raw_qty INT NOT NULL DEFAULT 0;
                        END IF;
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                                       WHERE table_name='machine_hourly_production' AND column_name='oee_availability') THEN
                            ALTER TABLE machine_hourly_production ADD COLUMN oee_availability REAL DEFAULT 0;
                        END IF;
                    END
                    $$;");;

                // ─── 5. users ───────────────────────────────────────────────────────────
                ExecuteSync(conn, @"
                    CREATE TABLE IF NOT EXISTS users (
                        id SERIAL PRIMARY KEY,
                        username VARCHAR(50) UNIQUE NOT NULL,
                        password VARCHAR(100) NOT NULL,
                        role VARCHAR(20) NOT NULL DEFAULT 'GUEST'
                    );");

                // ─── 6. audit_logs ──────────────────────────────────────────────────────
                ExecuteSync(conn, @"
                    CREATE TABLE IF NOT EXISTS audit_logs (
                        id SERIAL PRIMARY KEY,
                        username VARCHAR(100) NOT NULL,
                        action VARCHAR(100) NOT NULL,
                        details TEXT,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );");

                // ─── 7. plc_clients ─────────────────────────────────────────────────────
                ExecuteSync(conn, @"
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
                        last_heartbeat TIMESTAMP WITH TIME ZONE,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );");

                // Migrate existing plc_clients rows (add approval_status, machine_id if missing)
                ExecuteSync(conn, @"
                    DO $$
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='plc_clients' AND column_name='approval_status'
                        ) THEN
                            ALTER TABLE plc_clients ADD COLUMN approval_status VARCHAR(20) NOT NULL DEFAULT 'PENDING';
                        END IF;
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='plc_clients' AND column_name='machine_id'
                        ) THEN
                            ALTER TABLE plc_clients ADD COLUMN machine_id UUID REFERENCES machines(id) ON DELETE SET NULL;
                        END IF;
                    END
                    $$;");

                // ─── 8. alarms ──────────────────────────────────────────────────────────
                ExecuteSync(conn, @"
                    CREATE TABLE IF NOT EXISTS alarms (
                        id BIGSERIAL PRIMARY KEY,
                        machine_id UUID REFERENCES machines(id) ON DELETE CASCADE,
                        severity VARCHAR(20) NOT NULL DEFAULT 'LOW',
                        message TEXT NOT NULL,
                        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
                        acknowledged_by VARCHAR(100),
                        acknowledged_at TIMESTAMP WITH TIME ZONE,
                        resolved_at TIMESTAMP WITH TIME ZONE,
                        notes TEXT,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );");

                // ─── 9. simulation_configs ───────────────────────────────────────────────
                ExecuteSync(conn, @"
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
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );");

                // ─── 10. machine_telemetry_history ──────────────────────────────────────
                ExecuteSync(conn, @"
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
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );");

                ExecuteSync(conn, @"
                    CREATE INDEX IF NOT EXISTS idx_telemetry_hist_machine_time 
                    ON machine_telemetry_history(machine_id, created_at DESC);");

                // ─── 11. machine_telemetry ───────────────────────────────────────────────
                ExecuteSync(conn, @"
                    CREATE TABLE IF NOT EXISTS machine_telemetry (
                        id BIGSERIAL PRIMARY KEY,
                        machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
                        raw_json JSONB NOT NULL,
                        sequence BIGINT NOT NULL DEFAULT 0,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );");

                ExecuteSync(conn, @"
                    CREATE INDEX IF NOT EXISTS idx_machine_telemetry_machine_seq
                    ON machine_telemetry(machine_id, sequence DESC);");

                // ─── 12. normalized telemetry and CEP event log ──────────────────────────
                // Kept in the operational PostgreSQL database; TimescaleDB is the staged
                // analytical target and receives the append-only raw stream separately.
                ExecuteSync(conn, @"
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
                        ON event_log (event_type, severity);");

                ExecuteSync(conn, @"
                    CREATE TABLE IF NOT EXISTS fusion_outbox (
                        id UUID PRIMARY KEY,
                        schema_version INTEGER NOT NULL,
                        event_type VARCHAR(100) NOT NULL,
                        event_key VARCHAR(512) NOT NULL UNIQUE,
                        payload JSONB NOT NULL,
                        occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
                        status VARCHAR(16) NOT NULL,
                        attempts INTEGER NOT NULL DEFAULT 0,
                        available_at TIMESTAMP WITH TIME ZONE NOT NULL,
                        locked_at TIMESTAMP WITH TIME ZONE NULL,
                        lock_id UUID NULL,
                        delivered_at TIMESTAMP WITH TIME ZONE NULL,
                        last_error TEXT NULL,
                        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
                    );");

                ExecuteSync(conn, @"
                    CREATE INDEX IF NOT EXISTS idx_fusion_outbox_dispatch
                    ON fusion_outbox (status, available_at, created_at);");

                ExecuteSync(conn, @"
                    CREATE TABLE IF NOT EXISTS telemetry_data (
                        time TIMESTAMP WITH TIME ZONE NOT NULL,
                        asset_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
                        metric VARCHAR(100) NOT NULL,
                        value DOUBLE PRECISION NOT NULL,
                        unit VARCHAR(32),
                        source VARCHAR(255),
                        PRIMARY KEY (time, asset_id, metric)
                    );

                    CREATE INDEX IF NOT EXISTS idx_telemetry_data_query
                    ON telemetry_data (asset_id, metric, time DESC);

                    CREATE TABLE IF NOT EXISTS event_log (
                        event_id UUID PRIMARY KEY,
                        schema_version INTEGER NOT NULL,
                        timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
                        asset_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
                        event_type VARCHAR(100) NOT NULL,
                        severity VARCHAR(20) NOT NULL,
                        source VARCHAR(255),
                        payload JSONB,
                        correlation_id VARCHAR(255)
                    );

                    CREATE INDEX IF NOT EXISTS idx_event_log_query
                    ON event_log (asset_id, timestamp DESC);");

                // Accounts are provisioned explicitly; startup must never create or change credentials.

                // Auto-create simulation configs for machines and enable them by default
                string seedSimConfigsSql = @"
                    INSERT INTO simulation_configs (machine_id, enabled, temperature_min, temperature_max, pressure_min, pressure_max, speed_min, speed_max, production_rate, error_probability)
                    SELECT id, true, 20.0, 80.0, 1.0, 10.0, 0.0, 100.0, 15.0, 0.02
                    FROM machines
                    ON CONFLICT (machine_id) DO NOTHING;";
                ExecuteSync(conn, seedSimConfigsSql);

                Console.WriteLine("[DB] Database initialized successfully.");
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException("Database initialization failed.", ex);
            }
        }

        private static void ExecuteSync(NpgsqlConnection conn, string sql)
        {
            using var cmd = new NpgsqlCommand(sql, conn);
            cmd.ExecuteNonQuery();
        }

        public async Task ExecuteNonQueryAsync(string sql, Action<NpgsqlParameterCollection>? parameterBinder = null)
        {
            using var conn = CreateConnection();
            await conn.OpenAsync();
            using var cmd = new NpgsqlCommand(sql, conn);
            parameterBinder?.Invoke(cmd.Parameters);
            await cmd.ExecuteNonQueryAsync();
        }

        public async Task<T?> ExecuteScalarAsync<T>(string sql, Action<NpgsqlParameterCollection>? parameterBinder = null)
        {
            using var conn = CreateConnection();
            await conn.OpenAsync();
            using var cmd = new NpgsqlCommand(sql, conn);
            parameterBinder?.Invoke(cmd.Parameters);
            var result = await cmd.ExecuteScalarAsync();
            if (result == null || result == DBNull.Value) return default;
            return (T)result;
        }

        /// <summary>
        /// Upsert a PLC client record directly as a machine based on the clientId reported from the TCP socket.
        /// </summary>
        public async Task UpsertPlcClientAsync(string clientId, string? name, string? machineCode, string? ipAddress, double cpu, double ram, long uptimeSeconds)
        {
            try
            {
                Guid machineId = Guid.TryParse(clientId, out var parsedGuid) ? parsedGuid : Guid.NewGuid();

                // On first insert: approval_status = 'PENDING' (admin must approve)
                // On conflict: do NOT overwrite approval_status - keep whatever admin set.
                // Overwrite name/machine_code if they are null, empty, or currently equal to the client_id (raw GUID).
                string sql = @"
                    INSERT INTO machines (id, client_id, name, machine_code, ip, status, approval_status, cpu_percent, ram_percent, uptime_seconds, last_heartbeat)
                    VALUES (@id, @clientId, @name, @machineCode, @ip, 'offline', 'PENDING', @cpu, @ram, @uptime, NOW())
                    ON CONFLICT (client_id) DO UPDATE SET
                        name = CASE 
                            WHEN machines.name IS NULL OR machines.name = '' OR machines.name = machines.client_id THEN EXCLUDED.name 
                            ELSE machines.name 
                        END,
                        machine_code = CASE 
                            WHEN machines.machine_code IS NULL OR machines.machine_code = '' OR machines.machine_code = machines.client_id THEN EXCLUDED.machine_code 
                            ELSE machines.machine_code 
                        END,
                        ip = EXCLUDED.ip,
                        status = machines.status,
                        cpu_percent = CASE WHEN EXCLUDED.cpu_percent > 0 THEN EXCLUDED.cpu_percent ELSE machines.cpu_percent END,
                        ram_percent = CASE WHEN EXCLUDED.ram_percent > 0 THEN EXCLUDED.ram_percent ELSE machines.ram_percent END,
                        uptime_seconds = CASE WHEN EXCLUDED.uptime_seconds > 0 THEN EXCLUDED.uptime_seconds ELSE machines.uptime_seconds END,
                        last_heartbeat = NOW()";

                await ExecuteNonQueryAsync(sql, p =>
                {
                    p.AddWithValue("id", machineId);
                    p.AddWithValue("clientId", clientId);
                    p.AddWithValue("name", (object?)(name) ?? (clientId.Length >= 8 ? $"Machine {clientId[..8]}" : "Machine"));
                    p.AddWithValue("machineCode", (object?)(machineCode) ?? DBNull.Value);
                    p.AddWithValue("ip", (object?)(ipAddress) ?? DBNull.Value);
                    p.AddWithValue("cpu", cpu);
                    p.AddWithValue("ram", ram);
                    p.AddWithValue("uptime", uptimeSeconds);
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DB] UpsertPlcClientAsync failed: {ex.Message}");
            }
        }
        /// <summary>
        /// Kiểm tra xem PLC Client (Máy) có được Admin duyệt hay không.
        /// </summary>
        public async Task<bool> IsClientApprovedAsync(string clientId)
        {
            if (string.IsNullOrEmpty(clientId)) return false;
            try
            {
                var result = await ExecuteScalarAsync<string>(
                    "SELECT approval_status FROM machines WHERE client_id = @cid",
                    p => p.AddWithValue("cid", clientId));
                return result == "APPROVED";
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Saves telemetry details to the historical table in an optimized way.
        /// </summary>
        public async Task SaveTelemetryHistoryAsync(
            Guid machineId, string status, bool plcConnected, int productionCount, double cycleTime,
            double cpu, double ram, long uptime, string tagsJson)
        {
            try
            {
                // We optimize storage by not writing duplicate consecutive heartbeats with identical status and count.
                // We only write if status/count changes, or if the last record is older than 5 minutes.
                const string checkLastSql = @"
                    SELECT status, production_count, created_at 
                    FROM machine_telemetry_history 
                    WHERE machine_id = @mid 
                    ORDER BY created_at DESC LIMIT 1";

                bool shouldInsert = true;
                using (var conn = CreateConnection())
                {
                    await conn.OpenAsync();
                    using var cmd = new NpgsqlCommand(checkLastSql, conn);
                    cmd.Parameters.AddWithValue("mid", machineId);
                    using var reader = await cmd.ExecuteReaderAsync();
                    if (await reader.ReadAsync())
                    {
                        string lastStatus = reader.GetString(0);
                        int lastCount = reader.GetInt32(1);
                        DateTime lastTime = reader.GetDateTime(2);

                        if (lastStatus == status && lastCount == productionCount && (DateTime.UtcNow - lastTime).TotalMinutes < 5.0)
                        {
                            shouldInsert = false; // Skip redundant write
                        }
                    }
                }

                if (!shouldInsert) return;

                const string insertSql = @"
                    INSERT INTO machine_telemetry_history 
                    (machine_id, status, plc_connected, production_count, cycle_time, cpu_percent, ram_percent, uptime_seconds, tags)
                    VALUES 
                    (@mid, @status, @plcConn, @prodCount, @cycleTime, @cpu, @ram, @uptime, CAST(@tags AS jsonb))";

                await ExecuteNonQueryAsync(insertSql, p =>
                {
                    p.AddWithValue("mid", machineId);
                    p.AddWithValue("status", status);
                    p.AddWithValue("plcConn", plcConnected);
                    p.AddWithValue("prodCount", productionCount);
                    p.AddWithValue("cycleTime", cycleTime);
                    p.AddWithValue("cpu", cpu);
                    p.AddWithValue("ram", ram);
                    p.AddWithValue("uptime", uptime);
                    p.AddWithValue("tags", tagsJson);
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DB] SaveTelemetryHistoryAsync failed: {ex.Message}");
            }
        }

        public async Task<bool> PersistTelemetryAndFusionOutboxAsync(
            TelemetryCaptureInput input,
            bool captureEnabled)
        {
            try
            {
                await using var connection = CreateConnection();
                await connection.OpenAsync();
                await using var transaction = await connection.BeginTransactionAsync();

                try
                {
                    long sourceId;
                    DateTimeOffset persistedOccurredAt;
                    const string rawTelemetrySql = @"
                        INSERT INTO machine_telemetry (machine_id, raw_json, sequence, created_at)
                        VALUES (@machineId, CAST(@rawJson AS jsonb), @sequence, @occurredAt)
                        RETURNING id, created_at";

                    await using (var rawTelemetryCommand = new NpgsqlCommand(rawTelemetrySql, connection, transaction))
                    {
                        rawTelemetryCommand.Parameters.AddWithValue("machineId", input.MachineId);
                        rawTelemetryCommand.Parameters.AddWithValue("rawJson", input.RawTelemetryJson);
                        rawTelemetryCommand.Parameters.AddWithValue("sequence", input.Sequence);
                        rawTelemetryCommand.Parameters.AddWithValue("occurredAt", input.OccurredAt.UtcDateTime);
                        await using var reader = await rawTelemetryCommand.ExecuteReaderAsync();
                        if (!await reader.ReadAsync())
                        {
                            throw new InvalidOperationException("Primary telemetry insert did not return a row.");
                        }

                        sourceId = reader.GetInt64(0);
                        persistedOccurredAt = reader.GetFieldValue<DateTimeOffset>(1);
                    }

                    if (captureEnabled)
                    {
                        var context = await ReadMachineContextAsync(connection, transaction, input.MachineId);
                        if (context is null)
                        {
                            await transaction.RollbackAsync();
                            Console.WriteLine($"[DB] Fusion capture skipped because machine {input.MachineId} was not found.");
                            return false;
                        }

                        var fusionEvent = TelemetryFusionEventFactory.Create(input, context.Machine, context.Line);
                        await InsertFusionOutboxAsync(connection, transaction, fusionEvent);
                    }

                    await transaction.CommitAsync();
                    _cepStagingPublisher.TryPublish(sourceId, input);
                    await _timescaleTelemetry.TryWriteAsync(new TimescaleTelemetryPoint(
                        sourceId,
                        input.MachineId,
                        input.Sequence,
                        persistedOccurredAt,
                        input.RawTelemetryJson));
                    return true;
                }
                catch
                {
                    await transaction.RollbackAsync();
                    throw;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DB] PersistTelemetryAndFusionOutboxAsync failed: {ex.Message}");
                return false;
            }
        }

        private static async Task<MachineContext?> ReadMachineContextAsync(
            NpgsqlConnection connection,
            NpgsqlTransaction transaction,
            Guid machineId)
        {
            const string sql = @"
                SELECT m.id, m.client_id, m.machine_code, m.name, l.id, l.name
                FROM machines m
                LEFT JOIN line_machines lm ON lm.machine_id = m.id
                LEFT JOIN production_lines l ON l.id = lm.line_id
                WHERE m.id = @machineId
                ORDER BY lm.sequence_order NULLS LAST
                LIMIT 1";

            await using var command = new NpgsqlCommand(sql, connection, transaction);
            command.Parameters.AddWithValue("machineId", machineId);
            await using var reader = await command.ExecuteReaderAsync();
            if (!await reader.ReadAsync()) return null;

            var machine = new MachineSnapshot(
                reader.GetGuid(0),
                reader.IsDBNull(1) ? null : reader.GetString(1),
                reader.IsDBNull(2) ? null : reader.GetString(2),
                reader.IsDBNull(3) ? machineId.ToString() : reader.GetString(3));

            LineSnapshot? line = null;
            if (!reader.IsDBNull(4))
            {
                var lineId = reader.GetGuid(4);
                line = new LineSnapshot(lineId, reader.IsDBNull(5) ? lineId.ToString() : reader.GetString(5));
            }

            return new MachineContext(machine, line);
        }

        private static async Task InsertFusionOutboxAsync(
            NpgsqlConnection connection,
            NpgsqlTransaction transaction,
            TelemetryFusionEvent fusionEvent)
        {
            const string sql = @"
                INSERT INTO fusion_outbox
                    (id, schema_version, event_type, event_key, payload, occurred_at, status, available_at)
                VALUES
                    (@id, @schemaVersion, @eventType, @eventKey, @payload, @occurredAt, 'PENDING', @availableAt)
                ON CONFLICT (event_key) DO NOTHING";

            await using var command = new NpgsqlCommand(sql, connection, transaction);
            command.Parameters.AddWithValue("id", fusionEvent.EventId);
            command.Parameters.AddWithValue("schemaVersion", fusionEvent.SchemaVersion);
            command.Parameters.AddWithValue("eventType", "telemetry");
            command.Parameters.AddWithValue("eventKey", fusionEvent.EventKey);
            command.Parameters.AddWithValue(
                "payload",
                NpgsqlDbType.Jsonb,
                JsonSerializer.Serialize(fusionEvent, FusionJsonSerializerOptions));
            command.Parameters.AddWithValue("occurredAt", fusionEvent.OccurredAt.UtcDateTime);
            command.Parameters.AddWithValue("availableAt", DateTime.UtcNow);
            await command.ExecuteNonQueryAsync();
        }

        public async Task InsertTelemetryDataPointsAsync(IEnumerable<TelemetryDataPoint> dataPoints)
        {
            await using var connection = CreateConnection();
            await connection.OpenAsync();
            await using var transaction = await connection.BeginTransactionAsync();

            const string sql = @"
                INSERT INTO telemetry_data (time, asset_id, metric, value, unit, source)
                VALUES (@time, @assetId, @metric, @value, @unit, @source)
                ON CONFLICT (time, asset_id, metric) DO UPDATE SET
                    value = EXCLUDED.value,
                    unit = EXCLUDED.unit,
                    source = EXCLUDED.source";

            foreach (var point in dataPoints)
            {
                await using var command = new NpgsqlCommand(sql, connection, transaction);
                command.Parameters.AddWithValue("time", point.Time.UtcDateTime);
                command.Parameters.AddWithValue("assetId", point.AssetId);
                command.Parameters.AddWithValue("metric", point.Metric);
                command.Parameters.AddWithValue("value", point.Value);
                command.Parameters.AddWithValue("unit", (object?)point.Unit ?? DBNull.Value);
                command.Parameters.AddWithValue("source", (object?)point.Source ?? DBNull.Value);
                await command.ExecuteNonQueryAsync();
            }

            await transaction.CommitAsync();
        }

        public async Task InsertEventLogAsync(FusionEvent fusionEvent)
        {
            const string sql = @"
                INSERT INTO event_log
                    (event_id, schema_version, timestamp, asset_id, event_type, severity, source, payload, correlation_id)
                VALUES
                    (@eventId, @schemaVersion, @timestamp, @assetId, @eventType, @severity, @source, @payload, @correlationId)
                ON CONFLICT (event_id) DO NOTHING";

            await ExecuteNonQueryAsync(sql, parameters =>
            {
                parameters.AddWithValue("eventId", fusionEvent.EventId);
                parameters.AddWithValue("schemaVersion", fusionEvent.SchemaVersion);
                parameters.AddWithValue("timestamp", fusionEvent.Timestamp.UtcDateTime);
                parameters.AddWithValue("assetId", fusionEvent.AssetId);
                parameters.AddWithValue("eventType", fusionEvent.EventType);
                parameters.AddWithValue("severity", fusionEvent.Severity);
                parameters.AddWithValue("source", (object?)fusionEvent.Source ?? DBNull.Value);
                parameters.AddWithValue(
                    "payload",
                    NpgsqlDbType.Jsonb,
                    fusionEvent.Payload is null
                        ? (object)DBNull.Value
                        : JsonSerializer.Serialize(fusionEvent.Payload, FusionJsonSerializerOptions));
                parameters.AddWithValue("correlationId", (object?)fusionEvent.CorrelationId ?? DBNull.Value);
            });
        }

        public async Task<IReadOnlyList<object>> QueryTelemetryDataAsync(
            Guid assetId,
            string metric,
            DateTime from,
            DateTime to,
            int limit)
        {
            const string sql = @"
                SELECT time, asset_id, metric, value, unit, source
                FROM telemetry_data
                WHERE asset_id = @assetId
                  AND metric = @metric
                  AND time >= @from
                  AND time <= @to
                ORDER BY time DESC
                LIMIT @limit";

            var rows = new List<object>();
            await using var connection = CreateConnection();
            await connection.OpenAsync();
            await using var command = new NpgsqlCommand(sql, connection);
            command.Parameters.AddWithValue("assetId", assetId);
            command.Parameters.AddWithValue("metric", metric);
            command.Parameters.AddWithValue("from", from.ToUniversalTime());
            command.Parameters.AddWithValue("to", to.ToUniversalTime());
            command.Parameters.AddWithValue("limit", limit);
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                rows.Add(new
                {
                    time = reader.GetFieldValue<DateTimeOffset>(0),
                    assetId = reader.GetGuid(1),
                    metric = reader.GetString(2),
                    value = reader.GetDouble(3),
                    unit = reader.IsDBNull(4) ? null : reader.GetString(4),
                    source = reader.IsDBNull(5) ? null : reader.GetString(5),
                });
            }

            return rows;
        }

        public async Task<IReadOnlyList<object>> QueryEventLogAsync(
            Guid? assetId,
            string? eventType,
            string? severity,
            DateTime? from,
            DateTime? to,
            int limit)
        {
            const string sql = @"
                SELECT event_id, schema_version, timestamp, asset_id, event_type, severity, source, payload, correlation_id
                FROM event_log
                WHERE (@assetId IS NULL OR asset_id = @assetId)
                  AND (@eventType IS NULL OR event_type = @eventType)
                  AND (@severity IS NULL OR severity = @severity)
                  AND (@from IS NULL OR timestamp >= @from)
                  AND (@to IS NULL OR timestamp <= @to)
                ORDER BY timestamp DESC
                LIMIT @limit";

            var rows = new List<object>();
            await using var connection = CreateConnection();
            await connection.OpenAsync();
            await using var command = new NpgsqlCommand(sql, connection);
            command.Parameters.AddWithValue("assetId", NpgsqlDbType.Uuid, (object?)assetId ?? DBNull.Value);
            command.Parameters.AddWithValue("eventType", NpgsqlDbType.Varchar, (object?)eventType ?? DBNull.Value);
            command.Parameters.AddWithValue("severity", NpgsqlDbType.Varchar, (object?)severity ?? DBNull.Value);
            command.Parameters.AddWithValue("from", NpgsqlDbType.TimestampTz, from.HasValue ? from.Value.ToUniversalTime() : DBNull.Value);
            command.Parameters.AddWithValue("to", NpgsqlDbType.TimestampTz, to.HasValue ? to.Value.ToUniversalTime() : DBNull.Value);
            command.Parameters.AddWithValue("limit", limit);
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                rows.Add(new
                {
                    eventId = reader.GetGuid(0),
                    schemaVersion = reader.GetInt32(1),
                    timestamp = reader.GetFieldValue<DateTimeOffset>(2),
                    assetId = reader.GetGuid(3),
                    eventType = reader.GetString(4),
                    severity = reader.GetString(5),
                    source = reader.IsDBNull(6) ? null : reader.GetString(6),
                    payload = reader.IsDBNull(7) ? null : JsonSerializer.Deserialize<object>(reader.GetString(7)),
                    correlationId = reader.IsDBNull(8) ? null : reader.GetString(8),
                });
            }

            return rows;
        }

        public async Task InsertRawTelemetryAsync(string machineId, string rawJson, long sequence = 0, DateTime? createdAt = null)
        {
            if (!Guid.TryParse(machineId, out var machineGuid)) return;
            try
            {
                var occurredAt = createdAt ?? DateTime.UtcNow;
                long sourceId;
                DateTimeOffset persistedOccurredAt;
                await using var connection = CreateConnection();
                await connection.OpenAsync();
                await using var transaction = await connection.BeginTransactionAsync();
                const string sql = @"
                    INSERT INTO machine_telemetry (machine_id, raw_json, sequence, created_at)
                    VALUES (@mid, CAST(@raw AS jsonb), @seq, @created)
                    RETURNING id, created_at";

                await using (var command = new NpgsqlCommand(sql, connection, transaction))
                {
                    command.Parameters.AddWithValue("mid", machineGuid);
                    command.Parameters.AddWithValue("raw", rawJson);
                    command.Parameters.AddWithValue("seq", sequence);
                    command.Parameters.AddWithValue("created", occurredAt);
                    await using var reader = await command.ExecuteReaderAsync();
                    if (!await reader.ReadAsync())
                    {
                        throw new InvalidOperationException("Primary telemetry insert did not return a row.");
                    }

                    sourceId = reader.GetInt64(0);
                    persistedOccurredAt = reader.GetFieldValue<DateTimeOffset>(1);
                }

                await transaction.CommitAsync();
                _cepStagingPublisher.TryPublish(sourceId, new TelemetryCaptureInput(
                    machineGuid,
                    rawJson,
                    sequence,
                    persistedOccurredAt,
                    null,
                    null,
                    "OFFLINE",
                    false,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null));
                await _timescaleTelemetry.TryWriteAsync(new TimescaleTelemetryPoint(
                    sourceId,
                    machineGuid,
                    sequence,
                    persistedOccurredAt,
                    rawJson));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DB] InsertRawTelemetryAsync failed: {ex.Message}");
            }
        }

        public async Task<long> GetMaxSequenceAsync(string machineId)
        {
            if (!Guid.TryParse(machineId, out var machineGuid)) return 0;
            try
            {
                const string sql = "SELECT COALESCE(MAX(sequence), 0) FROM machine_telemetry WHERE machine_id = @mid";
                using var conn = CreateConnection();
                await conn.OpenAsync();
                using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("mid", machineGuid);
                var val = await cmd.ExecuteScalarAsync();
                return val != null && val != DBNull.Value ? Convert.ToInt64(val) : 0L;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DB] GetMaxSequenceAsync failed: {ex.Message}");
                return 0;
            }
        }

        /// <summary>
        /// Cleans up old telemetry records from the database.
        /// </summary>
        public async Task PruneTelemetryHistoryAsync(int retentionDays = 30)
        {
            try
            {
                string sql = "DELETE FROM machine_telemetry_history WHERE created_at < NOW() - INTERVAL '1 day' * @days";
                await ExecuteNonQueryAsync(sql, p => p.AddWithValue("days", retentionDays));
                Console.WriteLine($"[DB] Telemetry history pruned (records older than {retentionDays} days deleted).");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DB] PruneTelemetryHistoryAsync failed: {ex.Message}");
            }
        }

        public async Task UpdateHourlyProductionAsync(Guid machineId, int productionCount, double cpuPercent, double ramPercent, long uptimeSeconds)
        {
            try
            {
                DateTime now = DateTime.UtcNow;
                DateTime prodDate = now.Date;
                int prodHour = now.Hour;

                using var conn = CreateConnection();
                await conn.OpenAsync();

                string checkSql = @"
                    SELECT id, produced_qty_start, produced_qty_end, avg_cpu, avg_ram
                    FROM machine_hourly_production
                    WHERE machine_id = @machine_id AND prod_date = @prod_date AND prod_hour = @prod_hour";

                long existingId = -1;
                int startQty = 0;

                using (var cmd = new NpgsqlCommand(checkSql, conn))
                {
                    cmd.Parameters.AddWithValue("machine_id", machineId);
                    cmd.Parameters.AddWithValue("prod_date", prodDate);
                    cmd.Parameters.AddWithValue("prod_hour", prodHour);
                    using var reader = await cmd.ExecuteReaderAsync();
                    if (await reader.ReadAsync())
                    {
                        existingId = reader.GetInt64(0);
                        startQty = reader.GetInt32(1);
                    }
                }

                if (existingId == -1)
                {
                    try
                    {
                        string insertSql = @"
                            INSERT INTO machine_hourly_production
                            (machine_id, prod_date, prod_hour, produced_qty_start, produced_qty_end, hourly_qty, plc_run_time_start, plc_run_time_end, avg_cpu, avg_ram)
                            VALUES (@machine_id, @prod_date, @prod_hour, @produced_qty_start, @produced_qty_end, 0, 0, 0, @avg_cpu, @avg_ram)";

                        using var cmdInsert = new NpgsqlCommand(insertSql, conn);
                        cmdInsert.Parameters.AddWithValue("machine_id", machineId);
                        cmdInsert.Parameters.AddWithValue("prod_date", prodDate);
                        cmdInsert.Parameters.AddWithValue("prod_hour", prodHour);
                        cmdInsert.Parameters.AddWithValue("produced_qty_start", productionCount);
                        cmdInsert.Parameters.AddWithValue("produced_qty_end", productionCount);
                        cmdInsert.Parameters.AddWithValue("avg_cpu", cpuPercent);
                        cmdInsert.Parameters.AddWithValue("avg_ram", ramPercent);
                        await cmdInsert.ExecuteNonQueryAsync();
                    }
                    catch (PostgresException pgex) when (pgex.SqlState == "23505")
                    {
                        // Fallback if another thread inserted it between the check and insert
                        string getSql = @"
                            SELECT id, produced_qty_start
                            FROM machine_hourly_production
                            WHERE machine_id = @machine_id AND prod_date = @prod_date AND prod_hour = @prod_hour";
                        using var cmdGet = new NpgsqlCommand(getSql, conn);
                        cmdGet.Parameters.AddWithValue("machine_id", machineId);
                        cmdGet.Parameters.AddWithValue("prod_date", prodDate);
                        cmdGet.Parameters.AddWithValue("prod_hour", prodHour);
                        using var reader = await cmdGet.ExecuteReaderAsync();
                        if (await reader.ReadAsync())
                        {
                            existingId = reader.GetInt64(0);
                            startQty = reader.GetInt32(1);
                        }
                    }
                }

                if (existingId != -1)
                {
                    string updateSql = @"
                        UPDATE machine_hourly_production
                        SET produced_qty_end = @produced_qty_end,
                            hourly_qty = @hourly_qty,
                            plc_run_time_end = @plc_run_time_end,
                            avg_cpu = @avg_cpu,
                            avg_ram = @avg_ram
                        WHERE id = @id";

                    using var cmdUpdate = new NpgsqlCommand(updateSql, conn);
                    cmdUpdate.Parameters.AddWithValue("produced_qty_end", productionCount);
                    cmdUpdate.Parameters.AddWithValue("hourly_qty", Math.Max(0, productionCount - startQty));
                    cmdUpdate.Parameters.AddWithValue("plc_run_time_end", (int)uptimeSeconds);
                    cmdUpdate.Parameters.AddWithValue("avg_cpu", cpuPercent);
                    cmdUpdate.Parameters.AddWithValue("avg_ram", ramPercent);
                    cmdUpdate.Parameters.AddWithValue("id", existingId);
                    await cmdUpdate.ExecuteNonQueryAsync();
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DB] UpdateHourlyProductionAsync failed: {ex.Message}");
            }
        }

        // ─── CEP event log ──────────────────────────────────────────────────────────────

        public async Task InsertEventLogAsync(FusionEvent evt)
        {
            const string sql = @"
                INSERT INTO event_log
                    (event_id, schema_version, timestamp, asset_id, event_type, severity, source, payload, correlation_id)
                VALUES
                    (@eventId, @schemaVersion, @timestamp, @assetId, @eventType, @severity, @source, @payload, @correlationId)
                ON CONFLICT (event_id) DO NOTHING";

            await ExecuteNonQueryAsync(sql, parameters =>
            {
                parameters.AddWithValue("eventId", evt.EventId);
                parameters.AddWithValue("schemaVersion", evt.SchemaVersion);
                parameters.AddWithValue("timestamp", evt.Timestamp.UtcDateTime);
                parameters.AddWithValue("assetId", evt.AssetId);
                parameters.AddWithValue("eventType", evt.EventType);
                parameters.AddWithValue("severity", evt.Severity);
                parameters.AddWithValue("source", (object?)evt.Source ?? DBNull.Value);
                parameters.AddWithValue(
                    "payload",
                    NpgsqlDbType.Jsonb,
                    JsonSerializer.Serialize(evt.Payload ?? new Dictionary<string, object?>()));
                parameters.AddWithValue("correlationId", (object?)evt.CorrelationId ?? DBNull.Value);
            });
        }

        // ─── Normalized telemetry data ──────────────────────────────────────────────────

        public async Task InsertTelemetryDataPointsAsync(IEnumerable<TelemetryDataPoint> points)
        {
            const string sql = @"
                INSERT INTO telemetry_data (time, asset_id, metric, value, unit, source)
                VALUES (@time, @assetId, @metric, @value, @unit, @source)";

            await using var connection = CreateConnection();
            await connection.OpenAsync();
            await using var transaction = await connection.BeginTransactionAsync();

            try
            {
                foreach (var point in points)
                {
                    await using var command = new NpgsqlCommand(sql, connection, transaction);
                    command.Parameters.AddWithValue("time", point.Time.UtcDateTime);
                    command.Parameters.AddWithValue("assetId", point.AssetId);
                    command.Parameters.AddWithValue("metric", point.Metric);
                    command.Parameters.AddWithValue("value", point.Value);
                    command.Parameters.AddWithValue("unit", (object?)point.Unit ?? DBNull.Value);
                    command.Parameters.AddWithValue("source", (object?)point.Source ?? DBNull.Value);
                    await command.ExecuteNonQueryAsync();
                }

                await transaction.CommitAsync();
            }
            catch
            {
                await transaction.RollbackAsync();
                throw;
            }
        }

        public async Task<List<Dictionary<string, object?>>> QueryTelemetryDataAsync(
            Guid assetId,
            string metric,
            DateTime from,
            DateTime to,
            int limit = 1000)
        {
            const string sql = @"
                SELECT time, asset_id, metric, value, unit, source
                FROM telemetry_data
                WHERE asset_id = @assetId
                  AND metric = @metric
                  AND time >= @from
                  AND time <= @to
                ORDER BY time ASC
                LIMIT @limit";

            var results = new List<Dictionary<string, object?>>();
            await using var connection = CreateConnection();
            await connection.OpenAsync();
            await using var command = new NpgsqlCommand(sql, connection);
            command.Parameters.AddWithValue("assetId", assetId);
            command.Parameters.AddWithValue("metric", metric);
            command.Parameters.AddWithValue("from", from);
            command.Parameters.AddWithValue("to", to);
            command.Parameters.AddWithValue("limit", limit);

            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                results.Add(new Dictionary<string, object?>
                {
                    ["time"] = reader.GetDateTime(0),
                    ["assetId"] = reader.GetGuid(1),
                    ["metric"] = reader.GetString(2),
                    ["value"] = reader.GetDouble(3),
                    ["unit"] = reader.IsDBNull(4) ? null : reader.GetString(4),
                    ["source"] = reader.IsDBNull(5) ? null : reader.GetString(5),
                });
            }

            return results;
        }

        // ─── CEP event queries ──────────────────────────────────────────────────────────

        public async Task<List<Dictionary<string, object?>>> QueryEventLogAsync(
            Guid? assetId = null,
            string? eventType = null,
            string? severity = null,
            DateTime? from = null,
            DateTime? to = null,
            int limit = 100)
        {
            var conditions = new List<string>();
            if (assetId.HasValue) conditions.Add("asset_id = @assetId");
            if (!string.IsNullOrWhiteSpace(eventType)) conditions.Add("event_type = @eventType");
            if (!string.IsNullOrWhiteSpace(severity)) conditions.Add("severity = @severity");
            if (from.HasValue) conditions.Add("timestamp >= @from");
            if (to.HasValue) conditions.Add("timestamp <= @to");

            var where = conditions.Count == 0 ? string.Empty : $"WHERE {string.Join(" AND ", conditions)}";
            var sql = $@"
                SELECT event_id, schema_version, timestamp, asset_id, event_type, severity, source, payload, correlation_id
                FROM event_log
                {where}
                ORDER BY timestamp DESC
                LIMIT @limit";

            var results = new List<Dictionary<string, object?>>();
            await using var connection = CreateConnection();
            await connection.OpenAsync();
            await using var command = new NpgsqlCommand(sql, connection);
            if (assetId.HasValue) command.Parameters.AddWithValue("assetId", assetId.Value);
            if (!string.IsNullOrWhiteSpace(eventType)) command.Parameters.AddWithValue("eventType", eventType);
            if (!string.IsNullOrWhiteSpace(severity)) command.Parameters.AddWithValue("severity", severity);
            if (from.HasValue) command.Parameters.AddWithValue("from", from.Value);
            if (to.HasValue) command.Parameters.AddWithValue("to", to.Value);
            command.Parameters.AddWithValue("limit", limit);

            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                results.Add(new Dictionary<string, object?>
                {
                    ["eventId"] = reader.GetGuid(0),
                    ["schemaVersion"] = reader.GetInt32(1),
                    ["timestamp"] = reader.GetDateTime(2),
                    ["assetId"] = reader.GetGuid(3),
                    ["eventType"] = reader.GetString(4),
                    ["severity"] = reader.GetString(5),
                    ["source"] = reader.IsDBNull(6) ? null : reader.GetString(6),
                    ["payload"] = reader.IsDBNull(7) ? null : reader.GetString(7),
                    ["correlationId"] = reader.IsDBNull(8) ? null : reader.GetString(8),
                });
            }

            return results;
        }
    }
}
