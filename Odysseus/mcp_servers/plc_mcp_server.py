"""
plc_mcp_server.py

MCP server exposing tools to query the MKZ Factory PLC monitoring backend.
The server calls the authorized backend REST API and does not open direct
PostgreSQL connections from Odysseus.
"""

import asyncio
import ipaddress
import json
import logging
import os
import uuid
from typing import Any, Dict, Optional
from urllib.parse import urlparse

import httpx
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import TextContent, Tool, ToolAnnotations

logger = logging.getLogger(__name__)
server = Server("mkz-factory")

BACKEND_URL = os.getenv("MKZ_BACKEND_URL") or "http://127.0.0.1:5165"
BACKEND_TOKEN = os.getenv("MKZ_BACKEND_TOKEN", "")
LIMIT_MINIMUM = 1
LIMIT_MAXIMUM = 200
REPORT_TIME_RANGES = ("today", "last_7_days", "month")
TELEMETRY_MODES = ("live", "log")
CANONICAL_UUID_PATTERN = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
READ_ONLY_TOOL_ANNOTATIONS = ToolAnnotations(
    readOnlyHint=True,
    destructiveHint=False,
    idempotentHint=True,
)


class BackendRequestError(RuntimeError):
    """A sanitized backend failure that is safe to return through an MCP tool."""


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


def _bounded_limit(value: Any, default: int) -> int:
    """Coerce a caller-provided limit into the backend's safe range."""
    if isinstance(value, bool):
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError, OverflowError):
        return default
    return max(LIMIT_MINIMUM, min(parsed, LIMIT_MAXIMUM))


def _unsupported_arguments(arguments: Dict[str, Any], allowed: set[str]) -> str | None:
    """Return a stable error for clients that call a retired tool parameter."""
    unsupported = sorted(set(arguments) - allowed)
    if unsupported:
        return f"Unsupported argument(s): {', '.join(unsupported)}"
    return None


def _error_text(message: str) -> list[TextContent]:
    return [TextContent(type="text", text=f"Error: {message}")]


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


def _report_selector_schema() -> Dict[str, Any]:
    """Describe the same strict selector contract enforced at runtime."""
    return {
        "anyOf": [
            {"const": "all"},
            {
                "type": "string",
                "format": "uuid",
                "pattern": CANONICAL_UUID_PATTERN,
            },
        ],
        "default": "all",
    }


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
        message = (
            "FII backend rejected the request"
            if 400 <= upstream_status < 500
            else "FII backend request failed"
        )
        raise BackendRequestError(message) from exc
    except httpx.HTTPError as exc:
        logger.error("FII backend request failed for %s: %s", path, type(exc).__name__)
        raise BackendRequestError("FII backend is unavailable") from exc


