from fastapi import APIRouter, Depends, Request, HTTPException
from fastapi.responses import StreamingResponse
from app.schemas.openai import ChatCompletionRequest, ChatCompletionResponse, ChatCompletionChoice, ChatMessage
from app.auth.jwt_handler import decode_token
from app.agents.router import classify_intent
from app.agents.data_agent import FactoryDataAgent
from app.agents.engineering_agent import EngineeringAgent
from app.agents.document_agent import DocumentAgent
from app.agents.report_agent import ReportAgent
from app.audit.logger import log_audit_event
import time
import json
import uuid
from typing import Dict, Any

router = APIRouter()

AVAILABLE_MODELS = [
    {"id": "factory-auto", "object": "model", "created": 1719878400, "owned_by": "factory-ai"},
    {"id": "factory-data-agent", "object": "model", "created": 1719878400, "owned_by": "factory-ai"},
    {"id": "factory-document-agent", "object": "model", "created": 1719878400, "owned_by": "factory-ai"},
    {"id": "factory-report-agent", "object": "model", "created": 1719878400, "owned_by": "factory-ai"},
    {"id": "antigravity-engineering-agent", "object": "model", "created": 1719878400, "owned_by": "factory-ai"}
]

@router.get("/v1/models")
async def get_models():
    """List all available models in the platform."""
    return {"object": "list", "data": AVAILABLE_MODELS}

@router.post("/v1/chat/completions")
async def create_chat_completion(
    request_data: ChatCompletionRequest,
    request: Request,
    user_payload: Dict[str, Any] = Depends(decode_token)
):
    """OpenAI-compatible Chat Completion endpoint routing to specialized agents."""
    start_time = time.time()
    
    # Generate unique IDs
    completion_id = f"chatcmpl-{uuid.uuid4()}"
    conversation_id = request_data.user or f"conv-{uuid.uuid4()}"
    
    # Extract message content
    user_message = ""
    for msg in request_data.messages:
        if msg.role == "user":
            user_message = msg.content or ""
            
    # 1. Classify intent and select target agents
    intent_data = classify_intent(user_message)
    selected_agents = intent_data.agents
    
    # If a specific model was requested (e.g. factory-data-agent), override the router selection
    if request_data.model in [m["id"] for m in AVAILABLE_MODELS] and request_data.model != "factory-auto":
        selected_agents = [request_data.model]
        
    responses = []
    agent_names = []
    
    # 2. Invoke the selected agents sequentially
    try:
        for agent_name in selected_agents:
            agent_names.append(agent_name)
            
            if agent_name == "factory-data-agent":
                agent = FactoryDataAgent(scopes=user_payload)
            elif agent_name == "antigravity-engineering-agent":
                agent = EngineeringAgent(scopes=user_payload)
            elif agent_name == "factory-document-agent":
                agent = DocumentAgent(scopes=user_payload)
            elif agent_name == "factory-report-agent":
                agent = ReportAgent(scopes=user_payload)
            else:
                continue
                
            res_text = await agent.execute(user_message, conversation_id)
            responses.append(res_text)
            
        combined_text = "\n\n".join(responses) if responses else "Tôi không thể xác định Agent phù hợp để trả lời câu hỏi này."
        
        status = "success"
        error_msg = None
        
    except Exception as e:
        status = "error"
        error_msg = str(e)
        combined_text = f"Đã xảy ra lỗi hệ thống khi xử lý yêu cầu: {error_msg}"
        
    duration_ms = (time.time() - start_time) * 1000.0
    
    # 3. Log structured audit event
    log_audit_event(
        user_id=user_payload.get("sub", "unknown"),
        conversation_id=conversation_id,
        agent=",".join(agent_names),
        action="chat_completion",
        duration_ms=duration_ms,
        status=status,
        parameters={"model": request_data.model, "intent": intent_data.intent},
        error=error_msg
    )
    
    if request_data.stream:
        # Yield Server-Sent Events (SSE) stubs
        async def stream_generator():
            # Send initial role block
            chunk_start = {
                "id": completion_id,
                "object": "chat.completion.chunk",
                "created": int(start_time),
                "model": request_data.model,
                "choices": [{"index": 0, "delta": {"role": "assistant"}, "finish_reason": None}]
            }
            yield f"data: {json.dumps(chunk_start)}\n\n"
            
            # Yield content block in chunks
            chunk_content = {
                "id": completion_id,
                "object": "chat.completion.chunk",
                "created": int(start_time),
                "model": request_data.model,
                "choices": [{"index": 0, "delta": {"content": combined_text}, "finish_reason": "stop"}]
            }
            yield f"data: {json.dumps(chunk_content)}\n\n"
            yield "data: [DONE]\n\n"
            
        return StreamingResponse(stream_generator(), media_type="text/event-stream")
        
    # Non-streaming response format
    return ChatCompletionResponse(
        id=completion_id,
        created=int(start_time),
        model=request_data.model,
        choices=[
            ChatCompletionChoice(
                index=0,
                message=ChatMessage(role="assistant", content=combined_text)
            )
        ],
        usage={
            "prompt_tokens": len(user_message) // 4 + 1,
            "completion_tokens": len(combined_text) // 4 + 1,
            "total_tokens": (len(user_message) + len(combined_text)) // 4 + 2
        }
    )
