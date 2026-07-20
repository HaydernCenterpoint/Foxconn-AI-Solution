"""Validate the shared FII login cookie without adding a JWT dependency."""

import base64
import binascii
import hashlib
import hmac
import json
import time
from collections.abc import Mapping


class FiiSsoError(ValueError):
    pass


def _decode(value: str) -> dict:
    try:
        padded = value + "=" * (-len(value) % 4)
        decoded = base64.b64decode(padded.encode(), altchars=b"-_", validate=True)
        result = json.loads(decoded)
    except (binascii.Error, ValueError, TypeError, json.JSONDecodeError) as error:
        raise FiiSsoError("Invalid FII session token") from error
    if not isinstance(result, dict):
        raise FiiSsoError("Invalid FII session token")
    return result


def validate_fii_sso(
    token: str,
    secret: str,
    issuer: str,
    audience: str,
    now: int | None = None,
) -> tuple[str, str]:
    if len(secret.encode()) < 32:
        raise FiiSsoError("FII JWT secret must be at least 32 bytes")
    try:
        head, body, encoded_signature = token.split(".")
    except (AttributeError, ValueError) as error:
        raise FiiSsoError("Invalid FII session token") from error

    header = _decode(head)
    payload = _decode(body)
    if header.get("alg") != "HS256":
        raise FiiSsoError("Invalid FII session algorithm")

    try:
        padded = encoded_signature + "=" * (-len(encoded_signature) % 4)
        signature = base64.b64decode(padded.encode(), altchars=b"-_", validate=True)
    except (binascii.Error, ValueError) as error:
        raise FiiSsoError("Invalid FII session signature") from error
    expected = hmac.new(secret.encode(), f"{head}.{body}".encode(), hashlib.sha256).digest()
    if not hmac.compare_digest(signature, expected):
        raise FiiSsoError("Invalid FII session signature")

    username = payload.get("sub")
    role = payload.get("role")
    expiration = payload.get("exp")
    current_time = now if now is not None else time.time()
    if not isinstance(username, str) or not username.strip() or len(username.strip()) > 255:
        raise FiiSsoError("Invalid FII session subject")
    if role not in {"ADMIN", "ENGINEER", "GUEST"}:
        raise FiiSsoError("Invalid FII session role")
    if payload.get("iss") != issuer or payload.get("aud") != audience:
        raise FiiSsoError("Invalid FII session issuer or audience")
    if isinstance(expiration, bool) or not isinstance(expiration, (int, float)) or expiration <= current_time:
        raise FiiSsoError("Expired FII session")
    not_before = payload.get("nbf")
    if not_before is not None and (
        isinstance(not_before, bool) or not isinstance(not_before, (int, float)) or not_before > current_time
    ):
        raise FiiSsoError("FII session is not active")
    return username.strip().lower(), role


def resolve_fii_sso(
    cookies: Mapping[str, str],
    enabled: bool,
    secret: str,
    issuer: str,
    audience: str,
) -> tuple[str, str] | None:
    if not enabled:
        return None
    token = cookies.get("fii_sso")
    return validate_fii_sso(token, secret, issuer, audience) if token else None
