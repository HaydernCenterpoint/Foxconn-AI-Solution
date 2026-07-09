"""
ML model schemas for predictive alerting.
"""

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class ModelStatus(str, Enum):
    TRAINING = "training"
    DEPLOYED = "deployed"
    DRIFTED = "drifted"
    RETIRED = "retired"


class AnomalyResult(BaseModel):
    """Result from an anomaly detection model."""

    asset_id: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    anomaly_score: float = Field(..., ge=0.0, le=1.0)
    is_anomaly: bool
    threshold: float = Field(default=0.5)

    feature_values: dict[str, float] = Field(default_factory=dict)
    contribution_scores: dict[str, float] = Field(default_factory=dict)

    model_name: str = "isolation_forest_v1"
    model_version: str = "1.0.0"

    severity: Optional[str] = None

    def __init__(self, **data):
        super().__init__(**data)
        if self.anomaly_score > 0.8:
            self.severity = "critical"
        elif self.anomaly_score > 0.6:
            self.severity = "warning"
        elif self.anomaly_score > 0.5:
            self.severity = "info"
        else:
            self.severity = None


class FailurePrediction(BaseModel):
    """Result from a failure prediction model."""

    asset_id: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    failure_probability: float = Field(..., ge=0.0, le=1.0)
    time_to_failure_hours: Optional[float] = Field(None, ge=0.0)

    is_predicted_failure: bool = Field(False)
    confidence: float = Field(..., ge=0.0, le=1.0)

    risk_level: str = Field(
        default="low",
        description="'low', 'medium', 'high', 'critical'",
    )

    contributing_factors: list[str] = Field(default_factory=list)
    feature_importance: dict[str, float] = Field(default_factory=dict)

    model_name: str = "failure_classifier_v1"
    model_version: str = "1.0.0"

    recommended_window_hours: Optional[float] = Field(
        None,
        description="Recommended maintenance window in hours",
    )

    def __init__(self, **data):
        super().__init__(**data)
        p = self.failure_probability
        if p >= 0.85:
            self.risk_level = "critical"
            self.is_predicted_failure = True
        elif p >= 0.6:
            self.risk_level = "high"
            self.is_predicted_failure = True
        elif p >= 0.3:
            self.risk_level = "medium"
        else:
            self.risk_level = "low"


class FeatureVector(BaseModel):
    """
    Engineered feature vector for ML models.
    Computed from rolling windows of telemetry data.
    """

    asset_id: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Time windows
    window_1h: bool = True
    window_24h: bool = True

    # Rolling statistics per metric
    features: dict[str, dict[str, float]] = Field(default_factory=dict)

    # Temperature features
    temp_mean_1h: float = 0.0
    temp_std_1h: float = 0.0
    temp_max_1h: float = 0.0
    temp_trend_1h: float = 0.0

    temp_mean_24h: float = 0.0
    temp_std_24h: float = 0.0
    temp_max_24h: float = 0.0

    # Vibration features
    vib_mean_1h: float = 0.0
    vib_std_1h: float = 0.0
    vib_max_1h: float = 0.0
    vib_trend_1h: float = 0.0

    vib_mean_24h: float = 0.0
    vib_std_24h: float = 0.0
    vib_max_24h: float = 0.0

    # Current features
    curr_mean_1h: float = 0.0
    curr_std_1h: float = 0.0
    curr_max_1h: float = 0.0

    curr_mean_24h: float = 0.0
    curr_std_24h: float = 0.0

    # Derived
    cycle_count_24h: int = 0
    oee_1h: float = 0.0
    oee_24h: float = 0.0

    # Failure history features
    failure_count_7d: int = 0
    avg_repair_time_hours: float = 0.0
    uptime_ratio_7d: float = 1.0

    def to_array(self) -> list[float]:
        return [
            self.temp_mean_1h, self.temp_std_1h, self.temp_max_1h, self.temp_trend_1h,
            self.temp_mean_24h, self.temp_std_24h, self.temp_max_24h,
            self.vib_mean_1h, self.vib_std_1h, self.vib_max_1h, self.vib_trend_1h,
            self.vib_mean_24h, self.vib_std_24h, self.vib_max_24h,
            self.curr_mean_1h, self.curr_std_1h, self.curr_max_1h,
            self.curr_mean_24h, self.curr_std_24h,
            float(self.cycle_count_24h),
            self.oee_1h, self.oee_24h,
            float(self.failure_count_7d),
            self.avg_repair_time_hours,
            self.uptime_ratio_7d,
        ]

    @staticmethod
    def feature_names() -> list[str]:
        return [
            "temp_mean_1h", "temp_std_1h", "temp_max_1h", "temp_trend_1h",
            "temp_mean_24h", "temp_std_24h", "temp_max_24h",
            "vib_mean_1h", "vib_std_1h", "vib_max_1h", "vib_trend_1h",
            "vib_mean_24h", "vib_std_24h", "vib_max_24h",
            "curr_mean_1h", "curr_std_1h", "curr_max_1h",
            "curr_mean_24h", "curr_std_24h",
            "cycle_count_24h",
            "oee_1h", "oee_24h",
            "failure_count_7d",
            "avg_repair_time_hours",
            "uptime_ratio_7d",
        ]
