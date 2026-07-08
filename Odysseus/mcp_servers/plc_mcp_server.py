"""
plc_mcp_server.py

MCP server exposing tools to query the MKZ Factory PLC monitoring backend.
The server calls the authorized backend REST API and does not open direct
PostgreSQL connections from Odysseus.
"""

import asyncio
import json
import logging
import os
from typing import Any, Dict, Optional

import httpx
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import TextContent, Tool

logger = logging.getLogger(__name__)
server = Server("mkz-factory")

BACKEND_URL = os.getenv("MKZ_BACKEND_URL", os.getenv("BACKEND_URL", "http://localhost:5000"))
BACKEND_TOKEN = os.getenv("MKZ_BACKEND_TOKEN", "")


def _headers() -> Dict[str, str]:
    return {"Authorization": f"Bearer {BACKEND_TOKEN}"} if BACKEND_TOKEN else {}


async def backend_get(path: str, params: Optional[Dict[str, Any]] = None) -> Any:
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(
            f"{BACKEND_URL.rstrip('/')}{path}",
            params={k: v for k, v in (params or {}).items() if v not in (None, "")},
            headers=_headers(),
        )
        response.raise_for_status()
        return response.json()


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
                    "status": {"type": "string"},
                    "line_id": {"type": "string"},
                    "limit": {"type": "integer", "default": 50},
                },
            },
        ),
        Tool(
            name="mkz_get_production_lines",
            description="Get all production lines with machine counts and status.",
            inputSchema={"type": "object", "properties": {"include_machines": {"type": "boolean"}}},
        ),
        Tool(
            name="mkz_get_alarms",
            description="Get alarms from the factory backend.",
            inputSchema={
                "type": "object",
                "properties": {
                    "status": {"type": "string"},
                    "severity": {"type": "string"},
                    "limit": {"type": "integer", "default": 50},
                },
            },
        ),
        Tool(
            name="mkz_get_dashboard_summary",
            description="Get factory dashboard summary with machine counts, production, and alarm stats.",
            inputSchema={"type": "object", "properties": {}},
        ),
        Tool(
            name="mkz_get_production_report",
            description="Get production report with hourly/daily production data.",
            inputSchema={
                "type": "object",
                "properties": {
                    "time_range": {"type": "string", "enum": ["today", "last_7_days", "month"]},
                    "line_id": {"type": "string"},
                    "machine_id": {"type": "string"},
                },
            },
        ),
        Tool(
            name="mkz_get_telemetry",
            description="Get live telemetry data from machines.",
            inputSchema={
                "type": "object",
                "properties": {
                    "machine_id": {"type": "string"},
                    "hours": {"type": "integer", "default": 1},
                    "limit": {"type": "integer", "default": 100},
                },
            },
        ),
        Tool(
            name="mkz_get_audit_logs",
            description="Get audit log entries through the backend API.",
            inputSchema={
                "type": "object",
                "properties": {
                    "username": {"type": "string"},
                    "limit": {"type": "integer", "default": 50},
                },
            },
        ),
        Tool(
            name="mkz_get_system_info",
            description="Get backend routing information for the MKZ integration.",
            inputSchema={"type": "object", "properties": {}},
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    try:
        if name == "mkz_get_machines":
            data = await backend_get("/api/machines", {"status": arguments.get("status", "")})
            limit = int(arguments.get("limit", 50))
            if isinstance(data, list):
                data = data[:limit]
            return [TextContent(type="text", text=format_results(data))]

        if name == "mkz_get_production_lines":
            data = await backend_get("/api/production-lines")
            return [TextContent(type="text", text=format_results(data))]

        if name == "mkz_get_alarms":
            data = await backend_get(
                "/api/alarms",
                {
                    "status": arguments.get("status", ""),
                    "severity": arguments.get("severity", ""),
                    "limit": arguments.get("limit", 50),
                },
            )
            return [TextContent(type="text", text=format_results(data))]

        if name == "mkz_get_dashboard_summary":
            data = await backend_get("/api/dashboard/summary")
            return [TextContent(type="text", text=format_results(data))]

        if name == "mkz_get_production_report":
            data = await backend_get(
                "/api/reports/query",
                {
                    "timeRange": arguments.get("time_range", "today"),
                    "lineId": arguments.get("line_id", "all") or "all",
                    "machineId": arguments.get("machine_id", ""),
                },
            )
            return [TextContent(type="text", text=format_results(data))]

        if name == "mkz_get_telemetry":
            machine_id = arguments.get("machine_id", "")
            if machine_id:
                data = await backend_get(
                    "/api/telemetry/log",
                    {"machineId": machine_id, "count": arguments.get("limit", 100)},
                )
            else:
                data = await backend_get("/api/telemetry/live")
            return [TextContent(type="text", text=format_results(data))]

        if name == "mkz_get_audit_logs":
            data = await backend_get(
                "/api/audit-log",
                {"username": arguments.get("username", ""), "limit": arguments.get("limit", 50)},
            )
            return [TextContent(type="text", text=format_results(data))]

        if name == "mkz_get_system_info":
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
    except Exception as exc:
        logger.error("Tool execution error: %s", exc)
        return [TextContent(type="text", text=f"Error executing {name}: {exc}")]


if __name__ == "__main__":
    async def main() -> None:
        async with stdio_server() as (read_stream, write_stream):
            await server.run(read_stream, write_stream, server.create_initialization_options())

    asyncio.run(main())
