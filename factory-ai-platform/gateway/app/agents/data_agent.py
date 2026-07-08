import re
import json
from typing import Dict, Any
from app.tools.data_tools import execute_tool
from app.services.llm_client import chat_complete

SYSTEM_PROMPT = """Bạn là chuyên gia phân tích vận hành nhà máy sản xuất (Manufacturing Operations Analyst).
Dữ liệu thực tế từ hệ thống được cung cấp trong thẻ <data>. Hãy phân tích và trả lời bằng tiếng Việt, ngắn gọn, có số liệu cụ thể.
- Nếu có sản lượng: nêu tổng, so sánh ca/giờ, nhận xét xu hướng
- Nếu có alarm: liệt kê máy bị lỗi, mức độ nghiêm trọng, đề xuất ưu tiên xử lý
- Nếu có bottleneck: nêu tên máy, OEE, khuyến nghị
- Trả lời dạng markdown có bullet points và số liệu"""


def _extract_line_code(message: str) -> str:
    """Extract a line code from message, e.g. 'LS18', 'LINE_A', 'dây chuyền A'.

    Recognised patterns (case-insensitive):
      - LS12, LS1234   (2–4 digits)
      - LINE 3, LINE-3, LINE_3, LINE_A, LINE3
    """
    m = re.search(r"(?i)\b(LS\d{2,4}|LINE[\s_-]?\w+)\b", message)
    if m:
        return m.group(1).upper().replace(" ", "").replace("-", "").replace("_", "")
    return ""


def _select_tool(message: str) -> str:
    msg = message.lower()
    if any(k in msg for k in ["nghẽn", "bottleneck", "chậm nhất", "tắc"]):
        return "find_bottleneck_machine"
    if any(k in msg for k in ["alarm", "cảnh báo", "lỗi máy", "sự cố"]):
        return "get_active_alarms"
    if any(k in msg for k in ["tổng quan", "overview", "dashboard", "summary"]):
        return "get_dashboard_summary"
    # Default: production history
    return "get_production_history"


class FactoryDataAgent:
    def __init__(self, scopes: Dict[str, Any]):
        self.scopes = scopes

    async def execute(self, message: str, conversation_id: str) -> str:
        tool_name = _select_tool(message)
        line_code = _extract_line_code(message)

        args: Dict[str, Any] = {}
        if tool_name == "get_production_history":
            args = {
                "lineCode": line_code,
                "startTime": "today",
                "endTime": "today",
                "interval": "day" if "tuần" in message.lower() or "tháng" in message.lower() else "hour",
            }
        elif tool_name in ("get_active_alarms", "find_bottleneck_machine"):
            args = {"lineCode": line_code}

        result = await execute_tool(tool_name, args, self.scopes)

        if "error" in result:
            return f"Lỗi truy vấn dữ liệu vận hành: {result.get('message', result['error'])}"

        return await chat_complete(
            system_prompt=SYSTEM_PROMPT,
            user_message=message,
            context_data=result,
        )
