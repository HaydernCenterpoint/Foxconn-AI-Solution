import io
import os
import logging
from datetime import timedelta
from minio import Minio
from minio.error import S3Error

logger = logging.getLogger(__name__)

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ROOT_USER", "minio_admin")
MINIO_SECRET_KEY = os.getenv("MINIO_ROOT_PASSWORD", "minio_secure_password_7788")
MINIO_SECURE = os.getenv("MINIO_SECURE", "false").lower() == "true"
BUCKET = "factory-reports"

_client: Minio | None = None


def _get_client() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            MINIO_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=MINIO_SECURE,
        )
        if not _client.bucket_exists(BUCKET):
            _client.make_bucket(BUCKET)
    return _client


def upload_bytes(data: bytes, filename: str, content_type: str = "application/octet-stream") -> str:
    """Upload bytes to MinIO and return a presigned download URL (24h)."""
    client = _get_client()
    buf = io.BytesIO(data)
    client.put_object(
        BUCKET,
        filename,
        data=buf,
        length=len(data),
        content_type=content_type,
    )
    url = client.presigned_get_object(BUCKET, filename, expires=timedelta(hours=24))
    return url
