import os
import json
import logging
from typing import Any, Dict, List, Optional
import httpx

logger = logging.getLogger(__name__)

LLM_API_URL = os.getenv("LLM_API_URL", "")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")


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
            json.dumps(context_data, ensure_ascii=False, indent=2)
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
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(
                f"{LLM_API_URL.rstrip('/')}/chat/completions",
                json=payload,
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]
    except Exception as exc:
        logger.error("LLM call failed: %s", exc)
        return _fallback_response(user_message, context_data)


def _fallback_response(user_message: str, context_data: Any) -> str:
    """Used when LLM_API_URL is not configured — return raw data as formatted text."""
    if context_data is None:
        return f"[LLM chưa được cấu hình] Không có dữ liệu để trả lời: {user_message}"
    serialized = (
        json.dumps(context_data, ensure_ascii=False, indent=2)
        if not isinstance(context_data, str)
        else context_data
    )
    return f"**Dữ liệu thô (LLM chưa cấu hình):**\n```json\n{serialized}\n```"
