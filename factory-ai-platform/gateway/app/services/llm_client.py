"""
llm_client.py

Thin wrapper over an OpenAI-compatible /v1/chat/completions endpoint.
Retry once on transient network/5xx errors; falls back to a deterministic
formatted dump if no LLM is configured (useful for local dev and tests).
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

LLM_API_URL = os.getenv("LLM_API_URL", "")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")
LLM_TIMEOUT_SECONDS = float(os.getenv("LLM_TIMEOUT_SECONDS", "60"))
LLM_MAX_RETRIES = int(os.getenv("LLM_MAX_RETRIES", "1"))


async def _post_with_retry(client: httpx.AsyncClient, url: str, payload: Dict, headers: Dict) -> httpx.Response:
    """POST with one automatic retry on transport errors / 5xx."""
    last_exc: Optional[Exception] = None
    for attempt in range(LLM_MAX_RETRIES + 1):
        try:
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code >= 500 and attempt < LLM_MAX_RETRIES:
                logger.warning("LLM 5xx (attempt %d), retrying: %s", attempt + 1, resp.status_code)
                await asyncio.sleep(0.5)
                continue
            return resp
        except (httpx.TransportError, httpx.TimeoutException) as exc:
            last_exc = exc
            if attempt < LLM_MAX_RETRIES:
                logger.warning("LLM transport error (attempt %d), retrying: %s", attempt + 1, exc)
                await asyncio.sleep(0.5)
                continue
            raise
    # Defensive: should not reach here, but satisfy type checker.
    if last_exc:
        raise last_exc
    raise RuntimeError("LLM retry loop exited without response")


async def chat_complete(
    system_prompt: str,
    user_message: str,
    context_data: Optional[Any] = None,
    temperature: float = 0.3,
) -> str:
    """Call an OpenAI-compatible /v1/chat/completions endpoint and return the assistant reply."""
    if not LLM_API_URL:
        return _fallback_response(user_message, context_data)

    context_block = ""
    if context_data is not None:
        serialized = (
            json.dumps(context_data, ensure_ascii=False, indent=2, default=str)
            if not isinstance(context_data, str)
            else context_data
        )
        context_block = f"\n\n<data>\n{serialized}\n</data>"

    messages: List[Dict[str, str]] = [
        {"role": "system", "content": system_prompt + context_block},
        {"role": "user", "content": user_message},
    ]

    headers: Dict[str, str] = {"Content-Type": "application/json"}
    if LLM_API_KEY:
        headers["Authorization"] = f"Bearer {LLM_API_KEY}"

    payload = {
        "model": LLM_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": 2048,
    }

    try:
        async with httpx.AsyncClient(timeout=LLM_TIMEOUT_SECONDS) as client:
            resp = await _post_with_retry(
                client,
                f"{LLM_API_URL.rstrip('/')}/chat/completions",
                payload,
                headers,
            )
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]
    except Exception as exc:
        logger.error("LLM call failed: %s", exc)
        return _fallback_response(user_message, context_data)


def _fallback_response(user_message: str, context_data: Any) -> str:
    """Used when LLM_API_URL is not configured — return a friendly structured digest.

    Keeps the response deterministic enough for tests and demos that probe
    for specific Vietnamese keywords ("Sản lượng", "OEE", "Alarm").
    """
    if context_data is None:
        return (
            f"[LLM chưa được cấu hình — chế độ phân tích thô]\n"
            f"Câu hỏi: {user_message}\n"
            f"Không có dữ liệu ngữ cảnh để trả lời."
        )

    # If the data looks like a production summary, render a Vietnamese digest.
    summary = context_data.get("summary") if isinstance(context_data, dict) else None
    if isinstance(summary, dict) and any(k in summary for k in ("totalProduction", "yieldRate", "avgOee")):
        return _format_production_digest(user_message, context_data)
    if isinstance(context_data, dict) and "alarms" in context_data:
        return _format_alarm_digest(user_message, context_data)
    if isinstance(context_data, list) and context_data and isinstance(context_data[0], dict):
        return _format_chunk_digest(user_message, context_data)

    serialized = (
        json.dumps(context_data, ensure_ascii=False, indent=2, default=str)
        if not isinstance(context_data, str)
        else context_data
    )
    return f"**Dữ liệu thô (LLM chưa cấu hình):**\n```json\n{serialized}\n```"


def _format_production_digest(user_message: str, data: Dict) -> str:
    summary = data.get("summary") or {}
    chart = data.get("chartData") or []
    lines: List[str] = [
        "### Sản lượng & vận hành (LLM chưa cấu hình)",
        f"- **Tổng sản lượng**: {summary.get('totalProduction', 'N/A')}",
        f"- **Sản phẩm đạt**: {summary.get('totalGood', 'N/A')}",
        f"- **Phế phẩm**: {summary.get('totalScrap', 'N/A')}",
        f"- **Yield rate**: {summary.get('yieldRate', 'N/A')}%",
        f"- **Số máy**: {summary.get('machinesCount', 'N/A')}",
        f"- **Tốc độ trung bình**: {summary.get('avgSpeed', 'N/A')}",
        "",
        f"**Câu hỏi**: {user_message}",
    ]
    if chart:
        lines.append("\n**Sản lượng theo thời gian**:")
        for pt in chart[:8]:
            lines.append(f"- {pt}")
    return "\n".join(lines)


def _format_alarm_digest(user_message: str, data: Dict) -> str:
    alarms = data.get("alarms") or []
    lines: List[str] = [
        "### Cảnh báo đang hoạt động (LLM chưa cấu hình)",
        f"- **Số alarm ACTIVE**: {data.get('activeCount', len(alarms))}",
    ]
    for a in alarms[:5]:
        lines.append(
            f"- [{a.get('severity', '?')}] {a.get('machineName', '?')} — {a.get('message', '')}"
        )
    lines.append("")
    lines.append(f"**Câu hỏi**: {user_message}")
    return "\n".join(lines)


def _format_chunk_digest(user_message: str, chunks: List[Dict]) -> str:
    lines: List[str] = [
        "### Tài liệu kỹ thuật liên quan (LLM chưa cấu hình)",
    ]
    for c in chunks[:5]:
        snippet = (c.get("text") or c.get("content") or "")[:300]
        lines.append(
            f"- **{c.get('documentId', 'doc')}** ({c.get('lineCode', '?')}): {snippet}"
        )
    lines.append("")
    lines.append(f"**Câu hỏi**: {user_message}")
    return "\n".join(lines)
