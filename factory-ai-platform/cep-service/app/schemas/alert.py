"""
Alert schema for the CEP service.

An Alert is the action/notification derived from a triggered rule.
Distinct from Event — Alerts are what get displayed to operators.
"""

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field

from app.schemas.event import EventSeverity, EventType


class AlertStatus(str, Enum):
    ACTIVE = "active"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"
    SUPPRESSED = "suppressed"


class AlertChannel(str, Enum):
    UI = "ui"
    EMAIL = "email"
    SMS = "sms"
    WEBHOOK = "webhook"
    SMS_THIRD_PARTY = "sms_third_party"


class Alert(BaseModel):
    """An alert generated from a triggered CEP rule."""

    alert_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    event_id: str = Field(..., description="Source event that triggered this alert")
    rule_id: str = Field(..., description="Rule that generated this alert")
    rule_name: str = Field(..., description="Human-readable rule name")

    asset_id: str
    asset_name: Optional[str] = None
    line_code: Optional[str] = None

    event_type: EventType
    severity: EventSeverity

    title: str = Field(..., description="Short alert title for display")
    description: str = Field(default="", description="Detailed alert description")

    status: AlertStatus = Field(default=AlertStatus.ACTIVE)

    acknowledged_by: Optional[str] = None
    acknowledged_at: Optional[datetime] = None
    resolved_by: Optional[str] = None
    resolved_at: Optional[datetime] = None

    recommended_actions: list[str] = Field(default_factory=list)
    correlation_id: Optional[str] = None

    payload: dict[str, Any] = Field(default_factory=dict)

    class Config:
        json_schema_extra = {
            "example": {
                "alert_id": "alert-123",
                "rule_id": "temp-high-001",
                "rule_name": "Temperature Exceeds Threshold",
                "event_id": "event-456",
                "asset_id": "a1b2c3d4",
                "line_code": "LS18",
                "event_type": "temperature_high",
                "severity": "critical",
                "title": "Cảnh báo: Nhiệt độ vượt ngưỡng",
                "description": "Nhiệt độ máy Press-001 vượt 100°C trong hơn 2 phút. Giá trị hiện tại: 105.3°C",
                "recommended_actions": [
                    "Kiểm tra hệ thống làm mát",
                    "Dừng máy nếu nhiệt độ > 110°C",
                ],
            }
        }
