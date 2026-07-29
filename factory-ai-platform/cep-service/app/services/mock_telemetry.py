"""
Mock telemetry data generator for development and testing.

Generates realistic factory telemetry following the shared schema:
  (time, asset_id, metric, value)

While waiting for Agent A (TimescaleDB) and Agent C (asset schema),
we use mock data to build and validate the CEP service.
"""

import asyncio
import random
import uuid
from datetime import datetime, timedelta, timezone
from typing import AsyncIterator, Optional

from app.schemas.telemetry import MetricType, SensorConfig, TelemetryPoint


# Mock asset registry — replace with Agent C's schema once available
MOCK_ASSETS: dict[str, SensorConfig] = {
    "press-001-temp": SensorConfig(
        asset_id=str(uuid.uuid4()),
        asset_name="Press-001-Temp",
        line_code="LS18",
        machine_code="Press-001",
        sensor_type=MetricType.TEMPERATURE,
        unit="°C",
        normal_min=60.0,
        normal_max=90.0,
        warning_max=95.0,
        critical_max=100.0,
    ),
    "press-001-vib": SensorConfig(
        asset_id=str(uuid.uuid4()),
        asset_name="Press-001-Vib",
        line_code="LS18",
        machine_code="Press-001",
        sensor_type=MetricType.VIBRATION,
        unit="mm/s",
        normal_min=0.0,
        normal_max=5.0,
        warning_max=7.0,
        critical_max=10.0,
    ),
    "press-001-current": SensorConfig(
        asset_id=str(uuid.uuid4()),
        asset_name="Press-001-Current",
        line_code="LS18",
        machine_code="Press-001",
        sensor_type=MetricType.CURRENT,
        unit="A",
        normal_min=10.0,
        normal_max=30.0,
        warning_max=35.0,
        critical_max=40.0,
    ),
    "press-002-temp": SensorConfig(
        asset_id=str(uuid.uuid4()),
        asset_name="Press-002-Temp",
        line_code="LS18",
        machine_code="Press-002",
        sensor_type=MetricType.TEMPERATURE,
        unit="°C",
        normal_min=60.0,
        normal_max=90.0,
        warning_max=95.0,
        critical_max=100.0,
    ),
    "press-002-vib": SensorConfig(
        asset_id=str(uuid.uuid4()),
        asset_name="Press-002-Vib",
        line_code="LS18",
        machine_code="Press-002",
        sensor_type=MetricType.VIBRATION,
        unit="mm/s",
        normal_min=0.0,
        normal_max=5.0,
        warning_max=7.0,
        critical_max=10.0,
    ),
    "press-003-temp": SensorConfig(
        asset_id=str(uuid.uuid4()),
        asset_name="Press-003-Temp",
        line_code="LS19",
        machine_code="Press-003",
        sensor_type=MetricType.TEMPERATURE,
        unit="°C",
        normal_min=60.0,
        normal_max=90.0,
        warning_max=95.0,
        critical_max=100.0,
    ),
    "conveyor-001": SensorConfig(
        asset_id=str(uuid.uuid4()),
        asset_name="Conveyor-001",
        line_code="LS18",
        machine_code="Conveyor-001",
        sensor_type=MetricType.SPEED,
        unit="m/min",
        normal_min=5.0,
        normal_max=15.0,
        warning_min=3.0,
        warning_max=18.0,
        critical_min=1.0,
        critical_max=20.0,
    ),
    "conveyor-002": SensorConfig(
        asset_id=str(uuid.uuid4()),
        asset_name="Conveyor-002",
        line_code="LS19",
        machine_code="Conveyor-002",
        sensor_type=MetricType.SPEED,
        unit="m/min",
        normal_min=5.0,
        normal_max=15.0,
        warning_min=3.0,
        warning_max=18.0,
        critical_min=1.0,
        critical_max=20.0,
    ),
    "ls18-output": SensorConfig(
        asset_id=str(uuid.uuid4()),
        asset_name="LS18-Output",
        line_code="LS18",
        machine_code="LINE",
        sensor_type=MetricType.OUTPUT_COUNT,
        unit="pcs",
        normal_min=0.0,
        normal_max=1000.0,
    ),
    "ls19-output": SensorConfig(
        asset_id=str(uuid.uuid4()),
        asset_name="LS19-Output",
        line_code="LS19",
        machine_code="LINE",
        sensor_type=MetricType.OUTPUT_COUNT,
        unit="pcs",
        normal_min=0.0,
        normal_max=800.0,
    ),
}

ASSET_INDEX = {k: v for k, v in MOCK_ASSETS.items()}


