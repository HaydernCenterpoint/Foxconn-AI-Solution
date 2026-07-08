import httpx
import os
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

BRIDGE_URL = os.getenv("ANTIGRAVITY_BRIDGE_URL", "http://localhost:8081")

async def run_engineering_task(
    session_id: str,
    repository: str,
    task: str,
    mode: str = "analyze",
    allow_write: bool = False,
    allow_commands: bool = True
) -> Dict[str, Any]:
    """Call the antigravity-bridge service to run a task."""
    url = f"{BRIDGE_URL}/agent/run"
    payload = {
        "sessionId": session_id,
        "repository": repository,
        "task": task,
        "mode": mode,
        "allowWrite": allow_write,
        "allowCommands": allow_commands
    }
    
    try:
        async with httpx.AsyncClient(timeout=70.0) as client:
            response = await client.post(url, json=payload)
            if response.status_code == 200:
                return response.json()
            else:
                return {
                    "success": False,
                    "summary": f"Bridge returned status code {response.status_code}: {response.text}",
                    "warnings": ["BRIDGE_ERROR"]
                }
    except Exception as e:
        logger.error(f"Failed to communicate with Antigravity Bridge: {e}")
        return {
            "success": False,
            "summary": f"Failed to connect to Antigravity Bridge at {BRIDGE_URL}: {str(e)}",
            "warnings": ["BRIDGE_CONNECTION_FAILED"]
        }
