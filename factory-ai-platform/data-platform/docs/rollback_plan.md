# Rollback Plan: PostgreSQL to TimescaleDB Migration
# Version: 1.0.0
# Last Updated: 2026-07-09

## Overview

This document describes the rollback procedure in case the TimescaleDB migration
needs to be reverted.

## Rollback Triggers

Initiate rollback if:
- Query performance degrades >50% after 72 hours
- Data integrity issues detected (>0.1% data loss)
- TimescaleDB service unavailable >15 minutes
- Critical bugs affecting production data

## Rollback Procedure

### Phase 1: Stop Write Traffic (5 minutes)

```bash
# 1. Stop all connectors writing to TimescaleDB
docker-compose stop erp-connector mes-connector file-watcher-connector

# 2. Set dual-write mode to PostgreSQL only
export DUAL_WRITE_MODE=rollback

# 3. Switch application to PostgreSQL mode
# (Update your application config to use legacy tables)
```

### Phase 2: Verify PostgreSQL Connectivity (5 minutes)

```bash
# Verify PostgreSQL is accepting writes
psql -h localhost -U factory_user -d factory_db -c "SELECT 1"

# Check legacy tables are accessible
psql -h localhost -U factory_user -d factory_db -c "SELECT COUNT(*) FROM machine_telemetry_history"
```

### Phase 3: Redirect Read Traffic (10 minutes)

```sql
-- Switch application read queries to PostgreSQL
-- Update application code or proxy rules

-- Verify PostgreSQL can handle read load
SELECT COUNT(*) FROM telemetry;  -- Should fail, data is in legacy tables
SELECT COUNT(*) FROM machine_telemetry_history;  -- Should work
```

### Phase 4: Decommission TimescaleDB (30 minutes)

```bash
# 1. Stop TimescaleDB container
docker-compose stop timescaledb

# 2. Remove TimescaleDB containers
docker-compose rm -f timescaledb

# 3. Remove TimescaleDB volumes
docker volume rm factory-ai-platform_timescaledb_data

# 4. Restore PostgreSQL in docker-compose
# (Revert to pgvector/pgvector:0.7.0-pg16 image)
```

### Phase 5: Verify Rollback (15 minutes)

```bash
# 1. Verify application functionality
curl http://localhost:8080/health

# 2. Verify database writes
curl -X POST http://localhost:8080/api/telemetry \
  -d '{"asset_id": "...", "metric": "test", "value": 1}'

# 3. Verify reads
curl http://localhost:8080/api/telemetry/latest

# 4. Check logs for errors
docker-compose logs --tail=100
```

## Data Recovery

### If TimescaleDB Data Needs to Be Preserved

```bash
# 1. Export remaining TimescaleDB data
pg_dump -h localhost -U factory_user -d factory_db \
  -t telemetry -t events \
  -f timeseries_backup.sql

# 2. Store backup securely
aws s3 cp timeseries_backup.sql s3://factory-backups/timeseries_backup_$(date +%Y%m%d).sql

# 3. Mark backup in rollback log
echo "$(date): TimescaleDB backup saved to S3" >> rollback_log.txt
```

## Post-Rollback Actions

1. **Notify stakeholders** (immediate)
   - Send status update to ops team
   - Update incident ticket

2. **Root cause analysis** (within 24 hours)
   - Document what caused the rollback need
   - Identify fixes for next migration attempt

3. **Schedule retry** (within 1 week)
   - Plan fixes based on root cause
   - Schedule maintenance window

## Quick Rollback Commands

```bash
# Emergency rollback - single command
docker-compose stop erp-connector mes-connector file-watcher-connector data-platform-api && \
docker-compose rm -f timescaledb && \
docker volume rm factory-ai-platform_timescaledb_data
```

## Contact Information

- Database Admin: [Your DBA]
- On-Call Engineer: [PagerDuty escalation]
- Data Team Lead: [Your team lead]

## Checkpoints

| Checkpoint | Status | Timestamp | Initials |
|------------|--------|-----------|----------|
| Write traffic stopped | ☐ | | |
| PostgreSQL verified | ☐ | | |
| Read traffic redirected | ☐ | | |
| TimescaleDB stopped | ☐ | | |
| Application verified | ☐ | | |
