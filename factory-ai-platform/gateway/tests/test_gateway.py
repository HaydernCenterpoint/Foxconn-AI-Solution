import pytest
import jwt
import time
from fastapi.testclient import TestClient
from app.main import app as web_app
from app.agents.router import classify_intent
from app.auth.jwt_handler import verify_scope

client = TestClient(web_app)
# Use a secret that meets the minimum length requirement to suppress warnings
JWT_SECRET = "factory-jwt-secret-key-1234-long-enough-32bytes"
JWT_ALGORITHM = "HS256"

# Monkeypatch the secret key in jwt_handler to match
import app.auth.jwt_handler
app.auth.jwt_handler.JWT_SECRET = JWT_SECRET

def get_test_token(role="Engineer", site_scopes=None, line_scopes=None):
    payload = {
        "sub": "test-engineer",
        "role": role,
        "siteScopes": site_scopes or ["factory-vn-01"],
        "lineScopes": line_scopes or ["LS18"],
        "machineScopes": [],
        "exp": int(time.time()) + 3600
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

# 1. Router Test
def test_intent_router():
    # Production Data Intent
    res = classify_intent("Tính sản lượng của dây chuyền LS18 ca này")
    assert "factory-data-agent" in res.agents
    assert res.intent in ("production_analysis", "composite_report_production")
    
    # Code Engineering Intent
    res = classify_intent("Tìm lỗi reconnect trong Client PLC")
    assert "antigravity-engineering-agent" in res.agents
    assert res.intent == "code_engineering"
    
    # Document Lookup Intent
    res = classify_intent("Tra cứu tài liệu hướng dẫn sửa lỗi E103")
    assert "factory-document-agent" in res.agents
    assert res.intent == "document_lookup"
    
    # Report Generation Intent
    res = classify_intent("Xuất báo cáo downtime tuần này")
    assert "factory-report-agent" in res.agents
    assert res.intent in ("report_generation", "composite_report_production")

# 2. Auth Test
def test_jwt_authentication():
    # Attempt without headers
    response = client.post("/v1/chat/completions", json={"model": "factory-auto", "messages": []})
    assert response.status_code in (401, 403)
    
    # Attempt with invalid signature
    bad_token = jwt.encode({"sub": "malicious"}, "wrong-secret", algorithm=JWT_ALGORITHM)
    response = client.post(
        "/v1/chat/completions", 
        json={"model": "factory-auto", "messages": [{"role": "user", "content": "hello"}]},
        headers={"Authorization": f"Bearer {bad_token}"}
    )
    assert response.status_code == 401
    
    # Attempt with valid signature
    good_token = get_test_token()
    response = client.post(
        "/v1/chat/completions", 
        json={"model": "factory-auto", "messages": [{"role": "user", "content": "sản lượng"}]},
        headers={"Authorization": f"Bearer {good_token}"}
    )
    assert response.status_code == 200

# 3. Tool Permission Test
def test_tool_permission_scopes():
    payload_valid = {
        "role": "Engineer",
        "siteScopes": ["factory-vn-01"],
        "lineScopes": ["LS18"],
        "machineScopes": []
    }
    
    # Allowed line scope
    assert verify_scope(payload_valid, line="LS18") is True
    
    # Denied line scope
    assert verify_scope(payload_valid, line="LS19") is False
    
    # Allowed by Admin role override
    payload_admin = {"role": "Admin", "lineScopes": []}
    assert verify_scope(payload_admin, line="LS19") is True

# 4. OpenAI API Compatibility Test (Non-streaming & Streaming)
def test_openai_api_compatibility():
    token = get_test_token()
    
    # Models Endpoint
    res_models = client.get("/v1/models")
    assert res_models.status_code == 200
    assert "factory-auto" in [m["id"] for m in res_models.json()["data"]]
    
    # Non-streaming Chat Completion
    payload = {
        "model": "factory-auto",
        "messages": [
            {"role": "user", "content": "Cho tôi biết sản lượng LS18 hôm nay"}
        ],
        "stream": False
    }
    res_chat = client.post(
        "/v1/chat/completions",
        json=payload,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res_chat.status_code == 200
    data = res_chat.json()
    assert "choices" in data
    assert len(data["choices"]) > 0
    assert "assistant" == data["choices"][0]["message"]["role"]
    assert "Sản lượng" in data["choices"][0]["message"]["content"]
    
    # Streaming Chat Completion
    payload_stream = {
        "model": "factory-auto",
        "messages": [
            {"role": "user", "content": "Tìm lỗi reconnect trong Client PLC"}
        ],
        "stream": True
    }
    res_stream = client.post(
        "/v1/chat/completions",
        json=payload_stream,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res_stream.status_code == 200
    assert "text/event-stream" in res_stream.headers["content-type"]
    
    # Read first lines of stream
    stream_content = res_stream.text
    assert "data:" in stream_content
    assert "[DONE]" in stream_content
