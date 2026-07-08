from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

def test_chat_stream_and_status_endpoints(tmp_path, monkeypatch):
    import core.database
    from core.database import Base, Session, ModelEndpoint
    
    # 1. Create a clean temporary file-backed SQLite database
    db_file = tmp_path / "test.db"
    engine = create_engine(f"sqlite:///{db_file}")
    Base.metadata.create_all(bind=engine)
    
    # 2. Create test session factory
    TestSessionLocal = sessionmaker(bind=engine)
    
    # 3. Patch SessionLocal in core.database and related modules to use this database
    monkeypatch.setattr(core.database, "SessionLocal", TestSessionLocal)
    import routes.chat_routes
    monkeypatch.setattr(routes.chat_routes, "SessionLocal", TestSessionLocal)
    import core.session_manager
    monkeypatch.setattr(core.session_manager, "SessionLocal", TestSessionLocal)
    import routes.session_routes
    monkeypatch.setattr(routes.session_routes, "SessionLocal", TestSessionLocal)

    # 4. Mock authentication helpers to return a consistent test user
    import src.auth_helpers
    monkeypatch.setattr(src.auth_helpers, "get_current_user", lambda r: "test-user")
    monkeypatch.setattr(src.auth_helpers, "effective_user", lambda r: "test-user")

    # 5. Populate test database with the expected Session and ModelEndpoint
    db = TestSessionLocal()
    sess = Session(
        id="bdfe0fc7-b5f4-4cd7-bc2b-7315f4df03bd",
        name="Test Session",
        endpoint_url="http://localhost:8000/v1",
        model="gpt-4",
        owner="test-user",
    )
    endpoint = ModelEndpoint(
        id="test-endpoint",
        name="Test Endpoint",
        base_url="http://localhost:8000/v1",
        is_enabled=True,
        owner="test-user",
    )
    db.add(sess)
    db.add(endpoint)
    db.commit()
    db.close()

    from app import app
    client = TestClient(app)
    
    # 6. Verify that /api/chat_stream no longer raises NameError
    # (Since we mock everything, it might raise/return other things or proceed with the stream,
    # but it MUST NOT raise a NameError.)
    try:
        response = client.post(
            "/api/chat_stream",
            data={
                "message": "hello",
                "session": "bdfe0fc7-b5f4-4cd7-bc2b-7315f4df03bd"
            }
        )
        # It might return a stream response, 200, 400 (if LLM call fails), etc.,
        # but the key is that it didn't crash with a NameError or Internal Server Error (500).
        assert response.status_code != 500
    except NameError as e:
        pytest.fail(f"POST /api/chat_stream raised NameError: {e}")

    # 7. Verify that /api/chat/stream_status returns {"status": "inactive"} instead of 404
    resp_stream = client.get("/api/chat/stream_status/bdfe0fc7-b5f4-4cd7-bc2b-7315f4df03bd")
    assert resp_stream.status_code == 200
    assert resp_stream.json() == {"status": "inactive"}

    # 8. Verify that /api/research/status returns {"status": "inactive"} instead of 404
    resp_research = client.get("/api/research/status/bdfe0fc7-b5f4-4cd7-bc2b-7315f4df03bd")
    assert resp_research.status_code == 200
    assert resp_research.json() == {"status": "inactive"}
