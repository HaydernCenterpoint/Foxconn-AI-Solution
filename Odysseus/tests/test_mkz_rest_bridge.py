"""Regression coverage for the read-only FII REST and MCP bridge."""

import ast
import importlib
import json
import re
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


class _TestAuthManager:
    is_configured = True

    @staticmethod
    def is_admin(username):
        return username == "admin"


def _app_with_mkz_routes(
    mkz_routes,
    username=None,
    *,
    api_token=False,
    api_token_owner=None,
    api_token_scopes=None,
):
    """Mount the bridge with the same request-state contract as app auth."""
    app = FastAPI()
    app.state.auth_manager = _TestAuthManager()

    @app.middleware("http")
    async def set_current_user(request, call_next):
        request.state.current_user = username
        request.state.api_token = api_token
        request.state.api_token_owner = api_token_owner
        request.state.api_token_scopes = api_token_scopes or []
        return await call_next(request)

    app.include_router(mkz_routes.setup_mkz_routes())
    return app


def test_mkz_proxy_is_not_globally_auth_exempt():
    """Backend credentials must never be forwarded through an anonymous proxy."""
    project_root = Path(__file__).resolve().parents[1]
    tree = ast.parse((project_root / "app.py").read_text(encoding="utf-8"))

    def assigned_value(name):
        assignments = [
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.Assign)
            and any(
                isinstance(target, ast.Name) and target.id == name
                for target in node.targets
            )
        ]
        assert len(assignments) == 1
        return assignments[0].value

    exact = ast.literal_eval(assigned_value("AUTH_EXEMPT_EXACT"))
    prefixes = ast.literal_eval(assigned_value("AUTH_EXEMPT_PREFIXES"))
    pattern_node = assigned_value("AUTH_EXEMPT_PATTERNS")
    patterns = [
        call.args[0].value
        for call in ast.walk(pattern_node)
        if isinstance(call, ast.Call)
        and isinstance(call.func, ast.Attribute)
        and call.func.attr == "compile"
        and call.args
        and isinstance(call.args[0], ast.Constant)
        and isinstance(call.args[0].value, str)
    ]

    protected_paths = ("/api/mkz/dashboard", "/api/mkz/health")
    assert all(path not in exact for path in protected_paths)
    assert all(
        not path.startswith(prefix)
        for path in protected_paths
        for prefix in prefixes
    )
    assert all(
        not re.compile(pattern).match(path)
        for path in protected_paths
        for pattern in patterns
    )


@pytest.mark.asyncio
async def test_mcp_tools_publish_runtime_read_only_annotations():
    """Plan mode must learn read-only status from MCP runtime metadata."""
    import mcp_servers.plc_mcp_server as plc_mcp_server

    plc_mcp_server = importlib.reload(plc_mcp_server)
    tools = await plc_mcp_server.list_tools()

    assert tools
    assert all(tool.annotations is not None for tool in tools)
    assert all(tool.annotations.readOnlyHint is True for tool in tools)
    assert all(tool.annotations.destructiveHint is False for tool in tools)


@pytest.mark.asyncio
async def test_mcp_tool_contract_exposes_only_supported_read_operations():
    """The published MCP schema must match the supported backend contract."""
    import mcp_servers.plc_mcp_server as plc_mcp_server

    plc_mcp_server = importlib.reload(plc_mcp_server)
    tools = {tool.name: tool for tool in await plc_mcp_server.list_tools()}

    assert set(tools) == {
        "mkz_get_machines",
        "mkz_get_production_lines",
        "mkz_get_alarms",
        "mkz_get_dashboard_summary",
        "mkz_get_production_report",
        "mkz_get_telemetry",
        "mkz_get_system_info",
    }
    assert tools["mkz_get_machines"].inputSchema["properties"] == {
        "limit": {
            "type": "integer",
            "default": 50,
            "minimum": 1,
            "maximum": 200,
        }
    }
    assert tools["mkz_get_production_lines"].inputSchema["properties"] == {}
    assert tools["mkz_get_production_report"].inputSchema["properties"]["time_range"][
        "enum"
    ] == ["today", "last_7_days", "month"]
    for selector_name in ("line_id", "machine_id"):
        selector_schema = tools["mkz_get_production_report"].inputSchema["properties"][
            selector_name
        ]
        assert selector_schema["default"] == "all"
        assert selector_schema["anyOf"][0] == {"const": "all"}
        assert selector_schema["anyOf"][1]["format"] == "uuid"
        assert "pattern" in selector_schema["anyOf"][1]
    assert set(tools["mkz_get_telemetry"].inputSchema["properties"]) == {"mode", "limit"}

    for tool_name in ("mkz_get_machines", "mkz_get_alarms", "mkz_get_telemetry"):
        limit_schema = tools[tool_name].inputSchema["properties"]["limit"]
        assert (limit_schema["minimum"], limit_schema["maximum"]) == (1, 200)


