"""JWT Authentication & Role-Based Access Control middleware.
Sprint C4: Access Control & Hardening.

Role hierarchy:
  Admin       → full access
  Supervisor  → read/write, no delete
  Engineer    → read/write assets, no user management
  Maintenance → read assets + update maintenance metadata
  Viewer      → read-only

Scope-based access (from architecture.md):
  siteScopes: restrict to specific physical factories
  lineScopes: restrict to specific assembly lines
  machineScopes: restrict to specific machine stations
"""
from __future__ import annotations

import os
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Annotated, Callable, List, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel

JWT_SECRET = os.environ.get("JWT_SECRET", "factory-jwt-secret-key-1234-long-enough-32bytes")
JWT_ALGORITHM = "HS256"


class Role(str, Enum):
    ADMIN       = "Admin"
    SUPERVISOR  = "Supervisor"
    ENGINEER    = "Engineer"
    MAINTENANCE = "Maintenance"
    VIEWER      = "Viewer"


@dataclass
class TokenClaims:
    sub:      str            # User ID
    role:     Role
    site_scopes:  List[str] = field(default_factory=list)
    line_scopes:  List[str] = field(default_factory=list)
    machine_scopes: List[str] = field(default_factory=list)


class CurrentUser(BaseModel):
    user_id:  uuid.UUID
    role:     Role
    site_scopes:  List[str] = []
    line_scopes:  List[str] = []
    machine_scopes: List[str] = []

    def has_scope_for_asset(self, asset_type: str, asset_external_id: Optional[str] = None) -> bool:
        """Check if user has scope to access asset of given type."""
        if self.role == Role.ADMIN:
            return True

        if asset_type == "plant":
            return bool(self.site_scopes)
        if asset_type == "line":
            # Check line scopes
            if not self.line_scopes:
                return False
            if not asset_external_id:
                return True
            return asset_external_id in self.line_scopes
        if asset_type in ("machine", "sensor"):
            if not self.machine_scopes:
                return False
            if not asset_external_id:
                return True
            return asset_external_id in self.machine_scopes

        return False

    def can_write(self) -> bool:
        return self.role in (Role.ADMIN, Role.SUPERVISOR, Role.ENGINEER, Role.MAINTENANCE)

    def can_delete(self) -> bool:
        return self.role in (Role.ADMIN, Role.SUPERVISOR)

    def can_manage_users(self) -> bool:
        return self.role == Role.ADMIN

    def can_update_health(self) -> bool:
        return self.role in (Role.ADMIN, Role.SUPERVISOR, Role.MAINTENANCE)


security = HTTPBearer(auto_error=False)


def decode_token(token: str) -> TokenClaims:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return TokenClaims(
            sub=payload["sub"],
            role=Role(payload["role"]),
            site_scopes=payload.get("siteScopes", []),
            line_scopes=payload.get("lineScopes", []),
            machine_scopes=payload.get("machineScopes", []),
        )
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(security)] = None,
) -> CurrentUser:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication",
            headers={"WWW-Authenticate": "Bearer"},
        )

    claims = decode_token(credentials.credentials)
    try:
        return CurrentUser(
            user_id=uuid.UUID(claims.sub),
            role=claims.role,
            site_scopes=claims.site_scopes,
            line_scopes=claims.line_scopes,
            machine_scopes=claims.machine_scopes,
        )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID in token",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_optional_user(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(security)] = None,
) -> Optional[CurrentUser]:
    if credentials is None:
        return None
    try:
        claims = decode_token(credentials.credentials)
        return CurrentUser(
            user_id=uuid.UUID(claims.sub),
            role=claims.role,
            site_scopes=claims.site_scopes,
            line_scopes=claims.line_scopes,
            machine_scopes=claims.machine_scopes,
        )
    except Exception:
        return None


def require_roles(*roles: Role):
    """Dependency factory for endpoints requiring specific roles."""
    async def checker(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This action requires one of: {[r.value for r in roles]}",
            )
        return user
    return checker


def require_write():
    """Require user has write permissions."""
    async def checker(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if not user.can_write():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Write access denied for your role",
            )
        return user
    return checker


def require_delete():
    """Require user has delete permissions."""
    async def checker(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if not user.can_delete():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Delete access denied for your role",
            )
        return user
    return checker
