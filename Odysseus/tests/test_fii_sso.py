import asyncio
import base64
import hashlib
import hmac
import json
from collections import UserString
from types import SimpleNamespace

import pytest

from core.auth import ADMIN_PRIVILEGES, DEFAULT_PRIVILEGES, AuthManager
from core.fii_sso import FiiSsoError, resolve_fii_sso, validate_fii_sso


SECRET = "test-fii-secret-that-is-at-least-32-bytes-long"
ISSUER = "MKZ_PLC_Server"
AUDIENCE = "MKZ_PLC_Client"
NOW = 1_700_000_000
OTHER_SECRET = "different-fii-secret-that-is-also-at-least-32-bytes"
TRAILING_SPACE_SECRET = "fii-secret-keeps-exact-trailing-bytes-12345 "


def _b64url(value):
    raw = json.dumps(value, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _token(payload=None, header=None, secret=SECRET, omit=()):
    claims = {
        "sub": " Admin ",
        "role": " admin ",
        "iss": ISSUER,
        "aud": AUDIENCE,
        "exp": NOW + 60,
    }
    if payload:
        claims.update(payload)
    for claim in omit:
        claims.pop(claim, None)
    encoded_header = _b64url(header or {"alg": "HS256", "typ": "JWT"})
    encoded_payload = _b64url(claims)
    signing_input = f"{encoded_header}.{encoded_payload}"
    signature = hmac.new(
        secret.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256
    ).digest()
    encoded_signature = base64.urlsafe_b64encode(signature).rstrip(b"=").decode("ascii")
    return f"{signing_input}.{encoded_signature}"


def test_validate_fii_sso_normalizes_valid_identity():
    assert validate_fii_sso(_token(), SECRET, ISSUER, AUDIENCE, now=NOW) == (
        "admin",
        "ADMIN",
    )


@pytest.mark.parametrize("token", [None, "", "one.two", "one.two.three.four"])
def test_validate_fii_sso_requires_exactly_three_segments(token):
    with pytest.raises(FiiSsoError):
        validate_fii_sso(token, SECRET, ISSUER, AUDIENCE, now=NOW)


@pytest.mark.parametrize("segment_index", [0, 1, 2])
def test_validate_fii_sso_rejects_malformed_segments(segment_index):
    segments = _token().split(".")
    segments[segment_index] = "%"

    with pytest.raises(FiiSsoError):
        validate_fii_sso(".".join(segments), SECRET, ISSUER, AUDIENCE, now=NOW)


@pytest.mark.parametrize("signature_form", ["padded", "standard-base64"])
def test_validate_fii_sso_rejects_non_jwt_base64url_signature(signature_form):
    segments = _token().split(".")
    if signature_form == "padded":
        segments[2] += "="
    else:
        standard_signature = segments[2].translate(str.maketrans("-_", "+/"))
        assert standard_signature != segments[2]
        segments[2] = standard_signature

    with pytest.raises(FiiSsoError):
        validate_fii_sso(".".join(segments), SECRET, ISSUER, AUDIENCE, now=NOW)


@pytest.mark.parametrize("segment_index", [0, 1])
def test_validate_fii_sso_rejects_non_object_json_segments(segment_index):
    segments = _token().split(".")
    segments[segment_index] = _b64url([])

    with pytest.raises(FiiSsoError):
        validate_fii_sso(".".join(segments), SECRET, ISSUER, AUDIENCE, now=NOW)


def test_validate_fii_sso_rejects_non_hs256_algorithm():
    with pytest.raises(FiiSsoError):
        validate_fii_sso(
            _token(header={"alg": "HS512"}), SECRET, ISSUER, AUDIENCE, now=NOW
        )


def test_validate_fii_sso_rejects_short_secret():
    short_secret = "x" * 31

    with pytest.raises(FiiSsoError):
        validate_fii_sso(
            _token(secret=short_secret), short_secret, ISSUER, AUDIENCE, now=NOW
        )


def test_validate_fii_sso_uses_secret_bytes_without_trimming():
    assert validate_fii_sso(
        _token(secret=TRAILING_SPACE_SECRET),
        TRAILING_SPACE_SECRET,
        ISSUER,
        AUDIENCE,
        now=NOW,
    ) == ("admin", "ADMIN")


def test_validate_fii_sso_rejects_tampered_signature():
    with pytest.raises(FiiSsoError):
        validate_fii_sso(
            _token(secret=OTHER_SECRET), SECRET, ISSUER, AUDIENCE, now=NOW
        )


@pytest.mark.parametrize(
    ("claim", "value"),
    [("iss", "wrong-issuer"), ("aud", "wrong-audience")],
)
def test_validate_fii_sso_requires_exact_issuer_and_audience(claim, value):
    with pytest.raises(FiiSsoError):
        validate_fii_sso(
            _token({claim: value}), SECRET, ISSUER, AUDIENCE, now=NOW
        )


@pytest.mark.parametrize(
    ("issuer", "audience"),
    [
        (None, AUDIENCE),
        ("   ", AUDIENCE),
        (ISSUER, None),
        (ISSUER, "   "),
    ],
)
def test_validate_fii_sso_rejects_blank_identity_configuration(issuer, audience):
    with pytest.raises(FiiSsoError):
        validate_fii_sso(
            _token({"iss": issuer, "aud": audience}),
            SECRET,
            issuer,
            audience,
            now=NOW,
        )


@pytest.mark.parametrize("expiration", [NOW - 1, NOW])
def test_validate_fii_sso_requires_expiration_strictly_in_future(expiration):
    with pytest.raises(FiiSsoError):
        validate_fii_sso(
            _token({"exp": expiration}), SECRET, ISSUER, AUDIENCE, now=NOW
        )


@pytest.mark.parametrize(
    "token",
    [
        _token(omit=("exp",)),
        _token({"exp": "later"}),
        _token({"exp": True}),
        _token({"exp": float("nan")}),
    ],
    ids=["missing", "string", "boolean", "not-finite"],
)
def test_validate_fii_sso_rejects_missing_or_invalid_expiration(token):
    with pytest.raises(FiiSsoError):
        validate_fii_sso(token, SECRET, ISSUER, AUDIENCE, now=NOW)


@pytest.mark.parametrize(
    "not_before",
    [NOW + 1, True, "later", float("nan"), None],
    ids=["future", "boolean", "string", "not-finite", "null"],
)
def test_validate_fii_sso_rejects_invalid_or_future_not_before(not_before):
    with pytest.raises(FiiSsoError):
        validate_fii_sso(
            _token({"nbf": not_before}), SECRET, ISSUER, AUDIENCE, now=NOW
        )


@pytest.mark.parametrize(
    "token",
    [
        _token({"sub": "   "}),
        _token({"sub": "x" * 256}),
        _token({"sub": 123}),
        _token(omit=("sub",)),
    ],
    ids=["blank", "too-long", "non-string", "missing"],
)
def test_validate_fii_sso_rejects_invalid_subject(token):
    with pytest.raises(FiiSsoError):
        validate_fii_sso(token, SECRET, ISSUER, AUDIENCE, now=NOW)


@pytest.mark.parametrize(
    "token",
    [
        _token({"role": "OWNER"}),
        _token({"role": "   "}),
        _token({"role": 7}),
        _token(omit=("role",)),
    ],
    ids=["unknown", "blank", "non-string", "missing"],
)
def test_validate_fii_sso_rejects_invalid_role(token):
    with pytest.raises(FiiSsoError):
        validate_fii_sso(token, SECRET, ISSUER, AUDIENCE, now=NOW)


@pytest.mark.parametrize(
    ("cookies", "enabled"),
    [({"fii_sso": "invalid"}, False), ({}, True)],
)
def test_resolve_fii_sso_returns_none_when_disabled_or_cookie_absent(
    cookies, enabled
):
    assert resolve_fii_sso(cookies, enabled, SECRET, ISSUER, AUDIENCE) is None


def test_resolve_fii_sso_validates_present_cookie():
    token = _token(
        {"sub": " Engineer.User ", "role": "engineer", "exp": 4_000_000_000}
    )

    assert resolve_fii_sso(
        {"fii_sso": token}, True, SECRET, ISSUER, AUDIENCE
    ) == ("engineer.user", "ENGINEER")


def test_resolve_fii_sso_rejects_invalid_present_cookie():
    with pytest.raises(FiiSsoError):
        resolve_fii_sso({"fii_sso": ""}, True, SECRET, ISSUER, AUDIENCE)


@pytest.mark.parametrize(
    ("role", "is_admin", "expected_privileges"),
    [
        (" admin ", True, ADMIN_PRIVILEGES),
        ("Engineer", False, DEFAULT_PRIVILEGES),
        ("GUEST", False, DEFAULT_PRIVILEGES),
    ],
)
def test_ensure_fii_sso_user_creates_passwordless_role_mapping(
    tmp_path, role, is_admin, expected_privileges
):
    manager = AuthManager(str(tmp_path / f"auth-{role.strip()}.json"))

    assert manager.ensure_fii_sso_user(" Factory.User ", role) is True

    user = manager.users["factory.user"]
    assert user["is_admin"] is is_admin
    assert user["auth_source"] == "fii_sso"
    assert user["privileges"] == expected_privileges
    assert user["privileges"] is not expected_privileges
    assert "password_hash" not in user


def test_ensure_fii_sso_user_rejects_native_collision_untouched(tmp_path):
    manager = AuthManager(str(tmp_path / "auth.json"))
    assert manager.create_user("factory.user", "native-password") is True
    before = json.loads(json.dumps(manager.users["factory.user"]))

    assert manager.ensure_fii_sso_user(" Factory.User ", "ADMIN") is False

    assert manager.users["factory.user"] == before


def test_ensure_fii_sso_user_updates_admin_to_guest_and_preserves_created(tmp_path):
    manager = AuthManager(str(tmp_path / "auth.json"))
    assert manager.ensure_fii_sso_user("factory.user", "ADMIN") is True
    created = manager.users["factory.user"]["created"]
    admin_privileges = manager.users["factory.user"]["privileges"]

    assert manager.ensure_fii_sso_user("factory.user", "GUEST") is True

    user = manager.users["factory.user"]
    assert user["created"] == created
    assert user["is_admin"] is False
    assert user["auth_source"] == "fii_sso"
    assert user["privileges"] == DEFAULT_PRIVILEGES
    assert user["privileges"] is not admin_privileges
    assert "password_hash" not in user


def test_ensure_fii_sso_user_saves_only_on_create_or_change(
    tmp_path, monkeypatch
):
    manager = AuthManager(str(tmp_path / "auth.json"))
    saves = []
    monkeypatch.setattr(manager, "_save", lambda: saves.append(True))

    assert manager.ensure_fii_sso_user("factory.user", "GUEST") is True
    assert len(saves) == 1

    assert manager.ensure_fii_sso_user("factory.user", "GUEST") is True
    assert len(saves) == 1

    assert manager.ensure_fii_sso_user("factory.user", "ADMIN") is True
    assert len(saves) == 2


@pytest.mark.parametrize(
    ("username", "role"),
    [
        ("   ", "GUEST"),
        ("internal-tool", "GUEST"),
        ("api", "GUEST"),
        ("demo", "GUEST"),
        ("system", "GUEST"),
        ("factory.user", "OWNER"),
        ("factory.user", "   "),
    ],
)
def test_ensure_fii_sso_user_rejects_blank_reserved_or_invalid_role(
    tmp_path, username, role
):
    manager = AuthManager(str(tmp_path / "auth.json"))

    assert manager.ensure_fii_sso_user(username, role) is False
    assert manager.users == {}


@pytest.mark.parametrize(
    ("username", "role"),
    [
        (UserString("factory.user"), "GUEST"),
        ("factory.user", UserString("GUEST")),
    ],
)
def test_ensure_fii_sso_user_rejects_non_string_identity_inputs(
    tmp_path, username, role
):
    manager = AuthManager(str(tmp_path / "auth.json"))

    assert manager.ensure_fii_sso_user(username, role) is False
    assert manager.users == {}


def test_ensure_fii_sso_user_rejects_subject_over_255_characters(tmp_path):
    manager = AuthManager(str(tmp_path / "auth.json"))

    assert manager.ensure_fii_sso_user(f" {'x' * 256} ", "GUEST") is False
    assert manager.users == {}


def test_verify_password_always_rejects_fii_sso_shadow_users(
    tmp_path, monkeypatch
):
    manager = AuthManager(str(tmp_path / "auth.json"))
    assert manager.ensure_fii_sso_user("factory.user", "GUEST") is True
    manager.users["factory.user"]["password_hash"] = "legacy-looking-hash"
    monkeypatch.setattr("core.auth._verify_password", lambda password, hashed: True)

    assert manager.verify_password("factory.user", "anything") is False


def test_change_password_rejects_fii_sso_shadow_without_mutation(tmp_path):
    manager = AuthManager(str(tmp_path / "auth.json"))
    assert manager.ensure_fii_sso_user("factory.user", "GUEST") is True
    before = json.loads(json.dumps(manager.users["factory.user"]))

    assert manager.change_password("factory.user", "old", "new") is False
    assert manager.users["factory.user"] == before


def test_status_for_user_returns_shared_identity_shape(tmp_path):
    manager = AuthManager(str(tmp_path / "auth.json"))
    assert manager.ensure_fii_sso_user("factory.engineer", "ENGINEER") is True

    result = manager.status_for_user("factory.engineer")

    assert result == {
        "configured": True,
        "authenticated": True,
        "username": "factory.engineer",
        "is_admin": False,
        "privileges": manager.get_privileges("factory.engineer"),
    }


def test_auth_status_uses_shared_request_identity(tmp_path):
    from routes.auth_routes import setup_auth_routes

    auth_manager = AuthManager(str(tmp_path / "auth.json"))
    assert auth_manager.ensure_fii_sso_user("factory.engineer", "ENGINEER") is True
    router = setup_auth_routes(auth_manager)
    endpoint = next(
        route.endpoint
        for route in router.routes
        if route.path == "/api/auth/status"
    )
    request = SimpleNamespace(
        cookies={},
        state=SimpleNamespace(
            fii_sso=True,
            current_user="factory.engineer",
        ),
    )

    result = asyncio.run(endpoint(request=request))

    assert result == {
        "configured": True,
        "authenticated": True,
        "username": "factory.engineer",
        "is_admin": False,
        "privileges": auth_manager.get_privileges("factory.engineer"),
        "signup_enabled": False,
    }


def test_missing_sso_cookie_preserves_native_session_fallback(
    tmp_path, monkeypatch
):
    monkeypatch.setattr("core.auth._hash_password", lambda password: f"hash:{password}")
    monkeypatch.setattr(
        "core.auth._verify_password",
        lambda password, hashed: hashed == f"hash:{password}",
    )
    manager = AuthManager(str(tmp_path / "auth.json"))
    assert manager.create_user("native.user", "native-password") is True
    native_token = manager.create_session("native.user", "native-password")

    assert resolve_fii_sso({}, True, SECRET, ISSUER, AUDIENCE) is None
    assert manager.validate_token(native_token) is True
    assert manager.get_username_for_token(native_token) == "native.user"
