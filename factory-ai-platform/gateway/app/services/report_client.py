import os
import logging
from typing import Any, Dict, List, Optional
import httpx

logger = logging.getLogger(__name__)

REPORT_SERVICE_URL = os.getenv("REPORT_SERVICE_URL", "http://report-service:8083")


async def export_report(
    title: str,
    summary: Dict[str, Any],
    chart_data: List[Dict[str, Any]],
    alarms: List[Dict[str, Any]],
    report_text: str,
    fmt: str = "pdf",
) -> Optional[str]:
    payload = {
        "title": title,
        "period": {"timeRange": "today"},
        "summary": report_text,
        "kpis": [
            {"label": k, "value": v}
            for k, v in summary.items()
        ],
        "downtime": [],
        "topAlarms": alarms[:5],
        "recommendations": [],
        "chartData": chart_data,
    }
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{REPORT_SERVICE_URL}/report/export",
                json=payload,
                params={"format": fmt},
            )
            resp.raise_for_status()
            return resp.json().get("downloadUrl")
    except Exception as exc:
        logger.warning("report-service export failed: %s", exc)
        return None
