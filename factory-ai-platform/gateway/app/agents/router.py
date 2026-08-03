from pydantic import BaseModel
from typing import List

class IntentClassification(BaseModel):
    intent: str
    agents: List[str]
    confidence: float
    requires_realtime: bool
    requires_documents: bool

def classify_intent(message: str) -> IntentClassification:
    """Classify the user intent and select the appropriate agent routing path."""
    msg = message.lower()
    
    # Keyword sets
    data_keywords = [
        "sản lượng", "trạng thái", "downtime", "runtime", "lỗi", 
        "alarm", "availability", "oee", "ca sản xuất", "dây chuyền", 
        "máy nào", "năng suất", "hiệu suất"
    ]
    engineering_keywords = [
        "source code", "bug", "lỗi code", "asp.net", "react", "client plc",
        "reconnect", "exception", "nullreference", "sửa api", "viết migration",
        "kiểm tra repository", "chạy test", "pull request", "git"
    ]
    document_keywords = [
        "manual", "tài liệu", "hướng dẫn", "quy trình", "sơ đồ điện",
        "pdf", "tài liệu bảo trì", "rag", "tra cứu"
    ]
    report_keywords = [
        "viết báo cáo", "xuất báo cáo", "báo cáo ca", "báo cáo ngày",
        "báo cáo tuần", "báo cáo tháng", "docx", "xlsx", "pdf báo cáo"
    ]

    # Calculate match count
    data_score = sum(1 for kw in data_keywords if kw in msg)
    eng_score = sum(1 for kw in engineering_keywords if kw in msg)
    doc_score = sum(1 for kw in document_keywords if kw in msg)
    rep_score = sum(1 for kw in report_keywords if kw in msg)
    
    # Route logic
    max_score = max(data_score, eng_score, doc_score, rep_score)
    
    # Fallback to general agent
    if max_score == 0:
        return IntentClassification(
            intent="general_inquiry",
            agents=["factory-data-agent"],
            confidence=0.80,
            requires_realtime=True,
            requires_documents=False
        )
        
    agents = []
    intent = "general_inquiry"
    
    if data_score == max_score:
        intent = "production_analysis"
        agents.append("factory-data-agent")
    elif eng_score == max_score:
        intent = "code_engineering"
        agents.append("antigravity-engineering-agent")
    elif doc_score == max_score:
        intent = "document_lookup"
        agents.append("factory-document-agent")
    elif rep_score == max_score:
        intent = "report_generation"
        agents.append("factory-report-agent")
        
    # Handle composite requests (e.g. "lấy sản lượng để viết báo cáo")
    if rep_score > 0 and data_score > 0:
        intent = "composite_report_production"
        if "factory-data-agent" not in agents:
            agents.append("factory-data-agent")
        if "factory-report-agent" not in agents:
            agents.append("factory-report-agent")

    return IntentClassification(
        intent=intent,
        agents=agents,
        confidence=0.95 if max_score > 1 else 0.85,
        requires_realtime=intent in ("production_analysis", "composite_report_production"),
        requires_documents=intent == "document_lookup"
    )
