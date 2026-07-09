"""
CEP API routes.

Provides REST endpoints for:
- Event ingestion and query
- Rule management
- Alert management
- ML inference
- RCA
"""

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel

from app.rules.engine import CEPEngine
from app.rules.rca import RCAResult, RCAService
from app.schemas.alert import Alert, AlertStatus
from app.schemas.event import Event, EventQuery
from app.schemas.ml import AnomalyResult, FailurePrediction, FeatureVector
from app.schemas.rule import CEPRule, RuleStatus

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["CEP"])

# ── Global instances (initialized in main.py) ──────────────────
_cep_engine: CEPEngine | None = None
_rca_service: RCAService | None = None
_event_store: list[Event] = []
_alert_store: list[Alert] = []


def init_router(cep_engine: CEPEngine, rca_service: RCAService) -> None:
    global _cep_engine, _rca_service
    _cep_engine = cep_engine
    _rca_service = rca_service


# ── Request/Response models ───────────────────────────────────


class EventIngestRequest(BaseModel):
    event: Event


class EventIngestResponse(BaseModel):
    ingested: Event
    triggered_events: list[Event]
    alerts: list[Alert]


class RuleListResponse(BaseModel):
    rules: list[CEPRule]
    total: int


class RuleUpdateRequest(BaseModel):
    status: RuleStatus | None = None


class StatsResponse(BaseModel):
    cep: dict[str, Any]
    event_count: int
    alert_count: int


class RCARequest(BaseModel):
    event_id: str | None = None
    target_event: Event | None = None


class RCAResponse(BaseModel):
    rca: RCAResult | None


# ── Event endpoints ────────────────────────────────────────────


@router.post("/events", response_model=EventIngestResponse, status_code=status.HTTP_201_CREATED)
async def ingest_event(req: EventIngestRequest) -> EventIngestResponse:
    """Ingest a raw event into the CEP engine."""
    if _cep_engine is None:
        raise HTTPException(status_code=503, detail="CEP engine not initialized")

    event = req.event
    _event_store.append(event)

    # Evaluate against CEP rules
    triggered = _cep_engine.evaluate_event(event)

    # Create alerts from triggered events
    alerts = []
    for te in triggered:
        alert = _create_alert_from_event(te)
        if alert:
            alerts.append(alert)
            _alert_store.append(alert)

    # Add to RCA history
    if _rca_service:
        _rca_service.add_event(event)
        for te in triggered:
            _rca_service.add_event(te)

    logger.info("Ingested event %s, triggered %d rules", event.event_id, len(triggered))

    return EventIngestResponse(
        ingested=event,
        triggered_events=triggered,
        alerts=alerts,
    )


@router.post("/events/batch", status_code=status.HTTP_201_CREATED)
async def ingest_events_batch(events: list[Event]) -> dict[str, Any]:
    """Ingest multiple events at once."""
    if _cep_engine is None:
        raise HTTPException(status_code=503, detail="CEP engine not initialized")

    all_triggered = []
    all_alerts = []

    for event in events:
        _event_store.append(event)
        triggered = _cep_engine.evaluate_event(event)
        for te in triggered:
            alert = _create_alert_from_event(te)
            if alert:
                all_alerts.append(alert)
        all_triggered.extend(triggered)
        if _rca_service:
            _rca_service.add_event(event)

    _alert_store.extend(all_alerts)

    return {
        "ingested_count": len(events),
        "triggered_count": len(all_triggered),
        "alerts_generated": len(all_alerts),
    }


@router.get("/events", response_model=list[Event])
async def query_events(
    asset_id: str | None = None,
    line_code: str | None = None,
    event_type: str | None = None,
    severity: str | None = None,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    limit: int = Query(default=100, le=1000),
    offset: int = Query(default=0, ge=0),
) -> list[Event]:
    """Query stored events with filters."""
    results = _event_store

    if asset_id:
        results = [e for e in results if e.asset_id == asset_id]
    if line_code:
        results = [e for e in results if e.line_code == line_code]
    if event_type:
        results = [e for e in results if e.type.value == event_type]
    if severity:
        results = [e for e in results if e.severity.value == severity]
    if start_time:
        results = [e for e in results if e.timestamp >= start_time]
    if end_time:
        results = [e for e in results if e.timestamp <= end_time]

    return results[offset : offset + limit]


# ── Rule management endpoints ──────────────────────────────────


@router.get("/rules", response_model=RuleListResponse)
async def list_rules() -> RuleListResponse:
    """List all CEP rules."""
    if _cep_engine is None:
        raise HTTPException(status_code=503, detail="CEP engine not initialized")
    rules = _cep_engine.list_rules()
    return RuleListResponse(rules=rules, total=len(rules))


@router.get("/rules/{rule_id}", response_model=CEPRule)
async def get_rule(rule_id: str) -> CEPRule:
    if _cep_engine is None:
        raise HTTPException(status_code=503, detail="CEP engine not initialized")
    rule = _cep_engine.get_rule(rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail=f"Rule not found: {rule_id}")
    return rule


