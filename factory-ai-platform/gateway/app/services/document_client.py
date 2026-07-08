import os
import logging
from typing import Any, Dict, List, Optional
import httpx

logger = logging.getLogger(__name__)

DOCUMENT_SERVICE_URL = os.getenv("DOCUMENT_SERVICE_URL", "http://document-service:8082")


async def search_documents(query: str, limit: int = 5) -> List[Dict[str, Any]]:
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{DOCUMENT_SERVICE_URL}/document/search",
                params={"query": query, "limit": limit},
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("results", [])
    except Exception as exc:
        logger.warning("document-service search failed: %s", exc)
        return []
