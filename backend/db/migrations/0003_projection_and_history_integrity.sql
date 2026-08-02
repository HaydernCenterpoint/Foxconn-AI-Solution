-- Durable secondary projection receipts and retained telemetry/event history.

ALTER TABLE telemetry_receipts
    ADD COLUMN IF NOT EXISTS projection_status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS projection_attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS projection_available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS projection_completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS projection_last_error TEXT;

ALTER TABLE telemetry_receipts DROP CONSTRAINT IF EXISTS telemetry_receipts_projection_status_check;
ALTER TABLE telemetry_receipts
    ADD CONSTRAINT telemetry_receipts_projection_status_check
    CHECK (projection_status IN ('PENDING', 'COMPLETED'));

CREATE INDEX IF NOT EXISTS idx_telemetry_receipts_projection_pending
    ON telemetry_receipts (projection_available_at, id)
    WHERE projection_status = 'PENDING' AND machine_telemetry_id IS NOT NULL;

ALTER TABLE machine_telemetry_history
    ADD COLUMN IF NOT EXISTS source_telemetry_id BIGINT;
ALTER TABLE machine_telemetry_history DROP CONSTRAINT IF EXISTS machine_telemetry_history_source_telemetry_id_fkey;
ALTER TABLE machine_telemetry_history
    ADD CONSTRAINT machine_telemetry_history_source_telemetry_id_fkey
    FOREIGN KEY (source_telemetry_id) REFERENCES machine_telemetry(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS ux_machine_telemetry_history_source
    ON machine_telemetry_history (source_telemetry_id)
    WHERE source_telemetry_id IS NOT NULL;

ALTER TABLE telemetry_data DROP CONSTRAINT IF EXISTS telemetry_data_asset_id_fkey;
ALTER TABLE telemetry_data
    ADD CONSTRAINT telemetry_data_asset_id_fkey
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE RESTRICT NOT VALID;
COMMENT ON CONSTRAINT telemetry_data_asset_id_fkey ON telemetry_data IS
    'NOT VALID preserves historical orphan rows; RESTRICT prevents catalog deletion from erasing normalized telemetry.';

ALTER TABLE event_log DROP CONSTRAINT IF EXISTS event_log_asset_id_fkey;
ALTER TABLE event_log
    ADD CONSTRAINT event_log_asset_id_fkey
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE RESTRICT NOT VALID;
COMMENT ON CONSTRAINT event_log_asset_id_fkey ON event_log IS
    'NOT VALID preserves historical orphan rows; RESTRICT prevents catalog deletion from erasing event history.';
