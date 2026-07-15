"""
mkz_routes.py

REST API routes for MKZ Factory PLC monitoring integration.
Data is proxied through the authorized .NET backend REST API instead of opening
unauthenticated direct PostgreSQL connections from Odysseus.
"""

import ipaddress
import logging
import os
import uuid
from typing import Any, Dict, Literal, Optional
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from core.middleware import require_admin

logger = logging.getLogger(__name__)

BACKEND_URL = os.getenv("MKZ_BACKEND_URL") or "http://127.0.0.1:5165"
BACKEND_TOKEN = os.getenv("MKZ_BACKEND_TOKEN", "")


def _is_loopback_host(host: str) -> bool:
    normalized_host = host.rstrip(".").lower()
    if normalized_host == "localhost":
        return True
    try:
        return ipaddress.ip_address(normalized_host).is_loopback
    except ValueError:
        return False


def _validate_token_transport() -> None:
    """Permit a backend bearer token only over TLS or direct loopback HTTP."""
    parsed = urlparse(BACKEND_URL)
    if (
        BACKEND_TOKEN
        and parsed.scheme.lower() == "http"
        and not _is_loopback_host(parsed.hostname or "")
    ):
        raise ValueError("MKZ_BACKEND_TOKEN requires HTTPS for a non-loopback backend")


def _headers() -> Dict[str, str]:
    _validate_token_transport()
    return {"Authorization": f"Bearer {BACKEND_TOKEN}"} if BACKEND_TOKEN else {}


def _reject_unsupported_query_parameters(request: Request, allowed: set[str]) -> None:
    """Reject retired query parameters instead of silently ignoring them."""
    unsupported = sorted(set(request.query_params) - allowed)
    if unsupported:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported query parameter(s): {', '.join(unsupported)}",
        )


def _reject_duplicate_report_selectors(request: Request) -> None:
    """Reject duplicate selectors while their raw query values are still available."""
    duplicates = sorted(
        name
        for name in ("line_id", "machine_id")
        if len(request.query_params.getlist(name)) > 1
    )
    if duplicates:
        raise HTTPException(
            status_code=422,
            detail=f"Duplicate query parameter(s): {', '.join(duplicates)}",
        )


def _validate_report_selector(value: Any, field_name: str) -> str:
    """Return an exact `all` selector or canonical UUID, never a widened value."""
    error = f"Invalid {field_name}. Use a canonical UUID or 'all'."
    if not isinstance(value, str):
        raise ValueError(error)
    if value == "all":
        return value
    try:
        parsed = uuid.UUID(value)
    except (AttributeError, ValueError, TypeError):
        raise ValueError(error) from None
    if str(parsed) != value:
        raise ValueError(error)
    return value


def _validated_report_selector_or_422(value: Any, field_name: str) -> str:
    try:
        return _validate_report_selector(value, field_name)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


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
        upstream_status = exc.response.status_code
        logger.warning("FII backend returned HTTP %s for %s", upstream_status, path)
        if 400 <= upstream_status < 500:
            raise HTTPException(
                status_code=upstream_status,
                detail="FII backend rejected the request",
            ) from exc
        raise HTTPException(status_code=502, detail="FII backend request failed") from exc
    except Exception as exc:
        logger.error("FII backend request failed for %s: %s", path, type(exc).__name__)
        raise HTTPException(status_code=502, detail="FII backend is unavailable") from exc


def setup_mkz_routes() -> APIRouter:
    router = APIRouter(prefix="/api/mkz", tags=["MKZ Factory"])

    @router.get("/machines")
    async def get_machines(
        request: Request,
        limit: int = Query(50, ge=1, le=200),
    ):
        require_admin(request)
        _reject_unsupported_query_parameters(request, {"limit"})
        machines = await backend_get("/api/machines")
        if isinstance(machines, list):
            return machines[:limit]
        return machines

    @router.get("/production-lines")
    async def get_production_lines(request: Request):
        require_admin(request)
        _reject_unsupported_query_parameters(request, set())
        return await backend_get("/api/production-lines")

    @router.get("/alarms")
    async def get_alarms(
        request: Request,
        status: str = Query("", description="ACTIVE, ACKNOWLEDGED, RESOLVED"),
        severity: str = Query("", description="CRITICAL, HIGH, MEDIUM, LOW"),
        limit: int = Query(50, ge=1, le=200),
    ):
        require_admin(request)
        _reject_unsupported_query_parameters(request, {"status", "severity", "limit"})
        return await backend_get(
            "/api/alarms",
            {"status": status, "severity": severity, "limit": limit},
        )

    @router.get("/dashboard")
    async def get_dashboard_summary(request: Request):
        require_admin(request)
        _reject_unsupported_query_parameters(request, set())
        return await backend_get("/api/dashboard/summary")

    @router.get("/reports/production")
    async def get_production_report(
        request: Request,
        time_range: Literal["today", "last_7_days", "month"] = Query(
            "today", description="today, last_7_days, or month"
        ),
        line_id: str = Query("all"),
        machine_id: str = Query("all"),
    ):
        require_admin(request)
        _reject_unsupported_query_parameters(request, {"time_range", "line_id", "machine_id"})
        _reject_duplicate_report_selectors(request)
        line_id = _validated_report_selector_or_422(line_id, "line_id")
        machine_id = _validated_report_selector_or_422(machine_id, "machine_id")
        return await backend_get(
            "/api/reports/query",
            {"timeRange": time_range, "lineId": line_id, "machineId": machine_id},
        )

    @router.get("/telemetry")
    async def get_telemetry(
        request: Request,
        mode: Literal["live", "log"] = Query("live", description="live or log"),
        limit: int = Query(100, ge=1, le=200),
    ):
        require_admin(request)
        _reject_unsupported_query_parameters(request, {"mode", "limit"})
        if mode == "log":
            return await backend_get("/api/telemetry/log", {"count": limit})
        return await backend_get("/api/telemetry/live")

    @router.get("/system-info")
    async def get_system_info(request: Request):
        require_admin(request)
        _reject_unsupported_query_parameters(request, set())
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
    async def health_check(request: Request):
        require_admin(request)
        _reject_unsupported_query_parameters(request, set())
        try:
            data = await backend_get("/api/dashboard/summary")
            return {"status": "healthy", "backend": BACKEND_URL, "dashboardReachable": bool(data)}
        except HTTPException as exc:
            logger.warning("FII backend health check failed: %s", exc.status_code)
            raise HTTPException(
                status_code=503,
                detail="FII backend is unavailable",
            ) from exc

    return router
