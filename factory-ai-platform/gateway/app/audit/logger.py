import logging
import json
import time
from typing import Dict, Any, Optional

# Structured JSON Logger for Security Audits
audit_logger = logging.getLogger("factory_audit_log")
audit_logger.setLevel(logging.INFO)

# Consistently output as standard json text to stdout or log files
class JSONFormatter(logging.Formatter):
    def format(self, record):
        if isinstance(record.msg, dict):
            return json.dumps(record.msg)
        return json.dumps({"message": record.getMessage()})

handler = logging.StreamHandler()
handler.setFormatter(JSONFormatter())
audit_logger.addHandler(handler)

def log_audit_event(
    user_id: str,
    conversation_id: str,
    agent: str,
    action: str,
    duration_ms: float,
    status: str,
    tool_name: Optional[str] = None,
    parameters: Optional[Dict[str, Any]] = None,
    files_accessed: Optional[list] = None,
    commands_executed: Optional[list] = None,
    error: Optional[str] = None
):
    """Write an audit entry in a structured, parseable format."""
    event = {
        "timestamp": time.time(),
        "userId": user_id,
        "conversationId": conversation_id,
        "agent": agent,
        "action": action,
        "toolName": tool_name,
        "parameters": parameters,
        "filesAccessed": files_accessed or [],
        "commandsExecuted": commands_executed or [],
        "durationMs": duration_ms,
        "status": status,
        "error": error
    }
    audit_logger.info(event)
