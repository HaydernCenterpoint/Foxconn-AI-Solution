# MKZ Factory + Odysseus Integration Guide

## Overview

This guide explains how to integrate the MKZ Factory PLC monitoring system with Odysseus AI workspace.

## Quick Start

### 1. Start Server
```bash
cd d:\hnhnhnhnh\odysseus
$env:MKZ_DB_HOST="localhost"; $env:MKZ_DB_PORT="5432"; $env:MKZ_DB_NAME="plc_monitoring"; $env:MKZ_DB_USER="postgres"; $env:MKZ_DB_PASSWORD="12345678"; $env:AUTH_ENABLED="false"
python -m uvicorn app:app --host 127.0.0.1 --port 7000
```

### 2. Test API
```bash
# Health check
Invoke-RestMethod -Uri "http://127.0.0.1:7000/api/mkz/health" -Method GET

# Get dashboard
Invoke-RestMethod -Uri "http://127.0.0.1:7000/api/mkz/dashboard" -Method GET

# Get machines
Invoke-RestMethod -Uri "http://127.0.0.1:7000/api/mkz/machines" -Method GET
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/mkz/health` | GET | Health check |
| `/api/mkz/dashboard` | GET | Dashboard summary |
| `/api/mkz/machines` | GET | List all machines |
| `/api/mkz/production-lines` | GET | List production lines |
| `/api/mkz/alarms` | GET | List alarms |
| `/api/mkz/reports/production` | GET | Production reports |
| `/api/mkz/telemetry` | GET | Live telemetry |
| `/api/mkz/audit-logs` | GET | Audit logs |
| `/api/mkz/system-info` | GET | DB schema info |

## REST API Examples

### Get Machines
```bash
curl "http://localhost:7000/api/mkz/machines"
```

### Get Dashboard
```bash
curl "http://localhost:7000/api/mkz/dashboard"
```

### Get Production Report (7 days)
```bash
curl "http://localhost:7000/api/mkz/reports/production?time_range=last_7_days"
```

### Get Alarms
```bash
curl "http://localhost:7000/api/mkz/alarms"
```

## MCP Server Tools

The MCP server (`mcp_servers/plc_mcp_server.py`) provides these tools:

| Tool | Description |
|------|-------------|
| `mkz_get_machines` | Get all machines |
| `mkz_get_production_lines` | Get production lines |
| `mkz_get_alarms` | Get alarms |
| `mkz_get_dashboard_summary` | Dashboard KPIs |
| `mkz_get_production_report` | Production reports |
| `mkz_get_telemetry` | Live telemetry |
| `mkz_get_audit_logs` | Audit trail |
| `mkz_get_system_info` | Database info |

### Connect MCP Server
1. Settings → MCP Servers → Add
2. Command: `python`
3. Args: `mcp_servers/plc_mcp_server.py`
4. Environment variables:
   - `MKZ_DB_HOST=localhost`
   - `MKZ_DB_PORT=5432`
   - `MKZ_DB_NAME=plc_monitoring`
   - `MKZ_DB_USER=postgres`
   - `MKZ_DB_PASSWORD=12345678`

## Sync Script

### Manual Sync
```bash
cd d:\hnhnhnhnh\odysseus
python scripts/sync_mkz_to_odysseus.py
```

### Export Only
```bash
python scripts/sync_mkz_to_odysseus.py --export-only
```

### With Verbose Output
```bash
python scripts/sync_mkz_to_odysseus.py -v
```

## Database Schema

### Tables Available
| Table | Description |
|-------|-------------|
| `machines` | Machine registry (7 machines) |
| `production_lines` | Production lines |
| `line_machines` | Line-machine relationships |
| `machine_hourly_production` | Hourly production stats |
| `machine_telemetry_history` | Telemetry history |
| `alarms` | Alarm events |
| `audit_logs` | User actions |
| `plc_clients` | PLC client registry |

### Machine Status Values
- `RUNNING` - Machine operating
- `IDLE` - Machine idle
- `ERROR` - Machine in error state
- `OFFLINE` - Machine disconnected
- `MAINTENANCE` - Under maintenance

### Alarm Severity Levels
- `CRITICAL` - Immediate attention required
- `HIGH` - High priority
- `MEDIUM` - Medium priority
- `LOW` - Low priority

## Files Created

| File | Purpose |
|------|---------|
| `mcp_servers/plc_mcp_server.py` | MCP server |
| `routes/mkz_routes.py` | REST API |
| `scripts/sync_mkz_to_odysseus.py` | Data sync |
| `docker-compose.yml` | Production Docker |
| `Dockerfile.sync` | Sync container |
| `config/mosquitto.conf` | MQTT config |
| `INTEGRATION.md` | This documentation |

## Example Questions for Odysseus

After connecting MCP, ask Odysseus:
- "Show me all machines in the factory"
- "What are the active alarms?"
- "Get the production report for the last 7 days"
- "Show me machine JUMPER-01 telemetry"
- "What is the current machine status?"
- "List all production lines"
- "Show me the audit log for today"

## Troubleshooting

### Database Connection Failed
```
Error: could not connect to server
```
- Check PostgreSQL is running
- Verify credentials in environment variables

### Port 7000 Already in Use
```bash
netstat -ano | Select-String "7000"
# Kill the process using that port
Stop-Process -Id <PID> -Force
```

### MCP Server Won't Connect
- Ensure psycopg2-binary is installed
- Check environment variables are set
- Restart Odysseus after changes

## Production Deployment

### Docker Compose
```bash
cd odysseus
docker-compose up -d
```

### Environment Variables
Set in `.env` file:
```env
MKZ_DB_HOST=mkz-db
MKZ_DB_PORT=5432
MKZ_DB_NAME=plc_monitoring
MKZ_DB_USER=postgres
MKZ_DB_PASSWORD=your_password
AUTH_ENABLED=true
JWT_SECRET=your_jwt_secret
```
