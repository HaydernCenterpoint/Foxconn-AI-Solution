"""
mkz_routes.py

REST API routes for MKZ Factory PLC monitoring integration.
Data is proxied through the authorized .NET backend REST API instead of opening
unauthenticated direct PostgreSQL connections from Odysseus.
"""

import os
import logging
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query

logger = logging.getLogger(__name__)

BACKEND_URL = os.getenv("MKZ_BACKEND_URL", os.getenv("BACKEND_URL", "http://localhost:5000"))
BACKEND_TOKEN = os.getenv("MKZ_BACKEND_TOKEN", "")


def _headers() -> Dict[str, str]:
    return {"Authorization": f"Bearer {BACKEND_TOKEN}"} if BACKEND_TOKEN else {}


async def backend_get(path: str, params: Optional[Dict[str, Any]] = None) -> Any:
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(
                f"{BACKEND_URL.rstrip('/')}{path}",
                params={k: v for k, v in (params or {}).items() if v not in (None, "")},
                headers=_headers(),
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text or exc.response.reason_phrase
        raise HTTPException(status_code=exc.response.status_code, detail=detail)
    except Exception as exc:
        logger.error("Backend request failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc))


def setup_mkz_routes() -> APIRouter:
    router = APIRouter(prefix="/api/mkz", tags=["MKZ Factory"])

    @router.get("/machines")
    async def get_machines(
        status: str = Query("", description="Filter by status"),
        limit: int = Query(50, ge=1, le=200),
    ):
        machines = await backend_get("/api/machines", {"status": status})
        if isinstance(machines, list):
            return machines[:limit]
        return machines

    @router.get("/production-lines")
    async def get_production_lines():
        return await backend_get("/api/production-lines")

    @router.get("/alarms")
    async def get_alarms(
        status: str = Query("", description="ACTIVE, ACKNOWLEDGED, RESOLVED"),
        severity: str = Query("", description="CRITICAL, HIGH, MEDIUM, LOW"),
        limit: int = Query(50, ge=1, le=200),
    ):
        return await backend_get(
            "/api/alarms",
            {"status": status, "severity": severity, "limit": limit},
        )

    @router.get("/dashboard")
    async def get_dashboard_summary():
        return await backend_get("/api/dashboard/summary")

    @router.get("/reports/production")
    async def get_production_report(
        time_range: str = Query("today", description="today, last_7_days, month"),
        line_id: str = Query(""),
        machine_id: str = Query(""),
    ):
        return await backend_get(
            "/api/reports/query",
            {"timeRange": time_range, "lineId": line_id or "all", "machineId": machine_id},
        )

    @router.get("/telemetry")
    async def get_telemetry(
        machine_id: str = Query(""),
        hours: int = Query(1, ge=1, le=48),
        limit: int = Query(100, ge=1, le=500),
    ):
        if machine_id:
            return await backend_get("/api/telemetry/log", {"machineId": machine_id, "count": limit})
        return await backend_get("/api/telemetry/live")

    @router.get("/telemetry/{machine_id}")
    async def get_machine_telemetry(
        machine_id: str,
        hours: int = Query(24, ge=1, le=48),
        limit: int = Query(100, ge=1, le=500),
    ):
        return await backend_get("/api/telemetry/log", {"machineId": machine_id, "count": limit})

    @router.get("/audit-logs")
    async def get_audit_logs(
        username: str = Query(""),
        limit: int = Query(50, ge=1, le=200),
    ):
        return await backend_get("/api/audit-log", {"username": username, "limit": limit})

    @router.get("/system-info")
    async def get_system_info():
        return {
            "backendUrl": BACKEND_URL,
            "directDatabaseAccess": False,
            "routes": [
                "/api/dashboard/summary",
                "/api/reports/query",
                "/api/telemetry/live",
                "/api/telemetry/log",
                "/api/production-lines",
                "/api/alarms",
            ],
        }

    @router.get("/health")
    async def health_check():
        try:
            data = await backend_get("/api/dashboard/summary")
            return {"status": "healthy", "backend": BACKEND_URL, "dashboardReachable": bool(data)}
        except HTTPException as exc:
            return {"status": "unhealthy", "backend": BACKEND_URL, "error": exc.detail}

    return router
