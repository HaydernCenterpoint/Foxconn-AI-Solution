import hashlib
import hmac
import json
import logging
import os
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Query, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.generators.docx_generator import generate_docx
from app.generators.xlsx_generator import generate_xlsx
from app.storage.idempotency import ExportStore, ExportStoreError, LeaseLostError
from app.storage.minio_client import (
    resolve_local_report_path,
    upload_bytes,
    validate_storage_config,
    verify_download_capability,
)

logger = logging.getLogger(__name__)

_LOCAL_DIR = Path(os.getenv("LOCAL_REPORTS_DIR", "/var/lib/report-service"))
_EXPORT_STORE = ExportStore(_LOCAL_DIR)
_ALLOWED_MODES = {"production", "local", "test"}


class ReportExportRequest(BaseModel):
    title: str
    period: dict[str, str]
    summary: str
    kpis: list[dict[str, Any]]
    downtime: list[dict[str, Any]] = []
    topAlarms: list[dict[str, Any]] = []
    recommendations: list[str] = []
    chartData: list[dict[str, Any]] = []


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _validate_runtime_config() -> tuple[str, int]:
    mode = os.getenv("REPORT_SERVICE_MODE", "production").strip().lower()
    if mode not in _ALLOWED_MODES:
        raise RuntimeError("REPORT_SERVICE_MODE must be production, local, or test")
    try:
        replicas = int(os.getenv("REPORT_SERVICE_REPLICA_COUNT", "1"))
    except ValueError as exc:
        raise RuntimeError("REPORT_SERVICE_REPLICA_COUNT must be 1") from exc
    if replicas != 1:
        raise RuntimeError("local report storage supports exactly one report-service replica")
    validate_storage_config()
    return mode, replicas


@asynccontextmanager
async def _lifespan(_: FastAPI) -> AsyncIterator[None]:
    _validate_runtime_config()
    yield


app = FastAPI(title="Report Exporting Service", version="2.0.0", lifespan=_lifespan)


def _service_identity(
    service_key: str | None,
    tenant_id: str | None,
    user_id: str | None,
) -> tuple[str, str]:
    configured_key = os.getenv("REPORT_SERVICE_API_KEY", "").strip()
    if not configured_key:
        raise HTTPException(status_code=503, detail="report_service_auth_not_configured")
    supplied_key = service_key or ""
    configured_digest = hashlib.sha256(configured_key.encode("utf-8")).digest()
    supplied_digest = hashlib.sha256(supplied_key.encode("utf-8")).digest()
    if not hmac.compare_digest(configured_digest, supplied_digest):
        raise HTTPException(status_code=401, detail="report_service_unauthorized")
    if not tenant_id or not tenant_id.strip() or not user_id or not user_id.strip():
        raise HTTPException(status_code=400, detail="report_export_identity_required")
    return tenant_id.strip(), user_id.strip()


def _enforce_record_owner(record: dict[str, Any], tenant_id: str, user_id: str) -> None:
    if record.get("ownerTenant") != tenant_id or record.get("ownerUser") != user_id:
        raise HTTPException(status_code=404, detail="report_export_not_found")


