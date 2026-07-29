"""
CEP Rule definition schema.

A CEP rule consists of:
- Name, ID, version, description
- Condition logic (AND/OR/NOT temporal patterns)
- Severity assignment
- Window configuration
- Action to execute on match
"""

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class RuleConditionType(str, Enum):
    # Threshold-based
    THRESHOLD_HIGH = "threshold_high"
    THRESHOLD_LOW = "threshold_low"
    THRESHOLD_BREACH_DURATION = "threshold_breach_duration"

    # Pattern-based
    PATTERN_N_WITHIN = "pattern_n_within"  # N events of type X within T minutes
    PATTERN_SEQUENCE = "pattern_sequence"  # A then B then C within T
    PATTERN_CASCADE = "pattern_cascade"  # Machine failure chain
    PATTERN_DEVIATION = "pattern_deviation"  # Value deviation from baseline
    PATTERN_TREND = "pattern_trend"  # Monotonic increase/decrease

    # Comparative
    COMPARISON_SAME_HOUR_YESTERDAY = "comparison_same_hour_yesterday"
    COMPARISON_ROLLING_AVG = "comparison_rolling_avg"

    # ML-based
    ML_ANOMALY_SCORE = "ml_anomaly_score"
    ML_PREDICTED_FAILURE = "ml_predicted_failure"

    # Composite
    COMPOSITE_AND = "composite_and"
    COMPOSITE_OR = "composite_or"
    COMPOSITE_NOT = "composite_not"


class RuleStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    ERROR = "error"
    SUSPENDED = "suspended"


class RuleAction(BaseModel):
    """Action to execute when a rule matches."""

    action_type: str = Field(
        default="emit_event",
        description="Action type: 'emit_event', 'notify', 'escalate', 'auto_fix'",
    )
    event_type_to_emit: Optional[str] = None
    severity: Optional[str] = None
    message_template: Optional[str] = None
    webhook_url: Optional[str] = None
    notify_roles: list[str] = Field(default_factory=list)
    extra: dict[str, Any] = Field(default_factory=dict)


class ConditionConfig(BaseModel):
    """Configuration for a single condition within a rule."""

    condition_type: RuleConditionType

    # Target
    target_metric: Optional[str] = None
    target_asset_id: Optional[str] = None
    target_line_code: Optional[str] = None
    target_machine_codes: list[str] = Field(default_factory=list)

    # Threshold values
    threshold_value: Optional[float] = None
    threshold_unit: Optional[str] = None

    # Duration (for breach conditions)
    min_duration_seconds: Optional[float] = None
    max_duration_seconds: Optional[float] = None

    # Pattern parameters
    event_type_filter: Optional[str] = None
    min_count: Optional[int] = None
    max_count: Optional[int] = None
    time_window_minutes: Optional[float] = None

    # Severity map
    severity_mapping: dict[str, str] = Field(default_factory=dict)

    # Sub-conditions (for composite rules)
    sub_conditions: list["ConditionConfig"] = Field(default_factory=list)


class CEPRule(BaseModel):
    """
    A CEP rule definition.

    Each rule has:
    - Trigger condition(s) evaluated against incoming events
    - A time window during which events are considered
    - An action fired on match
    """

    rule_id: str = Field(..., description="Unique rule identifier")
    rule_name: str = Field(..., description="Human-readable rule name")
    description: str = Field(default="", description="Rule purpose and logic description")

    version: str = Field(default="1.0.0")
    status: RuleStatus = Field(default=RuleStatus.ACTIVE)

    # Condition
    condition_type: RuleConditionType
    condition_config: ConditionConfig

    # Window
    evaluation_window_minutes: float = Field(
        default=5.0,
        description="How far back to look for matching events",
    )
    evaluation_interval_seconds: float = Field(
        default=10.0,
        description="How often to re-evaluate this rule",
    )

    # Action
    action: RuleAction = Field(default_factory=RuleAction)

    # Priority and tags
    priority: int = Field(default=50, description="1=highest, 100=lowest")
    tags: list[str] = Field(default_factory=list)

    # Audit
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: str = Field(default="system")

    # Metrics
    match_count: int = Field(default=0, description="Total times this rule matched")
    last_match_time: Optional[datetime] = None
    last_error: Optional[str] = None

    def matches(self, event: dict[str, Any]) -> bool:
        """
        Evaluate this rule against an event dict.
        Override in subclasses for complex logic.
        """
        cfg = self.condition_config
        asset_id = event.get("asset_id", "")
        line_code = event.get("line_code", "")

        # Target filter
        if cfg.target_line_code and line_code != cfg.target_line_code:
            return False
        if cfg.target_asset_id and asset_id != cfg.target_asset_id:
            return False
        if cfg.target_machine_codes:
            machine_code = event.get("payload", {}).get("machine_code", "")
            if machine_code not in cfg.target_machine_codes:
                return False

        return True

    model_config = ConfigDict(json_schema_extra={
        "example": {
            "rule_id": "temp-high-001",
            "rule_name": "Temperature Exceeds Threshold",
            "description": "Triggers when temperature exceeds 100°C for more than 2 minutes",
            "condition_type": "threshold_breach_duration",
            "condition_config": {
                "condition_type": "threshold_breach_duration",
                "target_metric": "temperature",
                "threshold_value": 100.0,
                "threshold_unit": "°C",
                "min_duration_seconds": 120.0,
            },
            "action": {
                "action_type": "emit_event",
                "event_type_to_emit": "temperature_high",
                "severity": "critical",
            },
            "priority": 10,
            "evaluation_window_minutes": 5.0,
        }
    })
