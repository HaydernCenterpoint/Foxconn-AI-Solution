import base64
import hashlib
import hmac
import json
import time

import pytest

from core.auth import AuthManager
from core.fii_sso import FiiSsoError, resolve_fii_sso, validate_fii_sso


SECRET = "test-fii-secret-that-is-at-least-32-bytes-long"
ISSUER = "MKZ_PLC_Server"
AUDIENCE = "MKZ_PLC_Client"


def _encode(value: dict) -> str:
    raw = json.dumps(value, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _token(header=None, **overrides) -> str:
    payload = {
        "sub": "admin",
        "role": "ADMIN",
        "iss": ISSUER,
        "aud": AUDIENCE,
        "exp": int(time.time()) + 300,
        **overrides,
    }
    head = _encode(header or {"alg": "HS256", "typ": "JWT"})
    body = _encode(payload)
    signature = hmac.new(SECRET.encode(), f"{head}.{body}".encode(), hashlib.sha256).digest()
    return f"{head}.{body}.{base64.urlsafe_b64encode(signature).decode().rstrip('=')}"


def test_validates_signed_identity():
    assert validate_fii_sso(_token(), SECRET, ISSUER, AUDIENCE) == ("admin", "ADMIN")


@pytest.mark.parametrize("token", [
    lambda: _token(exp=1),
    lambda: _token(iss="wrong"),
    lambda: _token(aud="wrong"),
    lambda: _token(role="OWNER"),
    lambda: _token(sub=""),
    lambda: _token(header={"alg": "none", "typ": "JWT"}),
])
def test_rejects_invalid_claims(token):
    with pytest.raises(FiiSsoError):
        validate_fii_sso(token(), SECRET, ISSUER, AUDIENCE)


def test_rejects_tampered_signature():
    head, body, signature = _token().split(".")
    signature = ("a" if signature[0] != "a" else "b") + signature[1:]
    with pytest.raises(FiiSsoError):
        validate_fii_sso(f"{head}.{body}.{signature}", SECRET, ISSUER, AUDIENCE)


@pytest.mark.parametrize(("role", "is_admin"), [
    ("ADMIN", True),
    ("ENGINEER", False),
    ("GUEST", False),
])
def test_creates_passwordless_shadow_user_and_maps_role(tmp_path, role, is_admin):
    manager = AuthManager(str(tmp_path / "auth.json"))
    username = f"factory.{role.lower()}"
    assert manager.ensure_fii_sso_user(username, role) is True
    assert manager.is_admin(username) is is_admin
    assert manager.verify_password(username, "any-password") is False


def test_updates_shadow_user_when_the_signed_role_changes(tmp_path):
    manager = AuthManager(str(tmp_path / "auth.json"))
    assert manager.ensure_fii_sso_user("factory.user", "ADMIN") is True
    assert manager.ensure_fii_sso_user("factory.user", "GUEST") is True
    assert manager.is_admin("factory.user") is False


def test_rejects_collision_with_native_user(tmp_path):
    manager = AuthManager(str(tmp_path / "auth.json"))
    assert manager.create_user("alice", "secure-password", is_admin=False) is True
    assert manager.ensure_fii_sso_user("alice", "ADMIN") is False
    assert manager.is_admin("alice") is False


def test_missing_sso_cookie_preserves_native_session_fallback(tmp_path):
    manager = AuthManager(str(tmp_path / "auth.json"))
    assert manager.create_user("native.user", "secure-password", is_admin=False) is True
    native_token = manager.create_session("native.user", "secure-password")

    assert resolve_fii_sso({}, True, SECRET, ISSUER, AUDIENCE) is None
    assert native_token is not None
    assert manager.status(native_token)["authenticated"] is True


def test_shadow_user_status_uses_effective_privileges(tmp_path):
    manager = AuthManager(str(tmp_path / "auth.json"))
    assert manager.ensure_fii_sso_user("factory.engineer", "ENGINEER") is True

    status = manager.status_for_user("factory.engineer")

    assert status["authenticated"] is True
    assert status["username"] == "factory.engineer"
    assert status["is_admin"] is False
    assert status["privileges"] == manager.get_privileges("factory.engineer")
