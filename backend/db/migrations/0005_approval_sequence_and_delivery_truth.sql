-- Approval-safe liveness, immutable delivery sequences, and fail-closed secondary delivery states.

ALTER TABLE machines
    ALTER COLUMN approval_status SET DEFAULT 'PENDING';

ALTER TABLE telemetry_receipts
    ADD COLUMN IF NOT EXISTS delivery_sequence BIGINT;

UPDATE telemetry_receipts receipt
SET delivery_sequence = telemetry.sequence
FROM machine_telemetry telemetry
WHERE telemetry.id = receipt.machine_telemetry_id
  AND receipt.delivery_sequence IS NULL;

ALTER TABLE telemetry_receipts
    DROP CONSTRAINT IF EXISTS telemetry_receipts_delivery_sequence_positive;
ALTER TABLE telemetry_receipts
    ADD CONSTRAINT telemetry_receipts_delivery_sequence_positive
    CHECK (delivery_sequence IS NOT NULL AND delivery_sequence > 0) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS ux_telemetry_receipts_device_sequence
    ON telemetry_receipts (device_id, delivery_sequence)
    WHERE delivery_sequence IS NOT NULL;

ALTER TABLE machine_telemetry
    DROP CONSTRAINT IF EXISTS machine_telemetry_sequence_positive;
ALTER TABLE machine_telemetry
    ADD CONSTRAINT machine_telemetry_sequence_positive
    CHECK (sequence > 0) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS ux_machine_telemetry_machine_sequence
    ON machine_telemetry (machine_id, sequence)
    WHERE sequence > 0;

ALTER TABLE telemetry_secondary_deliveries
    DROP CONSTRAINT IF EXISTS telemetry_secondary_deliveries_status_check;
ALTER TABLE telemetry_secondary_deliveries
    ADD CONSTRAINT telemetry_secondary_deliveries_status_check
    CHECK (status IN ('PENDING', 'LEASED', 'COMPLETED', 'DISABLED'));

CREATE INDEX IF NOT EXISTS idx_telemetry_secondary_deliveries_disabled
    ON telemetry_secondary_deliveries (target, receipt_id)
    WHERE status = 'DISABLED';
