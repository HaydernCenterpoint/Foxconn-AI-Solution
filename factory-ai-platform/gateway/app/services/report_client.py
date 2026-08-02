import hashlib
import json
import logging
import os
from dataclasses import dataclass, replace
from enum import Enum
from typing import Any

import httpx

logger = logging.getLogger(__name__)

REPORT_SERVICE_URL = os.getenv("REPORT_SERVICE_URL", "http://report-service:8083")
RECONCILIATION_URL = "/report/export/status"


class ReportExportStatus(str, Enum):
    SUCCESS = "success"
    IN_PROGRESS = "in_progress"
    FAILED = "failed"


@dataclass(frozen=True)
class ReportExportResult:
    status: ReportExportStatus
    download_url: str | None = None
    error_code: str | None = None
    retryable: bool = False
    upstream_status: int | None = None
    idempotency_key: str | None = None
    reconciliation_url: str | None = None

    @property
    def succeeded(self) -> bool:
        return self.status is ReportExportStatus.SUCCESS


def _failed_result(
    error_code: str,
    *,
    retryable: bool,
    upstream_status: int | None = None,
    idempotency_key: str | None = None,
    reconciliation_url: str | None = None,
) -> ReportExportResult:
    logger.warning(
        "report-service export failed",
        extra={
            "error_code": error_code,
            "retryable": retryable,
            "upstream_status": upstream_status,
        },
    )
    return ReportExportResult(
        status=ReportExportStatus.FAILED,
        error_code=error_code,
        retryable=retryable,
        upstream_status=upstream_status,
        idempotency_key=idempotency_key,
        reconciliation_url=reconciliation_url,
    )


def _unknown_result(
    idempotency_key: str,
    *,
    upstream_status: int | None = None,
) -> ReportExportResult:
    logger.warning(
        "report-service export outcome is unknown",
        extra={
            "error_code": "report_export_outcome_unknown",
            "upstream_status": upstream_status,
        },
    )
    return ReportExportResult(
        status=ReportExportStatus.IN_PROGRESS,
        error_code="report_export_outcome_unknown",
        retryable=True,
        upstream_status=upstream_status,
        idempotency_key=idempotency_key,
        reconciliation_url=RECONCILIATION_URL,
    )


def _parse_result(payload: Any, upstream_status: int) -> ReportExportResult:
    if not isinstance(payload, dict):
        return _failed_result("report_service_invalid_response", retryable=False)

    status = payload.get("status")
    common = {
        "idempotency_key": payload.get("idempotencyKey"),
        "reconciliation_url": payload.get("reconciliationUrl"),
        "upstream_status": upstream_status,
    }
    if status == ReportExportStatus.SUCCESS.value:
        download_url = payload.get("downloadUrl")
        if not isinstance(download_url, str) or not download_url:
            return _failed_result("report_service_invalid_response", retryable=False)
        return ReportExportResult(
            status=ReportExportStatus.SUCCESS,
            download_url=download_url,
            retryable=False,
            **common,
        )
    if status == ReportExportStatus.IN_PROGRESS.value:
        return ReportExportResult(
            status=ReportExportStatus.IN_PROGRESS,
            retryable=True,
            **common,
        )
    if status == ReportExportStatus.FAILED.value:
        error_code = payload.get("errorCode")
        if not isinstance(error_code, str) or not error_code:
            return _failed_result("report_service_invalid_response", retryable=False)
        return ReportExportResult(
            status=ReportExportStatus.FAILED,
            error_code=error_code,
            retryable=payload.get("retryable") is True,
            **common,
        )
    return _failed_result("report_service_invalid_response", retryable=False)


def _request_headers(idempotency_key: str, namespace: dict[str, str]) -> dict[str, str]:
    service_key = os.getenv("REPORT_SERVICE_API_KEY", "").strip()
    tenant_id = namespace.get("tenant", "").strip()
    user_id = namespace.get("user", "").strip()
    if not service_key:
        raise RuntimeError("REPORT_SERVICE_API_KEY is required")
    if not tenant_id or not user_id:
        raise RuntimeError("canonical report export identity is required")
    return {
        "Idempotency-Key": idempotency_key,
        "X-Report-Service-Key": service_key,
        "X-Tenant-Id": tenant_id,
        "X-User-Id": user_id,
    }


