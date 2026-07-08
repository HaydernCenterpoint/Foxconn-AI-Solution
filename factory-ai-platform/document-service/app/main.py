from fastapi import FastAPI, UploadFile, File, Form
from typing import List, Optional
import uuid

app = FastAPI(title="Vector Document RAG Service", version="1.0.0")

@app.post("/document/upload")
async def upload_document(
    file: UploadFile = File(...),
    machineCode: Optional[str] = Form(None),
    lineCode: Optional[str] = Form(None),
    documentType: Optional[str] = Form("manual"),
    version: Optional[str] = Form("1.0")
):
    """Stub endpoint for uploading manuals, scanning, and chunking into pgvector."""
    doc_id = f"doc-{uuid.uuid4()}"
    return {
        "success": True,
        "documentId": doc_id,
        "filename": file.filename,
        "metadata": {
            "machineCode": machineCode,
            "lineCode": lineCode,
            "documentType": documentType,
            "version": version
        }
    }

@app.get("/document/search")
async def search_documents(query: str, limit: int = 5):
    """Stub endpoint for querying chunks in pgvector/Qdrant."""
    return {
        "query": query,
        "results": [
            {
                "documentId": "doc-001",
                "machineCode": "LS18-HEATSINK-01",
                "lineCode": "LS18",
                "documentType": "manual",
                "version": "2.4",
                "text": "For E103 errors (Conveyor Jam), check the optical proximity sensors for dirt accumulation.",
                "score": 0.89
            }
        ]
    }

@app.get("/health")
async def health():
    return {"status": "healthy"}
