import json
from typing import Dict, Any
from app.services.llm_client import chat_complete

SYSTEM_PROMPT = """Bạn là chuyên gia soạn thảo báo cáo vận hành nhà máy sản xuất.
Dữ liệu sản xuất thực tế được cung cấp trong thẻ <data>. Hãy viết báo cáo ca sản xuất bằng tiếng Việt, có các phần:
1. **Tóm tắt ca** — tổng sản lượng, OEE, yield rate
2. **Phân tích theo giờ/ngày** — giờ cao điểm, giờ thấp điểm
3. **Cảnh báo & sự cố** — nếu có alarm
4. **Khuyến nghị** — 2-3 điểm cải tiến cụ thể
Dùng định dạng markdown có heading và bullet points."""


class ReportAgent:
    def __init__(self, scopes: Dict[str, Any]):
        self.scopes = scopes

    async def execute(self, message: str, conversation_id: str) -> str:
        from app.tools.data_tools import execute_tool
        from app.services.report_client import export_report

        # 1. Fetch production data
        production_data = await execute_tool(
            "get_production_history",
            {"lineCode": "", "startTime": "today", "endTime": "today", "interval": "hour"},
            self.scopes,
        )
        alarm_data = await execute_tool("get_active_alarms", {}, self.scopes)

        context = {
            "production": production_data,
            "alarms": alarm_data,
        }

        # 2. LLM writes the report narrative
        report_text = await chat_complete(
            system_prompt=SYSTEM_PROMPT,
            user_message=message,
            context_data=context,
        )

        # 3. Call report-service to export file (best-effort)
        try:
            summary = production_data.get("summary", {}) if isinstance(production_data, dict) else {}
            download_url = await export_report(
                title=f"Báo cáo vận hành — {conversation_id[:8]}",
                summary=summary,
                chart_data=production_data.get("chartData", []) if isinstance(production_data, dict) else [],
                alarms=alarm_data.get("alarms", []) if isinstance(alarm_data, dict) else [],
                report_text=report_text,
            )
            if download_url:
                report_text += f"\n\n---\n**Tải báo cáo**: [{download_url}]({download_url})"
        except Exception:
            pass

        return report_text
