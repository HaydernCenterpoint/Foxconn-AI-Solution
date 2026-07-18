"""Validation helpers for the shared FII authentication cookie."""

import base64
import hashlib
import hmac
import json
import math
import time


_ALLOWED_ROLES = frozenset({"ADMIN", "ENGINEER", "GUEST"})


class FiiSsoError(ValueError):
    """Raised when the shared FII cookie cannot be trusted."""


def _decode_json(segment):
    try:
        value = json.loads(_decode_segment(segment).decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise FiiSsoError("Malformed FII SSO token") from exc
    if not isinstance(value, dict):
        raise FiiSsoError("Malformed FII SSO token")
    return value


def _decode_segment(segment):
    try:
        encoded = segment.encode("ascii")
        padding = b"=" * (-len(encoded) % 4)
        return base64.b64decode(encoded + padding, altchars=b"-_", validate=True)
    except (UnicodeEncodeError, ValueError) as exc:
        raise FiiSsoError("Malformed FII SSO token") from exc


def validate_fii_sso(token, secret, issuer, audience, now=None):
    """Return the normalized username and role from a shared FII JWT."""
    if not isinstance(secret, str):
        raise FiiSsoError("Invalid FII SSO secret")
    secret_bytes = secret.strip().encode("utf-8")
    if len(secret_bytes) < 32:
        raise FiiSsoError("FII SSO secret must be at least 32 bytes")
    if not isinstance(token, str):
        raise FiiSsoError("Malformed FII SSO token")
    segments = token.split(".")
    if len(segments) != 3:
        raise FiiSsoError("Malformed FII SSO token")
    header_segment, payload_segment, signature_segment = segments
    header = _decode_json(header_segment)
    if header.get("alg") != "HS256":
        raise FiiSsoError("Unsupported FII SSO algorithm")
    payload = _decode_json(payload_segment)
    signature = _decode_segment(signature_segment)
    expected = hmac.new(
        secret_bytes,
        f"{header_segment}.{payload_segment}".encode("ascii"),
        hashlib.sha256,
    ).digest()
    if not hmac.compare_digest(signature, expected):
        raise FiiSsoError("Invalid FII SSO signature")
    if payload.get("iss") != issuer or payload.get("aud") != audience:
        raise FiiSsoError("Invalid FII SSO issuer or audience")
    expiration = payload.get("exp")
    if (
        isinstance(expiration, bool)
        or not isinstance(expiration, (int, float))
        or not math.isfinite(expiration)
    ):
        raise FiiSsoError("Invalid FII SSO expiration")
    current_time = time.time() if now is None else now
    if expiration <= current_time:
        raise FiiSsoError("Expired FII SSO token")
    subject = payload.get("sub")
    if not isinstance(subject, str):
        raise FiiSsoError("Invalid FII SSO subject")
    username = subject.strip().lower()
    if not username or len(username) > 255:
        raise FiiSsoError("Invalid FII SSO subject")
    role_claim = payload.get("role")
    if not isinstance(role_claim, str):
        raise FiiSsoError("Invalid FII SSO role")
    role = role_claim.strip().upper()
    if role not in _ALLOWED_ROLES:
        raise FiiSsoError("Invalid FII SSO role")
    return username, role


def resolve_fii_sso(cookies, enabled, secret, issuer, audience):
    """Resolve the shared cookie when shared authentication is enabled."""
    if not enabled:
        return None
    token = cookies.get("fii_sso")
    if token is None:
        return None
    return validate_fii_sso(token, secret, issuer, audience)
