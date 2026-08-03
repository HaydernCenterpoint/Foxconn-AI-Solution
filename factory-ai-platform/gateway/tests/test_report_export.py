import asyncio
from unittest.mock import AsyncMock, Mock, patch

import httpx
import pytest

from app.agents.report_agent import ReportAgent
from app.services import report_client
from app.services.report_client import ReportExportResult, ReportExportStatus


class FakeAsyncClient:
    def __init__(self, post_outcome, get_outcome=None, *args, **kwargs):
        self.post_outcome = post_outcome
        self.get_outcome = get_outcome
        self.post_kwargs = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False

    async def post(self, *args, **kwargs):
        self.post_kwargs = kwargs
        if isinstance(self.post_outcome, Exception):
            raise self.post_outcome
        return self.post_outcome

    async def get(self, *args, **kwargs):
        if isinstance(self.get_outcome, Exception):
            raise self.get_outcome
        return self.get_outcome


NAMESPACE = {"tenant": "factory-1", "user": "operator-1", "conversation": "conv-123"}
SERVICE_KEY = "report-service-test-key"


@pytest.fixture(autouse=True)
def report_service_auth(monkeypatch):
    monkeypatch.setenv("REPORT_SERVICE_API_KEY", SERVICE_KEY)


def run_export(
    monkeypatch,
    outcome,
    reconciliation=None,
    *,
    namespace=None,
    report_text="Narrative",
    fmt="docx",
):
    client = FakeAsyncClient(outcome, reconciliation)
    monkeypatch.setattr(
        report_client.httpx,
        "AsyncClient",
        lambda *args, **kwargs: client,
    )
    result = asyncio.run(
        report_client.export_report(
            title="Shift report",
            summary={"oee": 91},
            chart_data=[],
            alarms=[],
            report_text=report_text,
            idempotency_namespace=namespace or NAMESPACE,
            fmt=fmt,
        )
    )
    return result, client


def response(status_code, payload=None):
    request = httpx.Request("POST", "http://report-service:8083/report/export")
    return httpx.Response(status_code, request=request, json=payload or {})


def test_export_report_success(monkeypatch):
    result, client = run_export(
        monkeypatch,
        response(200, {
            "success": True,
            "status": "success",
            "downloadUrl": "https://reports.test/report.docx",
            "idempotencyKey": "caller-key-123",
            "reconciliationUrl": "/report/export/status",
        }),
    )

    sent_key = client.post_kwargs["headers"]["Idempotency-Key"]
    assert result == ReportExportResult(
        status=ReportExportStatus.SUCCESS,
        download_url="https://reports.test/report.docx",
        upstream_status=200,
        idempotency_key="caller-key-123",
        reconciliation_url="/report/export/status",
    )
    assert result.succeeded is True
    assert len(sent_key) == 64
    assert client.post_kwargs["headers"]["X-Report-Service-Key"] == SERVICE_KEY
    assert client.post_kwargs["headers"]["X-Tenant-Id"] == NAMESPACE["tenant"]
    assert client.post_kwargs["headers"]["X-User-Id"] == NAMESPACE["user"]


def test_export_report_service_down_is_retryable_and_does_not_log_exception(monkeypatch, caplog):
    request = httpx.Request("POST", "http://report-service:8083/report/export")
    result, _ = run_export(
        monkeypatch,
        httpx.ConnectError("token=do-not-log", request=request),
        response(404),
    )

    assert result.status is ReportExportStatus.IN_PROGRESS
    assert result.error_code == "report_export_outcome_unknown"
    assert result.retryable is True
    assert result.idempotency_key
    assert result.reconciliation_url == "/report/export/status"
    assert "do-not-log" not in caplog.text


def test_export_report_timeout_is_retryable(monkeypatch):
    request = httpx.Request("POST", "http://report-service:8083/report/export")
    result, _ = run_export(
        monkeypatch,
        httpx.ReadTimeout("timed out with secret", request=request),
        response(404),
    )

    assert result.status is ReportExportStatus.IN_PROGRESS
    assert result.error_code == "report_export_outcome_unknown"
    assert result.retryable is True


@pytest.mark.parametrize(("status_code", "retryable"), [(400, False), (429, True)])
def test_export_report_terminal_non_2xx_has_safe_status(monkeypatch, status_code, retryable):
    result, _ = run_export(
        monkeypatch,
        response(status_code, {"detail": "internal secret"}),
        None,
    )

    assert result.status is ReportExportStatus.FAILED
    assert result.error_code == "report_service_http_error"
    assert result.upstream_status == status_code
    assert result.retryable is retryable


