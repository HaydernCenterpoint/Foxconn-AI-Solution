"""
CEP Rules Engine — Python-based rule evaluation engine.

This module provides the rule evaluation logic for the CEP service.
Each rule is evaluated against incoming events/telemetry.

Architecture decision: Python-based rules engine (Drools-style)
  - Fast enough for <100 rules at sub-second latency
  - Easy to extend with ML model integration
  - No JVM dependency overhead
  - Migrate to Apache Flink for >1000 rules or multi-node clustering

Pattern types supported:
  - Threshold breach (value > threshold)
  - Duration breach (threshold exceeded for N seconds)
  - N-within-M (N events of type X within M minutes)
  - Deviation (current vs baseline)
  - Cascade (A then B then C within T)
  - ML-based (anomaly score > threshold)
"""

import asyncio
import logging
import threading
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from app.schemas.event import Event, EventPayload, EventSeverity, EventType
from app.schemas.rule import CEPRule, ConditionConfig, RuleConditionType, RuleStatus
from app.schemas.telemetry import TelemetryPoint

logger = logging.getLogger(__name__)


@dataclass
class RuleState:
    """Mutable state tracked by the CEP engine for each rule."""

    rule: CEPRule
    last_eval: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    last_match: Optional[datetime] = None
    match_count: int = 0
    error_count: int = 0
    last_error: Optional[str] = None

    # Event buffer for pattern matching
    event_buffer: list[Event] = field(default_factory=list)
    telemetry_buffer: list[TelemetryPoint] = field(default_factory=list)


