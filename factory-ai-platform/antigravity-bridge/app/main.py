from fastapi import FastAPI, HTTPException, Body
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from app.sandbox import run_task_in_sandbox

app = FastAPI(title="Antigravity Bridge Service", version="1.0.0")

class AgentRunRequest(BaseModel):
    sessionId: str = Field(..., description="Unique conversation session ID")
    repository: str = Field(..., description="Repository name to mount/confine to")
    task: str = Field(..., description="Prompt task description for the engineering agent")
    mode: str = Field("analyze", description="Execution mode: 'analyze' or 'patch'")
    allowWrite: bool = Field(False, description="Whether code changes/patches are permitted")
    allowCommands: bool = Field(True, description="Whether executing command line stubs is allowed")

class AgentRunResponse(BaseModel):
    success: bool
    summary: str
    findings: List[str] = []
    filesRead: List[str] = []
    filesChanged: List[str] = []
    commandsExecuted: List[str] = []
    testResults: List[str] = []
    warnings: List[str] = []

@app.post("/agent/run", response_model=AgentRunResponse)
async def run_agent(request: AgentRunRequest):
    """Execute the task in sandbox."""
    try:
        # Run with default timeout of 60 seconds
        result = run_task_in_sandbox(
            session_id=request.sessionId,
            repository=request.repository,
            task=request.task,
            mode=request.mode,
            allow_write=request.allowWrite,
            allow_commands=request.allowCommands,
            timeout_seconds=60.0
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sandbox execution error: {str(e)}")

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
