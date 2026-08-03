import asyncio
import logging
import os
import threading
import time
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, unquote, urlparse

import pytest
from fastapi import HTTPException, Response

import app.main as report_main
import app.storage.idempotency as idempotency_module
import app.storage.minio_client as local_storage
from app.main import ReportExportRequest
from app.storage.idempotency import ExportStore, ExportStoreError, LeaseLostError

SERVICE_KEY = "report-service-test-key"
SIGNING_KEY = "report-download-signing-key-32-bytes-minimum"
TENANT_ID = "factory-1"
USER_ID = "operator-1"


def report_request():
    return ReportExportRequest(
        title="Shift report",
        period={"timeRange": "today"},
        summary="Narrative",
        kpis=[],
    )


@pytest.fixture(autouse=True)
def isolated_export_store(monkeypatch, tmp_path):
    monkeypatch.setattr(report_main, "_EXPORT_STORE", ExportStore(tmp_path))
    monkeypatch.setattr(local_storage, "_LOCAL_DIR", tmp_path / "reports")
    monkeypatch.setenv("REPORT_SERVICE_API_KEY", SERVICE_KEY)
    monkeypatch.setenv("REPORT_DOWNLOAD_SIGNING_KEY", SIGNING_KEY)
    monkeypatch.setenv("REPORT_SERVICE_MODE", "test")
    monkeypatch.setenv("REPORT_SERVICE_REPLICA_COUNT", "1")
    monkeypatch.setenv("LOCAL_REPORTS_BASE_URL", "http://127.0.0.1:8083/local-files")


def invoke_export(key="stable-key", request=None):
    return asyncio.run(report_main.export_report(
        request or report_request(),
        Response(),
        format="docx",
        idempotency_key=key,
        service_key=SERVICE_KEY,
        tenant_id=TENANT_ID,
        user_id=USER_ID,
    ))


def upload_report(
    data=b"report",
    filename="report.docx",
    export_token="a" * 64,
    tenant_id=TENANT_ID,
    user_id=USER_ID,
):
    return local_storage.upload_bytes(
        data,
        filename,
        export_token=export_token,
        tenant_id=tenant_id,
        user_id=user_id,
    )


def test_export_report_success_contract_and_retry_reuses_result():
    with (
        patch("app.main.generate_docx", return_value=b"report") as generate,
        patch("app.main.upload_bytes", return_value="https://reports.test/report.docx") as upload,
    ):
        result = invoke_export()
        retry = invoke_export()

    assert result["success"] is True
    assert result["status"] == "success"
    assert result["downloadUrl"] == "https://reports.test/report.docx"
    assert result["filename"].endswith(".docx")
    assert result["filename"] == retry["filename"]
    assert result["idempotencyKey"] == "stable-key"
    assert result["reconciliationUrl"] == "/report/export/status"
    generate.assert_called_once()
    upload.assert_called_once()


def test_same_key_with_different_request_is_rejected():
    with (
        patch("app.main.generate_docx", return_value=b"report"),
        patch("app.main.upload_bytes", return_value="https://reports.test/report.docx"),
    ):
        invoke_export()
        changed = report_request().model_copy(update={"summary": "Changed"})
        with pytest.raises(HTTPException) as exc_info:
            invoke_export(request=changed)

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == "idempotency_key_conflict"


def test_active_claim_returns_explicit_in_progress_state():
    request = report_request()
    key = "active-key"
    request_hash = report_main._request_hash(request, "docx")
    report_main._EXPORT_STORE.write(key, {
        "status": "in_progress",
        "idempotencyKey": key,
        "requestHash": request_hash,
        "ownerTenant": TENANT_ID,
        "ownerUser": USER_ID,
        "retryable": True,
        "createdAt": "2026-08-02T00:00:00+00:00",
        "updatedAt": "2026-08-02T00:00:00+00:00",
        "reconciliationUrl": "/report/export/status",
    })
    assert report_main._EXPORT_STORE.claim(key) is not None
    response = Response()

    result = asyncio.run(report_main.export_report(
        request,
        response,
        format="docx",
        idempotency_key=key,
        service_key=SERVICE_KEY,
        tenant_id=TENANT_ID,
        user_id=USER_ID,
    ))

    assert response.status_code == 202
    assert result["status"] == "in_progress"


