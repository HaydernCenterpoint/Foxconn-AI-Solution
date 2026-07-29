from __future__ import annotations

import hashlib
import json
import logging
import math
import os
import re
from typing import Any, Dict, Iterable, List, Optional

import psycopg2
import psycopg2.extras

logger = logging.getLogger(__name__)

POSTGRES_HOST = os.getenv("POSTGRES_HOST", "localhost")
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", "5432"))
POSTGRES_DB = os.getenv("POSTGRES_DB", "factory_db")
POSTGRES_USER = os.getenv("POSTGRES_USER", "factory_user")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD")
if not POSTGRES_PASSWORD:
    raise RuntimeError("POSTGRES_PASSWORD must be supplied by the deployment secret manager")
EMBEDDING_DIMS = int(os.getenv("EMBEDDING_DIMS", "384"))


def _connect():
    return psycopg2.connect(
        host=POSTGRES_HOST,
        port=POSTGRES_PORT,
        dbname=POSTGRES_DB,
        user=POSTGRES_USER,
        password=POSTGRES_PASSWORD,
        cursor_factory=psycopg2.extras.RealDictCursor,
    )


def _tokenize(text: str) -> List[str]:
    return re.findall(r"[a-z0-9_à-ỹ]+", (text or "").lower())


def embed_text(text: str) -> List[float]:
    """Deterministic hashing-based embedding. NO model download required.
    Maps text -> EMBEDDING_DIMS-dimensional float vector using SHA-256 buckets.
    Cosine similarity between texts sharing vocabulary is preserved approximately
    well enough for document RAG in dev/local environments.
    """
    vec = [0.0] * EMBEDDING_DIMS
    tokens = _tokenize(text)
    if not tokens:
        return vec
    for tok in tokens:
        digest = hashlib.sha256(tok.encode("utf-8")).digest()
        for i in range(0, len(digest), 4):
            bucket = int.from_bytes(digest[i : i + 4], "big") % EMBEDDING_DIMS
            sign = 1.0 if (digest[i // 4] & 1) else -1.0
            vec[bucket] += sign
    norm = math.sqrt(sum(v * v for v in vec))
    if norm > 0:
        vec = [v / norm for v in vec]
    return vec


def _vector_literal(values: Iterable[float]) -> str:
    return json.dumps([float(v) for v in values])


def _cosine(a: List[float], b: List[float]) -> float:
    if not a or not b:
        return 0.0
    return sum(x * y for x, y in zip(a, b))


def initialize_schema() -> None:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS document_chunks (
                    id SERIAL PRIMARY KEY,
                    document_id TEXT,
                    filename TEXT,
                    machine_code TEXT,
                    line_code TEXT,
                    document_type TEXT,
                    version TEXT,
                    page_number INT,
                    chunk_index INT,
                    content TEXT,
                    embedding JSONB,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_doc_chunks_metadata
                ON document_chunks (document_id, machine_code, line_code, document_type);
                """
            )
        conn.commit()
    logger.info("Document RAG schema initialized (JSONB mode, dims=%d)", EMBEDDING_DIMS)


def insert_chunks(
    *,
    document_id: str,
    filename: str,
    machine_code: Optional[str],
    line_code: Optional[str],
    document_type: Optional[str],
    version: Optional[str],
    chunks: List[Dict[str, Any]],
) -> int:
    if not chunks:
        return 0

    rows = []
    for chunk in chunks:
        content = chunk["content"]
        rows.append(
            (
                document_id,
                filename,
                machine_code,
                line_code,
                document_type,
                version,
                chunk.get("page_number"),
                chunk["chunk_index"],
                content,
                json.dumps(embed_text(content)),
            )
        )

    with _connect() as conn:
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO document_chunks (
                    document_id, filename, machine_code, line_code, document_type,
                    version, page_number, chunk_index, content, embedding
                ) VALUES %s
                """,
                rows,
                template="(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)",
            )
        conn.commit()
    return len(rows)


def search_chunks(query: str, limit: int = 5) -> List[Dict]:
    qvec = embed_text(query)
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT document_id AS \"documentId\", filename, "
                "machine_code AS \"machineCode\", line_code AS \"lineCode\", "
                "document_type AS \"documentType\", version, "
                "page_number AS \"pageNumber\", chunk_index AS \"chunkIndex\", "
                "content AS text, embedding FROM document_chunks"
            )
            results = []
            for row in cur.fetchall():
                stored = row["embedding"]
                if isinstance(stored, str):
                    stored = json.loads(stored)
                score = _cosine(qvec, stored)
                out = dict(row)
                out["score"] = score
                out.pop("embedding", None)
                results.append(out)
            results.sort(key=lambda r: r["score"], reverse=True)
            return results[: max(1, min(limit, 20))]
