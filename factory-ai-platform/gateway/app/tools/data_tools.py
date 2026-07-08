"""
data_tools.py

Schema-driven toolset that proxies user requests to the .NET backend.
Replaces the previous hardcoded MOCK_PRODUCTION_DATA / MOCK_ALARMS — now
all real data comes from backend_client (HTTP → ASP.NET Core REST API).
"""
from typing import Dict, Any, List, Optional
from app.services import backend_client

DATA_TOOLS_SCHEMA = [
    {
        "name": "resolve_line_code",
        "description": "Resolve a line code (e.g. 'LS18') to the backend's UUID for that line.",
        "parameters": {
            "type": "object",
            "properties": {"lineCode": {"type": "string"}},
            "required": ["lineCode"],
        },
    },
    {
        "name": "get_production_history",
        "description": "Lấy lịch sử sản lượng của một dây chuyền trong khoảng thời gian",
        "parameters": {
            "type": "object",
            "properties": {
                "lineCode": {"type": "string"},
                "interval": {"type": "string", "enum": ["minute", "hour", "shift", "day", "7d", "30d", "week", "month"]},
            },
        },
    },
    {
        "name": "get_active_alarms",
        "description": "Lấy các cảnh báo lỗi đang hoạt động trên hệ thống",
        "parameters": {
            "type": "object",
            "properties": {
                "lineCode": {"type": "string"},
                "severity": {"type": "string", "enum": ["CRITICAL", "HIGH", "MEDIUM", "LOW"]},
            },
        },
    },
    {
        "name": "find_bottleneck_machine",
        "description": "Phân tích và tìm máy trạm đang gây nghẽn (bottleneck) trên dây chuyền",
        "parameters": {
            "type": "object",
            "properties": {"lineCode": {"type": "string"}},
        },
    },
    {
        "name": "get_dashboard_summary",
        "description": "Lấy tổng quan toàn hệ thống: số máy, sản lượng, alarms",
        "parameters": {"type": "object", "properties": {}},
    },
]


# Map LLM-facing interval → backend's timeRange query parameter.
# The .NET ReportsController recognises: today, shift_morning, shift_night,
# last_7_days, month. Anything else falls back to "today".
_INTERVAL_TO_TIMERANGE = {
    "shift": "shift_morning",
    "day": "today",
    "hour": "today",
    "minute": "today",
    "7d": "last_7_days",
    "week": "last_7_days",
    "30d": "month",
    "month": "month",
}


def _map_interval_to_timerange(interval: Optional[str]) -> str:
    return _INTERVAL_TO_TIMERANGE.get((interval or "hour").lower(), "today")


async def execute_tool(
    name: str, args: Dict[str, Any], scopes: Dict[str, Any]
) -> Dict[str, Any]:
    """Execute data query tools, enforcing line scopes."""
    # Scope check
    line_code = args.get("lineCode")
    if line_code:
        allowed_lines = scopes.get("lineScopes", [])
        if allowed_lines and line_code not in allowed_lines:
            return {
                "error": "SCOPE_DENIED",
                "message": f"User does not have access to line {line_code}",
            }

    try:
        if name == "resolve_line_code":
            if not line_code:
                return {"error": "MISSING_ARGUMENT", "message": "lineCode is required"}
            line_uuid = await backend_client.resolve_line_id(line_code)
            return {
                "lineCode": line_code.upper(),
                "lineId": line_uuid,
                "resolved": line_uuid is not None,
            }

        if name == "get_dashboard_summary":
            return await backend_client.get_dashboard_summary()

        elif name == "get_production_history":
            line_uuid = "all"
            if line_code:
                resolved = await backend_client.resolve_line_id(line_code)
                line_uuid = resolved or "all"
            interval = (args.get("interval") or "hour").lower()
            # Daily grouping makes sense for multi-day windows; otherwise hourly.
            group_by = "day" if interval in {"day", "7d", "week", "30d", "month"} else "hour"
            time_range = _map_interval_to_timerange(interval)
            return await backend_client.get_production_report(
                time_range=time_range,
                line_id=line_uuid,
                group_by=group_by,
            )

        elif name == "get_active_alarms":
            severity = args.get("severity")
            alarms = await backend_client.get_active_alarms(severity=severity)
            if line_code:
                lc_lower = line_code.lower()
                alarms = [
                    a for a in alarms
                    if lc_lower in (a.get("machineName") or "").lower()
                ]
            return {
                "alarms": alarms,
                "activeCount": len(alarms),
            }

        elif name == "find_bottleneck_machine":
            snapshots = await backend_client.get_telemetry_live()
            if not snapshots:
                return {"error": "NO_DATA", "message": "Không có dữ liệu telemetry live"}

            # Filter by line if provided (line_code may appear in machineName)
            if line_code:
                lc_lower = line_code.lower()
                snapshots = [
                    s for s in snapshots
                    if lc_lower in (s.get("machineName") or "").lower()
                ]

            # Score each snapshot. Higher = worse.
            # Prefer cycle_time when present; fall back to (status != RUNNING) + low OEE.
            best: Dict[str, Any] = {}
            best_score: float = -1.0
            for snap in snapshots:
                payload = snap.get("payload") or {}
                if not isinstance(payload, dict):
                    payload = {}
                prod = payload.get("production") or {}
                if not isinstance(prod, dict):
                    prod = {}

                cycle_time = float(prod.get("time") or prod.get("cycleTime") or 0)
                oee = float(prod.get("oee", 100.0))
                status = (snap.get("payload") or {}).get("status") if isinstance(snap.get("payload"), dict) else None
                status_norm = (status or prod.get("status") or "").upper()

                # Score: combine cycle time and penalise non-RUNNING status
                penalty = 0.0 if status_norm in {"RUNNING", "ĐANG CHẠY"} else 50.0
                score = cycle_time + (100 - oee) + penalty
                if score > best_score:
                    best_score = score
                    best = snap

            if not best:
                return {"message": "Không tìm thấy dữ liệu bottleneck"}

            payload = best.get("payload") or {}
            prod = (payload.get("production") or {}) if isinstance(payload, dict) else {}
            status_val = payload.get("status") if isinstance(payload, dict) else None
            return {
                "lineCode": line_code,
                "bottleneckMachine": best.get("machineName", "unknown"),
                "oee": float(prod.get("oee", 0)) if isinstance(prod, dict) else 0,
                "cycleTimeSeconds": prod.get("time") if isinstance(prod, dict) else None,
                "status": status_val,
                "snapshot": best,
            }

    except Exception as exc:
        return {"error": "BACKEND_ERROR", "message": str(exc)}

    return {"error": "TOOL_NOT_FOUND", "message": f"Tool '{name}' is not registered."}