def test_status_reconciles_stale_claim_as_retryable_orphan():
    key = "orphaned-key"
    report_main._EXPORT_STORE.write(key, {
        "status": "in_progress",
        "idempotencyKey": key,
        "requestHash": "request-hash",
        "ownerTenant": TENANT_ID,
        "ownerUser": USER_ID,
        "retryable": True,
        "createdAt": "2026-08-02T00:00:00+00:00",
        "updatedAt": "2026-08-02T00:00:00+00:00",
        "reconciliationUrl": "/report/export/status",
    })
    assert report_main._EXPORT_STORE.claim(key) is not None
    lock_path = report_main._EXPORT_STORE._lock_path(key)
    os.utime(lock_path, (0, 0))

    result = asyncio.run(report_main.report_export_status(
        Response(),
        idempotency_key=key,
        service_key=SERVICE_KEY,
        tenant_id=TENANT_ID,
        user_id=USER_ID,
    ))

    assert result["status"] == "failed"
    assert result["errorCode"] == "report_export_orphaned"
    assert result["retryable"] is True
    assert report_main._EXPORT_STORE.read(key)["status"] == "failed"


def test_orphan_failure_is_not_persisted_while_claimed():
    key = "claimed-key"
    record = {
        "status": "in_progress",
        "idempotencyKey": key,
        "requestHash": "request-hash",
        "ownerTenant": TENANT_ID,
        "ownerUser": USER_ID,
        "reconciliationUrl": "/report/export/status",
    }
    report_main._EXPORT_STORE.write(key, record)
    owner = report_main._EXPORT_STORE.claim(key)
    assert owner is not None

    result = report_main._EXPORT_STORE.fail_if_unclaimed(
        key,
        {**record, "status": "failed", "errorCode": "report_export_orphaned"},
    )

    assert result["status"] == "in_progress"
    assert report_main._EXPORT_STORE.read(key)["status"] == "in_progress"


def test_export_report_failure_contract_is_safe_and_retryable(caplog):
    caplog.set_level(logging.ERROR, logger="app.main")

    with (
        patch("app.main.generate_docx", return_value=b"report"),
        patch(
            "app.main.upload_bytes",
            side_effect=RuntimeError("access_key=do-not-expose"),
        ),
        pytest.raises(HTTPException) as exc_info,
    ):
        invoke_export()

    assert exc_info.value.status_code == 500
    assert exc_info.value.detail == "report_export_failed"
    assert "do-not-expose" not in caplog.text


def test_release_failure_does_not_mask_success(monkeypatch):
    monkeypatch.setattr(
        report_main._EXPORT_STORE,
        "release",
        lambda key, owner: (_ for _ in ()).throw(ExportStoreError("release secret")),
    )
    with (
        patch("app.main.generate_docx", return_value=b"report"),
        patch("app.main.upload_bytes", return_value="https://reports.test/report.docx"),
    ):
        result = invoke_export(key="release-success")

    assert result["status"] == "success"


def test_release_failure_does_not_mask_primary_exception(monkeypatch):
    monkeypatch.setattr(
        report_main._EXPORT_STORE,
        "release",
        lambda key, owner: (_ for _ in ()).throw(ExportStoreError("release secret")),
    )
    with (
        patch("app.main.generate_docx", side_effect=RuntimeError("primary secret")),
        pytest.raises(HTTPException) as exc_info,
    ):
        invoke_export(key="release-failure")

    assert exc_info.value.status_code == 500
    assert exc_info.value.detail == "report_export_failed"


def test_export_requires_authenticated_service_identity():
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(report_main.export_report(
            report_request(),
            Response(),
            format="docx",
            idempotency_key="key",
            service_key="wrong-key",
            tenant_id=TENANT_ID,
            user_id=USER_ID,
        ))

    assert exc_info.value.status_code == 401


def test_runtime_rejects_multiple_replicas(monkeypatch):
    monkeypatch.setenv("REPORT_SERVICE_REPLICA_COUNT", "2")

    with pytest.raises(RuntimeError, match="exactly one"):
        report_main._validate_runtime_config()


def test_runtime_defaults_to_fail_closed_production_mode(monkeypatch):
    monkeypatch.delenv("REPORT_SERVICE_MODE", raising=False)
    monkeypatch.delenv("LOCAL_REPORTS_BASE_URL", raising=False)

    with pytest.raises(RuntimeError, match="externally reachable HTTPS"):
        report_main._validate_runtime_config()


