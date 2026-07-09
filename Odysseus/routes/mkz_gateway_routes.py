"""
mkz_gateway_routes.py

Expose Factory AI Gateway :8080 (OpenAI-compatible) as a first-class Odysseus route.

Why this exists
---------------
Odysseus's own LLM providers (Anthropic, OpenAI, custom endpoints via model_routes.py)
do not know about the "factory-*" model family. Those models are owned by the
Gateway service at factory-ai-platform/gateway/app, which in turn delegates to:

  * factory-data-agent          -> Backend .NET (PLC, OEE, alarms)
  * factory-document-agent      -> Document service (PDF RAG)
  * factory-report-agent        -> Report service (Docx/Xlsx export)
  * antigravity-engineering-agent -> Antigravity Bridge -> agy CLI
  * factory-auto                -> auto-route by keyword

This module simply proxies Odysseus chat requests to the Gateway's
/v1/chat/completions endpoint, so any Odysseus surface (chat_routes, MCP, tasks,
companion, …) can pick a "factory-*" model and Odysseus will dispatch through
the Gateway.

Endpoints exposed under /api/mkz/gateway:

  GET  /models         -> list factory-* models the Gateway advertises
  GET  /health         -> ping Gateway /health
  POST /chat           -> OpenAI-style chat completion (passthrough)
  GET  /system-info    -> describe the wiring (URL, bearer presence, available models)

Env
---
MKZ_GATEWAY_URL       default http://127.0.0.1:8080
MKZ_GATEWAY_BEARER    optional bearer token. Leave empty when Gateway has
                      AUTH_ENABLED=false (default in dev).
"""

from __future__ import annotations

import logging
import json
import os
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Body, HTTPException, Request
from fastapi.responses import StreamingResponse

logger = logging.getLogger(__name__)

GATEWAY_URL = os.getenv("MKZ_GATEWAY_URL", "http://127.0.0.1:8080").rstrip("/")
GATEWAY_BEARER = os.getenv("MKZ_GATEWAY_BEARER", "").strip()
GATEWAY_TIMEOUT = float(os.getenv("MKZ_GATEWAY_TIMEOUT", "60"))


def _headers() -> Dict[str, str]:
    h = {"Content-Type": "application/json"}
    if GATEWAY_BEARER:
        h["Authorization"] = f"Bearer {GATEWAY_BEARER}"
    return h


async def _gateway_get(path: str) -> Any:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{GATEWAY_URL}{path}", headers=_headers())
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code,
                            detail=exc.response.text or exc.response.reason_phrase)
    except Exception as exc:
        logger.error("Gateway GET %s failed: %s", path, exc)
        raise HTTPException(status_code=502, detail=f"Gateway unreachable: {exc}")


async def _gateway_post_stream(path: str, payload: Dict[str, Any], extra_headers: Optional[Dict[str, str]] = None):
    """Yield Gateway SSE chunks straight to the Odysseus client."""
    headers = {**_headers(), **(extra_headers or {})}
    try:
        async with httpx.AsyncClient(timeout=GATEWAY_TIMEOUT) as client:
            async with client.stream("POST", f"{GATEWAY_URL}{path}",
                                     json=payload, headers=headers) as resp:
                if resp.status_code >= 400:
                    body = await resp.aread()
                    raise HTTPException(status_code=resp.status_code, detail=body.decode("utf-8", "ignore"))
                async for chunk in resp.aiter_bytes():
                    if chunk:
                        yield chunk
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Gateway stream failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Gateway stream error: {exc}")


def setup_mkz_gateway_routes() -> APIRouter:
    router = APIRouter(prefix="/api/mkz/gateway", tags=["MKZ Factory Gateway"])

    def _forward_auth(request) -> Dict[str, str]:
        """Pass through Authorization header from Odysseus client when present.

        Priority:
          1. Caller-supplied Authorization header (browser/curl with their own JWT)
          2. Server-configured MKZ_GATEWAY_BEARER env
        If neither is set, the Gateway will reject (it requires HS256 JWT).
        """
        out: Dict[str, str] = {}
        auth = request.headers.get("authorization") if request else None
        if auth:
            out["Authorization"] = auth
        elif GATEWAY_BEARER:
            out["Authorization"] = f"Bearer {GATEWAY_BEARER}"
        return out

    @router.get("/system-info")
    async def system_info():
        return {
            "gatewayUrl": GATEWAY_URL,
            "bearerConfigured": bool(GATEWAY_BEARER),
            "description": "Factory AI Gateway bridge — exposes factory-* + antigravity-engineering-agent models",
        }

    @router.get("/health")
    async def health():
        try:
            data = await _gateway_get("/health")
            return {"status": "healthy", "gateway": GATEWAY_URL, "gatewayHealth": data}
        except HTTPException as exc:
            return {"status": "unhealthy", "gateway": GATEWAY_URL, "error": exc.detail}

    @router.get("/models")
    async def list_models():
        data = await _gateway_get("/v1/models")
        models: List[Dict[str, Any]] = data.get("data", []) if isinstance(data, dict) else []
        return {
            "gatewayUrl": GATEWAY_URL,
            "count": len(models),
            "models": [
                {
                    "id": m.get("id"),
                    "owned_by": m.get("owned_by"),
                    "object": m.get("object", "model"),
                }
                for m in models
            ],
        }

    @router.post("/chat")
    async def chat(request: Request):
        """OpenAI-compatible passthrough. Forwarded to Gateway /v1/chat/completions.

        Accepted payload shape matches OpenAI:
          { "model": "factory-data-agent",
            "messages": [{"role":"user","content":"…"}],
            "stream": false,
            "temperature": 0.3 }

        Authorization: Bearer <jwt> from the caller is forwarded to the Gateway
        so its HS256 dependency_injector (`decode_token`) validates the caller.
        If no Authorization is sent, the configured MKZ_GATEWAY_BEARER is used.

        Body is read raw so the request stream is consumed exactly once even
        when we forward to the Gateway as a streaming response.
        """
        try:
            raw = await request.body()
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail=f"invalid JSON body: {exc}")
        if "model" not in payload or "messages" not in payload:
            raise HTTPException(status_code=400,
                                detail="payload must include 'model' and 'messages'")

        model: str = payload["model"]
        if not model.startswith("factory-") and model != "antigravity-engineering-agent":
            # Soft guardrail — Gateway accepts any model id, but for clarity we warn.
            logger.info("Forwarding non-factory model %s to Gateway", model)

        stream: bool = bool(payload.get("stream", False))
        forward_payload = {
            "model": model,
            "messages": payload.get("messages", []),
            "temperature": payload.get("temperature", 0.3),
            "stream": stream,
            "user": payload.get("user"),
        }
        fwd_headers = _forward_auth(request)

        if stream:
            return StreamingResponse(
                _gateway_post_stream("/v1/chat/completions", forward_payload, fwd_headers),
                media_type="text/event-stream",
            )

        try:
            headers = {**_headers(), **fwd_headers}
            async with httpx.AsyncClient(timeout=GATEWAY_TIMEOUT) as client:
                resp = await client.post(
                    f"{GATEWAY_URL}/v1/chat/completions",
                    json=forward_payload,
                    headers=headers,
                )
                if resp.status_code >= 400:
                    raise HTTPException(status_code=resp.status_code,
                                        detail=resp.text)
                return resp.json()
        except HTTPException:
            raise
        except Exception as exc:
            logger.error("Gateway chat failed: %s", exc)
            raise HTTPException(status_code=502, detail=f"Gateway chat error: {exc}")

    return router