@router.patch("/rules/{rule_id}", response_model=CEPRule)
async def update_rule(rule_id: str, req: RuleUpdateRequest) -> CEPRule:
    if _cep_engine is None:
        raise HTTPException(status_code=503, detail="CEP engine not initialized")
    if req.status:
        success = _cep_engine.update_rule_status(rule_id, req.status)
        if not success:
            raise HTTPException(status_code=404, detail=f"Rule not found: {rule_id}")
    rule = _cep_engine.get_rule(rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail=f"Rule not found: {rule_id}")
    return rule


# ── Alert endpoints ───────────────────────────────────────────


@router.get("/alerts", response_model=list[Alert])
async def query_alerts(
    asset_id: str | None = None,
    line_code: str | None = None,
    status: AlertStatus | None = None,
    severity: str | None = None,
    limit: int = Query(default=100, le=1000),
    offset: int = Query(default=0, ge=0),
) -> list[Alert]:
    """Query alerts with filters."""
    results = _alert_store

    if asset_id:
        results = [a for a in results if a.asset_id == asset_id]
    if line_code:
        results = [a for a in results if a.line_code == line_code]
    if status:
        results = [a for a in results if a.status == status]
    if severity:
        results = [a for a in results if a.severity.value == severity]

    return sorted(
        results[offset : offset + limit],
        key=lambda a: a.timestamp,
        reverse=True,
    )


@router.patch("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str, user: str = "system") -> Alert:
    for alert in _alert_store:
        if alert.alert_id == alert_id:
            alert.status = AlertStatus.ACKNOWLEDGED
            alert.acknowledged_by = user
            alert.acknowledged_at = datetime.now(timezone.utc)
            return alert
    raise HTTPException(status_code=404, detail=f"Alert not found: {alert_id}")


@router.patch("/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: str, user: str = "system") -> Alert:
    for alert in _alert_store:
        if alert.alert_id == alert_id:
            alert.status = AlertStatus.RESOLVED
            alert.resolved_by = user
            alert.resolved_at = datetime.now(timezone.utc)
            return alert
    raise HTTPException(status_code=404, detail=f"Alert not found: {alert_id}")


# ── RCA endpoint ─────────────────────────────────────────────


@router.post("/rca", response_model=RCAResponse)
async def run_rca(req: RCARequest) -> RCAResponse:
    """Perform root cause analysis on an event."""
    if _rca_service is None:
        raise HTTPException(status_code=503, detail="RCA service not initialized")

    target_event: Event | None = None

    if req.event_id:
        for e in _event_store:
            if e.event_id == req.event_id:
                target_event = e
                break
    elif req.target_event:
        target_event = req.target_event
    else:
        raise HTTPException(
            status_code=400,
            detail="Must provide either event_id or target_event",
        )

    if not target_event:
        raise HTTPException(status_code=404, detail="Target event not found")

    rca = _rca_service.analyze(target_event)
    return RCAResponse(rca=rca)


# ── Stats endpoint ────────────────────────────────────────────


@router.get("/stats", response_model=StatsResponse)
async def get_stats() -> StatsResponse:
    """Get CEP engine statistics."""
    if _cep_engine is None:
        raise HTTPException(status_code=503, detail="CEP engine not initialized")

    return StatsResponse(
        cep=_cep_engine.get_stats(),
        event_count=len(_event_store),
        alert_count=len(_alert_store),
    )


# ── Helper ────────────────────────────────────────────────────


def _create_alert_from_event(event: Event) -> Alert | None:
    """Convert a triggered event into an Alert."""
    if not event.payload.rule_name:
        return None

    title = _generate_alert_title(event)
    description = _generate_alert_description(event)

    return Alert(
        event_id=event.event_id,
        rule_id=event.payload.rule_id or "unknown",
        rule_name=event.payload.rule_name,
        asset_id=event.asset_id,
        asset_name=event.asset_name,
        line_code=event.line_code,
        event_type=event.type,
        severity=event.severity,
        title=title,
        description=description,
        correlation_id=event.correlation_id,
        payload=event.payload.extra or {},
    )


def _generate_alert_title(event: Event) -> str:
    type_titles = {
        "temperature_high": "Nhiệt độ vượt ngưỡng",
        "vibration_anomaly": "Rung động bất thường",
        "current_anomaly": "Dòng điện bất thường",
        "output_drop": "Sản lượng giảm",
        "multi_machine_failure": "Nhiều máy dừng cùng lúc",
        "cascading_failure": "Phát hiện lỗi cascade",
        "thermal_drift": "Nhiệt độ tăng đều",
        "anomaly_detected": "ML phát hiện bất thường",
        "model_dift": "ML model drift",
        "machine_idle": "Máy không hoạt động",
        "cep_rule_triggered": "CEP rule triggered",
    }
    return type_titles.get(
        event.type.value,
        f"Alert: {event.type.value}",
    )


def _generate_alert_description(event: Event) -> str:
    payload = event.payload
    parts = []

    if payload.metric and payload.value is not None:
        unit = payload.unit or ""
        parts.append(f"{payload.metric}: {payload.value:.2f}{unit}")

    if payload.threshold is not None:
        parts.append(f"ngưỡng: {payload.threshold:.2f}")

    if payload.rule_name:
        parts.append(f"rule: {payload.rule_name}")

    return " | ".join(parts) if parts else "No details available"
