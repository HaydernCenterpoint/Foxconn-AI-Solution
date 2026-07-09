"""
Root Cause Analysis service.

Builds event correlation graphs and traces alarms back to root causes.
Integrates with the Factory AI Gateway for natural language explanations.
"""

import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from app.schemas.event import Event, EventSeverity, EventType


@dataclass
class CausalityEdge:
    """Directed edge in the causality graph."""

    from_event_id: str
    to_event_id: str
    relationship: str  # "causes", "precedes", "correlates_with"
    confidence: float  # 0-1


@dataclass
class RCAResult:
    """Root Cause Analysis result."""

    root_cause_event_id: str
    root_cause_type: str
    root_cause_asset_id: str
    root_cause_description: str
    causal_chain: list[str]  # Ordered list of event_ids from root to symptom
    causal_chain_events: list[Event] = field(default_factory=list)
    confidence_score: float = field(default=0.0)
    recommended_actions: list[str] = field(default_factory=list)
    rca_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict[str, Any]:
        return {
            "rca_id": self.rca_id,
            "timestamp": self.timestamp.isoformat(),
            "root_cause_event_id": self.root_cause_event_id,
            "root_cause_type": self.root_cause_type,
            "root_cause_asset_id": self.root_cause_asset_id,
            "root_cause_description": self.root_cause_description,
            "causal_chain": self.causal_chain,
            "causal_chain_events": [
                {
                    "event_id": e.event_id,
                    "type": e.type.value,
                    "timestamp": e.timestamp.isoformat(),
                    "asset_id": e.asset_id,
                    "severity": e.severity.value,
                    "payload": e.payload.extra or {},
                }
                for e in self.causal_chain_events
            ],
            "confidence_score": self.confidence_score,
            "recommended_actions": self.recommended_actions,
        }


