from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from api import connector_api

ADMIN_KEY = "test-connector-api-key"
ADMIN_HEADERS = {"X-Connector-API-Key": ADMIN_KEY}


def enable_connector_api(monkeypatch):
    monkeypatch.setenv("CONNECTOR_API_KEY", ADMIN_KEY)


class FakeCursor:
    def __init__(self, rows):
        self.rows = list(rows)
        self.executions = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        pass

    def execute(self, query, params):
        self.executions.append((" ".join(query.split()), params))

    def fetchall(self):
        return self.rows

    def fetchone(self):
        return self.rows.pop(0) if self.rows else None


class FakeConnection:
    def __init__(self, rows):
        self.cursor_instance = FakeCursor(rows)
        self.commits = 0
        self.rollbacks = 0
        self.closed = False

    def cursor(self):
        return self.cursor_instance

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def close(self):
        self.closed = True


def test_list_connector_dlq_uses_shared_schema(monkeypatch):
    enable_connector_api(monkeypatch)
    connection = FakeConnection([{
        "id": 7,
        "failed_at": "2026-07-28T12:00:00Z",
        "reason": "write unavailable",
        "record_data": {"entity": "production_orders", "record": {"order_id": "PO-7"}},
        "retry_count": 0,
        "last_retry_at": None,
        "resolved": False,
        "resolved_at": None,
        "resolved_by": None,
    }])
    monkeypatch.setattr(connector_api, "get_db_connection", lambda: connection)

    response = TestClient(connector_api.app).get(
        "/connectors/erp/dlq",
        headers=ADMIN_HEADERS,
    )

    assert response.status_code == 200
    assert response.json()["data"][0]["id"] == 7
    query, params = connection.cursor_instance.executions[0]
    assert "FROM connector_dlq" in query
    assert params == ("erp", False, False, 100)
    assert connection.closed


def test_retry_connector_dlq_replays_record_and_resolves(monkeypatch):
    enable_connector_api(monkeypatch)
    connection = FakeConnection([{
        "id": 9,
        "record_data": {
            "entity": "production_orders",
            "stage": "write",
            "record": {"event_type": "erp_production_order"},
        },
        "resolved": False,
    }])

    class Connector:
        def __init__(self):
            self.retried = []

        def retry_dlq_record(self, record_data):
            self.retried.append(record_data)

    connector = Connector()
    monkeypatch.setattr(connector_api, "get_db_connection", lambda: connection)
    monkeypatch.setattr(
        connector_api.ConnectorRegistry,
        "get_or_create",
        classmethod(lambda _cls, _name: connector),
    )

    response = TestClient(connector_api.app).post(
        "/connectors/erp/dlq/9/retry",
        headers=ADMIN_HEADERS,
    )

    assert response.status_code == 200
    assert response.json() == {
        "status": "resolved",
        "connector": "erp",
        "dlq_id": 9,
    }
    assert len(connector.retried) == 1
    assert connection.commits == 1
    assert any(
        "retry_count = retry_count + 1" in query and "resolved = TRUE" in query
        for query, _ in connection.cursor_instance.executions
    )


def test_resolve_connector_dlq_records_admin(monkeypatch):
    enable_connector_api(monkeypatch)
    connection = FakeConnection([(11,)])
    monkeypatch.setattr(connector_api, "get_db_connection", lambda: connection)

    response = TestClient(connector_api.app).post(
        "/connectors/erp/dlq/11/resolve",
        json={"resolved_by": "ops-user"},
        headers=ADMIN_HEADERS,
    )

    assert response.status_code == 200
    query, params = connection.cursor_instance.executions[0]
    assert "resolved_by = %s" in query
    assert params == ("ops-user", 11, "erp")
    assert connection.commits == 1


def test_connector_api_fails_closed_without_configured_key(monkeypatch):
    monkeypatch.delenv("CONNECTOR_API_KEY", raising=False)

    response = TestClient(connector_api.app).get("/connectors")

    assert response.status_code == 503
    assert response.json()["detail"] == "Connector API authentication is not configured"