def _request_hash(request: ReportExportRequest, format: str) -> str:
    canonical = json.dumps(
        {"format": format, "request": request.model_dump(mode="json")},
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _public_record(record: dict[str, Any]) -> dict[str, Any]:
    private_fields = {"requestHash", "ownerTenant", "ownerUser", "downloadPath"}
    return {key: value for key, value in record.items() if key not in private_fields}


def _read_export_record(key: str) -> dict[str, Any] | None:
    try:
        return _EXPORT_STORE.read(key)
    except ExportStoreError:
        logger.error("Report export state unavailable", extra={"error_code": "report_export_state_unavailable"})
        raise HTTPException(status_code=503, detail="report_export_state_unavailable")


def _write_export_record(key: str, record: dict[str, Any]) -> None:
    try:
        _EXPORT_STORE.write(key, record)
    except ExportStoreError:
        logger.error("Report export state unavailable", extra={"error_code": "report_export_state_unavailable"})
        raise HTTPException(status_code=503, detail="report_export_state_unavailable")


def _cleanup_export_store() -> None:
    try:
        _EXPORT_STORE.cleanup_orphans()
    except ExportStoreError:
        logger.error("Report export state unavailable", extra={"error_code": "report_export_state_unavailable"})
        raise HTTPException(status_code=503, detail="report_export_state_unavailable")


def _is_export_claimed(key: str) -> bool:
    try:
        return _EXPORT_STORE.is_claimed(key)
    except ExportStoreError:
        logger.error("Report export state unavailable", extra={"error_code": "report_export_state_unavailable"})
        raise HTTPException(status_code=503, detail="report_export_state_unavailable")


def _persist_orphan_failure(key: str, record: dict[str, Any]) -> dict[str, Any]:
    try:
        return _EXPORT_STORE.fail_if_unclaimed(key, record)
    except ExportStoreError:
        logger.error("Report export state unavailable", extra={"error_code": "report_export_state_unavailable"})
        raise HTTPException(status_code=503, detail="report_export_state_unavailable")


def _release_export_claim(key: str, owner: str) -> None:
    try:
        _EXPORT_STORE.release(key, owner)
    except ExportStoreError:
        logger.error(
            "Report export claim release failed",
            extra={"error_code": "report_export_release_failed"},
        )


@app.get("/report/export/status")
async def report_export_status(
    response: Response,
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
    service_key: str | None = Header(None, alias="X-Report-Service-Key"),
    tenant_id: str | None = Header(None, alias="X-Tenant-Id"),
    user_id: str | None = Header(None, alias="X-User-Id"),
):
    tenant_id, user_id = _service_identity(service_key, tenant_id, user_id)
    _cleanup_export_store()
    record = _read_export_record(idempotency_key)
    if record is None:
        raise HTTPException(status_code=404, detail="report_export_not_found")
    _enforce_record_owner(record, tenant_id, user_id)
    if record["status"] == "in_progress" and not _is_export_claimed(idempotency_key):
        orphaned_record = {
            **record,
            "status": "failed",
            "errorCode": "report_export_orphaned",
            "retryable": True,
            "updatedAt": _now(),
        }
        record = _persist_orphan_failure(idempotency_key, orphaned_record)
    if record["status"] == "in_progress":
        response.status_code = 202
    return _public_record(record)


@app.post("/report/export")
async def export_report(
    request: ReportExportRequest,
    response: Response,
    format: str = "pdf",
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    service_key: str | None = Header(None, alias="X-Report-Service-Key"),
    tenant_id: str | None = Header(None, alias="X-Tenant-Id"),
    user_id: str | None = Header(None, alias="X-User-Id"),
):
    tenant_id, user_id = _service_identity(service_key, tenant_id, user_id)
    if idempotency_key is not None and not (1 <= len(idempotency_key) <= 128):
        raise HTTPException(status_code=400, detail="invalid_idempotency_key")

    key = idempotency_key or str(uuid.uuid4())
    request_hash = _request_hash(request, format)
    _cleanup_export_store()
    existing = _read_export_record(key)
    if existing is not None:
        _enforce_record_owner(existing, tenant_id, user_id)
        if existing.get("requestHash") != request_hash:
            raise HTTPException(status_code=409, detail="idempotency_key_conflict")
        if existing["status"] == "success":
            return _public_record(existing)
        if existing["status"] == "in_progress" and _is_export_claimed(key):
            response.status_code = 202
            return _public_record(existing)

    try:
        owner = _EXPORT_STORE.claim(key)
    except ExportStoreError:
        logger.error("Report export state unavailable", extra={"error_code": "report_export_state_unavailable"})
        raise HTTPException(status_code=503, detail="report_export_state_unavailable")
    if owner is None:
        response.status_code = 202
        current = _read_export_record(key)
        if current is not None and current.get("status") == "in_progress":
            return _public_record(current)
        return {
            "status": "in_progress",
            "idempotencyKey": key,
            "retryable": True,
            "reconciliationUrl": "/report/export/status",
        }

    created_at = existing.get("createdAt", _now()) if existing else _now()
    record = {
        "success": False,
        "status": "in_progress",
        "idempotencyKey": key,
        "requestHash": request_hash,
        "ownerTenant": tenant_id,
        "ownerUser": user_id,
        "retryable": True,
        "createdAt": created_at,
        "updatedAt": _now(),
        "reconciliationUrl": "/report/export/status",
    }
    try:
        with _EXPORT_STORE.ownership(key, owner):
            _write_export_record(key, record)
        run_id = _EXPORT_STORE.token(key)[:16]
        safe_title = request.title.replace(" ", "_").replace("/", "_").replace("\\", "_")
        filename_base = f"{safe_title}_{run_id}"

        with _EXPORT_STORE.heartbeat(key, owner) as assert_heartbeat:
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

            with _EXPORT_STORE.ownership(key, owner):
                assert_heartbeat()
                download_url = upload_bytes(
                    data,
                    filename,
                    content_type,
                    export_token=_EXPORT_STORE.token(key),
                    tenant_id=tenant_id,
                    user_id=user_id,
                )
                record = {
                    **record,
                    "success": True,
                    "status": "success",
                    "filename": filename,
                    "downloadPath": filename,
                    "downloadUrl": download_url,
                    "retryable": False,
                    "updatedAt": _now(),
                }
                _write_export_record(key, record)
    except LeaseLostError:
        logger.warning(
            "Report export lease ownership lost",
            extra={"error_code": "report_export_lease_lost", "retryable": True},
        )
        raise HTTPException(status_code=409, detail="report_export_lease_lost")
    except ExportStoreError:
        logger.error(
            "Report export heartbeat or ownership state unavailable",
            extra={"error_code": "report_export_state_unavailable"},
        )
        raise HTTPException(status_code=503, detail="report_export_state_unavailable")
    except HTTPException:
        raise
    except Exception:  # noqa: BLE001 - normalize generator/storage failures safely
        record = {
            **record,
            "status": "failed",
            "errorCode": "report_export_failed",
            "retryable": True,
            "updatedAt": _now(),
        }
        try:
            with _EXPORT_STORE.ownership(key, owner):
                _write_export_record(key, record)
        except LeaseLostError:
            pass
        logger.error(
            "Report generation failed",
            extra={"error_code": "report_export_failed", "retryable": True},
        )
        raise HTTPException(
            status_code=500,
            detail="report_export_failed",
        )
    finally:
        _release_export_claim(key, owner)

    return _public_record(record)


@app.get("/health")
async def health():
    mode, replicas = _validate_runtime_config()
    return {
        "status": "healthy",
        "mode": mode,
        "storage": "local-single-replica",
        "configuredReplicas": replicas,
        "replicaLimit": 1,
        "multiReplicaReady": False,
    }


@app.get("/local-files/{filename:path}")
async def serve_local_file(
    filename: str,
    export_token: str = Query(..., alias="export"),
    tenant_id: str = Query(..., alias="tenant"),
    user_id: str = Query(..., alias="user"),
    expires: int = Query(...),
    signature: str = Query(...),
):
    """Serve locally-stored report files (replacement for MinIO presigned URL)."""
    if not verify_download_capability(
        filename,
        export_token,
        tenant_id,
        user_id,
        expires,
        signature,
    ):
        raise HTTPException(status_code=401, detail="invalid_report_download_capability")
    try:
        record = _EXPORT_STORE.read_token(export_token)
    except ExportStoreError:
        raise HTTPException(status_code=404, detail="report_export_not_found")
    if record is None:
        raise HTTPException(status_code=404, detail="report_export_not_found")
    _enforce_record_owner(record, tenant_id, user_id)
    if record.get("status") != "success" or record.get("downloadPath") != filename:
        raise HTTPException(status_code=404, detail="report_export_not_found")
    try:
        path = resolve_local_report_path(filename)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid_report_path")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(
        path,
        filename=path.name,
        headers={
            "Cache-Control": "private, no-store",
            "Referrer-Policy": "no-referrer",
            "X-Content-Type-Options": "nosniff",
        },
    )
