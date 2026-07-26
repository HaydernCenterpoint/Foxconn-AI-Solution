from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from core.auth import AuthManager
from routes.auth_routes import setup_auth_routes


def test_sso_logout_points_to_operations_global_logout(tmp_path):
    app = FastAPI()
    app.include_router(setup_auth_routes(
        AuthManager(str(tmp_path / "auth.json")),
        fii_sso_enabled=True,
        fii_main_logout_url="http://localhost:3001/logout",
    ))

    response = TestClient(app).post("/api/auth/logout")

    assert response.status_code == 200
    assert response.json() == {
        "ok": True,
        "redirect_url": "http://localhost:3001/logout",
    }


def test_sso_account_ui_hides_local_credentials_and_uses_redirect():
    repository = Path(__file__).resolve().parents[1]
    html = (repository / "static" / "index.html").read_text(encoding="utf-8")
    settings = (repository / "static" / "js" / "settings.js").read_text(encoding="utf-8")

    assert 'id="settings-password-card"' in html
    assert "d.auth_source === 'fii_sso'" in settings
    assert "passwordCard.style.display = 'none'" in settings
    assert "tfaCard.style.display = 'none'" in settings
    assert "window.location.href = redirectUrl" in settings
