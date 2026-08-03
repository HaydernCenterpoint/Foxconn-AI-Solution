import time
from typing import Any

from app.audit.logger import log_audit_event
from app.services.llm_client import chat_complete

SYSTEM_PROMPT = """Bạn là chuyên gia soạn thảo báo cáo vận hành nhà máy sản xuất.
Dữ liệu sản xuất thực tế được cung cấp trong thẻ <data>. Hãy viết báo cáo ca sản xuất bằng tiếng Việt, có các phần:
1. **Tóm tắt ca** — tổng sản lượng, OEE, yield rate
2. **Phân tích theo giờ/ngày** — giờ cao điểm, giờ thấp điểm
3. **Cảnh báo & sự cố** — nếu có alarm
4. **Khuyến nghị** — 2-3 điểm cải tiến cụ thể
Dùng định dạng markdown có heading và bullet points."""


class ReportAgent:
    def __init__(self, scopes: dict[str, Any]):
        self.scopes = scopes

    async def execute(self, message: str, conversation_id: str) -> str:
        from app.services.report_client import (
            ReportExportResult,
            ReportExportStatus,
            export_report,
        )
        from app.tools.data_tools import execute_tool

        # 1. Fetch production data
        production_data = await execute_tool(
            "get_production_history",
            {"lineCode": "", "startTime": "today", "endTime": "today", "interval": "hour"},
            self.scopes,
        )
        alarm_data = await execute_tool("get_active_alarms", {}, self.scopes)

        context = {
            "production": production_data,
            "alarms": alarm_data,
        }

        # 2. LLM writes the report narrative
        report_text = await chat_complete(
            system_prompt=SYSTEM_PROMPT,
            user_message=message,
            context_data=context,
        )

        # 3. Call report-service and expose export degradation without failing the narrative.
        export_started = time.monotonic()
        summary = production_data.get("summary", {}) if isinstance(production_data, dict) else {}
        tenant = self.scopes.get("tenant_id")
        subject = self.scopes.get("sub")
        tenant_id = tenant.strip() if isinstance(tenant, str) else ""
        subject_id = subject.strip() if isinstance(subject, str) else ""
        identity_valid = bool(tenant_id and subject_id)
        if identity_valid:
            try:
                export_result = await export_report(
                    title=f"Báo cáo vận hành — {conversation_id[:8]}",
                    summary=summary,
                    chart_data=production_data.get("chartData", []) if isinstance(production_data, dict) else [],
                    alarms=alarm_data.get("alarms", []) if isinstance(alarm_data, dict) else [],
                    report_text=report_text,
                    idempotency_namespace={
                        "tenant": tenant_id,
                        "user": subject_id,
                        "conversation": conversation_id,
                    },
                )
            except Exception:  # noqa: BLE001 - preserve narrative at the optional export boundary
                export_result = ReportExportResult(
                    status=ReportExportStatus.FAILED,
                    error_code="report_export_failed",
                    retryable=False,
                )
        else:
            export_result = ReportExportResult(
                status=ReportExportStatus.FAILED,
                error_code="report_export_identity_required",
                retryable=False,
            )
        download_url = export_result.download_url
        if download_url:
            report_text += f"\n\n---\n**Tải báo cáo**: [{download_url}]({download_url})"

        if export_result.succeeded:
            audit_status = "success"
            audit_error = None
        elif export_result.status is ReportExportStatus.IN_PROGRESS:
            report_text += (
                "\n\n---\n**Report export status**: "
                "File export is still in progress and can be reconciled safely."
            )
            audit_status = "in_progress"
            audit_error = None
        else:
            retry_text = "retryable" if export_result.retryable else "not retryable"
            report_text += (
                "\n\n---\n**Report export status**: "
                f"File export failed (`{export_result.error_code}`; {retry_text})."
            )
            audit_status = "degraded"
            audit_error = export_result.error_code

        log_audit_event(
            user_id=subject_id,
            conversation_id=conversation_id,
            agent="factory-report-agent",
            action="report_export",
            duration_ms=(time.monotonic() - export_started) * 1000.0,
            status=audit_status,
            parameters={
                "format": "docx",
                "retryable": export_result.retryable,
                "upstreamStatus": export_result.upstream_status,
                "exportStatus": export_result.status.value,
                "reconciliationAvailable": bool(export_result.reconciliation_url),
                "identityValid": identity_valid,
            },
            error=audit_error,
        )

        return report_text
