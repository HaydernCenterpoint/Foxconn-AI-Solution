from __future__ import annotations

import logging
import os
from typing import Any, Dict, Iterable, List, Optional

import psycopg2
import psycopg2.extras
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

POSTGRES_HOST = os.getenv("POSTGRES_HOST", "postgres")
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", "5432"))
POSTGRES_DB = os.getenv("POSTGRES_DB", "factory_db")
POSTGRES_USER = os.getenv("POSTGRES_USER", "factory_user")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "factory_secure_password_9988")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
EMBEDDING_DIMS = int(os.getenv("EMBEDDING_DIMS", "384"))

_model: Optional[SentenceTransformer] = None


def _connect():
    return psycopg2.connect(
        host=POSTGRES_HOST,
        port=POSTGRES_PORT,
        dbname=POSTGRES_DB,
        user=POSTGRES_USER,
        password=POSTGRES_PASSWORD,
        cursor_factory=psycopg2.extras.RealDictCursor,
    )


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        logger.info("Loading embedding model: %s", EMBEDDING_MODEL)
        _model = SentenceTransformer(EMBEDDING_MODEL)
    return _model


def _vector_literal(values: Iterable[float]) -> str:
    return "[" + ",".join(f"{float(value):.8f}" for value in values) + "]"


def embed_text(text: str) -> List[float]:
    embedding = _get_model().encode(text or "", normalize_embeddings=True)
    return [float(value) for value in embedding]


def initialize_schema() -> None:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
            cur.execute(
                f"""
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
                    embedding VECTOR({EMBEDDING_DIMS}),
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
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_doc_chunks_embedding
                ON document_chunks USING ivfflat (embedding vector_cosine_ops);
                """
            )
        conn.commit()


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
                _vector_literal(embed_text(content)),
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
                template="(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::vector)",
            )
        conn.commit()
    return len(rows)


def search_chunks(query: str, limit: int = 5) -> List[Dict[str, Any]]:
    query_vector = _vector_literal(embed_text(query))
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    document_id AS "documentId",
                    filename,
                    machine_code AS "machineCode",
                    line_code AS "lineCode",
                    document_type AS "documentType",
                    version,
                    page_number AS "pageNumber",
                    chunk_index AS "chunkIndex",
                    content AS text,
                    1 - (embedding <=> %s::vector) AS score
                FROM document_chunks
                ORDER BY embedding <=> %s::vector
                LIMIT %s;
                """,
                (query_vector, query_vector, limit),
            )
            return [dict(row) for row in cur.fetchall()]