def test_health_exposes_single_replica_readiness_metadata():
    result = asyncio.run(report_main.health())

    assert result["storage"] == "local-single-replica"
    assert result["configuredReplicas"] == 1
    assert result["replicaLimit"] == 1
    assert result["multiReplicaReady"] is False


def test_status_enforces_persisted_tenant_and_user_owner():
    invoke_export()

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(report_main.report_export_status(
            Response(),
            idempotency_key="stable-key",
            service_key=SERVICE_KEY,
            tenant_id="other-tenant",
            user_id=USER_ID,
        ))

    assert exc_info.value.status_code == 404


def test_stale_owner_cannot_publish_or_commit_success():
    generation_entered = threading.Event()
    allow_generation = threading.Event()
    outcome = []

    def paused_generation(**kwargs):
        generation_entered.set()
        assert allow_generation.wait(timeout=2)
        return b"report"

    def run_first_owner():
        try:
            invoke_export(key="concurrent-key")
        except HTTPException as exc:
            outcome.append(exc)

    with (
        patch("app.main.generate_docx", side_effect=paused_generation),
        patch("app.main.upload_bytes") as upload,
    ):
        first = threading.Thread(target=run_first_owner, name="stale-export-owner")
        first.start()
        assert generation_entered.wait(timeout=2)
        lock_path = report_main._EXPORT_STORE._lock_path("concurrent-key")
        first_owner = report_main._EXPORT_STORE._lock_owner(lock_path)
        report_main._EXPORT_STORE.release("concurrent-key", first_owner)
        second_owner = report_main._EXPORT_STORE.claim("concurrent-key")
        assert second_owner is not None
        allow_generation.set()
        first.join(timeout=2)

    assert not first.is_alive()
    assert outcome and outcome[0].status_code == 409
    assert outcome[0].detail == "report_export_lease_lost"
    upload.assert_not_called()
    assert report_main._EXPORT_STORE.read("concurrent-key")["status"] == "in_progress"
    assert report_main._EXPORT_STORE.refresh("concurrent-key", second_owner)


def test_heartbeat_ownership_loss_propagates(monkeypatch, tmp_path):
    monkeypatch.setattr(idempotency_module, "STALE_AFTER_SECONDS", 0.1)
    store = ExportStore(tmp_path)
    owner = store.claim("key")
    assert owner is not None
    monkeypatch.setattr(store, "refresh", lambda key, lease_owner: False)

    with pytest.raises(LeaseLostError), store.heartbeat("key", owner):
        time.sleep(0.08)


def test_heartbeat_storage_failure_propagates(monkeypatch, tmp_path):
    monkeypatch.setattr(idempotency_module, "STALE_AFTER_SECONDS", 0.1)
    store = ExportStore(tmp_path)
    owner = store.claim("key")
    assert owner is not None

    def fail_refresh(key, lease_owner):
        raise ExportStoreError("heartbeat unavailable")

    monkeypatch.setattr(store, "refresh", fail_refresh)
    with pytest.raises(ExportStoreError, match="heartbeat unavailable"), store.heartbeat("key", owner):
        time.sleep(0.08)


@pytest.mark.parametrize(
    "filename",
    ["../outside.docx", "/tmp/outside.docx", r"C:\\outside.docx", r"C:outside.docx"],
)
def test_local_storage_rejects_absolute_drive_and_traversal_paths(filename):
    with pytest.raises(ValueError, match="invalid report path"):
        upload_report(filename=filename)


@pytest.mark.parametrize("filename", ["../outside.docx", r"C:\\outside.docx"])
def test_local_file_read_rejects_unsafe_paths(filename):
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(report_main.serve_local_file(
            filename,
            export_token="a" * 64,
            tenant_id=TENANT_ID,
            user_id=USER_ID,
            expires=0,
            signature="invalid",
        ))

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "invalid_report_download_capability"


def test_local_storage_write_and_read_remain_under_configured_root():
    key = "download-key"
    export_token = report_main._EXPORT_STORE.token(key)
    url = upload_report(filename="nested/shift report.docx", export_token=export_token)
    stored = local_storage._LOCAL_DIR / "nested" / "shift report.docx"
    report_main._EXPORT_STORE.write(key, {
        "status": "success",
        "idempotencyKey": key,
        "requestHash": "request-hash",
        "ownerTenant": TENANT_ID,
        "ownerUser": USER_ID,
        "reconciliationUrl": "/report/export/status",
        "downloadPath": "nested/shift report.docx",
    })

    assert stored.read_bytes() == b"report"
    parsed = urlparse(url)
    query = {key: values[0] for key, values in parse_qs(parsed.query).items()}
    response = asyncio.run(report_main.serve_local_file(
        unquote(parsed.path.removeprefix("/local-files/")),
        export_token=query["export"],
        tenant_id=query["tenant"],
        user_id=query["user"],
        expires=int(query["expires"]),
        signature=query["signature"],
    ))
    assert response.path == stored.resolve()
    assert response.headers["cache-control"] == "private, no-store"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["x-content-type-options"] == "nosniff"


