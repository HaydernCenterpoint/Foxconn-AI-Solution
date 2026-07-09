# Migration 002: Migrate from existing PostgreSQL tables to TimescaleDB
# 
# Source tables (from backend/db/init.sql):
#   - machines (id, name, ip, status, machine_code, etc.)
#   - machine_telemetry (id, machine_id, raw_json, sequence, created_at)
#   - machine_telemetry_history (id, machine_id, status, plc_connected, production_count,
#                                 cycle_time, cpu_percent, ram_percent, uptime_seconds, tags, created_at)
#   - machine_hourly_production (id, machine_id, prod_date, prod_hour, produced_qty_start,
#                                  produced_qty_end, hourly_qty, plc_run_time_start, plc_run_time_end,
#                                  avg_cpu, avg_ram, received_at, last_raw_qty, oee_availability)
#   - alarms (id, machine_id, severity, message, status, acknowledged_by, acknowledged_at, resolved_at, notes, created_at)
#
# Target: telemetry + events hypertable

-- ============================================================
-- STEP 1: Sync assets table from machines
-- ============================================================

INSERT INTO assets (id, name, type, metadata, created_at)
SELECT 
    id,
    COALESCE(name, machine_code),
    'machine',
    jsonb_build_object(
        'ip', ip,
        'status', status,
        'machine_code', machine_code,
        'plc_brand', plc_brand,
        'plc_ip', plc_ip,
        'plc_port', plc_port,
        'plc_connected', plc_connected,
        'production_count', production_count,
        'machine_runtime_seconds', machine_runtime_seconds,
        'cpu_percent', cpu_percent,
        'ram_percent', ram_percent,
        'uptime_seconds', uptime_seconds,
        'approval_status', approval_status
    ),
    created_at
FROM machines m
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    metadata = EXCLUDED.metadata,
    updated_at = NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM assets WHERE id = m.id
);

-- ============================================================
-- STEP 2: Migrate machine_telemetry_history to telemetry
-- Extracts numeric metrics from the flat table
-- ============================================================

INSERT INTO telemetry (time, asset_id, metric, value, tags)
SELECT 
    created_at AS time,
    machine_id AS asset_id,
    metric_name,
    metric_value,
    jsonb_build_object(
        'source_table', 'machine_telemetry_history',
        'status', status,
        'plc_connected', plc_connected
    ) AS tags
FROM (
    SELECT 
        machine_id,
        created_at,
        status,
        plc_connected,
        'production_count' AS metric_name,
        production_count::double precision AS metric_value
    FROM machine_telemetry_history WHERE production_count IS NOT NULL
    
    UNION ALL
    
    SELECT machine_id, created_at, status, plc_connected,
           'cycle_time', cycle_time::double precision
    FROM machine_telemetry_history WHERE cycle_time IS NOT NULL
    
    UNION ALL
    
    SELECT machine_id, created_at, status, plc_connected,
           'cpu_percent', cpu_percent::double precision
    FROM machine_telemetry_history WHERE cpu_percent IS NOT NULL
    
    UNION ALL
    
    SELECT machine_id, created_at, status, plc_connected,
           'ram_percent', ram_percent::double precision
    FROM machine_telemetry_history WHERE ram_percent IS NOT NULL
    
    UNION ALL
    
    SELECT machine_id, created_at, status, plc_connected,
           'uptime_seconds', uptime_seconds::double precision
    FROM machine_telemetry_history WHERE uptime_seconds IS NOT NULL
) AS metrics;

-- ============================================================
-- STEP 3: Migrate machine_telemetry raw_json to telemetry
-- Parse JSON and extract individual metrics
-- ============================================================

INSERT INTO telemetry (time, asset_id, metric, value, tags)
SELECT 
    created_at AS time,
    machine_id AS asset_id,
    metric_key AS metric,
    metric_value::double precision,
    jsonb_build_object(
        'source_table', 'machine_telemetry',
        'sequence', sequence,
        'client_id', (raw_json->>'clientId')
    ) AS tags
FROM (
    SELECT 
        mt.machine_id,
        mt.created_at,
        mt.sequence,
        (mt.raw_json->>'clientId') AS client_id,
        (mt.raw_json->>'productionCount')::int AS production_count,
        (mt.raw_json->>'machineName') AS machine_name
    FROM machine_telemetry mt
    WHERE mt.raw_json IS NOT NULL
) AS source,
LATERAL (
    VALUES
        ('production_count', source.production_count::text)
) AS parsed(metric_key, metric_value)
WHERE metric_value IS NOT NULL;

-- ============================================================
-- STEP 4: Migrate machine_hourly_production to telemetry
-- Hourly aggregated production metrics
-- ============================================================

INSERT INTO telemetry (time, asset_id, metric, value, tags)
SELECT 
    received_at AS time,
    machine_id AS asset_id,
    metric_name,
    metric_value,
    jsonb_build_object(
        'source_table', 'machine_hourly_production',
        'prod_date', prod_date,
        'prod_hour', prod_hour,
        'oee_availability', oee_availability
    ) AS tags
