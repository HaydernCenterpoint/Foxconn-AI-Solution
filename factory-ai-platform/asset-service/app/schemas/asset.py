"""Pydantic schemas for Asset API — defines shared contracts.
CRITICAL: asset_id (UUID) is the blocking item for agents A/B/D.
All telemetry and events MUST reference this asset_id.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator


# ===================================================================
# ENUMS
# ===================================================================

class AssetType(str, Enum):
    PLANT   = "plant"
    LINE    = "line"
    MACHINE = "machine"
    SENSOR  = "sensor"


class AssetStatus(str, Enum):
    ACTIVE         = "active"
    INACTIVE       = "inactive"
    MAINTENANCE    = "maintenance"
    DECOMMISSIONED = "decommissioned"


class RelationshipType(str, Enum):
    UPSTREAM      = "upstream"
    DOWNSTREAM    = "downstream"
    MONITORS      = "monitors"
    SPARE_PART    = "spare_part"
    REDUNDANT     = "redundant"


class DocumentRelationship(str, Enum):
    MANUAL        = "manual"
    DRAWING       = "drawing"
    WARRANTY      = "warranty"
    CERTIFICATE   = "certificate"
    REPORT        = "report"
    SPECIFICATION = "specification"
    RELATED       = "related"


# ===================================================================
# REQUEST SCHEMAS
# ===================================================================

class AssetCreateRequest(BaseModel):
    name:           str   = Field(..., min_length=1, max_length=255)
    type:           AssetType
    parent_id:      Optional[uuid.UUID] = None
    external_id:    Optional[str] = Field(None, max_length=255)
    manufacturer:   Optional[str] = Field(None, max_length=255)
    model_number:   Optional[str] = Field(None, max_length=255)
    serial_number:  Optional[str] = Field(None, max_length=255)
    location_zone:  Optional[str] = Field(None, max_length=100)
    location_area:  Optional[str] = Field(None, max_length=100)
    metadata:       Dict[str, Any] = Field(default_factory=dict)
    tags:           List[str] = Field(default_factory=list)
    installed_at:   Optional[datetime] = None

    @field_validator("parent_id")
    @classmethod
    def validate_parent(cls, v: Optional[uuid.UUID], info) -> Optional[uuid.UUID]:
        return v


class AssetUpdateRequest(BaseModel):
    name:          Optional[str] = Field(None, min_length=1, max_length=255)
    status:        Optional[AssetStatus] = None
    external_id:   Optional[str] = Field(None, max_length=255)
    manufacturer:  Optional[str] = Field(None, max_length=255)
    model_number:  Optional[str] = Field(None, max_length=255)
    serial_number: Optional[str] = Field(None, max_length=255)
    location_zone: Optional[str] = Field(None, max_length=100)
    location_area: Optional[str] = Field(None, max_length=100)
    metadata:      Optional[Dict[str, Any]] = None
    tags:          Optional[List[str]] = None
    installed_at:  Optional[datetime] = None


class AssetSearchRequest(BaseModel):
    name:        Optional[str] = None
    type:        Optional[AssetType] = None
    status:      Optional[AssetStatus] = None
    parent_id:   Optional[uuid.UUID] = None
    tag:         Optional[str] = None
    manufacturer: Optional[str] = None
    external_id: Optional[str] = None
    limit:       int = Field(default=50, ge=1, le=500)
    offset:      int = Field(default=0, ge=0)


class AssetTreeRequest(BaseModel):
    root_id:    Optional[uuid.UUID] = None  # null = full tree
    depth:      int = Field(default=3, ge=1, le=10)
    limit:      int = Field(default=1000, ge=1, le=5000)


class RelationshipCreateRequest(BaseModel):
    asset_id:         uuid.UUID
    related_asset_id: uuid.UUID
    relationship_type: RelationshipType
    description:      Optional[str] = None
    metadata:         Dict[str, Any] = Field(default_factory=dict)

    @field_validator("related_asset_id")
    @classmethod
    def no_self_ref(cls, v: uuid.UUID, info) -> uuid.UUID:
        return v


class DocumentLinkRequest(BaseModel):
    asset_id:     uuid.UUID
    document_id:  str = Field(..., min_length=1, max_length=255)
    relationship: DocumentRelationship = DocumentRelationship.RELATED
    title:        Optional[str] = Field(None, max_length=500)
    version:      Optional[str] = Field(None, max_length=50)


class HealthScoreRequest(BaseModel):
    asset_id:   uuid.UUID
    recorded_at: Optional[datetime] = None


# ===================================================================
# RESPONSE SCHEMAS
# ===================================================================

class AssetResponse(BaseModel):
    id:            uuid.UUID
    name:          str
    type:          AssetType
    parent_id:     Optional[uuid.UUID]
    path:          Optional[str]
    status:        AssetStatus
    external_id:   Optional[str]
    manufacturer:  Optional[str]
    model_number:  Optional[str]
    serial_number: Optional[str]
    location_zone: Optional[str]
    location_area: Optional[str]
    metadata:      Dict[str, Any]
    tags:          List[str]
    installed_at:  Optional[datetime]
    created_at:    datetime
    updated_at:    datetime

    class Config:
        from_attributes = True


class AssetTreeNode(AssetResponse):
    children: List["AssetTreeNode"] = Field(default_factory=list)


class AssetListResponse(BaseModel):
    items:  List[AssetResponse]
    total:  int
    limit:  int
    offset: int


class RelationshipResponse(BaseModel):
    id:               uuid.UUID
    asset_id:         uuid.UUID
    related_asset_id: uuid.UUID
    relationship_type: RelationshipType
    description:      Optional[str]
    metadata:         Dict[str, Any]
    created_at:       datetime

    class Config:
        from_attributes = True


class DocumentLinkResponse(BaseModel):
    id:          uuid.UUID
    asset_id:    uuid.UUID
    document_id: str
    relationship: DocumentRelationship
    title:       Optional[str]
    version:     Optional[str]
    uploaded_at:  datetime

    class Config:
        from_attributes = True


class HealthScoreResponse(BaseModel):
    asset_id:        uuid.UUID
    recorded_at:     datetime
    health_score:    float = Field(..., ge=0, le=100)
    uptime_pct:      float
    alarm_frequency: float
    performance_pct: float
    maintenance_overdue: bool
    breakdown: Dict[str, Any] = Field(
        default_factory=dict,
        description="Component scores: uptime=40%, alarm=30%, performance=20%, maintenance=10%"
    )


class HealthScoreHistoryResponse(BaseModel):
    asset_id:  uuid.UUID
    items:     List[HealthScoreResponse]
    total:     int


# ===================================================================
# PAGINATION
# ===================================================================

class PaginatedResponse(BaseModel):
    items:  List[Any]
    total:  int
    limit:  int
    offset: int


# ===================================================================
# ERROR SCHEMAS (RFC 7807)
# ===================================================================

class ProblemDetail(BaseModel):
    type:   str = Field(default="about:blank")
    title:  str
    status: int
    detail: Optional[str] = None
    instance: Optional[str] = None
    extensions: Dict[str, Any] = Field(default_factory=dict)


# Rebuild forward refs
AssetTreeNode.model_rebuild()