class MockTelemetryGenerator:
    """
    Generates realistic mock telemetry with configurable anomaly injection.

    Supports:
    - Continuous stream generation (async iterator)
    - Batch historical data generation
    - Anomaly injection (temperature spikes, vibration anomalies, output drops)
    - Diurnal patterns (machine heats up during shift, cools at night)
    """

    def __init__(
        self,
        assets: Optional[dict[str, SensorConfig]] = None,
        inject_anomalies: bool = True,
        anomaly_probability: float = 0.02,
        seed: int = 42,
    ):
        self.assets = assets or ASSET_INDEX
        self.inject_anomalies = inject_anomalies
        self.anomaly_probability = anomaly_probability
        self.rng = random.Random(seed)

        # Track state for realistic continuity
        self._last_values: dict[str, float] = {}
        self._machine_states: dict[str, str] = {
            cfg.machine_code: "running" for cfg in self.assets.values()
        }
        self._anomaly_active: dict[str, bool] = {k: False for k in self.assets}

    def _get_baseline(self, cfg: SensorConfig, ts: datetime) -> float:
        """Compute baseline value with diurnal and shift patterns."""
        hour = ts.hour

        if cfg.sensor_type == MetricType.TEMPERATURE:
            # Machines warm during shift hours (6-22)
            shift_factor = 1.0 if 6 <= hour <= 22 else 0.7
            baseline = (cfg.normal_min + cfg.normal_max) / 2 * shift_factor
            baseline += self.rng.gauss(0, 2)

        elif cfg.sensor_type == MetricType.VIBRATION:
            baseline = (cfg.normal_min + cfg.normal_max) / 2
            # Slight increase during heavy production hours
            if 9 <= hour <= 17:
                baseline *= 1.1
            baseline += self.rng.gauss(0, 0.3)

        elif cfg.sensor_type == MetricType.CURRENT:
            baseline = (cfg.normal_min + cfg.normal_max) / 2
            # Power draw increases mid-shift
            if 10 <= hour <= 16:
                baseline *= 1.15
            baseline += self.rng.gauss(0, 1.0)

        elif cfg.sensor_type == MetricType.SPEED:
            baseline = (cfg.normal_min + cfg.normal_max) / 2
            baseline += self.rng.gauss(0, 0.5)

        elif cfg.sensor_type == MetricType.OUTPUT_COUNT:
            # Production output per sampling interval
            baseline = 50 + self.rng.gauss(0, 5)

        elif cfg.sensor_type == MetricType.CYCLE_TIME:
            baseline = 3.5 + self.rng.gauss(0, 0.2)

        else:
            baseline = cfg.normal_max / 2
            baseline += self.rng.gauss(0, cfg.normal_max * 0.05)

        return baseline

    def _maybe_inject_anomaly(self, key: str, cfg: SensorConfig) -> float:
        """Inject anomaly with configurable probability."""
        if not self.inject_anomalies:
            return 0.0

        if self.rng.random() < self.anomaly_probability:
            self._anomaly_active[key] = True

        if not self._anomaly_active[key]:
            return 0.0

        # Different anomaly types
        anomaly_type = self.rng.choice(["spike", "drift", "drop", "oscillation"])

        if anomaly_type == "spike":
            self._anomaly_active[key] = False
            if cfg.sensor_type == MetricType.TEMPERATURE:
                return self.rng.uniform(15, 25)
            elif cfg.sensor_type == MetricType.VIBRATION:
                return self.rng.uniform(3, 6)
            elif cfg.sensor_type == MetricType.CURRENT:
                return self.rng.uniform(8, 15)

        elif anomaly_type == "drift":
            if cfg.sensor_type == MetricType.TEMPERATURE:
                return 3.0
            elif cfg.sensor_type == MetricType.VIBRATION:
                return 1.5

        elif anomaly_type == "drop":
            if cfg.sensor_type in (MetricType.SPEED, MetricType.OUTPUT_COUNT):
                self._anomaly_active[key] = False
                return -self.rng.uniform(0.3, 0.6) * cfg.normal_max

        return 0.0

    def generate_point(
        self,
        key: str,
        ts: Optional[datetime] = None,
    ) -> TelemetryPoint:
        """Generate a single telemetry point."""
        cfg = self.assets[key]
        ts = ts or datetime.now(timezone.utc)

        baseline = self._get_baseline(cfg, ts)
        anomaly_delta = self._maybe_inject_anomaly(key, cfg)

        # Smooth transitions from last value
        last = self._last_values.get(key, baseline)
        if cfg.sensor_type == MetricType.OUTPUT_COUNT:
            # Count metrics accumulate
            value = baseline
        else:
            # Continuous metrics smooth
            value = last * 0.7 + (baseline + anomaly_delta) * 0.3
            value += self.rng.gauss(0, cfg.normal_max * 0.02)

        # Clamp to reasonable bounds
        if cfg.sensor_type == MetricType.OUTPUT_COUNT:
            value = max(0, value)
        elif cfg.critical_max is not None:
            value = min(value, cfg.critical_max * 1.2)
        if cfg.critical_min is not None:
            value = max(value, cfg.critical_min * 0.5)

        self._last_values[key] = value

        return TelemetryPoint(
            time=ts,
            asset_id=cfg.asset_id,
            asset_name=cfg.asset_name,
            line_code=cfg.line_code,
            metric=cfg.sensor_type.value,
            value=round(value, 3),
            unit=cfg.unit,
            quality="good",
        )

    def generate_batch(
        self,
        start: datetime,
        end: datetime,
        interval_seconds: int = 10,
        keys: Optional[list[str]] = None,
    ) -> list[TelemetryPoint]:
        """Generate a batch of historical telemetry data."""
        keys = keys or list(self.assets.keys())
        points = []
        current = start

        while current <= end:
            for key in keys:
                if key in self.assets:
                    points.append(self.generate_point(key, current))
            current += timedelta(seconds=interval_seconds)

        return points

    async def stream(
        self,
        interval_seconds: float = 1.0,
        keys: Optional[list[str]] = None,
    ) -> AsyncIterator[TelemetryPoint]:
        """Async generator that streams telemetry continuously."""
        keys = keys or list(self.assets.keys())

        while True:
            ts = datetime.now(timezone.utc)
            for key in keys:
                if key in self.assets:
                    yield self.generate_point(key, ts)
            await asyncio.sleep(interval_seconds)

__all__ = ["MockTelemetryGenerator", "MOCK_ASSETS", "ASSET_INDEX"]
