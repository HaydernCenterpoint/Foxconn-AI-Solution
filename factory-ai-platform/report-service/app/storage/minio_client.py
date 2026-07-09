"""Local-file replacement for MinIO when running without Docker.

Writes bytes under a configurable directory and returns a `file://` URL that
the gateway/UI can dereference directly. Behaviour is otherwise drop-in for
the gateway/report code that only calls `upload_bytes(data, filename, mime)`.
"""
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
BUCKET = "factory-reports"

_LOCAL_DIR = Path(os.getenv("LOCAL_REPORTS_DIR", "d:/nhnhnhnhnh/factory-ai-platform/report-service/_local_storage"))
LOCAL_BASE_URL = os.getenv("LOCAL_REPORTS_BASE_URL", "http://127.0.0.1:8083/local-files")


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


def upload_bytes(data: bytes, filename: str, content_type: str = "application/octet-stream") -> str:
    """Write bytes to local disk and return a downloadable URL."""
    _get_client()
    safe_name = filename.replace("..", "_").replace("\\", "/")
    dest = _LOCAL_DIR / safe_name
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    logger.info("Stored report %s (%d bytes, mime=%s)", dest, len(data), content_type)
    return f"{LOCAL_BASE_URL}/{safe_name}"