class RCAService:
    """
    Root Cause Analysis engine.

    Performs backward tracing from an alarm to identify the root cause event.
    Uses:
    - Temporal proximity (events within N minutes of each other)
    - Causality patterns (known failure chains)
    - Asset hierarchy (upstream sensors are potential root causes)
    """

    # Known causality patterns: trigger_event_type → [potential_causes]
    CAUSALITY_PATTERNS: dict[str, list[str]] = {
        "machine_stopped": [
            "temperature_high",
            "vibration_anomaly",
            "current_anomaly",
            "sensor_error",
        ],
        "temperature_high": [
            "cooling_failure",
            "overload",
            "sensor_error",
        ],
        "vibration_anomaly": [
            "bearing_wear",
            "misalignment",
            "imbalance",
        ],
        "output_drop": [
            "machine_stopped",
            "material_shortage",
            "quality_issue",
        ],
        "cascading_failure": [
            "power_surge",
            "cooling_failure",
            "network_failure",
        ],
    }

    # Recommended actions per root cause type
    RECOMMENDED_ACTIONS: dict[str, list[str]] = {
        "temperature_high": [
            "Kiểm tra hệ thống làm mát (quạt, bơm nước)",
            "Kiểm tra lưu lượng coolant",
            "Giảm tải máy nếu nhiệt độ > 100°C",
        ],
        "vibration_anomaly": [
            "Kiểm tra ổ bạc và bộ truyền động",
            "Kiểm tra độ cân bằng rotor",
            "Align lại motor nếu cần",
        ],
        "current_anomaly": [
            "Kiểm tra mô-tơ và bộ điều khiển",
            "Kiểm tra điện áp nguồn",
            "Tìm hiểu hiện tượng kẹt cơ khí",
        ],
        "sensor_error": [
            "Kiểm tra kết nối cảm biến",
            "Calibrate lại cảm biến",
            "Thay thế cảm biến nếu cần",
        ],
        "power_surge": [
            "Kiểm tra UPS và bộ ổn áp",
            "Kiểm tra nguồn điện nhà máy",
            "Lắp đặt bộ lọc surge nếu chưa có",
        ],
        "cooling_failure": [
            "Kiểm tra bơm nước làm mát",
            "Kiểm tra van điều khiển",
            "Vệ sinh bộ tản nhiệt",
        ],
        "unknown": [
            "Kiểm tra log vận hành gần đây",
            "Tra cứu tài liệu kỹ thuật máy",
            "Liên hệ bộ phận bảo trì cơ khí",
        ],
    }

    def __init__(self, max_trace_window_minutes: int = 30):
        self.max_trace_window = timedelta(minutes=max_trace_window_minutes)
        self._event_history: list[Event] = []
        self._causality_graph: list[CausalityEdge] = []

    def add_event(self, event: Event) -> None:
        """Add an event to the history for RCA tracing."""
        self._event_history.append(event)
        self._prune_old_events()

    def add_events(self, events: list[Event]) -> None:
        for e in events:
            self.add_event(e)

    def _prune_old_events(self) -> None:
        cutoff = datetime.now(timezone.utc) - self.max_trace_window * 2
        self._event_history = [e for e in self._event_history if e.timestamp >= cutoff]

    def analyze(self, target_event: Event) -> RCAResult:
        """
        Perform RCA on a target event.

        Traces backward through the event history to find the root cause.
        """
        # Find candidate precursor events
        candidates = self._find_candidate_precursors(target_event)

        if not candidates:
            return self._no_root_cause_found(target_event)

        # Score each candidate
        scored = []
        for candidate in candidates:
            score = self._score_candidate(candidate, target_event)
            scored.append((score, candidate))

        scored.sort(key=lambda x: x[0], reverse=True)
        best_score, root = scored[0]

        # Build causal chain
        chain = self._build_causal_chain(root, target_event)

        # Get recommended actions
        root_type = self._infer_root_cause_type(root)
        actions = self.RECOMMENDED_ACTIONS.get(
            root_type, self.RECOMMENDED_ACTIONS["unknown"]
        )

        return RCAResult(
            root_cause_event_id=root.event_id,
            root_cause_type=root_type,
            root_cause_asset_id=root.asset_id,
            root_cause_description=(
                f"Nguyên nhân gốc: {root.type.value} trên {root.asset_name or root.asset_id} "
                f"lúc {root.timestamp.strftime('%H:%M:%S')}"
            ),
            causal_chain=[e.event_id for e in chain],
            causal_chain_events=chain,
            confidence_score=best_score,
            recommended_actions=actions,
        )

    def _find_candidate_precursors(self, event: Event) -> list[Event]:
        """Find events that could be root causes of the target event."""
        window_start = event.timestamp - self.max_trace_window

        candidates = []
        for candidate in self._event_history:
            if candidate.timestamp < window_start:
                continue
            if candidate.event_id == event.event_id:
                continue

            # Check causality pattern
            pattern_causes = self.CAUSALITY_PATTERNS.get(event.type.value, [])
            if candidate.type.value in pattern_causes:
                candidates.append(candidate)
                continue

            # Same asset, earlier time
            if candidate.asset_id == event.asset_id and candidate.timestamp < event.timestamp:
                candidates.append(candidate)
                continue

            # Same line, earlier time, higher severity
            if candidate.line_code == event.line_code:
                if candidate.timestamp < event.timestamp:
                    candidates.append(candidate)

        return candidates

    def _score_candidate(
        self, candidate: Event, target: Event
    ) -> float:
        """Score how likely a candidate is the root cause."""
        score = 0.5

        # Same asset = strong signal
        if candidate.asset_id == target.asset_id:
            score += 0.3

        # Direct causality pattern match
        pattern_causes = self.CAUSALITY_PATTERNS.get(target.type.value, [])
        if candidate.type.value in pattern_causes:
            score += 0.2

        # Temporal proximity (closer = higher score)
        time_diff = (target.timestamp - candidate.timestamp).total_seconds() / 60.0
        if time_diff < 5:
            score += 0.2
        elif time_diff < 15:
            score += 0.1

        # Severity (root causes are often high severity)
        severity_weights = {
            EventSeverity.EMERGENCY: 0.15,
            EventSeverity.CRITICAL: 0.1,
            EventSeverity.WARNING: 0.05,
            EventSeverity.INFO: 0.0,
        }
        score += severity_weights.get(candidate.severity, 0.0)

        return min(1.0, score)

    def _build_causal_chain(self, root: Event, target: Event) -> list[Event]:
        """Build ordered causal chain from root to target symptom."""
        chain = [root]

        # Find intermediate events
        window_start = root.timestamp
        window_end = target.timestamp

        intermediates = [
            e
            for e in self._event_history
            if window_start <= e.timestamp <= window_end
            and e.event_id not in (root.event_id, target.event_id)
        ]
        intermediates.sort(key=lambda e: e.timestamp)

        chain.extend(intermediates)
        chain.append(target)

        return chain

    def _infer_root_cause_type(self, event: Event) -> str:
        """Infer the root cause type from an event."""
        type_to_cause = {
            "temperature_high": "temperature_high",
            "vibration_anomaly": "vibration_anomaly",
            "current_anomaly": "current_anomaly",
            "sensor_error": "sensor_error",
            "sensor_offline": "sensor_error",
            "power_surge": "power_surge",
            "cooling_failure": "cooling_failure",
        }
        return type_to_cause.get(event.type.value, "unknown")

    def _no_root_cause_found(self, event: Event) -> RCAResult:
        """Return a 'no root cause found' result."""
        return RCAResult(
            root_cause_event_id="",
            root_cause_type="unknown",
            root_cause_asset_id=event.asset_id,
            root_cause_description="Không tìm được nguyên nhân gốc rễ. Cần kiểm tra thủ công.",
            causal_chain=[event.event_id],
            causal_chain_events=[event],
            confidence_score=0.0,
            recommended_actions=self.RECOMMENDED_ACTIONS["unknown"],
        )

    def get_correlation_id(self, events: list[Event]) -> str:
        """Generate a correlation ID for a set of related events."""
        if not events:
            return str(uuid.uuid4())

        # Use the earliest event's timestamp + line code as seed
        earliest = min(events, key=lambda e: e.timestamp)
        seed = f"{earliest.line_code or 'unknown'}-{earliest.timestamp.strftime('%Y%m%d%H%M')}"
        return seed