def format_results(results: Any, max_rows: int = 100) -> str:
    if isinstance(results, (dict, list)):
        if isinstance(results, list) and len(results) > max_rows:
            results = results[:max_rows]
        return json.dumps(results, ensure_ascii=False, indent=2, default=str)
    return str(results)


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="mkz_get_machines",
            description="Get all machines from the MKZ factory backend.",
            inputSchema={
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "default": 50,
                        "minimum": LIMIT_MINIMUM,
                        "maximum": LIMIT_MAXIMUM,
                    },
                },
                "additionalProperties": False,
            },
            annotations=READ_ONLY_TOOL_ANNOTATIONS,
        ),
        Tool(
            name="mkz_get_production_lines",
            description="Get all production lines with machine counts and status.",
            inputSchema={"type": "object", "properties": {}, "additionalProperties": False},
            annotations=READ_ONLY_TOOL_ANNOTATIONS,
        ),
        Tool(
            name="mkz_get_alarms",
            description="Get alarms from the factory backend.",
            inputSchema={
                "type": "object",
                "properties": {
                    "status": {"type": "string"},
                    "severity": {"type": "string"},
                    "limit": {
                        "type": "integer",
                        "default": 50,
                        "minimum": LIMIT_MINIMUM,
                        "maximum": LIMIT_MAXIMUM,
                    },
                },
                "additionalProperties": False,
            },
            annotations=READ_ONLY_TOOL_ANNOTATIONS,
        ),
        Tool(
            name="mkz_get_dashboard_summary",
            description="Get factory dashboard summary with machine counts, production, and alarm stats.",
            inputSchema={"type": "object", "properties": {}, "additionalProperties": False},
            annotations=READ_ONLY_TOOL_ANNOTATIONS,
        ),
        Tool(
            name="mkz_get_production_report",
            description="Get production report with hourly/daily production data.",
            inputSchema={
                "type": "object",
                "properties": {
                    "time_range": {"type": "string", "enum": list(REPORT_TIME_RANGES)},
                    "line_id": _report_selector_schema(),
                    "machine_id": _report_selector_schema(),
                },
                "additionalProperties": False,
            },
            annotations=READ_ONLY_TOOL_ANNOTATIONS,
        ),
        Tool(
            name="mkz_get_telemetry",
            description="Get live telemetry data from machines.",
            inputSchema={
                "type": "object",
                "properties": {
                    "mode": {"type": "string", "enum": list(TELEMETRY_MODES), "default": "live"},
                    "limit": {
                        "type": "integer",
                        "default": 100,
                        "minimum": LIMIT_MINIMUM,
                        "maximum": LIMIT_MAXIMUM,
                    },
                },
                "additionalProperties": False,
            },
            annotations=READ_ONLY_TOOL_ANNOTATIONS,
        ),
        Tool(
            name="mkz_get_system_info",
            description="Get backend routing information for the MKZ integration.",
            inputSchema={"type": "object", "properties": {}, "additionalProperties": False},
            annotations=READ_ONLY_TOOL_ANNOTATIONS,
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    if not isinstance(arguments, dict):
        return _error_text("Tool arguments must be an object.")

    try:
        if name == "mkz_get_machines":
            if error := _unsupported_arguments(arguments, {"limit"}):
                return _error_text(error)
            data = await backend_get("/api/machines")
            limit = _bounded_limit(arguments.get("limit", 50), 50)
            if isinstance(data, list):
                data = data[:limit]
            return [TextContent(type="text", text=format_results(data, max_rows=limit))]

        if name == "mkz_get_production_lines":
            if error := _unsupported_arguments(arguments, set()):
                return _error_text(error)
            data = await backend_get("/api/production-lines")
            return [TextContent(type="text", text=format_results(data))]

        if name == "mkz_get_alarms":
            if error := _unsupported_arguments(arguments, {"status", "severity", "limit"}):
                return _error_text(error)
            limit = _bounded_limit(arguments.get("limit", 50), 50)
            data = await backend_get(
                "/api/alarms",
                {
                    "status": arguments.get("status", ""),
                    "severity": arguments.get("severity", ""),
                    "limit": limit,
                },
            )
            return [TextContent(type="text", text=format_results(data, max_rows=limit))]

        if name == "mkz_get_dashboard_summary":
            if error := _unsupported_arguments(arguments, set()):
                return _error_text(error)
            data = await backend_get("/api/dashboard/summary")
            return [TextContent(type="text", text=format_results(data))]

        if name == "mkz_get_production_report":
            if error := _unsupported_arguments(arguments, {"time_range", "line_id", "machine_id"}):
                return _error_text(error)
            time_range = arguments.get("time_range", "today")
            if not isinstance(time_range, str) or time_range not in REPORT_TIME_RANGES:
                return _error_text(
                    "Invalid time_range. Allowed values: today, last_7_days, month."
                )
            try:
                line_id = _validate_report_selector(arguments.get("line_id", "all"), "line_id")
                machine_id = _validate_report_selector(
                    arguments.get("machine_id", "all"), "machine_id"
                )
            except ValueError as exc:
                return _error_text(str(exc))
            data = await backend_get(
                "/api/reports/query",
                {
                    "timeRange": time_range,
                    "lineId": line_id,
                    "machineId": machine_id,
                },
            )
            return [TextContent(type="text", text=format_results(data))]

        if name == "mkz_get_telemetry":
            if error := _unsupported_arguments(arguments, {"mode", "limit"}):
                return _error_text(error)
            mode = arguments.get("mode", "live")
            if not isinstance(mode, str) or mode not in TELEMETRY_MODES:
                return _error_text("Invalid mode. Allowed values: live, log.")
            if mode == "log":
                limit = _bounded_limit(arguments.get("limit", 100), 100)
                data = await backend_get("/api/telemetry/log", {"count": limit})
                return [TextContent(type="text", text=format_results(data, max_rows=limit))]
            else:
                data = await backend_get("/api/telemetry/live")
            return [TextContent(type="text", text=format_results(data))]

        if name == "mkz_get_system_info":
            if error := _unsupported_arguments(arguments, set()):
                return _error_text(error)
            data = {
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
            return [TextContent(type="text", text=format_results(data))]

        return [TextContent(type="text", text=f"Unknown tool: {name}")]
    except BackendRequestError as exc:
        return _error_text(str(exc))
    except Exception as exc:
        logger.error("FII MCP tool %s failed: %s", name, type(exc).__name__)
        return _error_text("Unable to read FII backend data.")


if __name__ == "__main__":
    async def main() -> None:
        async with stdio_server() as (read_stream, write_stream):
            await server.run(read_stream, write_stream, server.create_initialization_options())

    asyncio.run(main())