def test_download_signatures_use_independent_strong_key(monkeypatch):
    url = upload_report()
    parsed = urlparse(url)
    query = {name: values[0] for name, values in parse_qs(parsed.query).items()}
    monkeypatch.setenv("REPORT_SERVICE_API_KEY", "rotated-service-api-key")

    assert local_storage.verify_download_capability(
        "report.docx",
        query["export"],
        query["tenant"],
        query["user"],
        int(query["expires"]),
        query["signature"],
    )


def test_runtime_rejects_short_download_signing_key(monkeypatch):
    monkeypatch.setenv("REPORT_DOWNLOAD_SIGNING_KEY", "too-short")

    with pytest.raises(RuntimeError, match="at least 32 bytes"):
        report_main._validate_runtime_config()


def test_download_capability_must_match_persisted_owner():
    key = "owned-download"
    export_token = report_main._EXPORT_STORE.token(key)
    url = upload_report(export_token=export_token, tenant_id="other-tenant")
    report_main._EXPORT_STORE.write(key, {
        "status": "success",
        "idempotencyKey": key,
        "requestHash": "request-hash",
        "ownerTenant": TENANT_ID,
        "ownerUser": USER_ID,
        "reconciliationUrl": "/report/export/status",
        "downloadPath": "report.docx",
    })
    parsed = urlparse(url)
    query = {name: values[0] for name, values in parse_qs(parsed.query).items()}

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(report_main.serve_local_file(
            "report.docx",
            export_token=query["export"],
            tenant_id=query["tenant"],
            user_id=query["user"],
            expires=int(query["expires"]),
            signature=query["signature"],
        ))

    assert exc_info.value.status_code == 404


def test_corrupt_export_state_fails_closed_without_duplicate_execution():
    key = "corrupt-key"
    record_path = report_main._EXPORT_STORE._record_path(key)
    record_path.parent.mkdir(parents=True)
    record_path.write_text("{not-json", encoding="utf-8")

    with (
        patch("app.main.generate_docx") as generate,
        pytest.raises(HTTPException) as exc_info,
    ):
        invoke_export(key=key)

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "report_export_state_unavailable"
    generate.assert_not_called()


def test_export_store_read_returns_none_only_for_missing_file(monkeypatch, tmp_path):
    store = ExportStore(tmp_path)
    assert store.read("missing") is None

    monkeypatch.setattr(store, "_record_path", lambda key: tmp_path)
    with pytest.raises(ExportStoreError):
        store.read("unreadable")


def test_old_owner_cannot_release_reclaimed_lock(monkeypatch, tmp_path):
    monkeypatch.setattr(idempotency_module, "STALE_AFTER_SECONDS", 1)
    store = ExportStore(tmp_path)
    first_owner = store.claim("key")
    assert first_owner is not None
    os.utime(store._lock_path("key"), (0, 0))
    store.cleanup_orphans()
    second_owner = store.claim("key")
    assert second_owner is not None

    store.release("key", first_owner)

    assert store.is_claimed("key")
    assert store.refresh("key", second_owner)


def test_heartbeat_refresh_prevents_stale_lock_cleanup(monkeypatch, tmp_path):
    monkeypatch.setattr(idempotency_module, "STALE_AFTER_SECONDS", 0.1)
    store = ExportStore(tmp_path)
    owner = store.claim("key")
    assert owner is not None

    with store.heartbeat("key", owner):
        time.sleep(0.2)
        store.cleanup_orphans()

        assert store.is_claimed("key")