async def _reconcile(
    client: httpx.AsyncClient,
    idempotency_key: str,
    namespace: dict[str, str],
) -> ReportExportResult | None:
    try:
        response = await client.get(
            f"{REPORT_SERVICE_URL}/report/export/status",
            headers=_request_headers(idempotency_key, namespace),
        )
        if response.status_code == 404:
            return None
        response.raise_for_status()
        result = _parse_result(response.json(), response.status_code)
        return replace(
            result,
            idempotency_key=result.idempotency_key or idempotency_key,
            reconciliation_url=result.reconciliation_url or RECONCILIATION_URL,
        )
    except (httpx.HTTPError, json.JSONDecodeError):
        return None


def _idempotency_key(namespace: dict[str, str], payload: dict[str, Any]) -> str:
    canonical = json.dumps(
        {"namespace": namespace, "export": payload},
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


async def _export_report(
    title: str,
    summary: dict[str, Any],
    chart_data: list[dict[str, Any]],
    alarms: list[dict[str, Any]],
    report_text: str,
    idempotency_namespace: dict[str, str],
    fmt: str = "docx",
) -> ReportExportResult:
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
    idempotency_key = _idempotency_key(
        idempotency_namespace,
        {"format": fmt, "request": payload},
    )
    headers = _request_headers(idempotency_key, idempotency_namespace)
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.post(
                f"{REPORT_SERVICE_URL}/report/export",
                json=payload,
                params={"format": fmt},
                headers=headers,
            )
            resp.raise_for_status()
            result = _parse_result(resp.json(), resp.status_code)
            return replace(
                result,
                idempotency_key=result.idempotency_key or idempotency_key,
                reconciliation_url=result.reconciliation_url or RECONCILIATION_URL,
            )
        except httpx.TimeoutException:
            reconciled = await _reconcile(client, idempotency_key, idempotency_namespace)
            return reconciled or _unknown_result(idempotency_key)
        except httpx.HTTPStatusError as exc:
            status_code = exc.response.status_code
            if status_code >= 500:
                reconciled = await _reconcile(client, idempotency_key, idempotency_namespace)
                if reconciled is not None:
                    return reconciled
                return _unknown_result(idempotency_key, upstream_status=status_code)
            return _failed_result(
                "report_service_http_error",
                retryable=status_code in (408, 429),
                upstream_status=status_code,
                idempotency_key=idempotency_key,
                reconciliation_url=RECONCILIATION_URL,
            )
        except httpx.TransportError:
            reconciled = await _reconcile(client, idempotency_key, idempotency_namespace)
            return reconciled or _unknown_result(idempotency_key)
        except json.JSONDecodeError:
            reconciled = await _reconcile(client, idempotency_key, idempotency_namespace)
            return reconciled or _unknown_result(idempotency_key)


async def export_report(
    title: str,
    summary: dict[str, Any],
    chart_data: list[dict[str, Any]],
    alarms: list[dict[str, Any]],
    report_text: str,
    idempotency_namespace: dict[str, str],
    fmt: str = "docx",
) -> ReportExportResult:
    """Best-effort export boundary that never exposes configuration or exception details."""
    try:
        return await _export_report(
            title=title,
            summary=summary,
            chart_data=chart_data,
            alarms=alarms,
            report_text=report_text,
            idempotency_namespace=idempotency_namespace,
            fmt=fmt,
        )
    except RuntimeError:
        logger.error(
            "report-service export unavailable",
            extra={"error_code": "report_export_unavailable"},
        )
        return _failed_result("report_export_unavailable", retryable=False)
    except Exception:  # noqa: BLE001 - optional export must preserve the core narrative
        logger.error(
            "unexpected report-service export failure",
            extra={"error_code": "report_export_failed"},
        )
        return _failed_result("report_export_failed", retryable=False)
