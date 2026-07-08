from typing import Dict, Any
from app.services.bridge_client import run_engineering_task

class EngineeringAgent:
    def __init__(self, scopes: Dict[str, Any]):
        self.scopes = scopes

    async def execute(self, message: str, conversation_id: str) -> str:
        """Forward engineering questions to the Antigravity Bridge."""
        # Simple repository selection mapping
        msg = message.lower()
        if "frontend" in msg or "react" in msg:
            repo = "frontend"
        elif "backend" in msg or "api" in msg:
            repo = "backend"
        elif "plc" in msg:
            repo = "client-plc"
        else:
            repo = "factory-management-system"
            
        result = await run_engineering_task(
            session_id=conversation_id,
            repository=repo,
            task=message,
            mode="analyze",
            allow_write=False,
            allow_commands=True
        )
        
        if not result.get("success"):
            return f"Lỗi phân tích kỹ thuật: {result.get('summary')}"
            
        findings = "\n".join([f"- {f}" for f in result.get("findings", [])])
        files = ", ".join(result.get("filesRead", []))
        
        return (
            f"### Kết quả phân tích kỹ thuật (Antigravity Agent)\n"
            f"* **Tóm tắt**: {result.get('summary')}\n"
            f"* **Tập tin đã quét**: {files}\n"
            f"* **Phát hiện chính**:\n{findings}"
        )
