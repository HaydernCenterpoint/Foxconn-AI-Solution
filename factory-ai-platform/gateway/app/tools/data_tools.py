from typing import Dict, Any, List, Optional
from app.services import backend_client

DATA_TOOLS_SCHEMA = [
    {
        "name": "get_production_history",
        "description": "Lấy lịch sử sản lượng của một dây chuyền trong khoảng thời gian",
        "parameters": {
            "type": "object",
            "properties": {
                "lineCode": {"type": "string"},
                "startTime": {"type": "string", "format": "date-time"},
                "endTime": {"type": "string", "format": "date-time"},
                "interval": {"type": "string", "enum": ["minute", "hour", "shift", "day"]},
            },
            "required": ["lineCode", "startTime", "endTime"],
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
            "required": ["lineCode"],
        },
    },
    {
        "name": "get_dashboard_summary",
        "description": "Lấy tổng quan toàn hệ thống: số máy, sản lượng, alarms",
        "parameters": {"type": "object", "properties": {}},
    },
]


def _map_interval_to_timerange(interval: Optional[str]) -> str:
    mapping = {
        "shift": "shift_morning",
        "day": "today",
        "hour": "today",
        "minute": "today",
    }
    return mapping.get(interval or "hour", "today")


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
        if name == "get_dashboard_summary":
            return await backend_client.get_dashboard_summary()

        elif name == "get_production_history":
            line_uuid = "all"
            if line_code:
                resolved = await backend_client.resolve_line_id(line_code)
                line_uuid = resolved or "all"
            interval = args.get("interval", "hour")
            group_by = "day" if interval == "day" else "hour"
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
                    if lc_lower in a.get("machineName", "").lower()
                ]
            return {
                "alarms": alarms,
                "activeCount": len(alarms),
            }

        elif name == "find_bottleneck_machine":
            snapshots = await backend_client.get_telemetry_live()
            if not snapshots:
                return {"error": "NO_DATA", "message": "Không có dữ liệu telemetry live"}

            # Filter by line if provided
            if line_code:
                lc_lower = line_code.lower()
                snapshots = [
                    s for s in snapshots
                    if lc_lower in s.get("machineName", "").lower()
                ]

            # Find machine with highest cycle time or lowest OEE
            best: Dict[str, Any] = {}
            worst_oee = 999.0
            for snap in snapshots:
                payload = snap.get("payload") or {}
                prod = payload.get("production", {}) if isinstance(payload, dict) else {}
                oee = prod.get("oee", 100.0) if isinstance(prod, dict) else 100.0
                if oee < worst_oee:
                    worst_oee = oee
                    best = snap

            if not best:
                return {"message": "Không tìm thấy dữ liệu bottleneck"}

            payload = best.get("payload") or {}
            prod = payload.get("production", {}) if isinstance(payload, dict) else {}
            return {
                "lineCode": line_code,
                "bottleneckMachine": best.get("machineName", "unknown"),
                "oee": worst_oee,
                "cycleTimeSeconds": prod.get("time") if isinstance(prod, dict) else None,
                "status": best.get("payload", {}).get("status") if isinstance(best.get("payload"), dict) else None,
                "snapshot": best,
            }

    except Exception as exc:
        return {"error": "BACKEND_ERROR", "message": str(exc)}

    return {"error": "TOOL_NOT_FOUND", "message": f"Tool '{name}' is not registered."}
