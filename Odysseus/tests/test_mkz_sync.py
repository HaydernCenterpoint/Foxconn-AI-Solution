"""Tests for the read-only MKZ REST export script."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "sync_mkz_to_odysseus.py"


def _load_sync_module():
    spec = importlib.util.spec_from_file_location("mkz_sync_under_test", SCRIPT_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_builds_and_writes_concise_markdown_without_raw_plc_telemetry(tmp_path):
    sync = _load_sync_module()
    snapshot = {
        "dashboard": {
            "totalMachines": 8,
            "running": 6,
            "idle": 1,
            "error": 1,
            "offline": 0,
            "totalLines": 2,
            "totalProduction": 1250,
            "activeAlarms": 1,
            "hourlyData": [{"prodHour": 8, "totalQty": 400}],
        },
        "lines": [
            {
                "id": "line-1",
                "name": "Assembly A",
                "description": "Main assembly line",
                "machineCount": 4,
                "lastPlcData": {"temperature": 99, "secret": "do-not-export"},
            }
        ],
        "active_alarms": [
            {
                "id": 42,
                "severity": "HIGH",
                "machineName": "Press 1",
                "message": "Overheating",
                "status": "ACTIVE",
                "createdAt": "2026-07-15T08:00:00Z",
                "telemetry": {"pressure": 999},
            }
        ],
        "reports": {
            "today": {
                "summary": {
                    "totalProduction": 1250,
                    "totalGood": 1200,
                    "totalScrap": 50,
                    "yieldRate": 96.0,
                    "scrapRate": 4.0,
                    "avgSpeed": 220.5,
                    "machinesCount": 6,
                },
                "chartData": [{"hour": "08:00", "output": 400}],
            }
        },
    }

    documents = sync.build_rag_documents(snapshot, generated_at="2026-07-15T12:00:00Z")
    written_paths = sync.write_rag_documents(documents, output_dir=tmp_path)

    assert {path.name for path in written_paths} == {
        "factory_dashboard.md",
        "production_lines.md",
        "active_alarms.md",
        "report_today.md",
        "report_last_7_days.md",
        "report_month.md",
    }
    assert not any("shift" in path.name for path in written_paths)
    rendered = "\n".join(path.read_text(encoding="utf-8") for path in written_paths)
    assert "Assembly A" in rendered
    assert "Overheating" in rendered
    assert "1,250" in rendered
    assert "do-not-export" not in rendered
    assert "temperature" not in rendered
    assert "pressure" not in rendered
    assert "Morning shift" not in rendered
    assert "Night shift" not in rendered


def test_rest_client_sends_get_request_and_optional_bearer_header_with_mock_response():
    sync = _load_sync_module()
    requests = []

    class Response:
        status = 200

        def read(self):
            return b'{"totalMachines": 8}'

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    def opener(request, timeout):
        requests.append((request, timeout))
        return Response()

    client = sync.MKZRestClient(
        base_url="http://127.0.0.1:5165/",
        token="test-token",
        timeout=7,
        opener=opener,
    )

    assert client.fetch_dashboard() == {"totalMachines": 8}
    request, timeout = requests[0]
    assert request.get_method() == "GET"
    assert request.full_url == "http://127.0.0.1:5165/api/dashboard/summary"
    assert request.get_header("Authorization") == "Bearer test-token"
    assert request.get_header("Accept") == "application/json"
    assert timeout == 7

    anonymous_client = sync.MKZRestClient(
        base_url="http://mkz.example",
        token="",
        opener=opener,
    )
    anonymous_client.fetch_dashboard()
    assert requests[1][0].get_header("Authorization") is None


def test_rest_client_refuses_bearer_token_over_remote_plaintext_http():
    sync = _load_sync_module()

    with pytest.raises(ValueError) as excinfo:
        sync.MKZRestClient(base_url="http://mkz.example:5165", token="test-token")

    message = str(excinfo.value)
    assert "test-token" not in message
    assert "mkz.example" not in message


def test_rest_client_wraps_malformed_utf8_without_leaking_connection_secrets():
    sync = _load_sync_module()

    class Response:
        status = 200

        def read(self):
            return b"\xff"

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    client = sync.MKZRestClient(
        base_url="http://127.0.0.1:5165",
        token="test-token",
        opener=lambda _request, timeout: Response(),
    )

    with pytest.raises(sync.MKZRestError) as excinfo:
        client.fetch_dashboard()

    message = str(excinfo.value)
    assert "invalid UTF-8" in message
    assert "test-token" not in message
    assert "127.0.0.1" not in message


def test_main_exits_nonzero_when_available_reindex_reports_failure(monkeypatch):
    sync = _load_sync_module()
    monkeypatch.setattr(sync, "export_rag_summaries", lambda: [Path("factory_dashboard.md")])
    monkeypatch.setattr(
        sync,
        "reindex_rag_exports",
        lambda: {"success": False, "message": "Chroma write failed"},
    )
    monkeypatch.setattr(sys, "argv", ["sync_mkz_to_odysseus.py"])

    with pytest.raises(SystemExit) as excinfo:
        sync.main()

    assert excinfo.value.code == 1


def test_main_exits_nonzero_when_reindex_reports_partial_failure(monkeypatch):
    sync = _load_sync_module()
    monkeypatch.setattr(sync, "export_rag_summaries", lambda: [Path("factory_dashboard.md")])
    monkeypatch.setattr(
        sync,
        "reindex_rag_exports",
        lambda: {"success": True, "failed_count": 1, "message": "One document failed"},
    )
    monkeypatch.setattr(sys, "argv", ["sync_mkz_to_odysseus.py"])

    with pytest.raises(SystemExit) as excinfo:
        sync.main()

    assert excinfo.value.code == 1


def test_main_exits_nonzero_when_chroma_rag_is_unavailable(monkeypatch):
    sync = _load_sync_module()
    monkeypatch.setattr(sync, "export_rag_summaries", lambda: [Path("factory_dashboard.md")])
    monkeypatch.setattr(sync, "reindex_rag_exports", lambda: None)
    monkeypatch.setattr(sys, "argv", ["sync_mkz_to_odysseus.py"])

    with pytest.raises(SystemExit) as excinfo:
        sync.main()

    assert excinfo.value.code == 1


def test_main_export_only_succeeds_when_chroma_rag_is_unavailable(monkeypatch):
    sync = _load_sync_module()
    monkeypatch.setattr(sync, "export_rag_summaries", lambda: [Path("factory_dashboard.md")])

    def unavailable_rag():
        raise AssertionError("export-only mode must not try to initialize Chroma RAG")

    monkeypatch.setattr(sync, "reindex_rag_exports", unavailable_rag)
    monkeypatch.setattr(sys, "argv", ["sync_mkz_to_odysseus.py", "--export-only"])

    sync.main()


def test_write_rag_documents_replaces_all_top_level_markdown_in_managed_directory(tmp_path):
    sync = _load_sync_module()
    stale_morning = tmp_path / "report_shift_morning.md"
    stale_night = tmp_path / "report_shift_night.md"
    stale_custom = tmp_path / "report_shift_custom.md"
    stale_uppercase = tmp_path / "legacy.MD"
    non_markdown = tmp_path / "keep.txt"
    nested_directory = tmp_path / "previous_exports"
    nested_directory.mkdir()
    nested_markdown = nested_directory / "legacy.md"
    stale_morning.write_text("obsolete morning report", encoding="utf-8")
    stale_night.write_text("obsolete night report", encoding="utf-8")
    stale_custom.write_text("stale custom report", encoding="utf-8")
    stale_uppercase.write_text("stale uppercase extension", encoding="utf-8")
    non_markdown.write_text("keep this non-Markdown file", encoding="utf-8")
    nested_markdown.write_text("do not traverse nested exports", encoding="utf-8")

    sync.write_rag_documents({"factory_dashboard.md": "# Current summary"}, output_dir=tmp_path)

    assert not stale_morning.exists()
    assert not stale_night.exists()
    assert not stale_custom.exists()
    assert not stale_uppercase.exists()
    assert (tmp_path / "factory_dashboard.md").read_text(encoding="utf-8") == "# Current summary\n"
    assert non_markdown.read_text(encoding="utf-8") == "keep this non-Markdown file"
    assert nested_markdown.read_text(encoding="utf-8") == "do not traverse nested exports"


def test_write_rag_documents_rejects_paths_outside_its_output_directory(tmp_path):
    sync = _load_sync_module()
    outside_target = tmp_path.parent / "outside.md"

    for filename in ("../outside.md", "nested/report.md"):
        with pytest.raises(ValueError):
            sync.write_rag_documents({filename: "# Must not be written"}, output_dir=tmp_path)

    assert not outside_target.exists()
    assert not (tmp_path / "nested").exists()


def test_snapshot_fetches_only_summary_endpoints_for_each_required_report_period():
    sync = _load_sync_module()
    requests = []

    class Response:
        status = 200

        def read(self):
            return b'{}'

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    def opener(request, timeout):
        requests.append(request)
        return Response()

    snapshot = sync.MKZRestClient(base_url="http://mkz.example", opener=opener).fetch_snapshot()
    parsed = [(urlsplit(request.full_url).path, parse_qs(urlsplit(request.full_url).query)) for request in requests]

    assert set(snapshot["reports"]) == {"today", "last_7_days", "month"}
    assert ("/api/dashboard/summary", {}) in parsed
    assert ("/api/production-lines", {}) in parsed
    assert ("/api/alarms", {"status": ["ACTIVE"], "limit": ["100"]}) in parsed
    report_queries = [query for path, query in parsed if path == "/api/reports/query"]
    assert {query["timeRange"][0] for query in report_queries} == {
        "today",
        "last_7_days",
        "month",
    }
    assert all("shift" not in query["timeRange"][0] for query in report_queries)
    assert all(query["lineId"] == ["all"] and query["machineId"] == ["all"] for query in report_queries)
    assert all("telemetry" not in path for path, _query in parsed)
