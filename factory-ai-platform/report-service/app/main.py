# Load local environment variables from infrastructure/.env if running locally
import os
def _load_local_env():
    cur = os.path.dirname(os.path.abspath(__file__))
    for _ in range(5):
        infra_env = os.path.join(cur, "infrastructure", ".env")
        if os.path.exists(infra_env):
            with open(infra_env, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    if "=" in line:
                        k, v = line.split("=", 1)
                        os.environ[k.strip()] = v.strip().strip("'").strip('"')
            break
        env_file = os.path.join(cur, ".env")
        if os.path.exists(env_file):
            with open(env_file, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    if "=" in line:
                        k, v = line.split("=", 1)
                        os.environ[k.strip()] = v.strip().strip("'").strip('"')
            break
        parent = os.path.dirname(cur)
        if parent == cur:
            break
        cur = parent

_load_local_env()

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Any, Dict, List
import uuid
import logging
from pathlib import Path

from app.generators.docx_generator import generate_docx
from app.generators.xlsx_generator import generate_xlsx
from app.storage.minio_client import upload_bytes, LOCAL_BASE_URL

logger = logging.getLogger(__name__)
app = FastAPI(title="Report Exporting Service", version="2.0.0")

_LOCAL_DIR = Path(os.getenv("LOCAL_REPORTS_DIR", "d:/nhnhnhnhnh/factory-ai-platform/report-service/_local_storage"))


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


@app.get("/local-files/{filename:path}")
async def serve_local_file(filename: str):
    """Serve locally-stored report files (replacement for MinIO presigned URL)."""
    safe = filename.replace("..", "_").replace("\\", "/")
    path = _LOCAL_DIR / safe
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, filename=path.name)
