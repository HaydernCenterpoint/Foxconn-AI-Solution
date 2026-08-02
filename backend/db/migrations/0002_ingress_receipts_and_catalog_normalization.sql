-- WP2 delivery receipts and safe convergence of the two historical telemetry/event constructors.
-- Legacy duplicate telemetry rows are archived before semantic idempotency is enforced.

ALTER TABLE telemetry_data ADD COLUMN IF NOT EXISTS time TIMESTAMPTZ;
ALTER TABLE telemetry_data ADD COLUMN IF NOT EXISTS asset_id UUID;
ALTER TABLE telemetry_data ADD COLUMN IF NOT EXISTS metric VARCHAR(100);
ALTER TABLE telemetry_data ADD COLUMN IF NOT EXISTS value DOUBLE PRECISION;
ALTER TABLE telemetry_data ADD COLUMN IF NOT EXISTS unit VARCHAR(32);
ALTER TABLE telemetry_data ADD COLUMN IF NOT EXISTS source VARCHAR(256);
ALTER TABLE telemetry_data ALTER COLUMN metric TYPE VARCHAR(100);
ALTER TABLE telemetry_data ALTER COLUMN unit TYPE VARCHAR(32);
ALTER TABLE telemetry_data ALTER COLUMN source TYPE VARCHAR(256);
ALTER TABLE telemetry_data ALTER COLUMN time SET NOT NULL;
ALTER TABLE telemetry_data ALTER COLUMN asset_id SET NOT NULL;
ALTER TABLE telemetry_data ALTER COLUMN metric SET NOT NULL;
ALTER TABLE telemetry_data ALTER COLUMN value SET NOT NULL;

CREATE TABLE IF NOT EXISTS telemetry_data_duplicates_archive (
    archive_id BIGSERIAL PRIMARY KEY,
    time TIMESTAMPTZ NOT NULL,
    asset_id UUID NOT NULL,
    metric VARCHAR(100) NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    unit VARCHAR(32),
    source VARCHAR(256),
    archived_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

WITH ranked AS (
    SELECT ctid, time, asset_id, metric, value, unit, source,
           row_number() OVER (
               PARTITION BY time, asset_id, metric
               ORDER BY ctid
           ) AS duplicate_rank
    FROM telemetry_data
), archived AS (
    INSERT INTO telemetry_data_duplicates_archive
        (time, asset_id, metric, value, unit, source)
    SELECT time, asset_id, metric, value, unit, source
    FROM ranked
    WHERE duplicate_rank > 1
    RETURNING time, asset_id, metric
)
DELETE FROM telemetry_data target
USING ranked
WHERE target.ctid = ranked.ctid
  AND ranked.duplicate_rank > 1;

DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    -- Replace the legacy PK with one canonical semantic unique index on both upgrade paths.
    FOR constraint_name IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.telemetry_data'::regclass
          AND contype = 'p'
    LOOP
        EXECUTE format('ALTER TABLE public.telemetry_data DROP CONSTRAINT %I', constraint_name);
    END LOOP;

    -- machines(id) was too narrow because asset_id also supports plant/area/line assets.
    FOR constraint_name IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.telemetry_data'::regclass
          AND contype = 'f'
    LOOP
        EXECUTE format('ALTER TABLE public.telemetry_data DROP CONSTRAINT %I', constraint_name);
    END LOOP;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_telemetry_data_identity
    ON telemetry_data (time, asset_id, metric);
ALTER TABLE telemetry_data
    ADD CONSTRAINT telemetry_data_asset_id_fkey
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE NOT VALID;
COMMENT ON CONSTRAINT telemetry_data_asset_id_fkey ON telemetry_data IS
    'NOT VALID preserves any historical orphan rows while enforcing canonical assets(id) integrity for new writes.';

ALTER TABLE event_log ADD COLUMN IF NOT EXISTS event_id UUID;
ALTER TABLE event_log ADD COLUMN IF NOT EXISTS schema_version INTEGER;
ALTER TABLE event_log ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ;
ALTER TABLE event_log ADD COLUMN IF NOT EXISTS asset_id UUID;
ALTER TABLE event_log ADD COLUMN IF NOT EXISTS event_type VARCHAR(100);
ALTER TABLE event_log ADD COLUMN IF NOT EXISTS severity VARCHAR(20);
ALTER TABLE event_log ADD COLUMN IF NOT EXISTS source VARCHAR(256);
ALTER TABLE event_log ADD COLUMN IF NOT EXISTS payload JSONB;
ALTER TABLE event_log ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(256);
ALTER TABLE event_log ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE event_log ALTER COLUMN event_type TYPE VARCHAR(100);
ALTER TABLE event_log ALTER COLUMN severity TYPE VARCHAR(20);
ALTER TABLE event_log ALTER COLUMN source TYPE VARCHAR(256);
ALTER TABLE event_log ALTER COLUMN correlation_id TYPE VARCHAR(256);
UPDATE event_log SET event_id = gen_random_uuid() WHERE event_id IS NULL;
UPDATE event_log SET schema_version = 1 WHERE schema_version IS NULL;
UPDATE event_log SET timestamp = CURRENT_TIMESTAMP WHERE timestamp IS NULL;
UPDATE event_log SET created_at = COALESCE(timestamp, CURRENT_TIMESTAMP) WHERE created_at IS NULL;
ALTER TABLE event_log ALTER COLUMN event_id SET DEFAULT gen_random_uuid();
ALTER TABLE event_log ALTER COLUMN schema_version SET DEFAULT 1;
ALTER TABLE event_log ALTER COLUMN timestamp SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE event_log ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE event_log ALTER COLUMN event_id SET NOT NULL;
ALTER TABLE event_log ALTER COLUMN schema_version SET NOT NULL;
ALTER TABLE event_log ALTER COLUMN timestamp SET NOT NULL;
ALTER TABLE event_log ALTER COLUMN asset_id SET NOT NULL;
ALTER TABLE event_log ALTER COLUMN event_type SET NOT NULL;
ALTER TABLE event_log ALTER COLUMN severity SET NOT NULL;
ALTER TABLE event_log ALTER COLUMN created_at SET NOT NULL;

DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    FOR constraint_name IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.event_log'::regclass
          AND contype = 'f'
    LOOP
        EXECUTE format('ALTER TABLE public.event_log DROP CONSTRAINT %I', constraint_name);
    END LOOP;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_event_log_event_id ON event_log (event_id);
ALTER TABLE event_log
    ADD CONSTRAINT event_log_asset_id_fkey
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE NOT VALID;
COMMENT ON CONSTRAINT event_log_asset_id_fkey ON event_log IS
    'NOT VALID preserves any historical orphan rows while enforcing canonical assets(id) integrity for new writes.';

CREATE TABLE IF NOT EXISTS telemetry_receipts (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(100) NOT NULL,
    message_id VARCHAR(256) NOT NULL,
    payload_hash CHAR(64) NOT NULL,
    machine_telemetry_id BIGINT UNIQUE REFERENCES machine_telemetry(id) ON DELETE RESTRICT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    committed_at TIMESTAMPTZ,
    CONSTRAINT telemetry_receipts_device_message_key UNIQUE (device_id, message_id),
    CONSTRAINT telemetry_receipts_payload_hash_format CHECK (payload_hash ~ '^[0-9a-f]{64}$')
);
CREATE INDEX IF NOT EXISTS idx_telemetry_receipts_received_at
    ON telemetry_receipts (received_at);
