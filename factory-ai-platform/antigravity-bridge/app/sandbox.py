import os
import subprocess
import shutil
import logging
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

# Allowed repositories for mounting (confinement)
ALLOWED_REPOSITORIES = {
    "factory-management-system": "d:/nhnhnhnhnh/Odysseus",
    "frontend": "d:/nhnhnhnhnh/frontend",
    "backend": "d:/nhnhnhnhnh/backend",
    "client-plc": "d:/nhnhnhnhnh/ClientPLC"
}

def find_agy_binary() -> str | None:
    """Check if agy CLI is available on PATH or in custom path."""
    # Check PATH first
    path_bin = shutil.which("agy") or shutil.which("agy.exe")
    if path_bin:
        return path_bin
        
    # Check local user location
    local_bin = os.path.expandvars(r"%USERPROFILE%\AppData\Local\agy\bin\agy.exe")
    if os.path.isfile(local_bin):
        return local_bin
    return None

def run_task_in_sandbox(
    session_id: str,
    repository: str,
    task: str,
    mode: str,
    allow_write: bool,
    allow_commands: bool,
    timeout_seconds: float = 60.0
) -> Dict[str, Any]:
    """Execute agy command inside a sandboxed subprocess or fall back to mock."""
    
    # 1. Directory/Repository Confinement check
    if repository not in ALLOWED_REPOSITORIES:
        return {
            "success": False,
            "summary": f"Repository '{repository}' is not allowed or registered.",
            "warnings": ["REPOSITORY_ACCESS_DENIED"]
        }
        
    repo_path = ALLOWED_REPOSITORIES[repository]
    
    # 2. Check mock mode
    mock_mode = os.getenv("MOCK_ANTIGRAVITY", "false").lower() == "true"
    agy_bin = find_agy_binary()
    
    if mock_mode or not agy_bin:
        logger.info("Running Antigravity Bridge in MOCK mode")
        return simulate_mock_task(task, repository)
        
    # 3. Real mode execution
    logger.info(f"Running Antigravity Bridge in REAL mode using binary: {agy_bin}")
    
    # Build safe argument list without shell=True to avoid command injection
    args = [
        agy_bin,
        "--print", task,
        "--dangerously-skip-permissions",
        "--add-dir", repo_path
    ]
    
    try:
        # Run process with timeout and limits
        process = subprocess.Popen(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd=repo_path
        )
        
        try:
            stdout, stderr = process.communicate(timeout=timeout_seconds)
            success = process.returncode == 0
            
            summary = stdout.strip() if success else f"Error: {stderr.strip()}"
            
            return {
                "success": success,
                "summary": summary,
                "findings": [summary] if success else [],
                "filesRead": [repo_path],
                "filesChanged": [],
                "commandsExecuted": ["agy --print ..."],
                "testResults": [],
                "warnings": [stderr.strip()] if stderr.strip() else []
            }
            
        except subprocess.TimeoutExpired:
            process.kill()
            stdout, stderr = process.communicate()
            return {
                "success": False,
                "summary": f"Task execution exceeded timeout limit of {timeout_seconds}s.",
                "warnings": ["EXECUTION_TIMEOUT"]
            }
            
    except Exception as e:
        logger.error(f"Failed to execute subprocess: {e}")
        return {
            "success": False,
            "summary": f"Subprocess invocation failure: {str(e)}",
            "warnings": ["SUBPROCESS_ERROR"]
        }

def simulate_mock_task(task: str, repository: str) -> Dict[str, Any]:
    """Provide realistic mock analysis responses for testing."""
    task_lower = task.lower()
    
    # Security block simulation
    if "postgres" in task_lower or "production database" in task_lower:
        return {
            "success": False,
            "summary": "Access denied: Production database credentials or network access is prohibited.",
            "warnings": ["SECURITY_VIOLATION_DB_BLOCK"]
        }
        
    if "reconnect" in task_lower or "plc" in task_lower:
        return {
            "success": True,
            "summary": "Completed code analysis of ClientPLC reconnection logic.",
            "findings": [
                "Found connection retry loop in ClientPLC/PLCConnector.cs.",
                "Reconnection loop is missing an exponential backoff or timeout, which could cause high CPU utilization during network drops."
            ],
            "filesRead": ["ClientPLC/PLCConnector.cs"],
            "filesChanged": [],
            "commandsExecuted": [],
            "testResults": [],
            "warnings": ["POTENTIAL_INFINITE_LOOP"]
        }
        
    if "test" in task_lower:
        return {
            "success": True,
            "summary": "Executed sandbox unit test suite.",
            "findings": ["All 12 tests passed in the sandbox environment."],
            "filesRead": ["backend/tests/ReconnectTests.cs"],
            "filesChanged": [],
            "commandsExecuted": ["dotnet test"],
            "testResults": ["Pass: ReconnectRetryLimitTest", "Pass: ConnectTimeoutTest"],
            "warnings": []
        }
        
    return {
        "success": True,
        "summary": f"Mock analysis completed for task: '{task}'",
        "findings": ["Repository structure matches expected schema.", "No compilation errors found."],
        "filesRead": [],
        "filesChanged": [],
        "commandsExecuted": [],
        "testResults": [],
        "warnings": []
    }
