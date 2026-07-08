"""
mkz_routes.py

REST API routes for MKZ Factory PLC monitoring system integration.
Allows external applications (including Odysseus AI agents) to query factory data
through standard REST endpoints with JWT authentication.
"""

import os
import json
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from src.auth_helpers import get_current_user

logger = logging.getLogger(__name__)

# Database configuration
DB_CONFIG = {
    "host": os.getenv("MKZ_DB_HOST", "localhost"),
    "port": int(os.getenv("MKZ_DB_PORT", "5432")),
    "database": os.getenv("MKZ_DB_NAME", "plc_monitoring"),
    "user": os.getenv("MKZ_DB_USER", "postgres"),
    "password": os.getenv("MKZ_DB_PASSWORD", "12345678"),
}

_psycopg2 = None


def _get_psycopg2():
    global _psycopg2
    if _psycopg2 is None:
        try:
            import psycopg2
            import psycopg2.extras
            _psycopg2 = (psycopg2, psycopg2.extras)
        except ImportError:
            raise HTTPException(status_code=500, detail="psycopg2 not installed")
    return _psycopg2


def get_db_connection():
    psycopg2, extras = _get_psycopg2()
    return psycopg2.connect(**DB_CONFIG, cursor_factory=extras.RealDictCursor)


def execute_query(query: str, params: tuple = None) -> List[Dict]:
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query, params)
                return [dict(row) for row in cur.fetchall()]
    except Exception as e:
        logger.error(f"Database error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========== Pydantic Models ==========

class MachineResponse(BaseModel):
    id: str
    name: str
    ip: Optional[str] = None
    status: str
    machine_code: Optional[str] = None
    cpu_percent: Optional[float] = None
    ram_percent: Optional[float] = None
    uptime_seconds: Optional[int] = None
    approval_status: Optional[str] = None
    last_heartbeat: Optional[datetime] = None
    plc_connected: Optional[bool] = None
    plc_brand: Optional[str] = None
    plc_ip: Optional[str] = None
    client_id: Optional[str] = None
    production_count: Optional[int] = None
    line_name: Optional[str] = None
    line_id: Optional[str] = None


class ProductionLineResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    machine_count: int
    running_count: int
    error_count: int
    created_at: Optional[datetime] = None


class AlarmResponse(BaseModel):
    id: int
    machine_id: Optional[str] = None
    severity: str
    message: Optional[str] = None
    status: str
    acknowledged_by: Optional[str] = None
    acknowledged_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime
    machine_name: Optional[str] = None


class DashboardSummaryResponse(BaseModel):
    timestamp: datetime
    machines: Dict[str, int]
    production_today: Dict[str, Any]
    active_alarms: int


class SystemInfoResponse(BaseModel):
    database: str
    host: str
    tables: List[Dict[str, Any]]


# ========== Router Setup ==========

def setup_mkz_routes() -> APIRouter:
    router = APIRouter(prefix="/api/mkz", tags=["MKZ Factory"])

    @router.get("/machines", response_model=List[MachineResponse])
    async def get_machines(
        status: str = Query("", description="Filter by status"),
        limit: int = Query(50, ge=1, le=200),
    ):
        status_filter = "AND UPPER(m.status) = UPPER(%s)" if status else ""
        params: list = []
        if status:
            params.append(status)
        params.append(limit)

        query = f"""
            SELECT
                m.id, m.name, m.ip, m.status, m.machine_code,
                m.cpu_percent, m.ram_percent, m.uptime_seconds,
                m.approval_status, m.last_heartbeat,
                m.plc_connected, m.plc_brand, m.plc_ip,
                m.client_id, m.production_count,
                pl.name as line_name, pl.id as line_id
            FROM machines m
            LEFT JOIN line_machines lm ON m.id = lm.machine_id
            LEFT JOIN production_lines pl ON lm.line_id = pl.id
            WHERE 1=1 {status_filter}
            ORDER BY m.name
            LIMIT %s
        """
        return execute_query(query, tuple(params))

    @router.get("/production-lines", response_model=List[ProductionLineResponse])
    async def get_production_lines():
        query = """
            SELECT
                pl.id, pl.name, pl.description, pl.created_at,
                COUNT(DISTINCT lm.machine_id) as machine_count,
                COUNT(DISTINCT CASE WHEN UPPER(m.status) = 'RUNNING' THEN m.id END) as running_count,
                COUNT(DISTINCT CASE WHEN UPPER(m.status) = 'ERROR' THEN m.id END) as error_count
            FROM production_lines pl
            LEFT JOIN line_machines lm ON pl.id = lm.line_id
            LEFT JOIN machines m ON lm.machine_id = m.id
            GROUP BY pl.id, pl.name, pl.description, pl.created_at
            ORDER BY pl.name
        """
        return execute_query(query)

    @router.get("/alarms", response_model=List[AlarmResponse])
    async def get_alarms(
        status: str = Query("", description="ACTIVE, ACKNOWLEDGED, RESOLVED"),
        severity: str = Query("", description="CRITICAL, HIGH, MEDIUM, LOW"),
        limit: int = Query(50, ge=1, le=200),
    ):
            query = """
                SELECT
                    a.id, a.machine_id, a.severity, a.message,
                    a.status, a.acknowledged_by, a.acknowledged_at,
                    a.resolved_at, a.notes, a.created_at,
                    m.name as machine_name
                FROM alarms a
                LEFT JOIN machines m ON a.machine_id = m.id
                WHERE (a.status = %s OR %s IS NULL OR %s = '')
                  AND (a.severity = %s OR %s IS NULL OR %s = '')
                ORDER BY
                    CASE a.severity
                        WHEN 'CRITICAL' THEN 1
                        WHEN 'HIGH' THEN 2
                        WHEN 'MEDIUM' THEN 3
                        ELSE 4
                    END,
                    a.created_at DESC
                LIMIT %s
            """
            return execute_query(query, (status, status, status, severity, severity, severity, limit))

    @router.get("/dashboard")
    async def get_dashboard_summary():
        status_query = "SELECT status, COUNT(*) as count FROM machines GROUP BY status"
        status_counts = execute_query(status_query)
        status_dict = {str(row['status']).upper(): row['count'] for row in status_counts}

        production_query = """
            SELECT 
                COALESCE(SUM(hourly_qty), 0) as total_production,
                COUNT(DISTINCT machine_id) as active_machines
            FROM machine_hourly_production
            WHERE prod_date = CURRENT_DATE
        """
        production = execute_query(production_query)

        alarm_query = "SELECT COUNT(*) as count FROM alarms WHERE UPPER(status) = 'ACTIVE'"
        alarms = execute_query(alarm_query)

        return {
            "timestamp": datetime.now(),
            "machines": {
                "total": sum(status_dict.values()),
                "running": status_dict.get("RUNNING", 0),
                "idle": status_dict.get("IDLE", 0),
                "error": status_dict.get("ERROR", 0),
                "offline": status_dict.get("OFFLINE", 0),
            },
            "production_today": {
                "total_output": production[0]['total_production'] if production else 0,
                "active_machines": production[0]['active_machines'] if production else 0,
            },
            "active_alarms": alarms[0]['count'] if alarms else 0,
        }

    @router.get("/reports/production")
    async def get_production_report(
        time_range: str = Query("today", description="today, last_7_days, month"),
        line_id: str = Query(""),
        machine_id: str = Query(""),
    ):
        time_filters = {
            "today": "prod_date = CURRENT_DATE",
            "last_7_days": "prod_date >= CURRENT_DATE - INTERVAL '7 days'",
            "month": "prod_date >= CURRENT_DATE - INTERVAL '30 days'",
        }
        time_filter = time_filters.get(time_range, "prod_date = CURRENT_DATE")

        machine_filter = "AND mhp.machine_id = %s" if machine_id else ""
        params = (machine_id,) if machine_id else ()

        summary_query = f"""
            SELECT
                COALESCE(SUM(mhp.hourly_qty), 0) as total_production,
                COUNT(DISTINCT mhp.machine_id) as machines_reporting,
                AVG(mhp.avg_cpu) as avg_cpu,
                AVG(mhp.avg_ram) as avg_ram
            FROM machine_hourly_production mhp
            WHERE {time_filter} {machine_filter}
        """
        summary = execute_query(summary_query, params if params else None)

        chart_query = f"""
            SELECT prod_date::text as label, prod_hour, SUM(hourly_qty) as output
            FROM machine_hourly_production mhp
            WHERE {time_filter} {machine_filter}
            GROUP BY prod_date, prod_hour
            ORDER BY prod_date, prod_hour
        """
        chart_data = execute_query(chart_query, params if params else None)

        return {
            "time_range": time_range,
            "summary": summary[0] if summary else {},
            "chart_data": chart_data,
        }

    @router.get("/telemetry")
    async def get_telemetry(
        machine_id: str = Query(""),
        hours: int = Query(1, ge=1, le=48),
        limit: int = Query(100, ge=1, le=500),
    ):
        if machine_id:
            query = """
                SELECT machine_id, status, plc_connected, production_count,
                       cycle_time, cpu_percent, ram_percent, uptime_seconds, created_at
                FROM machine_telemetry_history
                WHERE machine_id = %s
                  AND created_at > NOW() - (%s || ' hours')::INTERVAL
                ORDER BY created_at DESC
                LIMIT %s
            """
            results = execute_query(query, (machine_id, str(hours), limit))
        else:
            query = """
                SELECT machine_id, status, plc_connected, production_count,
                       cycle_time, cpu_percent, ram_percent, uptime_seconds, created_at
                FROM machine_telemetry_history
                WHERE created_at > NOW() - (%s || ' hours')::INTERVAL
                ORDER BY created_at DESC
                LIMIT %s
            """
            results = execute_query(query, (str(hours), limit))
        return results

    @router.get("/telemetry/{machine_id}")
    async def get_machine_telemetry(
        machine_id: str,
        hours: int = Query(24, ge=1, le=48),
        limit: int = Query(100, ge=1, le=500),
    ):
        query = """
            SELECT machine_id, status, plc_connected, production_count,
                   cycle_time, cpu_percent, ram_percent, uptime_seconds, created_at
            FROM machine_telemetry_history
            WHERE machine_id = %s
              AND created_at > NOW() - (%s || ' hours')::INTERVAL
            ORDER BY created_at DESC
            LIMIT %s
        """
        return execute_query(query, (machine_id, str(hours), limit))

    @router.get("/audit-logs")
    async def get_audit_logs(
        username: str = Query(""),
        limit: int = Query(50, ge=1, le=200),
    ):
        query = """
            SELECT id, username, action, details, created_at
            FROM audit_logs
            WHERE (%s = '' OR username = %s)
            ORDER BY created_at DESC
            LIMIT %s
        """
        return execute_query(query, (username, username, limit))

    @router.get("/system-info", response_model=SystemInfoResponse)
    async def get_system_info():
        tables_query = """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name
        """
        tables = execute_query(tables_query)

        table_info = []
        for t in tables:
            table_name = t['table_name']
            count_result = execute_query(f'SELECT COUNT(*) as row_count FROM {table_name}')
            table_info.append({
                "table": table_name,
                "rows": count_result[0]['row_count'] if count_result else 0,
            })

        return {
            "database": DB_CONFIG["database"],
            "host": DB_CONFIG["host"],
            "tables": table_info,
        }

    @router.get("/health")
    async def health_check():
        try:
            execute_query("SELECT 1")
            return {"status": "healthy", "database": DB_CONFIG["database"]}
        except Exception as e:
            return {"status": "unhealthy", "error": str(e)}

    return router
