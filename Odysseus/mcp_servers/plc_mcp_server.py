"""
plc_mcp_server.py

MCP server exposing tools to query the MKZ Factory PLC monitoring database.
Allows Odysseus AI agents to read machines, production lines, alarms, telemetry,
and generate production reports from the factory system.
"""

import os
import sys
import json
import logging
from pathlib import Path
from datetime import datetime
from typing import Any

import psycopg2
import psycopg2.extras
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

logger = logging.getLogger(__name__)

# Initialize MCP server
server = Server("mkz-factory")

# Database configuration - reads from environment or uses defaults
DB_CONFIG = {
    "host": os.getenv("MKZ_DB_HOST", "localhost"),
    "port": int(os.getenv("MKZ_DB_PORT", "5432")),
    "database": os.getenv("MKZ_DB_NAME", "plc_monitoring"),
    "user": os.getenv("MKZ_DB_USER", "postgres"),
    "password": os.getenv("MKZ_DB_PASSWORD", "12345678"),
}


def get_db_connection():
    """Create a new database connection."""
    return psycopg2.connect(**DB_CONFIG, cursor_factory=psycopg2.extras.RealDictCursor)


def execute_query(query: str, params: tuple = None) -> list[dict]:
    """Execute a query and return results as list of dicts."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query, params)
                results = cur.fetchall()
                return [dict(row) for row in results]
    except Exception as e:
        logger.error(f"Database error: {e}")
        return [{"error": str(e)}]


def format_results(results: list, max_rows: int = 100) -> str:
    """Format query results for text output."""
    if not results:
        return "No results found."

    if "error" in results[0]:
        return f"Error: {results[0]['error']}"

    if len(results) > max_rows:
        output = f"Showing {max_rows} of {len(results)} rows:\n\n"
        results = results[:max_rows]
    else:
        output = f"{len(results)} rows:\n\n"

    # Get column names from first row
    columns = list(results[0].keys())

    # Format as readable table
    col_widths = {}
    for col in columns:
        col_widths[col] = max(len(str(col)), max(len(str(row.get(col, ""))) for row in results))

    # Header
    header = " | ".join(str(col).ljust(col_widths[col]) for col in columns)
    separator = "-+-".join("-" * col_widths[col] for col in columns)

    output += header + "\n" + separator + "\n"

    # Rows
    for row in results:
        output += " | ".join(str(row.get(col, "")).ljust(col_widths[col]) for col in columns) + "\n"

    return output


# ========== MCP TOOLS ==========

@server.list_tools()
async def list_tools() -> list[Tool]:
    """Define available MCP tools."""
    return [
        Tool(
            name="mkz_get_machines",
            description="Get all machines from the MKZ factory system with their status, IP, approval, and telemetry data.",
            inputSchema={
                "type": "object",
                "properties": {
                    "status": {"type": "string", "description": "Filter by status (RUNNING, IDLE, ERROR, OFFLINE, MAINTENANCE)"},
                    "line_id": {"type": "string", "description": "Filter by production line ID"},
                    "limit": {"type": "integer", "description": "Maximum results", "default": 50}
                }
            }
        ),
        Tool(
            name="mkz_get_production_lines",
            description="Get all production lines with machine counts and status.",
            inputSchema={
                "type": "object",
                "properties": {
                    "include_machines": {"type": "boolean", "description": "Include machine details"}
                }
            }
        ),
        Tool(
            name="mkz_get_alarms",
            description="Get alarms from the factory system.",
            inputSchema={
                "type": "object",
                "properties": {
                    "status": {"type": "string", "description": "Filter by status (ACTIVE, ACKNOWLEDGED, RESOLVED)"},
                    "severity": {"type": "string", "description": "Filter by severity (CRITICAL, HIGH, MEDIUM, LOW)"},
                    "limit": {"type": "integer", "description": "Maximum results", "default": 50}
                }
            }
        ),
        Tool(
            name="mkz_get_dashboard_summary",
            description="Get factory dashboard summary with machine counts, production, and alarm stats.",
            inputSchema={"type": "object", "properties": {}}
        ),
        Tool(
            name="mkz_get_production_report",
            description="Get production report with hourly/daily production data.",
            inputSchema={
                "type": "object",
                "properties": {
                    "time_range": {"type": "string", "enum": ["today", "last_7_days", "month"], "description": "Time range"},
                    "line_id": {"type": "string", "description": "Filter by line ID"},
                    "machine_id": {"type": "string", "description": "Filter by machine ID"}
                }
            }
        ),
        Tool(
            name="mkz_get_telemetry",
            description="Get live telemetry data from machines.",
            inputSchema={
                "type": "object",
                "properties": {
                    "machine_id": {"type": "string", "description": "Specific machine ID"},
                    "hours": {"type": "integer", "description": "Hours of history", "default": 1}
                }
            }
        ),
        Tool(
            name="mkz_get_audit_logs",
            description="Get audit log entries showing system activity.",
            inputSchema={
                "type": "object",
                "properties": {
                    "username": {"type": "string", "description": "Filter by username"},
                    "limit": {"type": "integer", "description": "Maximum entries", "default": 50}
                }
            }
        ),
        Tool(
            name="mkz_get_system_info",
            description="Get database schema information and table counts.",
            inputSchema={"type": "object", "properties": {}}
        )
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    """Handle tool execution requests."""

    try:
        if name == "mkz_get_machines":
            status = arguments.get("status", "")
            line_id = arguments.get("line_id", "")
            limit = arguments.get("limit", 50)

            query = """
                SELECT
                    m.id, m.name, m.ip, m.status, m.machine_code,
                    m.cpu_percent, m.ram_percent, m.uptime_seconds,
                    m.approval_status, m.last_heartbeat, m.created_at,
                    m.plc_connected, m.plc_brand, m.plc_ip,
                    m.client_id, m.production_count, m.machine_runtime_seconds,
                    pl.name as line_name, pl.id as line_id
                FROM machines m
                LEFT JOIN line_machines lm ON m.id = lm.machine_id
                LEFT JOIN production_lines pl ON lm.line_id = pl.id
                WHERE (%s = '' OR UPPER(m.status) = UPPER(%s))
                  AND (%s = '' OR lm.line_id = %s)
                ORDER BY m.name
                LIMIT %s
            """
            results = execute_query(query, (status, status, line_id, line_id, limit))
            return [TextContent(type="text", text=format_results(results))]

        elif name == "mkz_get_production_lines":
            include_machines = arguments.get("include_machines", False)

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
            results = execute_query(query)

            if include_machines and results:
                for line in results:
                    machines_query = """
                        SELECT m.id, m.name, m.status, m.machine_code
                        FROM machines m
                        JOIN line_machines lm ON m.id = lm.machine_id
                        WHERE lm.line_id = %s
                        ORDER BY lm.sequence_order
                    """
                    machines = execute_query(machines_query, (str(line['id']),))
                    line['machines'] = machines

            return [TextContent(type="text", text=format_results(results))]

        elif name == "mkz_get_alarms":
            status = arguments.get("status", "")
            severity = arguments.get("severity", "")
            limit = arguments.get("limit", 50)

            query = """
                SELECT
                    a.id, a.machine_id, a.severity, a.message,
                    a.status, a.acknowledged_by, a.acknowledged_at,
                    a.resolved_at, a.notes, a.created_at,
                    m.name as machine_name
                FROM alarms a
                LEFT JOIN machines m ON a.machine_id = m.id
                WHERE (%s = '' OR UPPER(a.status) = UPPER(%s))
                  AND (%s = '' OR UPPER(a.severity) = UPPER(%s))
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
            results = execute_query(query, (status, status, severity, severity, limit))
            return [TextContent(type="text", text=format_results(results))]

        elif name == "mkz_get_dashboard_summary":
            # Get machine counts by status
            status_query = "SELECT status, COUNT(*) as count FROM machines GROUP BY status"
            status_counts = execute_query(status_query)
            status_dict = {str(row['status']).upper(): row['count'] for row in status_counts}

            # Get production today
            production_query = """
                SELECT 
                    COALESCE(SUM(hourly_qty), 0) as total_production,
                    COUNT(DISTINCT machine_id) as active_machines
                FROM machine_hourly_production
                WHERE prod_date = CURRENT_DATE
            """
            production = execute_query(production_query)

            # Get active alarms count
            alarm_query = "SELECT COUNT(*) as active_alarms FROM alarms WHERE UPPER(status) = 'ACTIVE'"
            alarms = execute_query(alarm_query)

            # Get recent alarms
            recent_query = """
                SELECT a.id, a.severity, a.message, a.status, a.created_at, m.name as machine_name
                FROM alarms a
                LEFT JOIN machines m ON a.machine_id = m.id
                ORDER BY a.created_at DESC
                LIMIT 10
            """
            recent_alarms = execute_query(recent_query)

            # Get hourly production for today
            hourly_query = """
                SELECT prod_hour, SUM(hourly_qty) as output
                FROM machine_hourly_production
                WHERE prod_date = CURRENT_DATE
                GROUP BY prod_hour
                ORDER BY prod_hour
            """
            hourly = execute_query(hourly_query)

            summary = {
                "timestamp": datetime.now().isoformat(),
                "machines": {
                    "total": sum(status_dict.values()),
                    "running": status_dict.get("RUNNING", 0),
                    "idle": status_dict.get("IDLE", 0),
                    "error": status_dict.get("ERROR", 0),
                    "offline": status_dict.get("OFFLINE", 0)
                },
                "production_today": {
                    "total_output": production[0]['total_production'] if production else 0,
                    "active_machines": production[0]['active_machines'] if production else 0
                },
                "active_alarms": alarms[0]['active_alarms'] if alarms else 0,
                "recent_alarms": recent_alarms,
                "hourly_production": hourly
            }

            return [TextContent(type="text", text=json.dumps(summary, indent=2, default=str))]

        elif name == "mkz_get_production_report":
            time_range = arguments.get("time_range", "today")
            machine_id = arguments.get("machine_id", "")

            # Build time filter
            time_filters = {
                "today": "prod_date = CURRENT_DATE",
                "last_7_days": "prod_date >= CURRENT_DATE - INTERVAL '7 days'",
                "month": "prod_date >= CURRENT_DATE - INTERVAL '30 days'"
            }
            time_filter = time_filters.get(time_range, "prod_date = CURRENT_DATE")

            machine_filter = "AND mhp.machine_id = %s" if machine_id else ""

            # Summary query
            summary_query = f"""
                SELECT
                    COALESCE(SUM(mhp.hourly_qty), 0) as total_production,
                    COUNT(DISTINCT mhp.machine_id) as machines_reporting,
                    AVG(mhp.avg_cpu) as avg_cpu,
                    AVG(mhp.avg_ram) as avg_ram
                FROM machine_hourly_production mhp
                WHERE {time_filter} {machine_filter}
            """
            params = (machine_id,) if machine_id else ()
            summary = execute_query(summary_query, params if params else None)

            # Chart data
            chart_query = f"""
                SELECT prod_date::text as label, prod_hour, SUM(hourly_qty) as output
                FROM machine_hourly_production mhp
                WHERE {time_filter} {machine_filter}
                GROUP BY prod_date, prod_hour
                ORDER BY prod_date, prod_hour
            """
            chart_data = execute_query(chart_query, params if params else None)

            report = {
                "time_range": time_range,
                "summary": summary[0] if summary else {},
                "chart_data": chart_data
            }

            return [TextContent(type="text", text=json.dumps(report, indent=2, default=str))]

        elif name == "mkz_get_telemetry":
            machine_id = arguments.get("machine_id", "")
            hours = min(arguments.get("hours", 1), 48)

            if machine_id:
                query = """
                    SELECT machine_id, status, plc_connected, production_count,
                           cycle_time, cpu_percent, ram_percent, uptime_seconds, created_at
                    FROM machine_telemetry_history
                    WHERE machine_id = %s
                      AND created_at > NOW() - INTERVAL '%s hours'
                    ORDER BY created_at DESC
                    LIMIT 100
                """
                results = execute_query(query, (machine_id, hours))
            else:
                query = """
                    SELECT machine_id, status, plc_connected, production_count,
                           cycle_time, cpu_percent, ram_percent, uptime_seconds, created_at
                    FROM machine_telemetry_history
                    WHERE created_at > NOW() - INTERVAL '%s hours'
                    ORDER BY created_at DESC
                    LIMIT 100
                """
                results = execute_query(query, (hours,))

            return [TextContent(type="text", text=format_results(results))]

        elif name == "mkz_get_audit_logs":
            username = arguments.get("username", "")
            limit = arguments.get("limit", 50)

            query = """
                SELECT id, username, action, details, created_at
                FROM audit_logs
                WHERE (%s = '' OR username = %s)
                ORDER BY created_at DESC
                LIMIT %s
            """
            results = execute_query(query, (username, username, limit))
            return [TextContent(type="text", text=format_results(results))]

        elif name == "mkz_get_system_info":
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
                count_query = f'SELECT COUNT(*) as row_count FROM {table_name}'
                count_result = execute_query(count_query)
                table_info.append({
                    "table": table_name,
                    "rows": count_result[0]['row_count'] if count_result else 0
                })

            return [TextContent(type="text", text=json.dumps({
                "database": DB_CONFIG["database"],
                "host": DB_CONFIG["host"],
                "tables": table_info
            }, indent=2))]

        else:
            return [TextContent(type="text", text=f"Unknown tool: {name}")]

    except Exception as e:
        logger.error(f"Tool execution error: {e}")
        return [TextContent(type="text", text=f"Error executing {name}: {str(e)}")]


if __name__ == "__main__":
    import asyncio
    async def main():
        async with stdio_server() as (read_stream, write_stream):
            await server.run(read_stream, write_stream, server.create_initialization_options())
    asyncio.run(main())