@pytest.mark.parametrize("status_code", [502, 503, 504])
def test_retryable_gateway_status_reconciles_committed_export(monkeypatch, status_code):
    result, client = run_export(
        monkeypatch,
        response(status_code),
        response(200, {
            "status": "success",
            "downloadUrl": "https://reports.test/committed.docx",
        }),
    )

    assert result.status is ReportExportStatus.SUCCESS
    assert result.download_url == "https://reports.test/committed.docx"
    assert result.idempotency_key == client.post_kwargs["headers"]["Idempotency-Key"]
    assert result.reconciliation_url == "/report/export/status"


def test_retryable_gateway_status_reconciles_in_progress_export(monkeypatch):
    result, client = run_export(
        monkeypatch,
        response(503),
        response(202, {"status": "in_progress"}),
    )

    assert result.status is ReportExportStatus.IN_PROGRESS
    assert result.idempotency_key == client.post_kwargs["headers"]["Idempotency-Key"]
    assert result.reconciliation_url == "/report/export/status"


@pytest.mark.parametrize("status_code", [500, 504])
def test_post_commit_5xx_with_immediate_reconciliation_404_is_unknown(monkeypatch, status_code):
    result, client = run_export(monkeypatch, response(status_code), response(404))

    assert result.status is ReportExportStatus.IN_PROGRESS
    assert result.error_code == "report_export_outcome_unknown"
    assert result.retryable is True
    assert result.upstream_status == status_code
    assert result.idempotency_key == client.post_kwargs["headers"]["Idempotency-Key"]
    assert result.reconciliation_url == "/report/export/status"


def test_unexpected_client_error_becomes_safe_failure(monkeypatch, caplog):
    invalid_response = Mock(status_code=200)
    invalid_response.raise_for_status.return_value = None
    invalid_response.json.side_effect = TypeError("programming defect")

    result, _ = run_export(monkeypatch, invalid_response)

    assert result.error_code == "report_export_failed"
    assert "programming defect" not in caplog.text


def test_timeout_reconciles_to_stored_result(monkeypatch):
    request = httpx.Request("POST", "http://report-service:8083/report/export")
    result, _ = run_export(
        monkeypatch,
        httpx.ReadTimeout("timed out", request=request),
        response(200, {
            "status": "success",
            "downloadUrl": "https://reports.test/stored.docx",
            "idempotencyKey": "caller-key-123",
            "reconciliationUrl": "/report/export/status",
        }),
    )

    assert result.status is ReportExportStatus.SUCCESS
    assert result.download_url == "https://reports.test/stored.docx"


def test_timeout_reconciles_to_explicit_in_progress(monkeypatch):
    request = httpx.Request("POST", "http://report-service:8083/report/export")
    result, _ = run_export(
        monkeypatch,
        httpx.ReadTimeout("timed out", request=request),
        response(202, {
            "status": "in_progress",
            "idempotencyKey": "caller-key-123",
            "reconciliationUrl": "/report/export/status",
        }),
    )

    assert result.status is ReportExportStatus.IN_PROGRESS
    assert result.retryable is True


def test_post_send_transport_error_reconciles_to_stored_result(monkeypatch):
    request = httpx.Request("POST", "http://report-service:8083/report/export")
    result, _ = run_export(
        monkeypatch,
        httpx.ReadError("connection closed after send", request=request),
        response(200, {
            "status": "success",
            "downloadUrl": "https://reports.test/reconciled.docx",
            "idempotencyKey": "stored-key",
            "reconciliationUrl": "/report/export/status",
        }),
    )

    assert result.status is ReportExportStatus.SUCCESS
    assert result.download_url.endswith("reconciled.docx")


def test_unreconciled_post_send_error_preserves_reconciliation_identity(monkeypatch):
    request = httpx.Request("POST", "http://report-service:8083/report/export")
    result, client = run_export(
        monkeypatch,
        httpx.ReadError("connection closed after send", request=request),
        response(404),
    )

    sent_key = client.post_kwargs["headers"]["Idempotency-Key"]
    assert result.status is ReportExportStatus.IN_PROGRESS
    assert result.error_code == "report_export_outcome_unknown"
    assert result.idempotency_key == sent_key
    assert result.reconciliation_url == "/report/export/status"


