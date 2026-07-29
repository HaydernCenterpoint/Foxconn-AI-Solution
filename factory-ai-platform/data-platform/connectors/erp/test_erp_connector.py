import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from uuid import UUID

import dualwrite
import pytest
from connectors.erp.connector import ERPConfig, ERPConnector, SyncStatus


class ERPHandler(BaseHTTPRequestHandler):
    requests = []

    def do_GET(self):
        type(self).requests.append(self.path)
        payload = json.dumps({
            "records": [{
                "order_id": "PO-100",
                "material_id": "MAT-7",
                "quantity": 12,
                "unit": "pcs",
                "status": "released",
                "planned_start": "2026-07-28T08:00:00Z",
                "planned_end": "2026-07-28T10:00:00Z",
                "machine_id": "11111111-1111-1111-1111-111111111111",
            }],
            "total": 1,
        }).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *_args):
        pass


def test_sync_once_reads_local_erp_http_api(tmp_path, monkeypatch):
    ERPHandler.requests = []
    server = ThreadingHTTPServer(("127.0.0.1", 0), ERPHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        connector = ERPConnector(
            ERPConfig(
                api_url=f"http://127.0.0.1:{server.server_port}/api",
                entity_types=["production_orders"],
                retry_attempts=0,
            ),
            state_file=str(tmp_path / "erp-state.json"),
        )
        events = []
        monkeypatch.setattr(connector, "_write_events", events.extend)

        result = connector.sync_once()
    finally:
        server.shutdown()
        thread.join(timeout=5)
        server.server_close()

    assert result.status == SyncStatus.SUCCESS
    assert result.records_synced == 1
    assert result.errors == 0
    assert ERPHandler.requests == [
        "/api/production_orders?page=1&page_size=1000"
    ]
    assert events[0]["event_type"] == "erp_production_order"
    assert events[0]["payload"]["order_id"] == "PO-100"
    assert events[0]["payload"]["source"] == "erp"


class FakeCursor:
    def __init__(self):
        self.executions = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        pass

    def execute(self, query, params):
        self.executions.append((" ".join(query.split()), params))

    def fetchone(self):
        return ("22222222-2222-2222-2222-222222222222",)


class FakeConnection:
    def __init__(self):
        self.cursor_instance = FakeCursor()
        self.committed = False
        self.closed = False

    def cursor(self):
        return self.cursor_instance

    def commit(self):
        self.committed = True

    def rollback(self):
        pass

    def close(self):
        self.closed = True


def test_write_dlq_prefers_shared_database_schema(tmp_path, monkeypatch):
    connector = ERPConnector(
        ERPConfig(entity_types=[]),
        state_file=str(tmp_path / "erp-state.json"),
    )
    connector._dlq_dir = tmp_path / "dlq"
    connector._dlq_dir.mkdir()
    connection = FakeConnection()
    monkeypatch.setattr(connector, "_get_db_connection", lambda: connection)

    connector._write_dlq(
        "production_orders",
        [{"order_id": "PO-404"}],
        "write unavailable",
        stage="write",
    )

    queries = [query for query, _ in connection.cursor_instance.executions]
    assert any("INSERT INTO connector_definitions" in query for query in queries)
    assert any("INSERT INTO connector_dlq" in query for query in queries)
    assert connection.committed
    assert connection.closed
    assert list(connector._dlq_dir.iterdir()) == []


def test_write_dlq_falls_back_to_local_json(tmp_path, monkeypatch):
    connector = ERPConnector(
        ERPConfig(entity_types=[]),
        state_file=str(tmp_path / "erp-state.json"),
    )
    connector._dlq_dir = tmp_path / "dlq"
    connector._dlq_dir.mkdir()

    def unavailable():
        raise OSError("database offline")

    monkeypatch.setattr(connector, "_get_db_connection", unavailable)

    connector._write_dlq(
        "production_orders",
        [{"order_id": "PO-500"}],
        "write unavailable",
        stage="write",
    )

    files = list(connector._dlq_dir.glob("*.json"))
    assert len(files) == 1
    payload = json.loads(files[0].read_text())
    assert payload["entity"] == "production_orders"
    assert payload["stage"] == "write"
    assert payload["records"] == [{"order_id": "PO-500"}]


def test_retry_dlq_record_replays_previously_transformed_event(tmp_path, monkeypatch):
    connector = ERPConnector(
        ERPConfig(entity_types=[]),
        state_file=str(tmp_path / "erp-state.json"),
    )
    event = {"event_type": "erp_quality", "severity": "info", "payload": {}}
    writes = []
    monkeypatch.setattr(connector, "_write_events", writes.extend)

    connector.retry_dlq_record({
        "entity": "quality_data",
        "stage": "write",
        "record": event,
    })

    assert writes == [event]


class LookupCursor:
    def __init__(self, rows):
        self.rows = list(rows)
        self.executions = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        pass

    def execute(self, query, params):
        self.executions.append((" ".join(query.split()), params))

    def fetchone(self):
        return self.rows.pop(0) if self.rows else None


class LookupConnection:
    def __init__(self, rows):
        self.cursor_instance = LookupCursor(rows)
        self.closed = False

    def cursor(self):
        return self.cursor_instance

    def close(self):
        self.closed = True


def test_resolve_external_asset_uses_active_erp_mapping(tmp_path, monkeypatch):
    canonical_id = "66666666-6666-6666-6666-666666666666"
    connection = LookupConnection([(canonical_id,)])
    connector = ERPConnector(
        ERPConfig(entity_types=[]),
        state_file=str(tmp_path / "erp-state.json"),
    )
    monkeypatch.setattr(connector, "_get_db_connection", lambda: connection)

    result = connector._resolve_asset_id("LINE-6")

    assert result == UUID(canonical_id)
    query, params = connection.cursor_instance.executions[0]
    assert "FROM asset_mapping_rules" in query
    assert "JOIN assets" in query
    assert params == ("LINE-6",)
    assert connection.closed


def test_canonical_asset_id_must_exist(tmp_path, monkeypatch):
    canonical_id = "77777777-7777-7777-7777-777777777777"
    connection = LookupConnection([None, None])
    connector = ERPConnector(
        ERPConfig(entity_types=[]),
        state_file=str(tmp_path / "erp-state.json"),
    )
    monkeypatch.setattr(connector, "_get_db_connection", lambda: connection)

    result = connector._resolve_asset_id(canonical_id)

    assert result is None
    assert "SELECT id FROM assets" in connection.cursor_instance.executions[0][0]
    assert "FROM asset_mapping_rules" in connection.cursor_instance.executions[1][0]


def test_write_events_flushes_and_rejects_false_result(tmp_path, monkeypatch):
    canonical_id = UUID("88888888-8888-8888-8888-888888888888")
    connector = ERPConnector(
        ERPConfig(entity_types=[]),
        state_file=str(tmp_path / "erp-state.json"),
    )
    monkeypatch.setattr(connector, "_resolve_asset_id", lambda _external_id: canonical_id)
    writes = []
    monkeypatch.setattr(
        dualwrite,
        "write_event",
        lambda **kwargs: writes.append(kwargs) or False,
    )
    event = {
        "asset_id": "MACHINE-8",
        "event_type": "erp_quality",
        "severity": "info",
        "payload": {"inspection_id": "I-8"},
    }

    with pytest.raises(RuntimeError, match="Dual-write rejected ERP event"):
        connector._write_events([event])

    assert writes[0]["asset_id"] == canonical_id
    assert writes[0]["flush"] is True


def test_unresolved_asset_is_written_to_connector_dlq(tmp_path, monkeypatch):
    connector = ERPConnector(
        ERPConfig(entity_types=["production_orders"]),
        state_file=str(tmp_path / "erp-state.json"),
    )
    monkeypatch.setattr(
        connector.client,
        "fetch_all",
        lambda _entity, _since: [{
            "order_id": "PO-UNMAPPED",
            "machine_id": "UNKNOWN-MACHINE",
        }],
    )
    monkeypatch.setattr(connector, "_resolve_asset_id", lambda _external_id: None)
    failures = []
    monkeypatch.setattr(
        connector,
        "_write_dlq",
        lambda entity, records, error, stage="write": failures.append(
            (entity, records, error, stage)
        ),
    )

    synced, errors = connector._process_entity("production_orders")

    assert synced == 0
    assert errors == 1
    assert failures[0][0] == "production_orders"
    assert failures[0][3] == "write"
    assert failures[0][1][0]["asset_id"] == "UNKNOWN-MACHINE"
    assert "Unresolved ERP asset mapping" in failures[0][2]