@pytest.mark.asyncio
async def test_mcp_rejects_retired_arguments_and_invalid_contract_values(monkeypatch):
    """Bad MCP calls fail safely rather than pretending unsupported filters work."""
    import mcp_servers.plc_mcp_server as plc_mcp_server

    plc_mcp_server = importlib.reload(plc_mcp_server)
    backend_calls = []

    async def fake_backend_get(path, params=None):
        backend_calls.append((path, params))
        return [{"row": number} for number in range(300)] if path == "/api/machines" else []

    monkeypatch.setattr(plc_mcp_server, "backend_get", fake_backend_get)

    result = await plc_mcp_server.call_tool("mkz_get_machines", {"status": "OFFLINE"})
    assert result[0].text == "Error: Unsupported argument(s): status"

    result = await plc_mcp_server.call_tool(
        "mkz_get_production_lines", {"include_machines": True}
    )
    assert result[0].text == "Error: Unsupported argument(s): include_machines"

    result = await plc_mcp_server.call_tool(
        "mkz_get_production_report", {"time_range": "shift_morning"}
    )
    assert result[0].text == "Error: Invalid time_range. Allowed values: today, last_7_days, month."

    result = await plc_mcp_server.call_tool("mkz_get_telemetry", {"mode": "history"})
    assert result[0].text == "Error: Invalid mode. Allowed values: live, log."

    result = await plc_mcp_server.call_tool(
        "mkz_get_production_report", {"line_id": ""}
    )
    assert result[0].text == "Error: Invalid line_id. Use a canonical UUID or 'all'."

    result = await plc_mcp_server.call_tool(
        "mkz_get_production_report", {"machine_id": "not-a-uuid"}
    )
    assert result[0].text == "Error: Invalid machine_id. Use a canonical UUID or 'all'."
    assert backend_calls == []


@pytest.mark.asyncio
async def test_mcp_clamps_limits_and_handles_malformed_limit_values(monkeypatch):
    """Tool calls must never pass unsafe or unparsable limits downstream."""
    import mcp_servers.plc_mcp_server as plc_mcp_server

    plc_mcp_server = importlib.reload(plc_mcp_server)
    backend_calls = []

    async def fake_backend_get(path, params=None):
        backend_calls.append((path, params))
        return [{"row": number} for number in range(300)] if path == "/api/machines" else []

    monkeypatch.setattr(plc_mcp_server, "backend_get", fake_backend_get)

    machine_result = await plc_mcp_server.call_tool("mkz_get_machines", {"limit": 999})
    assert len(json.loads(machine_result[0].text)) == 200

    await plc_mcp_server.call_tool("mkz_get_alarms", {"limit": "not-an-integer"})
    await plc_mcp_server.call_tool("mkz_get_telemetry", {"mode": "log", "limit": 0})
    malformed_arguments = await plc_mcp_server.call_tool("mkz_get_machines", None)
    assert malformed_arguments[0].text == "Error: Tool arguments must be an object."

    assert backend_calls == [
        ("/api/machines", None),
        ("/api/alarms", {"status": "", "severity": "", "limit": 50}),
        ("/api/telemetry/log", {"count": 1}),
    ]


