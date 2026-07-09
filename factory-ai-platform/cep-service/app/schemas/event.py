"""
Event schema for MKZ Factory Monitor CEP service.

Defines the canonical event model following the shared contract:
  event_id, timestamp, asset_id, type, severity, payload

This schema is versioned and JSON/Avro compatible.
"""

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class EventSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"
    EMERGENCY = "emergency"


class EventType(str, Enum):
    # CEP rule events
    CEP_RULE_TRIGGERED = "cep_rule_triggered"
    CEP_PATTERN_MATCH = "cep_pattern_match"

    # Sensor threshold events
    TEMPERATURE_HIGH = "temperature_high"
    TEMPERATURE_LOW = "temperature_low"
    VIBRATION_ANOMALY = "vibration_anomaly"
    CURRENT_ANOMALY = "current_anomaly"
    PRESSURE_ANOMALY = "pressure_anomaly"

    # Production events
    OUTPUT_DROP = "output_drop"
    OUTPUT_SPIKE = "output_spike"
    MACHINE_STOPPED = "machine_stopped"
    MACHINE_STARTED = "machine_started"
    MACHINE_IDLE = "machine_idle"

    # Predictive events (ML)
    PREDICTED_FAILURE = "predicted_failure"
    ANOMALY_DETECTED = "anomaly_detected"
    PREDICTED_MAINTENANCE = "predicted_maintenance"

    # Pattern events
    CASCADING_FAILURE = "cascading_failure"
    MULTI_MACHINE_FAILURE = "multi_machine_failure"
    THERMAL_DRIFT = "thermal_drift"
    VIBRATION_TREND = "vibration_trend"

    # RCA events
    ROOT_CAUSE_IDENTIFIED = "root_cause_identified"
    CORRELATION_FOUND = "correlation_found"

    # System events
    SENSOR_OFFLINE = "sensor_offline"
    SENSOR_ERROR = "sensor_error"
    MODEL_DRIFT = "model_drift"

    # Generic
    RAW_ALARM = "raw_alarm"


class EventPayload(BaseModel):
    """Flexible payload for event type-specific data."""

    # Rule metadata
    rule_id: Optional[str] = None
    rule_name: Optional[str] = None
    rule_version: Optional[str] = None

    # Sensor metrics (when applicable)
    metric: Optional[str] = None
    value: Optional[float] = None
    unit: Optional[str] = None
    threshold: Optional[float] = None
    threshold_breach_duration_sec: Optional[float] = None

    # Production context
    line_code: Optional[str] = None
    machine_code: Optional[str] = None
    shift: Optional[str] = None

    # Comparison values
    baseline_value: Optional[float] = None
    deviation_percent: Optional[float] = None

    # Related events (for pattern matching)
    related_event_ids: list[str] = Field(default_factory=list)
    event_count: Optional[int] = None

    # ML model metadata
    model_name: Optional[str] = None
    model_version: Optional[str] = None
    confidence: Optional[float] = None
    anomaly_score: Optional[float] = None

    # RCA context
    root_cause_asset_id: Optional[str] = None
    root_cause_type: Optional[str] = None
    causal_chain: list[str] = Field(default_factory=list)
    confidence_score: Optional[float] = None

    # Severity transition
    previous_severity: Optional[EventSeverity] = None
    new_severity: Optional[EventSeverity] = None

    # Timestamps
    event_window_start: Optional[datetime] = None
    event_window_end: Optional[datetime] = None

    # Additional arbitrary data
    extra: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(extra="allow")


class Event(BaseModel):
    """
    Canonical event model for the CEP service.

    Shared contract fields (immutable once emitted):
    - event_id: UUID, globally unique
    - timestamp: ISO8601 UTC
    - asset_id: UUID referencing the asset that generated the event
    - type: EventType enum
    - severity: EventSeverity enum
    - payload: EventPayload dict

    Additional fields:
    - source: origin of the event ("cep_rule", "ml_model", "sensor", "api")
    - correlation_id: groups related events across the system
    - metadata: agent/tool provenance
    """

    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    asset_id: str = Field(..., description="UUID of the asset that generated this event")
    asset_name: Optional[str] = Field(None, description="Human-readable asset name")
    line_code: Optional[str] = Field(None, description="Production line code, e.g. LS18")

    type: EventType = Field(..., description="Event type classification")
    severity: EventSeverity = Field(EventSeverity.INFO, description="Event severity")

    payload: EventPayload = Field(default_factory=EventPayload)

    source: str = Field(
        default="cep_service",
        description="Origin source: 'cep_rule', 'ml_model', 'sensor', 'api'",
    )

    correlation_id: Optional[str] = Field(
        None,
        description="Groups related events across the system for tracing",
    )

    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Agent/tool provenance and audit information",
    )

    model_config = ConfigDict(json_schema_extra={
        "example": {
            "event_id": "550e8400-e29b-41d4-a716-446655440000",
            "timestamp": "2026-07-09T10:15:30.123Z",
            "asset_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            "asset_name": "Press-001",
            "line_code": "LS18",
            "type": "temperature_high",
            "severity": "critical",
            "payload": {
                "metric": "temperature",
                "value": 105.3,
                "unit": "°C",
                "threshold": 100.0,
                "threshold_breach_duration_sec": 180.0,
                "rule_id": "temp-high-001",
                "rule_name": "Temperature Exceeds Threshold",
            },
            "source": "cep_rule",
            "correlation_id": "corr-123-abc",
        }
    })

    def to_dict(self) -> dict[str, Any]:
        return self.model_dump(mode="json")

    def to_avro_dict(self) -> dict[str, Any]:
        """Returns a dict compatible with Avro serialization."""
        d = self.model_dump()
        d["timestamp"] = int(self.timestamp.timestamp() * 1000)
        d["severity"] = self.severity.value
        d["type"] = self.type.value
        return d


class EventQuery(BaseModel):
    """Query parameters for filtering events."""

    asset_id: Optional[str] = None
    line_code: Optional[str] = None
    event_types: list[EventType] = Field(default_factory=list)
    severities: list[EventSeverity] = Field(default_factory=list)
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    source: Optional[str] = None
    correlation_id: Optional[str] = None
    limit: int = Field(default=100, le=1000)
    offset: int = Field(default=0, ge=0)
