"""
Telemetry schema for MKZ Factory Monitor.

Defines the telemetry model matching the shared contract:
  (time, asset_id, metric, value)

Agent A / TimescaleDB will own this schema.
This module provides typed Python access for the CEP service.
"""

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class MetricType(str, Enum):
    TEMPERATURE = "temperature"
    VIBRATION = "vibration"
    CURRENT = "current"
    PRESSURE = "pressure"
    SPEED = "speed"
    OUTPUT_COUNT = "output_count"
    CYCLE_TIME = "cycle_time"
    OEE = "oee"
    DOWNTIME_SECONDS = "downtime_seconds"
    PRODUCT_COUNT = "product_count"
    REJECT_COUNT = "reject_count"
    HUMIDITY = "humidity"
    POWER_KW = "power_kw"


class TelemetryPoint(BaseModel):
    """
    Single telemetry measurement point.

    Shared contract schema:
      (time, asset_id, metric, value)
    """

    time: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    asset_id: str = Field(..., description="UUID of the asset/sensor")
    asset_name: Optional[str] = None
    line_code: Optional[str] = Field(None, description="Production line code")

    metric: str = Field(..., description="Metric name (see MetricType)")
    value: float = Field(..., description="Measured value")

    unit: Optional[str] = Field(
        None,
        description="Unit of measurement (°C, mm/s, A, etc.)",
    )

    quality: str = Field(
        default="good",
        description="Data quality flag: 'good', 'uncertain', 'bad'",
    )

    metadata: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(json_schema_extra={
        "example": {
            "time": "2026-07-09T10:15:00Z",
            "asset_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            "asset_name": "Press-001-Temp",
            "line_code": "LS18",
            "metric": "temperature",
            "value": 87.5,
            "unit": "°C",
            "quality": "good",
        }
    })


class TelemetryWindow(BaseModel):
    """
    A window of telemetry readings for batch analysis.
    Used by CEP rules and ML feature engineering.
    """

    asset_id: str
    metric: str
    start_time: datetime
    end_time: datetime

    points: list[TelemetryPoint] = Field(default_factory=list)

    # Pre-computed aggregates (avoid recomputing in rules)
    count: int = 0
    mean: float = 0.0
    std: float = 0.0
    min: float = 0.0
    max: float = 0.0
    last: float = 0.0
    first: float = 0.0

    # Trend indicators
    trend: str = Field(default="stable", description="'rising', 'falling', 'stable'")
    trend_slope: float = 0.0  # degrees per minute

    def add_point(self, point: TelemetryPoint) -> None:
        self.points.append(point)
        self._recompute()

    def _recompute(self) -> None:
        if not self.points:
            return
        values = [p.value for p in self.points]
        import statistics

        self.count = len(values)
        self.mean = statistics.mean(values)
        self.std = statistics.stdev(values) if len(values) > 1 else 0.0
        self.min = min(values)
        self.max = max(values)
        self.last = values[-1]
        self.first = values[0]

        if len(values) > 1:
            dt = (self.points[-1].time - self.points[0].time).total_seconds() / 60.0
            if dt > 0:
                self.trend_slope = (self.last - self.first) / dt
                if self.trend_slope > 0.5:
                    self.trend = "rising"
                elif self.trend_slope < -0.5:
                    self.trend = "falling"
                else:
                    self.trend = "stable"
            else:
                self.trend = "stable"


class TelemetryQuery(BaseModel):
    """Query parameters for fetching telemetry."""

    asset_id: Optional[str] = None
    line_code: Optional[str] = None
    metrics: list[str] = Field(default_factory=list)
    start_time: datetime
    end_time: datetime
    aggregation: str = Field(
        default="raw",
        description="'raw', '1min', '5min', '1h', '1d'",
    )
    limit: int = Field(default=10000, le=100000)


class SensorConfig(BaseModel):
    """Metadata for a sensor/asset."""

    asset_id: str
    asset_name: str
    line_code: str
    machine_code: str
    sensor_type: MetricType
    unit: str
    normal_min: float
    normal_max: float
    warning_min: Optional[float] = None
    warning_max: Optional[float] = None
    critical_min: Optional[float] = None
    critical_max: Optional[float] = None