@pytest.mark.asyncio
async def test_mcp_does_not_return_raw_backend_exception_text(monkeypatch):
    """A backend failure must not expose internal exception content to an AI caller."""
    import mcp_servers.plc_mcp_server as plc_mcp_server

    plc_mcp_server = importlib.reload(plc_mcp_server)

    async def failing_backend_get(path, params=None):
        raise RuntimeError("secret upstream diagnostic")

    monkeypatch.setattr(plc_mcp_server, "backend_get", failing_backend_get)
    result = await plc_mcp_server.call_tool("mkz_get_dashboard_summary", {})

    assert result[0].text == "Error: Unable to read FII backend data."
    assert "secret" not in result[0].text


@pytest.mark.asyncio
async def test_mcp_report_selector_defaults_and_uuid_are_forwarded_exactly(monkeypatch):
    """MCP must never widen an empty or malformed report selector to `all`."""
    import mcp_servers.plc_mcp_server as plc_mcp_server

    plc_mcp_server = importlib.reload(plc_mcp_server)
    backend_calls = []

    async def fake_backend_get(path, params=None):
        backend_calls.append((path, params))
        return {"ok": True}

    monkeypatch.setattr(plc_mcp_server, "backend_get", fake_backend_get)
    canonical_uuid = "123e4567-e89b-12d3-a456-426614174000"

    result = await plc_mcp_server.call_tool("mkz_get_production_report", {})
    assert json.loads(result[0].text) == {"ok": True}

    result = await plc_mcp_server.call_tool(
        "mkz_get_production_report",
        {"line_id": canonical_uuid, "machine_id": "all"},
    )
    assert json.loads(result[0].text) == {"ok": True}

    assert backend_calls == [
        (
            "/api/reports/query",
            {"timeRange": "today", "lineId": "all", "machineId": "all"},
        ),
        (
            "/api/reports/query",
            {"timeRange": "today", "lineId": canonical_uuid, "machineId": "all"},
        ),
    ]


def test_rest_routes_require_an_administrator(monkeypatch):
    """The router itself is fail-closed even when app middleware is bypassed."""
    monkeypatch.setenv("AUTH_ENABLED", "true")
    import routes.mkz_routes as mkz_routes

    mkz_routes = importlib.reload(mkz_routes)
    backend_calls = []

    async def fake_backend_get(path, params=None):
        backend_calls.append((path, params))
        return {"ok": True}

    monkeypatch.setattr(mkz_routes, "backend_get", fake_backend_get)

    non_admin_client = TestClient(_app_with_mkz_routes(mkz_routes, "viewer"))
    assert non_admin_client.get("/api/mkz/dashboard").status_code == 403
    assert backend_calls == []

    admin_client = TestClient(_app_with_mkz_routes(mkz_routes, "admin"))
    assert admin_client.get("/api/mkz/dashboard").status_code == 200
    assert backend_calls == [("/api/dashboard/summary", None)]

    bearer_client = TestClient(
        _app_with_mkz_routes(
            mkz_routes,
            "api",
            api_token=True,
            api_token_owner="admin",
            api_token_scopes=["factory:read"],
        )
    )
    assert bearer_client.get("/api/mkz/dashboard").status_code == 403
    assert backend_calls == [("/api/dashboard/summary", None)]


def test_rest_routes_reject_retired_query_parameters_before_backend_calls(monkeypatch):
    """Every bridge endpoint has an explicit query contract in trusted dev mode."""
    monkeypatch.setenv("AUTH_ENABLED", "false")
    import routes.mkz_routes as mkz_routes

    mkz_routes = importlib.reload(mkz_routes)
    backend_calls = []

    async def fake_backend_get(path, params=None):
        backend_calls.append((path, params))
        return []

    monkeypatch.setattr(mkz_routes, "backend_get", fake_backend_get)
    app = FastAPI()
    app.include_router(mkz_routes.setup_mkz_routes())
    client = TestClient(app)

    for endpoint in (
        "/api/mkz/machines?status=OFFLINE",
        "/api/mkz/production-lines?include_machines=true",
        "/api/mkz/alarms?line_id=retired",
        "/api/mkz/dashboard?include_history=true",
        "/api/mkz/reports/production?hours=24",
        "/api/mkz/telemetry?machine_id=retired",
        "/api/mkz/system-info?verbose=true",
        "/api/mkz/health?verbose=true",
    ):
        assert client.get(endpoint).status_code == 422
    assert backend_calls == []