def test_connector_api_rejects_invalid_key(monkeypatch):
    enable_connector_api(monkeypatch)

    response = TestClient(connector_api.app).get(
        "/connectors",
        headers={"X-Connector-API-Key": "wrong-key"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid connector API key"


def test_aggregate_telemetry_groups_by_bucket_and_preserves_zero(monkeypatch):
    enable_connector_api(monkeypatch)
    connection = FakeConnection([{
        "time": datetime(2026, 7, 28, tzinfo=timezone.utc),
        "asset_id": "11111111-1111-1111-1111-111111111111",
        "metric": "temperature",
        "value": 0,
    }])
    monkeypatch.setattr(connector_api, "get_db_connection", lambda: connection)

    response = TestClient(connector_api.app).get(
        "/api/v1/telemetry/query?bucket=5m&aggregate=avg",
        headers=ADMIN_HEADERS,
    )

    assert response.status_code == 200
    assert response.json()["data"][0]["value"] == 0.0
    query, params = connection.cursor_instance.executions[0]
    assert "time_bucket('5 minutes', time)" in query
    assert "GROUP BY 1, 2, 3" in query
    assert params == [1000]
    assert connection.closed


def test_hourly_telemetry_uses_direct_continuous_aggregate(monkeypatch):
    enable_connector_api(monkeypatch)
    connection = FakeConnection([])
    monkeypatch.setattr(connector_api, "get_db_connection", lambda: connection)

    response = TestClient(connector_api.app).get(
        "/api/v1/telemetry/query?bucket=1h",
        headers=ADMIN_HEADERS,
    )

    assert response.status_code == 200
    query, _ = connection.cursor_instance.executions[0]
    assert "FROM telemetry_hourly" in query
    assert "bucket AS time" in query
    assert "avg_value AS value" in query
    assert "GROUP BY" not in query


@pytest.mark.parametrize(
    ("bucket", "aggregate", "table", "column"),
    [
        ("1h", "avg", "telemetry_hourly", "avg_value"),
        ("1h", "min", "telemetry_hourly", "min_value"),
        ("1h", "max", "telemetry_hourly", "max_value"),
        ("1d", "avg", "telemetry_daily", "avg_value"),
        ("1d", "min", "telemetry_daily", "min_value"),
        ("1d", "max", "telemetry_daily", "max_value"),
    ],
)
def test_hourly_and_daily_aggregates_use_rollups(
    monkeypatch,
    bucket,
    aggregate,
    table,
    column,
):
    enable_connector_api(monkeypatch)
    connection = FakeConnection([])
    monkeypatch.setattr(connector_api, "get_db_connection", lambda: connection)

    response = TestClient(connector_api.app).get(
        f"/api/v1/telemetry/query?bucket={bucket}&aggregate={aggregate}",
        headers=ADMIN_HEADERS,
    )

    assert response.status_code == 200
    query, params = connection.cursor_instance.executions[0]
    assert f"FROM {table}" in query
    assert f"{column} AS value" in query
    assert "GROUP BY" not in query
    assert params == [1000]


@pytest.mark.parametrize(
    ("bucket", "aggregate", "expression"),
    [
        ("1h", "sum", "SUM(value)"),
        ("1h", "count", "COUNT(value)"),
        ("1d", "sum", "SUM(value)"),
        ("1d", "count", "COUNT(value)"),
    ],
)
def test_sum_and_count_stay_on_raw_rows(
    monkeypatch,
    bucket,
    aggregate,
    expression,
):
    enable_connector_api(monkeypatch)
    connection = FakeConnection([])
    monkeypatch.setattr(connector_api, "get_db_connection", lambda: connection)

    response = TestClient(connector_api.app).get(
        (
            f"/api/v1/telemetry/query?bucket={bucket}&aggregate={aggregate}"
            "&start_time=2026-07-27T00:00:00Z"
            "&end_time=2026-07-28T00:00:00Z"
        ),
        headers=ADMIN_HEADERS,
    )

    assert response.status_code == 200
    query, params = connection.cursor_instance.executions[0]
    assert "FROM telemetry" in query
    assert f"{expression} AS value" in query
    assert "GROUP BY 1, 2, 3" in query
    assert "time >= %s" in query
    assert "time <= %s" in query
    assert params[-1] == 1000


def test_bounded_hourly_average_uses_raw_rows_for_partial_bucket_parity(monkeypatch):
    enable_connector_api(monkeypatch)
    connection = FakeConnection([])
    monkeypatch.setattr(connector_api, "get_db_connection", lambda: connection)

    response = TestClient(connector_api.app).get(
        (
            "/api/v1/telemetry/query?bucket=1h&aggregate=avg"
            "&start_time=2026-07-27T00:30:00Z"
            "&end_time=2026-07-27T02:15:00Z"
        ),
        headers=ADMIN_HEADERS,
    )

    assert response.status_code == 200
    query, _ = connection.cursor_instance.executions[0]
    assert "FROM telemetry" in query
    assert "time_bucket('1 hour', time)" in query
    assert "time >= %s" in query
    assert "time <= %s" in query


def test_telemetry_query_rejects_unknown_bucket_before_database_access(monkeypatch):
    enable_connector_api(monkeypatch)
    monkeypatch.setattr(
        connector_api,
        "get_db_connection",
        lambda: (_ for _ in ()).throw(AssertionError("database should not be called")),
    )

    response = TestClient(connector_api.app).get(
        "/api/v1/telemetry/query?bucket=5m%27%29%3BSELECT%201--&aggregate=avg",
        headers=ADMIN_HEADERS,
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Unsupported telemetry bucket"


def test_telemetry_query_rejects_unknown_aggregation(monkeypatch):
    enable_connector_api(monkeypatch)

    response = TestClient(connector_api.app).get(
        "/api/v1/telemetry/query?bucket=5m&aggregate=median",
        headers=ADMIN_HEADERS,
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Unsupported telemetry aggregation"
