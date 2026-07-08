from __future__ import annotations

import logging
import uuid
from io import BytesIO
from typing import Dict, List, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pypdf import PdfReader

from app.db.pgvector_client import initialize_schema, insert_chunks, search_chunks

logger = logging.getLogger(__name__)
app = FastAPI(title="Vector Document RAG Service", version="2.0.0")


@app.on_event("startup")
def startup() -> None:
    initialize_schema()


def _chunk_text(text: str, chunk_size: int = 500, overlap: int = 100) -> List[str]:
    cleaned = " ".join((text or "").split())
    if not cleaned:
        return []

    chunks: List[str] = []
    start = 0
    step = max(chunk_size - overlap, 1)
    while start < len(cleaned):
        chunks.append(cleaned[start : start + chunk_size])
        start += step
    return chunks


def _extract_pdf_chunks(content: bytes) -> List[Dict]:
    reader = PdfReader(BytesIO(content))
    chunks: List[Dict] = []
    chunk_index = 0
    for page_number, page in enumerate(reader.pages, start=1):
        page_text = page.extract_text() or ""
        for chunk in _chunk_text(page_text):
            chunks.append(
                {
                    "page_number": page_number,
                    "chunk_index": chunk_index,
                    "content": chunk,
                }
            )
            chunk_index += 1
    return chunks


@app.post("/document/upload")
async def upload_document(
    file: UploadFile = File(...),
    machineCode: Optional[str] = Form(None),
    lineCode: Optional[str] = Form(None),
    documentType: Optional[str] = Form("manual"),
    version: Optional[str] = Form("1.0"),
):
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    filename = file.filename or "document.pdf"
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF uploads are supported")

    document_id = f"doc-{uuid.uuid4()}"
    try:
        chunks = _extract_pdf_chunks(content)
        inserted = insert_chunks(
            document_id=document_id,
            filename=filename,
            machine_code=machineCode,
            line_code=lineCode,
            document_type=documentType,
            version=version,
            chunks=chunks,
        )
    except Exception as exc:
        logger.exception("Document upload failed")
        raise HTTPException(status_code=500, detail=f"Document indexing failed: {exc}")

    return {
        "success": True,
        "documentId": document_id,
        "filename": filename,
        "chunksIndexed": inserted,
        "metadata": {
            "machineCode": machineCode,
            "lineCode": lineCode,
            "documentType": documentType,
            "version": version,
        },
    }


@app.get("/document/search")
async def search_documents(query: str, limit: int = 5):
    if not query.strip():
        raise HTTPException(status_code=400, detail="query is required")

    try:
        results = search_chunks(query, limit=max(1, min(limit, 20)))
    except Exception as exc:
        logger.exception("Document search failed")
        raise HTTPException(status_code=500, detail=f"Document search failed: {exc}")

    return {"query": query, "results": results}


@app.get("/health")
async def health():
    return {"status": "healthy"}
