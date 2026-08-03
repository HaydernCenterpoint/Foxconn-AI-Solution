-- Per-target durable secondary delivery and machine-history retention hardening.

CREATE TABLE IF NOT EXISTS telemetry_secondary_deliveries (
    receipt_id BIGINT NOT NULL REFERENCES telemetry_receipts(id) ON DELETE CASCADE,
    target VARCHAR(16) NOT NULL,
    idempotency_key VARCHAR(256) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    attempts INTEGER NOT NULL DEFAULT 0,
    available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lease_id UUID,
    lease_expires_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (receipt_id, target),
    CONSTRAINT telemetry_secondary_deliveries_target_check
        CHECK (target IN ('CEP', 'TIMESCALE')),
    CONSTRAINT telemetry_secondary_deliveries_status_check
        CHECK (status IN ('PENDING', 'LEASED', 'COMPLETED')),
    CONSTRAINT telemetry_secondary_deliveries_idempotency_key_key UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_telemetry_secondary_deliveries_pending
    ON telemetry_secondary_deliveries (available_at, receipt_id, target)
    WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_telemetry_secondary_deliveries_expired_lease
    ON telemetry_secondary_deliveries (lease_expires_at, receipt_id, target)
    WHERE status = 'LEASED';

INSERT INTO telemetry_secondary_deliveries
    (receipt_id, target, idempotency_key, status, attempts, available_at,
     completed_at, last_error)
SELECT receipt.id,
       target.name,
       'telemetry:' || receipt.id::text || ':' || lower(target.name),
       'PENDING',
       receipt.projection_attempts,
       receipt.projection_available_at,
       NULL,
       receipt.projection_last_error
FROM telemetry_receipts receipt
CROSS JOIN (VALUES ('CEP'), ('TIMESCALE')) AS target(name)
WHERE receipt.machine_telemetry_id IS NOT NULL
ON CONFLICT (receipt_id, target) DO NOTHING;

-- The old combined state treated volatile CEP queue admission as completion and cannot be
-- trusted per target. Every upgraded row is replayed idempotently through the new target rows.
ALTER TABLE telemetry_receipts
    DROP COLUMN IF EXISTS projection_status,
    DROP COLUMN IF EXISTS projection_attempts,
    DROP COLUMN IF EXISTS projection_available_at,
    DROP COLUMN IF EXISTS projection_completed_at,
    DROP COLUMN IF EXISTS projection_last_error;

DO $$
DECLARE constraint_name TEXT;
BEGIN
    FOR constraint_name IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.machine_telemetry'::regclass
          AND contype = 'f'
          AND confrelid = 'public.machines'::regclass
    LOOP
        EXECUTE format('ALTER TABLE public.machine_telemetry DROP CONSTRAINT %I', constraint_name);
    END LOOP;
    ALTER TABLE machine_telemetry
        ADD CONSTRAINT machine_telemetry_machine_id_fkey
        FOREIGN KEY (machine_id) REFERENCES machines(id) ON DELETE RESTRICT NOT VALID;

    FOR constraint_name IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.machine_telemetry_history'::regclass
          AND contype = 'f'
          AND confrelid = 'public.machines'::regclass
    LOOP
        EXECUTE format('ALTER TABLE public.machine_telemetry_history DROP CONSTRAINT %I', constraint_name);
    END LOOP;
    ALTER TABLE machine_telemetry_history
        ADD CONSTRAINT machine_telemetry_history_machine_id_fkey
        FOREIGN KEY (machine_id) REFERENCES machines(id) ON DELETE RESTRICT NOT VALID;
END;
$$;

COMMENT ON CONSTRAINT machine_telemetry_machine_id_fkey ON machine_telemetry IS
    'NOT VALID preserves legacy rows while preventing machine deletion from erasing raw telemetry.';
COMMENT ON CONSTRAINT machine_telemetry_history_machine_id_fkey ON machine_telemetry_history IS
    'NOT VALID preserves legacy history, including rows without source_telemetry_id, while blocking cascade deletion.';