def test_rest_routes_accept_only_documented_queries_and_strict_report_selectors(monkeypatch):
    """AUTH_ENABLED=false remains an explicit local-dev exception to the admin gate."""
    monkeypatch.setenv("AUTH_ENABLED", "false")
    import routes.mkz_routes as mkz_routes

    mkz_routes = importlib.reload(mkz_routes)
    backend_calls = []

    async def fake_backend_get(path, params=None):
        backend_calls.append((path, params))
        return {"ok": True} if path == "/api/dashboard/summary" else []

    monkeypatch.setattr(mkz_routes, "backend_get", fake_backend_get)
    app = FastAPI()
    app.include_router(mkz_routes.setup_mkz_routes())
    client = TestClient(app)
    canonical_uuid = "123e4567-e89b-12d3-a456-426614174000"

    for endpoint in (
        "/api/mkz/machines?limit=1",
        "/api/mkz/production-lines",
        "/api/mkz/alarms?status=ACTIVE&severity=HIGH&limit=3",
        "/api/mkz/dashboard",
        "/api/mkz/reports/production",
        f"/api/mkz/reports/production?line_id={canonical_uuid}&machine_id=all",
        "/api/mkz/telemetry?mode=log&limit=7",
        "/api/mkz/system-info",
        "/api/mkz/health",
    ):
        assert client.get(endpoint).status_code == 200

    for endpoint in (
        "/api/mkz/reports/production?line_id=",
        "/api/mkz/reports/production?line_id=ALL",
        "/api/mkz/reports/production?machine_id=not-a-uuid",
        "/api/mkz/reports/production?line_id=not-a-uuid&line_id=all",
        "/api/mkz/reports/production?line_id=all&line_id=all",
        "/api/mkz/reports/production?machine_id=all&machine_id=all",
    ):
        response = client.get(endpoint)
        assert response.status_code == 422
        assert (
            "canonical UUID or 'all'" in response.json()["detail"]
            or "Duplicate query parameter(s)" in response.json()["detail"]
        )

    assert backend_calls == [
        ("/api/machines", None),
        ("/api/production-lines", None),
        ("/api/alarms", {"status": "ACTIVE", "severity": "HIGH", "limit": 3}),
        ("/api/dashboard/summary", None),
        ("/api/reports/query", {"timeRange": "today", "lineId": "all", "machineId": "all"}),
        (
            "/api/reports/query",
            {"timeRange": "today", "lineId": canonical_uuid, "machineId": "all"},
        ),
        ("/api/telemetry/log", {"count": 7}),
        ("/api/dashboard/summary", None),
    ]


def test_rest_health_returns_503_when_the_backend_is_unavailable(monkeypatch):
    """Monitoring must not mistake a failed backend dependency for healthy state."""
    monkeypatch.setenv("AUTH_ENABLED", "false")
    from fastapi import HTTPException
    import routes.mkz_routes as mkz_routes

    mkz_routes = importlib.reload(mkz_routes)

    async def unavailable_backend_get(path, params=None):
        raise HTTPException(status_code=502, detail="upstream response must stay private")

    monkeypatch.setattr(mkz_routes, "backend_get", unavailable_backend_get)
    app = FastAPI()
    app.include_router(mkz_routes.setup_mkz_routes())

    response = TestClient(app).get("/api/mkz/health")

    assert response.status_code == 503
    assert response.json() == {"detail": "FII backend is unavailable"}


def test_read_only_bridge_defaults_to_local_backend_and_has_no_audit_surface(monkeypatch):
    """The REST and MCP bridge omit sensitive audit data until policy exists."""
    monkeypatch.delenv("MKZ_BACKEND_URL", raising=False)
    monkeypatch.setenv("BACKEND_URL", "https://ignored.example")

    import mcp_servers.plc_mcp_server as plc_mcp_server
    import routes.mkz_routes as mkz_routes

    plc_mcp_server = importlib.reload(plc_mcp_server)
    mkz_routes = importlib.reload(mkz_routes)

    assert mkz_routes.BACKEND_URL == "http://127.0.0.1:5165"
    assert plc_mcp_server.BACKEND_URL == "http://127.0.0.1:5165"

    router = mkz_routes.setup_mkz_routes()
    assert not any(route.path == "/api/mkz/audit-logs" for route in router.routes)


