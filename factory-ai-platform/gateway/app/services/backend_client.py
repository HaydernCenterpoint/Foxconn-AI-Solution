"""
backend_client.py

HTTP client for the .NET factory backend (Postgres-backed).
Supports per-process service-account login with in-memory token cache
and proactive refresh ~10 minutes before JWT expiry (tokens live 2h).
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import time
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

BACKEND_URL = os.getenv("BACKEND_URL", "http://host.docker.internal:5000")
DEFAULT_TIMEOUT = float(os.getenv("BACKEND_TIMEOUT_SECONDS", "15"))

# ---------------------------------------------------------------------------
# Token cache (module-level — single service account per gateway process)
# ---------------------------------------------------------------------------
_service_token: Optional[str] = None
_service_token_expires_at: float = 0.0
_token_lock = asyncio.Lock()

# Refresh ~10 min before expiry. AuthController issues 2h tokens.
_TOKEN_REFRESH_BUFFER_SECONDS = 600


def _decode_jwt_expiry(token: str) -> Optional[float]:
    """Decode the `exp` claim from a JWT without verifying the signature."""
    try:
        payload_b64 = token.split(".", 2)[1]
        # JWT uses base64url padding-free; pad before decoding
        padded = payload_b64 + "=" * (-len(payload_b64) % 4)
        decoded = base64.urlsafe_b64decode(padded.encode("ascii"))
        payload = json.loads(decoded)
        return float(payload.get("exp", 0)) if "exp" in payload else None
    except Exception:
        return None


async def login(username: str, password: str) -> Optional[str]:
    """POST /api/auth/login and return the JWT, or None on failure."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{BACKEND_URL}/api/auth/login",
                json={"username": username, "password": password},
            )
            if resp.status_code == 200:
                data = resp.json()
                token = data.get("token")
                exp = _decode_jwt_expiry(token or "")
                return token, exp
    except Exception as exc:
        logger.warning("Login to backend failed: %s", exc)
    return None, None


async def _get_service_token() -> Optional[str]:
    """Return a cached service JWT, refreshing if it's near expiry or missing."""
    global _service_token, _service_token_expires_at

    if _service_token and time.time() < (_service_token_expires_at - _TOKEN_REFRESH_BUFFER_SECONDS):
        return _service_token

    async with _token_lock:
        # Re-check inside the lock — another coroutine may have refreshed already.
        if _service_token and time.time() < (_service_token_expires_at - _TOKEN_REFRESH_BUFFER_SECONDS):
            return _service_token

        user = os.getenv("AI_SERVICE_USER", "ai_service")
        password = os.getenv("AI_SERVICE_PASSWORD", "")
        if not password:
            logger.debug("AI_SERVICE_PASSWORD not configured; authenticated endpoints will be skipped.")
            _service_token = None
            _service_token_expires_at = 0.0
            return None

        token, exp = await login(user, password)
        if token:
            _service_token = token
            _service_token_expires_at = exp or (time.time() + 7200)
            logger.info("Obtained AI service JWT (expires in %ss)", int(_service_token_expires_at - time.time()))
        else:
            _service_token = None
            _service_token_expires_at = 0.0
        return _service_token


def invalidate_token() -> None:
    """Force the next call to re-authenticate (e.g. after a 401)."""
    global _service_token, _service_token_expires_at
    _service_token = None
    _service_token_expires_at = 0.0


def _auth_headers(token: Optional[str]) -> Dict[str, str]:
    if token:
        return {"Authorization": f"Bearer {token}"}
    return {}


# ---------------------------------------------------------------------------
# Line resolution cache (so we don't hit /production-lines on every call)
# ---------------------------------------------------------------------------
_line_cache: Dict[str, str] = {}
_line_cache_loaded_at: float = 0.0
_LINE_CACHE_TTL_SECONDS = 300  # 5 minutes


async def get_production_lines(force: bool = False) -> List[Dict[str, Any]]:
    global _line_cache, _line_cache_loaded_at
    if force or (time.time() - _line_cache_loaded_at) > _LINE_CACHE_TTL_SECONDS:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
            resp = await client.get(f"{BACKEND_URL}/api/production-lines")
            resp.raise_for_status()
            data = resp.json()
        _line_cache = {str(line.get("id")): line.get("name", "") for line in data}
        _line_cache_loaded_at = time.time()
    # Return rich structure (caller may need id+name); the cache is keyed separately above.
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        resp = await client.get(f"{BACKEND_URL}/api/production-lines")
        resp.raise_for_status()
        return resp.json()


async def resolve_line_id(line_code: str) -> Optional[str]:
    """Return the UUID of a production line whose name matches line_code (case-insensitive)."""
    if not line_code:
        return None
    lines = await get_production_lines()
    needle = line_code.lower()
    for line in lines:
        name: str = (line.get("name") or "").lower()
        if needle == name or needle in name or name in needle:
            return str(line["id"])
    return None


# ---------------------------------------------------------------------------
# REST calls
# ---------------------------------------------------------------------------
async def get_dashboard_summary() -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        resp = await client.get(f"{BACKEND_URL}/api/dashboard/summary")
        resp.raise_for_status()
        return resp.json()


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
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        resp = await client.get(
            f"{BACKEND_URL}/api/alarms",
            params=params,
            headers=_auth_headers(token),
        )
        if resp.status_code == 401:
            # Drop token and let next call refresh.
            invalidate_token()
            logger.warning("Alarms endpoint returned 401 — AI service token invalid")
            return []
        resp.raise_for_status()
        return resp.json()


async def get_telemetry_live() -> List[Dict[str, Any]]:
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        resp = await client.get(f"{BACKEND_URL}/api/telemetry/live")
        resp.raise_for_status()
        return resp.json()


async def get_telemetry_log(count: int = 50) -> List[Dict[str, Any]]:
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        resp = await client.get(
            f"{BACKEND_URL}/api/telemetry/log", params={"count": count}
        )
        resp.raise_for_status()
        return resp.json()


# ---------------------------------------------------------------------------
# Class-style facade (for agents that prefer dependency injection).
# Function-style imports above remain the source of truth.
# ---------------------------------------------------------------------------
class BackendClient:
    """Object-oriented wrapper around the module-level helpers.

    Useful for testing (mock the methods on a fake instance) and for
    future per-tenant token isolation.
    """

    def __init__(self, base_url: Optional[str] = None):
        self.base_url = base_url or BACKEND_URL

    async def login(self, username: str, password: str) -> Optional[str]:
        token, _ = await login(username, password)
        return token

    async def get_dashboard_summary(self) -> Dict[str, Any]:
        return await get_dashboard_summary()

    async def get_production_lines(self, force: bool = False) -> List[Dict[str, Any]]:
        return await get_production_lines(force=force)

    async def resolve_line_id(self, line_code: str) -> Optional[str]:
        return await resolve_line_id(line_code)

    async def get_production_report(
        self,
        time_range: str = "today",
        line_id: str = "all",
        group_by: str = "hour",
    ) -> Dict[str, Any]:
        return await get_production_report(
            time_range=time_range, line_id=line_id, group_by=group_by
        )

    async def get_active_alarms(self, severity: Optional[str] = None) -> List[Dict[str, Any]]:
        return await get_active_alarms(severity=severity)

    async def get_telemetry_live(self) -> List[Dict[str, Any]]:
        return await get_telemetry_live()

    async def get_telemetry_log(self, count: int = 50) -> List[Dict[str, Any]]:
        return await get_telemetry_log(count)