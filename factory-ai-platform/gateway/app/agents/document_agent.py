from typing import Dict, Any
from app.services.llm_client import chat_complete

SYSTEM_PROMPT = """Bạn là chuyên gia tra cứu tài liệu kỹ thuật và bảo trì máy móc nhà máy sản xuất.
Các đoạn tài liệu liên quan được cung cấp trong thẻ <data> (nếu không có, hãy nói là chưa có tài liệu được lập chỉ mục).
Hãy trả lời bằng tiếng Việt, nêu rõ nguồn tài liệu, số trang nếu có, và hướng dẫn từng bước cụ thể."""


class DocumentAgent:
    def __init__(self, scopes: Dict[str, Any]):
        self.scopes = scopes

    async def execute(self, message: str, conversation_id: str) -> str:
        from app.services.document_client import search_documents

        chunks = await search_documents(message, limit=5)
        return await chat_complete(
            system_prompt=SYSTEM_PROMPT,
            user_message=message,
            context_data=chunks if chunks else None,
        )