FROM (
    SELECT 
        machine_id,
        prod_date,
        prod_hour,
        received_at,
        oee_availability,
        (prod_date || ' ' || LPAD(prod_hour::text, 2, '0') || ':00:00')::timestamptz AS hour_time,
        
        'produced_qty' AS metric_name,
        hourly_qty::double precision AS metric_value
    FROM machine_hourly_production
    WHERE hourly_qty IS NOT NULL
    
    UNION ALL
    
    SELECT machine_id, prod_date, prod_hour, received_at, oee_availability,
           (prod_date || ' ' || LPAD(prod_hour::text, 2, '0') || ':00:00')::timestamptz,
           'produced_qty_start', produced_qty_start::double precision
    FROM machine_hourly_production WHERE produced_qty_start IS NOT NULL
    
    UNION ALL
    
    SELECT machine_id, prod_date, prod_hour, received_at, oee_availability,
           (prod_date || ' ' || LPAD(prod_hour::text, 2, '0') || ':00:00')::timestamptz,
           'produced_qty_end', produced_qty_end::double precision
    FROM machine_hourly_production WHERE produced_qty_end IS NOT NULL
    
    UNION ALL
    
    SELECT machine_id, prod_date, prod_hour, received_at, oee_availability,
           (prod_date || ' ' || LPAD(prod_hour::text, 2, '0') || ':00:00')::timestamptz,
           'plc_run_time', (COALESCE(plc_run_time_end, 0) - COALESCE(plc_run_time_start, 0))::double precision
    FROM machine_hourly_production
    
    UNION ALL
    
    SELECT machine_id, prod_date, prod_hour, received_at, oee_availability,
           (prod_date || ' ' || LPAD(prod_hour::text, 2, '0') || ':00:00')::timestamptz,
           'avg_cpu', avg_cpu::double precision
    FROM machine_hourly_production WHERE avg_cpu IS NOT NULL
    
    UNION ALL
    
    SELECT machine_id, prod_date, prod_hour, received_at, oee_availability,
           (prod_date || ' ' || LPAD(prod_hour::text, 2, '0') || ':00:00')::timestamptz,
           'avg_ram', avg_ram::double precision
    FROM machine_hourly_production WHERE avg_ram IS NOT NULL
    
    UNION ALL
    
    SELECT machine_id, prod_date, prod_hour, received_at, oee_availability,
           (prod_date || ' ' || LPAD(prod_hour::text, 2, '0') || ':00:00')::timestamptz,
           'oee_availability', oee_availability::double precision
    FROM machine_hourly_production WHERE oee_availability IS NOT NULL
) AS hourly_metrics;

-- ============================================================
-- STEP 5: Migrate alarms to events
-- ============================================================

INSERT INTO events (event_id, timestamp, asset_id, type, severity, payload, source, created_at)
SELECT 
    gen_random_uuid(),
    COALESCE(acknowledged_at, created_at),
    machine_id,
    'alarm',
    severity,
    jsonb_build_object(
        'message', message,
        'status', status,
        'acknowledged_by', acknowledged_by,
        'acknowledged_at', acknowledged_at,
        'resolved_at', resolved_at,
        'notes', notes,
        'original_id', id
    ),
    'plc',
    created_at
FROM alarms
WHERE machine_id IS NOT NULL;

-- ============================================================
-- STEP 6: Create production_lines as assets
-- ============================================================

INSERT INTO assets (id, name, type, metadata, created_at)
SELECT 
    id,
    name,
    'line',
    jsonb_build_object(
        'description', description,
        'is_active', is_active,
        'name_translations', name_translations,
        'description_translations', description_translations
    ),
    created_at
FROM production_lines pl
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    metadata = EXCLUDED.metadata,
    updated_at = NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM assets WHERE id = pl.id
);

-- ============================================================
-- STEP 7: Create line_machines relationships
-- Update machine assets with parent line reference
-- ============================================================

UPDATE assets a
SET metadata = jsonb_set(a.metadata, '{parent_line_id}', to_jsonb(lm.line_id))
FROM line_machines lm
JOIN assets m ON m.id = lm.machine_id
WHERE a.id = lm.machine_id;

-- ============================================================
-- STEP 8: Mark migration complete
-- ============================================================

INSERT INTO _migration_progress (step, status, details)
VALUES (
    '005_postgresql_migration',
    'applied',
    jsonb_build_object(
        'migrated_tables', ARRAY[
            'machine_telemetry_history',
            'machine_telemetry',
            'machine_hourly_production',
            'alarms',
            'machines -> assets',
            'production_lines -> assets',
            'line_machines'
        ],
        'migrated_at', NOW()
    )
)
ON CONFLICT (step) DO NOTHING;

-- ============================================================
-- VERIFICATION: Count migrated rows
-- ============================================================

-- SELECT 
--     'telemetry' AS table_name,
--     COUNT(*) AS row_count,
--     COUNT(DISTINCT asset_id) AS unique_assets,
--     MIN(time) AS earliest,
--     MAX(time) AS latest
-- FROM telemetry
-- UNION ALL
-- SELECT 
--     'events' AS table_name,
--     COUNT(*) AS row_count,
--     COUNT(DISTINCT asset_id) AS unique_assets,
--     MIN(timestamp) AS earliest,
--     MAX(timestamp) AS latest
-- FROM events
-- UNION ALL
-- SELECT 
--     'assets' AS table_name,
--     COUNT(*) AS row_count,
--     NULL::bigint AS unique_assets,
--     MIN(created_at) AS earliest,
--     MAX(created_at) AS latest
-- FROM assets;
