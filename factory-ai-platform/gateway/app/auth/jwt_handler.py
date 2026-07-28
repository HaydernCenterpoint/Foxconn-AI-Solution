import jwt
from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Dict, Any, List

import os

JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGORITHM = "HS256"

security = HTTPBearer()

def decode_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Dict[str, Any]:
    """Decode and validate the JWT from the Authorization header."""
    if not JWT_SECRET:
        raise RuntimeError("JWT_SECRET must be supplied by the deployment secret manager")
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def verify_scope(user_payload: Dict[str, Any], site: str | None = None, line: str | None = None, machine: str | None = None) -> bool:
    """Check if the user scopes allow accessing specific site, line, or machine.
    
    Roles:
      - Admin: Full access.
      - Supervisor / Engineer / Maintenance / Viewer: Restricted based on token scopes.
    """
    role = user_payload.get("role", "Viewer")
    if role == "Admin":
        return True
        
    # Check site restriction
    if site:
        site_scopes = user_payload.get("siteScopes", [])
        if site_scopes and site not in site_scopes:
            return False
            
    # Check line restriction
    if line:
        line_scopes = user_payload.get("lineScopes", [])
        if line_scopes and line not in line_scopes:
            return False
            
    # Check machine restriction
    if machine:
        machine_scopes = user_payload.get("machineScopes", [])
        if machine_scopes and machine not in machine_scopes:
            return False
            
    return True
