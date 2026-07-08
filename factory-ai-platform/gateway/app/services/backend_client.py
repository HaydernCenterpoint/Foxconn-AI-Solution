import os
import logging
from typing import Dict, Any, List, Optional
import httpx

logger = logging.getLogger(__name__)

BACKEND_URL = os.getenv("BACKEND_URL", "http://host.docker.internal:5000")
_service_token: Optional[str] = None


async def _get_service_token() -> Optional[str]:
    """Obtain and cache a JWT token for the AI service account."""
    global _service_token
    if _service_token:
        return _service_token

    user = os.getenv("AI_SERVICE_USER", "ai_service")
    password = os.getenv("AI_SERVICE_PASSWORD", "")
    if not password:
        return None

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{BACKEND_URL}/api/auth/login",
                json={"username": user, "password": password},
            )
            if resp.status_code == 200:
                _service_token = resp.json().get("token")
                return _service_token
    except Exception as exc:
        logger.warning("Could not obtain AI service token: %s", exc)
    return None


def _auth_headers(token: Optional[str]) -> Dict[str, str]:
    if token:
        return {"Authorization": f"Bearer {token}"}
    return {}


async def get_dashboard_summary() -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(f"{BACKEND_URL}/api/dashboard/summary")
        resp.raise_for_status()
        return resp.json()


async def get_production_lines() -> List[Dict[str, Any]]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"{BACKEND_URL}/api/production-lines")
        resp.raise_for_status()
        return resp.json()


async def resolve_line_id(line_code: str) -> Optional[str]:
    """Return the UUID of a production line whose name matches line_code (case-insensitive)."""
    lines = await get_production_lines()
    needle = line_code.lower()
    for line in lines:
        name: str = line.get("name", "")
        if needle in name.lower() or name.lower() in needle:
            return str(line["id"])
    return None


async def get_production_report(
    time_range: str = "today",
    line_id: str = "all",
    group_by: str = "hour",
) -> Dict[str, Any]:
    params = {"timeRange": time_range, "lineId": line_id, "groupBy": group_by}
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(f"{BACKEND_URL}/api/reports/query", params=params)
        resp.raise_for_status()
        return resp.json()


async def get_active_alarms(severity: Optional[str] = None) -> List[Dict[str, Any]]:
    token = await _get_service_token()
    params: Dict[str, Any] = {"status": "ACTIVE", "limit": 100}
    if severity:
        params["severity"] = severity
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{BACKEND_URL}/api/alarms",
            params=params,
            headers=_auth_headers(token),
        )
        if resp.status_code == 401:
            # Alarms endpoint requires auth; return empty list gracefully
            logger.warning("Alarms endpoint returned 401 — AI service token missing or invalid")
            return []
        resp.raise_for_status()
        return resp.json()


async def get_telemetry_live() -> List[Dict[str, Any]]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"{BACKEND_URL}/api/telemetry/live")
        resp.raise_for_status()
        return resp.json()


async def get_telemetry_log(count: int = 50) -> List[Dict[str, Any]]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{BACKEND_URL}/api/telemetry/log", params={"count": count}
        )
        resp.raise_for_status()
        return resp.json()
