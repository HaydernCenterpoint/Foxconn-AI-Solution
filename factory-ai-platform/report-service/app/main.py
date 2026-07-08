from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Any, Dict, List
import uuid
import logging

from app.generators.docx_generator import generate_docx
from app.generators.xlsx_generator import generate_xlsx
from app.storage.minio_client import upload_bytes

logger = logging.getLogger(__name__)
app = FastAPI(title="Report Exporting Service", version="2.0.0")


class ReportExportRequest(BaseModel):
    title: str
    period: Dict[str, str]
    summary: str
    kpis: List[Dict[str, Any]]
    downtime: List[Dict[str, Any]] = []
    topAlarms: List[Dict[str, Any]] = []
    recommendations: List[str] = []
    chartData: List[Dict[str, Any]] = []


@app.post("/report/export")
async def export_report(request: ReportExportRequest, format: str = "pdf"):
    run_id = str(uuid.uuid4())[:8]
    filename_base = f"{request.title.replace(' ', '_')}_{run_id}"

    try:
        if format == "xlsx":
            data = generate_xlsx(
                title=request.title,
                summary=request.summary,
                kpis=request.kpis,
                chart_data=request.chartData,
                top_alarms=request.topAlarms,
            )
            filename = f"{filename_base}.xlsx"
            content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        else:
            # Default to docx (pdf requires wkhtmltopdf; use docx as fallback)
            data = generate_docx(
                title=request.title,
                summary=request.summary,
                kpis=request.kpis,
                chart_data=request.chartData,
                top_alarms=request.topAlarms,
            )
            filename = f"{filename_base}.docx"
            content_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

        download_url = upload_bytes(data, filename, content_type)

    except Exception as exc:
        logger.error("Report generation failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Lỗi tạo báo cáo: {str(exc)}")

    return {
        "success": True,
        "filename": filename,
        "downloadUrl": download_url,
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}