@pytest.mark.parametrize(
    "backend_url",
    [
        "http://127.0.0.1:5165",
        "http://localhost:5165",
        "http://[::1]:5165",
        "https://factory.example:5165",
    ],
)
def test_bridge_allows_backend_token_over_loopback_http_or_https(monkeypatch, backend_url):
    """A backend bearer token is safe only over TLS or a direct loopback link."""
    monkeypatch.setenv("MKZ_BACKEND_URL", backend_url)
    monkeypatch.setenv("MKZ_BACKEND_TOKEN", "bridge-test-token")

    import mcp_servers.plc_mcp_server as plc_mcp_server
    import routes.mkz_routes as mkz_routes

    plc_mcp_server = importlib.reload(plc_mcp_server)
    mkz_routes = importlib.reload(mkz_routes)

    for bridge in (plc_mcp_server, mkz_routes):
        assert bridge._headers() == {"Authorization": "Bearer bridge-test-token"}


def test_bridge_rejects_backend_token_over_remote_plaintext_http(monkeypatch):
    """Do not expose a backend credential to a remote plaintext HTTP endpoint."""
    monkeypatch.setenv("MKZ_BACKEND_URL", "http://factory.example:5165")
    monkeypatch.setenv("MKZ_BACKEND_TOKEN", "bridge-test-token")

    import mcp_servers.plc_mcp_server as plc_mcp_server
    import routes.mkz_routes as mkz_routes

    plc_mcp_server = importlib.reload(plc_mcp_server)
    mkz_routes = importlib.reload(mkz_routes)

    for bridge in (plc_mcp_server, mkz_routes):
        with pytest.raises(ValueError) as excinfo:
            bridge._headers()
        message = str(excinfo.value)
        assert "bridge-test-token" not in message
        assert "factory.example" not in message


def test_mcp_metadata_and_integration_templates_keep_ai_and_backend_credentials_separate():
    """Factory data access is REST-only and must not be confused with an LLM key."""
    project_root = Path(__file__).resolve().parents[1]
    mcp_config = json.loads(
        (project_root / "mcp_servers" / "plc_mcp_config.json").read_text(encoding="utf-8")
    )
    expected_tools = {
        "mkz_get_machines",
        "mkz_get_production_lines",
        "mkz_get_alarms",
        "mkz_get_dashboard_summary",
        "mkz_get_production_report",
        "mkz_get_telemetry",
        "mkz_get_system_info",
    }

    assert mcp_config["env"] == {"MKZ_BACKEND_URL": "http://127.0.0.1:5165"}
    assert "MKZ_BACKEND_TOKEN" not in mcp_config["env"]
    assert {tool["name"] for tool in mcp_config["tools"]} == expected_tools
    assert all(tool["read_only"] is True for tool in mcp_config["tools"])
    assert "audit" not in json.dumps(mcp_config).lower()
    assert "MKZ_DB_" not in json.dumps(mcp_config)

    integration_env = (project_root / ".env.integration.example").read_text(encoding="utf-8")
    integration_guide = (project_root / "INTEGRATION.md").read_text(encoding="utf-8")
    for text in (integration_env, integration_guide):
        assert "OPENAI_API_KEY" in text
        assert "MKZ_BACKEND_TOKEN" in text
        assert "http://127.0.0.1:5165" in text
        assert "MKZ_DB_" not in text
        assert "12345678" not in text

    assert "Only the listed read-only FII bridge endpoints" in integration_guide
    assert "HTTP bridge is admin-only" in integration_guide
    assert "signed-in administrator session" in integration_guide
    assert "Bearer/API tokens are deliberately not accepted" in integration_guide
    assert "separately mounted `/api/mkz/gateway/...` namespace" in integration_guide
    assert "non-loopback" in integration_guide
    assert "requires HTTPS" in integration_guide
    assert "inherits it from the process environment" in integration_guide
    assert "HF_HUB_DISABLE_XET=1" in integration_guide
    assert "intentionally does **not** expose FII audit logs" in integration_guide
    assert "least-privilege audit-read policy" in integration_guide