def test_cleanup_does_not_reclaim_lease_refreshed_concurrently(monkeypatch, tmp_path):
    monkeypatch.setattr(idempotency_module, "STALE_AFTER_SECONDS", 1)
    store = ExportStore(tmp_path)
    owner = store.claim("key")
    assert owner is not None
    lock_path = store._lock_path("key")
    marker_path = lock_path / owner
    os.utime(marker_path, (0, 0))
    os.utime(lock_path, (0, 0))

    refresh_entered = threading.Event()
    allow_refresh = threading.Event()
    real_utime = os.utime

    def paused_utime(path, *args, **kwargs):
        if threading.current_thread().name == "lease-refresh" and Path(path) == marker_path:
            refresh_entered.set()
            assert allow_refresh.wait(timeout=2)
        return real_utime(path, *args, **kwargs)

    monkeypatch.setattr(idempotency_module.os, "utime", paused_utime)
    refresh = threading.Thread(target=store.refresh, args=("key", owner), name="lease-refresh")
    cleanup = threading.Thread(target=store.cleanup_orphans, name="lease-cleanup")
    refresh.start()
    assert refresh_entered.wait(timeout=2)
    cleanup.start()
    allow_refresh.set()
    refresh.join(timeout=2)
    cleanup.join(timeout=2)

    assert not refresh.is_alive()
    assert not cleanup.is_alive()
    assert store.is_claimed("key")
    assert store.refresh("key", owner)


@pytest.mark.parametrize("shape", ["file", "empty", "multiple"])
def test_malformed_export_lock_raises_instead_of_hanging(tmp_path, shape):
    store = ExportStore(tmp_path)
    lock_path = store._lock_path("key")
    lock_path.parent.mkdir(parents=True)
    if shape == "file":
        lock_path.write_text("not-a-lock-directory", encoding="utf-8")
    else:
        lock_path.mkdir()
        if shape == "multiple":
            (lock_path / "owner-1").touch()
            (lock_path / "owner-2").touch()
    os.utime(lock_path, (0, 0))

    with pytest.raises(ExportStoreError, match="lock is corrupt"):
        store.cleanup_orphans()


def test_non_local_environment_requires_external_download_base(monkeypatch):
    monkeypatch.setenv("REPORT_SERVICE_MODE", "production")
    monkeypatch.delenv("LOCAL_REPORTS_BASE_URL", raising=False)

    with pytest.raises(RuntimeError, match="LOCAL_REPORTS_BASE_URL"):
        upload_report()


@pytest.mark.parametrize(
    "base_url",
    [
        "https://user:password@reports.example.com/local-files",
        "https://reports.example.com/local-files?token=secret",
        "https://reports.example.com/local-files?",
        "https://reports.example.com/local-files#fragment",
        "https://reports.example.com/local-files#",
        "https:///local-files",
        "https://reports.example.com:/local-files",
        "https://reports.example.com:0/local-files",
        "https://reports.example.com:99999/local-files",
        "https://bad_host.example/local-files",
        "https://127.0.0.1/local-files",
        "https://10.0.0.1/local-files",
        "https://169.254.1.1/local-files",
        "https://192.168.1.1/local-files",
        "https://224.0.0.1/local-files",
        "https://240.0.0.1/local-files",
        "https://[::1]/local-files",
        "https://0.0.0.0/local-files",
        "https://[::]/local-files",
        "https://reports/local-files",
        "https://reports.example/local-files",
        "http://reports.example.com/local-files",
    ],
)
def test_production_rejects_unsafe_download_base_urls(monkeypatch, base_url):
    monkeypatch.setenv("REPORT_SERVICE_MODE", "production")
    monkeypatch.setenv("LOCAL_REPORTS_BASE_URL", base_url)
    hostname = urlparse(base_url).hostname
    if hostname:
        monkeypatch.setenv("REPORT_PUBLIC_HOST_ALLOWLIST", hostname)

    with pytest.raises(RuntimeError, match="LOCAL_REPORTS_BASE_URL"):
        upload_report()


def test_production_accepts_external_https_download_base(monkeypatch):
    monkeypatch.setenv("REPORT_SERVICE_MODE", "production")
    monkeypatch.setenv("REPORT_PUBLIC_HOST_ALLOWLIST", "reports.factory-ai.com")
    monkeypatch.setenv(
        "LOCAL_REPORTS_BASE_URL",
        "https://reports.factory-ai.com/local-files",
    )

    url = upload_report()

    assert url.startswith("https://reports.factory-ai.com/local-files/report.docx?")

    monkeypatch.setenv("LOCAL_REPORTS_BASE_URL", "http://127.0.0.1:8083/local-files")
    with pytest.raises(RuntimeError, match="LOCAL_REPORTS_BASE_URL"):
        upload_report()