class CEPEngine:
    """
    In-process CEP rule evaluation engine.

    Thread-safe, runs rules on a background thread.
    Supports:
    - Sync evaluation on event ingestion
    - Async periodic re-evaluation
    - Event window buffering for pattern rules
    """

    def __init__(self):
        self._rules: dict[str, RuleState] = {}
        self._lock = threading.RLock()
        self._running = False
        self._eval_task: Optional[asyncio.Task] = None

    # ── Rule Management ──────────────────────────────────────────

    def register_rule(self, rule: CEPRule) -> None:
        with self._lock:
            state = RuleState(rule=rule)
            self._rules[rule.rule_id] = state
            logger.info("Registered CEP rule: %s (%s)", rule.rule_name, rule.rule_id)

    def unregister_rule(self, rule_id: str) -> None:
        with self._lock:
            if rule_id in self._rules:
                del self._rules[rule_id]
                logger.info("Unregistered CEP rule: %s", rule_id)

    def get_rule(self, rule_id: str) -> Optional[CEPRule]:
        state = self._rules.get(rule_id)
        return state.rule if state else None

    def list_rules(self) -> list[CEPRule]:
        return [s.rule for s in self._rules.values()]

    def update_rule_status(self, rule_id: str, status: RuleStatus) -> bool:
        with self._lock:
            if rule_id in self._rules:
                self._rules[rule_id].rule.status = status
                return True
        return False

    # ── Evaluation ───────────────────────────────────────────────

    def evaluate_event(self, event: Event) -> list[Event]:
        """
        Evaluate all active rules against an incoming event.
        Returns list of triggered events (new derived events).
        """
        triggered = []
        now = datetime.now(timezone.utc)

        with self._lock:
            for rule_id, state in self._rules.items():
                rule = state.rule

                if rule.status != RuleStatus.ACTIVE:
                    continue

                try:
                    matched = self._evaluate_rule(rule, state, event, now)
                    if matched:
                        triggered_event = self._create_triggered_event(rule, event, matched)
                        if triggered_event:
                            triggered.append(triggered_event)
                            state.match_count += 1
                            state.last_match = now
                            rule.match_count += 1
                            rule.last_match_time = now

                            # Store in pattern buffer
                            state.event_buffer.append(event)
                            self._prune_buffer(state, now)

                except Exception as exc:
                    state.error_count += 1
                    state.last_error = str(exc)
                    rule.last_error = str(exc)
                    logger.warning("Rule %s evaluation error: %s", rule_id, exc)

        return triggered

    def evaluate_telemetry(self, point: TelemetryPoint) -> list[Event]:
        """Evaluate rules against an incoming telemetry point."""
        now = datetime.now(timezone.utc)
        triggered = []

        with self._lock:
            for rule_id, state in self._rules.items():
                rule = state.rule
                if rule.status != RuleStatus.ACTIVE:
                    continue

                cfg = rule.condition_config

                # Check if this telemetry is relevant to the rule
                if cfg.target_metric and cfg.target_metric != point.metric:
                    continue
                if cfg.target_line_code and cfg.target_line_code != point.line_code:
                    continue
                if cfg.target_asset_id and cfg.target_asset_id != point.asset_id:
                    continue

                try:
                    state.telemetry_buffer.append(point)
                    self._prune_telemetry_buffer(state, now)

                    matched = self._evaluate_telemetry_rule(rule, state, point, now)
                    if matched:
                        triggered_event = self._create_telemetry_triggered_event(
                            rule, point, matched
                        )
                        if triggered_event:
                            triggered.append(triggered_event)
                            state.match_count += 1
                            state.last_match = now

                except Exception as exc:
                    state.error_count += 1
                    state.last_error = str(exc)
                    logger.warning("Rule %s telemetry eval error: %s", rule_id, exc)

        return triggered

    # ── Rule Evaluation Logic ────────────────────────────────────

    def _evaluate_rule(
        self,
        rule: CEPRule,
        state: RuleState,
        event: Event,
        now: datetime,
    ) -> Optional[dict[str, Any]]:
        """Evaluate a single rule against an event. Returns match context or None."""
        cfg = rule.condition_config
        cond_type = cfg.condition_type

        if cond_type == RuleConditionType.THRESHOLD_HIGH:
            return self._eval_threshold_high(cfg, event)

        elif cond_type == RuleConditionType.PATTERN_N_WITHIN:
            return self._eval_n_within(cfg, state, event, now)

        elif cond_type == RuleConditionType.PATTERN_CASCADE:
            return self._eval_cascade(cfg, state, event, now)

        elif cond_type == RuleConditionType.ML_ANOMALY_SCORE:
            return self._eval_ml_anomaly(cfg, event)

        elif cond_type == RuleConditionType.COMPOSITE_AND:
            # All sub-conditions must match in window
            matches = [self._evaluate_rule(rule, state, event, now) for rule in rule.evaluation_window_minutes]
            return {"matched": all(matches)} if all(matches) else None

        return None

    def _evaluate_telemetry_rule(
        self,
        rule: CEPRule,
        state: RuleState,
        point: TelemetryPoint,
        now: datetime,
    ) -> Optional[dict[str, Any]]:
        """Evaluate telemetry-specific rule conditions."""
        cfg = rule.condition_config
        cond_type = cfg.condition_type

        if cond_type == RuleConditionType.THRESHOLD_HIGH:
            return self._eval_telemetry_threshold_high(cfg, state, point, now)

        elif cond_type == RuleConditionType.THRESHOLD_BREACH_DURATION:
            return self._eval_duration_breach(cfg, state, point, now)

        elif cond_type == RuleConditionType.PATTERN_TREND:
            return self._eval_trend(cfg, state, point)

        elif cond_type == RuleConditionType.COMPARISON_SAME_HOUR_YESTERDAY:
            return self._eval_same_hour_yesterday(cfg, state, point)

        return None

    def _eval_threshold_high(
        self, cfg: ConditionConfig, event: Event
    ) -> Optional[dict[str, Any]]:
        """Simple threshold: value > threshold."""
        if cfg.threshold_value is None:
            return None
        value = event.payload.value
        if value is not None and value > cfg.threshold_value:
            return {
                "type": "threshold_high",
                "value": value,
                "threshold": cfg.threshold_value,
                "deviation": value - cfg.threshold_value,
                "deviation_pct": ((value - cfg.threshold_value) / cfg.threshold_value * 100)
                if cfg.threshold_value != 0
                else 0,
            }
        return None

    def _eval_telemetry_threshold_high(
        self,
        cfg: ConditionConfig,
        state: RuleState,
        point: TelemetryPoint,
        now: datetime,
    ) -> Optional[dict[str, Any]]:
        """Threshold check on telemetry value."""
        if cfg.threshold_value is None:
            return None

        if point.value > cfg.threshold_value:
            return {
                "type": "telemetry_threshold_high",
                "value": point.value,
                "threshold": cfg.threshold_value,
                "unit": point.unit,
            }
        return None

    def _eval_duration_breach(
        self,
        cfg: ConditionConfig,
        state: RuleState,
        point: TelemetryPoint,
        now: datetime,
    ) -> Optional[dict[str, Any]]:
        """Check if threshold is exceeded for >= min_duration_seconds."""
        if cfg.threshold_value is None or cfg.min_duration_seconds is None:
            return None

        if point.value > cfg.threshold_value:
            # Check historical buffer
            recent_violations = [
                p
                for p in state.telemetry_buffer
                if p.value > cfg.threshold_value
                and (now - p.time).total_seconds() <= cfg.min_duration_seconds
            ]
            if len(recent_violations) >= 2:  # At least 2 points in the duration window
                return {
                    "type": "duration_breach",
                    "value": point.value,
                    "threshold": cfg.threshold_value,
                    "duration_seconds": cfg.min_duration_seconds,
                }
        return None

    def _eval_n_within(
        self,
        cfg: ConditionConfig,
        state: RuleState,
        event: Event,
        now: datetime,
    ) -> Optional[dict[str, Any]]:
        """
        Pattern: N events of type X within M minutes on same line/machine.
        Example: 3 machines fail on LS18 within 5 minutes.
        """
        if cfg.min_count is None or cfg.time_window_minutes is None:
            return None

        event_type_filter = cfg.event_type_filter or event.type.value
        target_machines = cfg.target_machine_codes or []
        target_line = cfg.target_line_code

        window_start = now - timedelta(minutes=cfg.time_window_minutes)
        recent_events = [
            e
            for e in state.event_buffer
            if e.timestamp >= window_start
            and (
                (event_type_filter and e.type.value == event_type_filter)
                or (not event_type_filter and True)
            )
            and (target_line is None or e.line_code == target_line)
        ]

        # Count unique machines in window
        machines_seen = set()
        for e in recent_events:
            mc = e.payload.extra.get("machine_code") or e.payload.machine_code
            if mc:
                machines_seen.add(mc)

        # Add current event's machine
        current_machine = event.payload.extra.get("machine_code") or event.payload.machine_code
        if current_machine:
            machines_seen.add(current_machine)

        if len(machines_seen) >= cfg.min_count:
            return {
                "type": "n_within",
                "machines": list(machines_seen),
                "count": len(machines_seen),
                "window_minutes": cfg.time_window_minutes,
            }
        return None

    def _eval_cascade(
        self,
        cfg: ConditionConfig,
        state: RuleState,
        event: Event,
        now: datetime,
    ) -> Optional[dict[str, Any]]:
        """
        Cascade pattern: A → B → C within T minutes on same line.
        Example: Temperature high → Vibration high → Machine stop.
        """
        window = timedelta(minutes=cfg.time_window_minutes or 10)
        event_type_filter = cfg.event_type_filter

        if not event_type_filter:
            return None

        # Look for precursor events in buffer
        precursors = [
            e
            for e in state.event_buffer
            if e.timestamp >= now - window
            and e.type.value == event_type_filter
        ]

        if precursors:
            return {
                "type": "cascade",
                "precursor_event_id": precursors[-1].event_id,
                "trigger_event_id": event.event_id,
                "cascade_chain": [p.event_id for p in precursors] + [event.event_id],
            }
        return None

    def _eval_ml_anomaly(
        self, cfg: ConditionConfig, event: Event
    ) -> Optional[dict[str, Any]]:
        """ML-based: anomaly score above threshold."""
        if cfg.threshold_value is None:
            return None
        score = event.payload.anomaly_score
        if score is not None and score > cfg.threshold_value:
            return {
                "type": "ml_anomaly",
                "anomaly_score": score,
                "threshold": cfg.threshold_value,
            }
        return None

    def _eval_trend(
        self,
        cfg: ConditionConfig,
        state: RuleState,
        point: TelemetryPoint,
    ) -> Optional[dict[str, Any]]:
        """Detect monotonic trend in telemetry."""
        if len(state.telemetry_buffer) < 5:
            return None

        recent = state.telemetry_buffer[-10:]
        values = [p.value for p in recent]
        if len(values) < 3:
            return None

        # Simple slope detection
        slope = (values[-1] - values[0]) / len(values)
        threshold_slope = cfg.threshold_value or 0.5

        if abs(slope) > threshold_slope:
            direction = "rising" if slope > 0 else "falling"
            return {
                "type": "trend",
                "direction": direction,
                "slope": slope,
                "values": values,
            }
        return None

    def _eval_same_hour_yesterday(
        self,
        cfg: ConditionConfig,
        state: RuleState,
        point: TelemetryPoint,
    ) -> Optional[dict[str, Any]]:
        """Compare current value vs same hour yesterday."""
        baseline = cfg.baseline_value
        if baseline is None:
            return None

        deviation_pct = ((point.value - baseline) / baseline * 100) if baseline != 0 else 0

        if cfg.threshold_value is not None and abs(deviation_pct) > cfg.threshold_value:
            return {
                "type": "same_hour_deviation",
                "current_value": point.value,
                "baseline_value": baseline,
                "deviation_percent": deviation_pct,
            }
        return None

    # ── Event Creation ──────────────────────────────────────────

    def _create_triggered_event(
        self, rule: CEPRule, source_event: Event, match_context: dict[str, Any]
    ) -> Optional[Event]:
        action = rule.action

        event_type_str = action.event_type_to_emit or source_event.type.value
        try:
            event_type = EventType(event_type_str)
        except ValueError:
            event_type = EventType.CEP_RULE_TRIGGERED

        severity_str = action.severity or "warning"
        try:
            severity = EventSeverity(severity_str)
        except ValueError:
            severity = EventSeverity.WARNING

        payload = EventPayload(
            rule_id=rule.rule_id,
            rule_name=rule.rule_name,
            rule_version=rule.version,
            value=match_context.get("value"),
            metric=source_event.payload.metric,
            threshold=match_context.get("threshold"),
            line_code=source_event.line_code,
            machine_code=source_event.payload.machine_code,
            related_event_ids=match_context.get("related_event_ids", []),
            extra={"match_context": match_context, "source_event_id": source_event.event_id},
        )

        return Event(
            event_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            asset_id=source_event.asset_id,
            asset_name=source_event.asset_name,
            line_code=source_event.line_code,
            type=event_type,
            severity=severity,
            payload=payload,
            source="cep_rule",
            correlation_id=source_event.correlation_id,
            metadata={
                "rule_id": rule.rule_id,
                "rule_name": rule.rule_name,
                "triggered_by_event": source_event.event_id,
            },
        )

    def _create_telemetry_triggered_event(
        self, rule: CEPRule, point: TelemetryPoint, match_context: dict[str, Any]
    ) -> Optional[Event]:
        action = rule.action

        event_type_str = action.event_type_to_emit or "telemetry_anomaly"
        try:
            event_type = EventType(event_type_str)
        except ValueError:
            event_type = EventType.CEP_RULE_TRIGGERED

        severity_str = action.severity or "warning"
        try:
            severity = EventSeverity(severity_str)
        except ValueError:
            severity = EventSeverity.WARNING

        payload = EventPayload(
            rule_id=rule.rule_id,
            rule_name=rule.rule_name,
            rule_version=rule.version,
            metric=point.metric,
            value=point.value,
            unit=point.unit,
            threshold=match_context.get("threshold"),
            line_code=point.line_code,
            extra={"match_context": match_context},
        )

        return Event(
            event_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            asset_id=point.asset_id,
            asset_name=point.asset_name,
            line_code=point.line_code,
            type=event_type,
            severity=severity,
            payload=payload,
            source="cep_rule",
            metadata={
                "rule_id": rule.rule_id,
                "rule_name": rule.rule_name,
            },
        )

    # ── Buffer Management ────────────────────────────────────────

    def _prune_buffer(self, state: RuleState, now: datetime) -> None:
        window = timedelta(minutes=state.rule.evaluation_window_minutes)
        state.event_buffer = [
            e for e in state.event_buffer if e.timestamp >= now - window
        ]

    def _prune_telemetry_buffer(self, state: RuleState, now: datetime) -> None:
        window = timedelta(minutes=state.rule.evaluation_window_minutes)
        state.telemetry_buffer = [
            p for p in state.telemetry_buffer if p.time >= now - window
        ]

    # ── Background Periodic Evaluation ───────────────────────────

    async def start_periodic_evaluation(self, interval_seconds: float = 10.0) -> None:
        """Start background periodic rule evaluation."""
        self._running = True
        logger.info("Starting CEP periodic evaluation (interval=%ss)", interval_seconds)

        async def _eval_loop():
            while self._running:
                await asyncio.sleep(interval_seconds)
                now = datetime.now(timezone.utc)
                with self._lock:
                    for rule_id, state in self._rules.items():
                        rule = state.rule
                        if rule.status != RuleStatus.ACTIVE:
                            continue
                        # Re-evaluate pattern rules on schedule
                        if rule.condition_config.condition_type in (
                            RuleConditionType.PATTERN_N_WITHIN,
                            RuleConditionType.PATTERN_CASCADE,
                            RuleConditionType.PATTERN_TREND,
                        ):
                            state.last_eval = now

        self._eval_task = asyncio.create_task(_eval_loop())

    async def stop(self) -> None:
        self._running = False
        if self._eval_task:
            self._eval_task.cancel()
            try:
                await self._eval_task
            except asyncio.CancelledError:
                pass
        logger.info("CEP engine stopped")

    # ── Stats ────────────────────────────────────────────────────

    def get_stats(self) -> dict[str, Any]:
        return {
            "total_rules": len(self._rules),
            "active_rules": sum(
                1 for s in self._rules.values() if s.rule.status == RuleStatus.ACTIVE
            ),
            "total_matches": sum(s.match_count for s in self._rules.values()),
            "total_errors": sum(s.error_count for s in self._rules.values()),
            "rules": [
                {
                    "rule_id": s.rule.rule_id,
                    "rule_name": s.rule.rule_name,
                    "status": s.rule.status.value,
                    "match_count": s.match_count,
                    "error_count": s.error_count,
                    "last_match": (
                        s.last_match.isoformat() if s.last_match else None
                    ),
                    "last_error": s.last_error,
                }
                for s in self._rules.values()
            ],
        }
