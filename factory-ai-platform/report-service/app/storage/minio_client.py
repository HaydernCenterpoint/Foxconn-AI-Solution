"""Local-file replacement for MinIO when running without Docker.

Writes bytes under a configurable directory and returns an HTTP download URL
the gateway/UI can dereference directly. Behaviour is otherwise drop-in for
the gateway/report code that only calls `upload_bytes(data, filename, mime)`.
This backend is single-replica only: local files and idempotency state are not
shared between report-service replicas.
"""
import hashlib
import hmac
import ipaddress
import logging
import os
import re
import time
import uuid
from pathlib import Path, PureWindowsPath
from urllib.parse import quote, urlencode, urlparse

logger = logging.getLogger(__name__)

_LOCAL_DIR = Path(os.getenv("LOCAL_REPORTS_DIR", "/var/lib/report-service"))
LOCAL_BASE_URL = os.getenv("LOCAL_REPORTS_BASE_URL", "http://127.0.0.1:8083/local-files")
_LOCAL_ENVIRONMENTS = {"local", "test"}


class _StubMinio:
    def bucket_exists(self, name: str) -> bool:
        return True

    def make_bucket(self, name: str) -> None:
        return None


_client: _StubMinio | None = None


def _get_client() -> _StubMinio:
    global _client
    if _client is None:
        _LOCAL_DIR.mkdir(parents=True, exist_ok=True)
        _client = _StubMinio()
    return _client


def resolve_local_report_path(filename: str) -> Path:
    """Resolve an untrusted report name and require it to remain under storage."""
    normalized = filename.replace("\\", "/")
    relative = Path(normalized)
    if (
        not filename
        or relative.is_absolute()
        or PureWindowsPath(filename).drive
        or any(part == ".." for part in relative.parts)
    ):
        raise ValueError("invalid report path")

    root = _LOCAL_DIR.resolve()
    destination = (root / relative).resolve()
    try:
        destination.relative_to(root)
    except ValueError as exc:
        raise ValueError("invalid report path") from exc
    return destination


def _download_base_url() -> str:
    configured = os.getenv("LOCAL_REPORTS_BASE_URL")
    environment = os.getenv("REPORT_SERVICE_MODE", "production").strip().lower()
    if environment not in {"production", *_LOCAL_ENVIRONMENTS}:
        raise RuntimeError("REPORT_SERVICE_MODE must be production, local, or test")
    base_url = configured or LOCAL_BASE_URL
    parsed = urlparse(base_url)
    try:
        port = parsed.port
    except ValueError as exc:
        raise RuntimeError("LOCAL_REPORTS_BASE_URL is invalid") from exc
    hostname = parsed.hostname
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.netloc
        or not hostname
        or parsed.username is not None
        or parsed.password is not None
        or "?" in base_url
        or "#" in base_url
        or parsed.netloc.endswith(":")
        or port == 0
        or any(char.isspace() for char in base_url)
    ):
        raise RuntimeError("LOCAL_REPORTS_BASE_URL is invalid")

    try:
        address = ipaddress.ip_address(hostname)
    except ValueError:
        labels = hostname.rstrip(".").split(".")
        if hostname != hostname.rstrip(".") or any(
            not label
            or len(label) > 63
            or not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?", label)
            for label in labels
        ):
            raise RuntimeError("LOCAL_REPORTS_BASE_URL is invalid")
        address = None

    if environment not in _LOCAL_ENVIRONMENTS:
        normalized_host = hostname.lower().rstrip(".")
        allowlist = {
            entry.strip().lower().rstrip(".")
            for entry in os.getenv("REPORT_PUBLIC_HOST_ALLOWLIST", "").split(",")
            if entry.strip()
        }
        reserved_suffixes = (".example", ".invalid", ".localhost", ".test")
        if (
            not configured
            or parsed.scheme != "https"
            or not allowlist
            or normalized_host not in allowlist
            or normalized_host == "localhost"
            or "." not in normalized_host
            or normalized_host.endswith(reserved_suffixes)
            or (
                address is not None
                and (
                    not address.is_global
                    or address.is_private
                    or address.is_link_local
                    or address.is_loopback
                    or address.is_multicast
                    or address.is_reserved
                    or address.is_unspecified
                )
            )
        ):
            raise RuntimeError("externally reachable HTTPS LOCAL_REPORTS_BASE_URL is required")
    return base_url.rstrip("/")


def _signing_secret() -> bytes:
    secret = os.getenv("REPORT_DOWNLOAD_SIGNING_KEY", "").encode("utf-8")
    if len(secret) < 32:
        raise RuntimeError("REPORT_DOWNLOAD_SIGNING_KEY must be at least 32 bytes")
    return secret


def validate_storage_config() -> None:
    """Validate the fail-closed local-storage deployment boundary."""
    _download_base_url()
    if not os.getenv("REPORT_SERVICE_API_KEY", "").strip():
        raise RuntimeError("REPORT_SERVICE_API_KEY is required")
    _signing_secret()
    readiness_probe = _LOCAL_DIR / f".readiness-{uuid.uuid4().hex}"
    try:
        _LOCAL_DIR.mkdir(parents=True, exist_ok=True)
        with readiness_probe.open("xb") as probe:
            probe.write(b"ready")
            probe.flush()
            os.fsync(probe.fileno())
    except OSError as exc:
        raise RuntimeError("LOCAL_REPORTS_DIR is not writable") from exc
    finally:
        try:
            readiness_probe.unlink(missing_ok=True)
        except OSError:
            pass


def _capability_payload(
    filename: str,
    export_token: str,
    tenant_id: str,
    user_id: str,
    expires: int,
) -> str:
    return "\n".join((filename, export_token, tenant_id, user_id, str(expires)))


def verify_download_capability(
    filename: str,
    export_token: str,
    tenant_id: str,
    user_id: str,
    expires: int,
    signature: str,
) -> bool:
    if expires < int(time.time()):
        return False
    try:
        secret = _signing_secret()
    except RuntimeError:
        return False
    expected = hmac.new(
        secret,
        _capability_payload(filename, export_token, tenant_id, user_id, expires).encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


def upload_bytes(
    data: bytes,
    filename: str,
    content_type: str = "application/octet-stream",
    *,
    export_token: str,
    tenant_id: str,
    user_id: str,
) -> str:
    """Write bytes to local disk and return a downloadable URL."""
    base_url = _download_base_url()
    dest = resolve_local_report_path(filename)
    _get_client()
    dest.parent.mkdir(parents=True, exist_ok=True)
    temporary = dest.with_name(f"{dest.name}.tmp-{uuid.uuid4().hex}")
    try:
        temporary.write_bytes(data)
        os.replace(temporary, dest)
    finally:
        temporary.unlink(missing_ok=True)
    logger.info("Stored report %s (%d bytes, mime=%s)", dest, len(data), content_type)
    relative_name = dest.relative_to(_LOCAL_DIR.resolve()).as_posix()
    ttl_seconds = max(60, int(os.getenv("REPORT_DOWNLOAD_TTL_SECONDS", "900")))
    expires = int(time.time()) + ttl_seconds
    payload = _capability_payload(relative_name, export_token, tenant_id, user_id, expires)
    signature = hmac.new(_signing_secret(), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    query = urlencode({
        "export": export_token,
        "tenant": tenant_id,
        "user": user_id,
        "expires": expires,
        "signature": signature,
    })
    return f"{base_url}/{quote(relative_name, safe='/')}?{query}"
