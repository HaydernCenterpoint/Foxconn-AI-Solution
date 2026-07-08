import pytest
import subprocess
from fastapi.testclient import TestClient
from app.main import app as web_app
import app.sandbox

client = TestClient(web_app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}

def test_mock_agent_run_reconnect(monkeypatch):
    # Enforce mock mode
    monkeypatch.setenv("MOCK_ANTIGRAVITY", "true")
    
    payload = {
        "sessionId": "session-test",
        "repository": "client-plc",
        "task": "Check reconnect loop",
        "mode": "analyze",
        "allowWrite": False,
        "allowCommands": True
    }
    
    response = client.post("/agent/run", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "reconnect" in data["summary"].lower()
    assert len(data["findings"]) > 0
    assert "ClientPLC/PLCConnector.cs" in data["filesRead"]

def test_invalid_repository():
    payload = {
        "sessionId": "session-test",
        "repository": "unauthorized-repo",
        "task": "Check code",
        "mode": "analyze",
        "allowWrite": False,
        "allowCommands": True
    }
    response = client.post("/agent/run", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is False
    assert "not allowed" in data["summary"]

def test_sandbox_timeout_handling(monkeypatch):
    # Simulate a slow subprocess call by mocking subprocess.Popen to hang on first call
    class MockProcess:
        def __init__(self, *args, **kwargs):
            self.calls = 0
        def communicate(self, timeout=None):
            self.calls += 1
            if self.calls == 1:
                raise subprocess.TimeoutExpired(cmd="mock", timeout=0.1)
            return "mocked stdout", "mocked stderr"
        def kill(self):
            pass

    monkeypatch.setattr(app.sandbox, "find_agy_binary", lambda: "mock_agy")
    monkeypatch.setattr(app.sandbox, "subprocess", type("SubprocessMock", (), {
        "Popen": MockProcess,
        "TimeoutExpired": subprocess.TimeoutExpired,
        "PIPE": subprocess.PIPE
    }))
    monkeypatch.setenv("MOCK_ANTIGRAVITY", "false")

    payload = {
        "sessionId": "session-test",
        "repository": "client-plc",
        "task": "Do long task",
        "mode": "analyze",
        "allowWrite": False,
        "allowCommands": True
    }
    
    response = client.post("/agent/run", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is False
    assert "timeout" in data["summary"].lower()
    assert "EXECUTION_TIMEOUT" in data["warnings"]