def test_idempotency_key_namespaces_identity_and_immutable_export_inputs(monkeypatch):
    _, first_client = run_export(monkeypatch, response(200, {"status": "in_progress"}))
    first_key = first_client.post_kwargs["headers"]["Idempotency-Key"]
    _, retry_client = run_export(monkeypatch, response(200, {"status": "in_progress"}))
    _, other_user_client = run_export(
        monkeypatch,
        response(200, {"status": "in_progress"}),
        namespace={**NAMESPACE, "user": "operator-2"},
    )
    _, changed_input_client = run_export(
        monkeypatch,
        response(200, {"status": "in_progress"}),
        report_text="Changed narrative",
    )
    _, changed_format_client = run_export(
        monkeypatch,
        response(200, {"status": "in_progress"}),
        fmt="xlsx",
    )

    assert retry_client.post_kwargs["headers"]["Idempotency-Key"] == first_key
    assert other_user_client.post_kwargs["headers"]["Idempotency-Key"] != first_key
    assert changed_input_client.post_kwargs["headers"]["Idempotency-Key"] != first_key
    assert changed_format_client.post_kwargs["headers"]["Idempotency-Key"] != first_key


def test_report_agent_appends_download_link_and_success_audit():
    export_result = ReportExportResult(
        status=ReportExportStatus.SUCCESS,
        download_url="https://reports.test/report.docx",
    )

    result, audit = run_agent(export_result)

    assert "https://reports.test/report.docx" in result
    assert audit.call_args.kwargs["status"] == "success"
    assert audit.call_args.kwargs["error"] is None


def test_report_agent_marks_failed_export_as_degraded_and_audits_safe_error():
    export_result = ReportExportResult(
        status=ReportExportStatus.FAILED,
        error_code="report_service_timeout",
        retryable=True,
    )

    result, audit = run_agent(export_result)

    assert "report_service_timeout" in result
    assert "retryable" in result
    assert audit.call_args.kwargs["status"] == "degraded"
    assert audit.call_args.kwargs["error"] == "report_service_timeout"
    assert audit.call_args.kwargs["parameters"]["retryable"] is True


def test_report_agent_surfaces_reconcilable_in_progress_state():
    export_result = ReportExportResult(
        status=ReportExportStatus.IN_PROGRESS,
        retryable=True,
        idempotency_key="safe-key",
        reconciliation_url="/report/export/status",
    )

    result, audit = run_agent(export_result)

    assert "still in progress" in result
    assert audit.call_args.kwargs["status"] == "in_progress"
    assert "idempotencyKey" not in audit.call_args.kwargs["parameters"]
    assert audit.call_args.kwargs["parameters"]["reconciliationAvailable"] is True


def test_report_agent_preserves_narrative_on_unexpected_export_exception():
    result, audit = run_agent(RuntimeError("credential=do-not-expose"), raises=True)

    assert result.startswith("REPORT")
    assert "report_export_failed" in result
    assert "do-not-expose" not in result
    assert audit.call_args.kwargs["error"] == "report_export_failed"


def test_missing_report_service_config_becomes_safe_failure(monkeypatch, caplog):
    monkeypatch.delenv("REPORT_SERVICE_API_KEY")

    result, _ = run_export(monkeypatch, response(200, {"status": "success"}))

    assert result.error_code == "report_export_unavailable"
    assert "REPORT_SERVICE_API_KEY is required" not in caplog.text


@pytest.mark.parametrize(
    "scopes",
    [
        {"sub": "operator-1"},
        {"tenant_id": "factory-1"},
        {"sub": "operator-1", "tenantId": "factory-1"},
        {"sub": " ", "tenant_id": "factory-1"},
        {"sub": "operator-1", "tenant_id": " "},
    ],
)
def test_report_agent_requires_canonical_authenticated_identity(scopes):
    result, audit, export = run_agent(
        ReportExportResult(status=ReportExportStatus.SUCCESS),
        scopes=scopes,
        return_export=True,
    )

    assert "report_export_identity_required" in result
    assert audit.call_args.kwargs["status"] == "degraded"
    assert audit.call_args.kwargs["parameters"]["identityValid"] is False
    assert audit.call_args.kwargs["user_id"] not in {"unknown", "default"}
    export.assert_not_awaited()


def run_agent(export_result, *, raises=False, scopes=None, return_export=False):
    async def execute_tool(name, args, scopes):
        if name == "get_production_history":
            return {"summary": {"oee": 91}, "chartData": []}
        return {"alarms": []}

    audit = Mock()
    export = AsyncMock(side_effect=export_result) if raises else AsyncMock(return_value=export_result)
    with (
        patch("app.agents.report_agent.chat_complete", new=AsyncMock(return_value="REPORT")),
        patch("app.tools.data_tools.execute_tool", new=execute_tool),
        patch(
            "app.services.report_client.export_report",
            new=export,
        ),
        patch("app.agents.report_agent.log_audit_event", new=audit),
    ):
        result = asyncio.run(ReportAgent(
            scopes or {"sub": "operator-1", "tenant_id": "factory-1"}
        ).execute("export", "conv-123"))
    if return_export:
        return result, audit, export
    return result, audit
