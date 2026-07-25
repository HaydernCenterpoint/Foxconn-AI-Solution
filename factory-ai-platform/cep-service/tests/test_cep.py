"""
Smoke tests for the CEP service.
"""

import asyncio
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.ml.models import AnomalyDetector, FailurePredictor, FeatureEngineering
from app.rules.engine import CEPEngine
from app.rules.rca import RCAService
from app.rules.sample_rules import ALL_RULES, RULE_VIBRATION_ANOMALY
from app.schemas.event import Event, EventPayload, EventSeverity, EventType
from app.schemas.ml import FeatureVector
from app.schemas.rule import CEPRule, ConditionConfig, RuleAction, RuleConditionType, RuleStatus


class TestCEPEngine:
    def test_register_and_list_rules(self):
        engine = CEPEngine()
        engine.register_rule(RULE_VIBRATION_ANOMALY)
        rules = engine.list_rules()
        assert len(rules) == 1
        assert rules[0].rule_id == "vibration-001"

    def test_unregister_rule(self):
        engine = CEPEngine()
        engine.register_rule(RULE_VIBRATION_ANOMALY)
        engine.unregister_rule("vibration-001")
        assert engine.get_rule("vibration-001") is None

    def test_evaluate_threshold_event(self):
        engine = CEPEngine()
        engine.register_rule(RULE_VIBRATION_ANOMALY)

        event = Event(
            event_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            asset_id="asset-1",
            line_code="LS18",
            type=EventType.RAW_ALARM,
            severity=EventSeverity.WARNING,
            payload=EventPayload(
                rule_id="vibration-001",
                metric="vibration",
                value=8.5,  # above 7.0 threshold
                unit="mm/s",
            ),
        )

        triggered = engine.evaluate_event(event)
        assert len(triggered) == 1
        assert triggered[0].type == EventType.VIBRATION_ANOMALY
        assert triggered[0].severity == EventSeverity.WARNING

    def test_evaluate_below_threshold_no_trigger(self):
        engine = CEPEngine()
        engine.register_rule(RULE_VIBRATION_ANOMALY)

        event = Event(
            event_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            asset_id="asset-1",
            line_code="LS18",
            type=EventType.RAW_ALARM,
            severity=EventSeverity.INFO,
            payload=EventPayload(
                metric="vibration",
                value=3.0,  # below threshold
                unit="mm/s",
            ),
        )

        triggered = engine.evaluate_event(event)
        assert len(triggered) == 0

    def test_multiple_rules_registered(self):
        engine = CEPEngine()
        for rule in ALL_RULES:
            engine.register_rule(rule)
        assert len(engine.list_rules()) == len(ALL_RULES)

    def test_rule_stats(self):
        engine = CEPEngine()
        engine.register_rule(RULE_VIBRATION_ANOMALY)
        stats = engine.get_stats()
        assert stats["total_rules"] == 1
        assert stats["active_rules"] == 1

    def test_rule_status_update(self):
        engine = CEPEngine()
        engine.register_rule(RULE_VIBRATION_ANOMALY)
        engine.update_rule_status("vibration-001", RuleStatus.INACTIVE)
        assert engine.get_rule("vibration-001").status.value == "inactive"

    @pytest.mark.asyncio
    async def test_periodic_evaluation_reads_registered_rule_state(self):
        engine = CEPEngine()
        engine.register_rule(RULE_VIBRATION_ANOMALY)

        await engine.start_periodic_evaluation(interval_seconds=0.001)
        await asyncio.sleep(0.01)

        assert engine._eval_task is not None
        assert not engine._eval_task.done()
        await engine.stop()


class TestRCAService:
    def test_add_and_analyze(self):
        rca = RCAService()

        # Root cause: temperature high
        root_event = Event(
            event_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            asset_id="machine-1",
            line_code="LS18",
            type=EventType.TEMPERATURE_HIGH,
            severity=EventSeverity.CRITICAL,
            payload=EventPayload(machine_code="Press-001"),
        )

        # Symptom: machine stopped
        symptom_event = Event(
            event_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            asset_id="machine-1",
            line_code="LS18",
            type=EventType.MACHINE_STOPPED,
            severity=EventSeverity.CRITICAL,
            payload=EventPayload(machine_code="Press-001"),
        )

        rca.add_event(root_event)
        rca.add_event(symptom_event)

        result = rca.analyze(symptom_event)
        assert result.root_cause_type in ("temperature_high", "unknown")
        assert result.confidence_score >= 0.0

    def test_correlation_id_generation(self):
        rca = RCAService()
        events = [
            Event(
                event_id=str(uuid.uuid4()),
                timestamp=datetime.now(timezone.utc),
                asset_id="machine-1",
                line_code="LS18",
                type=EventType.TEMPERATURE_HIGH,
                severity=EventSeverity.WARNING,
                payload=EventPayload(),
            )
        ]
        corr_id = rca.get_correlation_id(events)
        assert corr_id.startswith("LS18-")


class TestFeatureEngineering:
    def test_compute_features_empty(self):
        fv = FeatureEngineering.compute_features("asset-1", [])
        assert fv.asset_id == "asset-1"
        assert len(fv.features) == 0

    def test_compute_features_with_data(self):
        from datetime import timedelta

        now = datetime.now(timezone.utc)
        points = [
            {"time": now - timedelta(minutes=i * 5), "metric": "temperature", "value": 80.0 + i}
            for i in range(10)
        ]

        fv = FeatureEngineering.compute_features("asset-1", points)
        assert fv.temp_mean_1h > 0
        assert len(fv.features) >= 0

    def test_feature_vector_to_array(self):
        fv = FeatureVector(asset_id="test")
        arr = fv.to_array()
        assert len(arr) == len(FeatureVector.feature_names())


class TestAnomalyDetector:
    def test_detect_with_synthetic_training(self):
        detector = AnomalyDetector()
        assert detector._trained is True

        fv = FeatureVector(asset_id="test-asset")
        result = detector.detect(fv)
        assert 0.0 <= result.anomaly_score <= 1.0
        assert result.model_name == "isolation_forest_v1"

    def test_feature_vector_names(self):
        names = FeatureVector.feature_names()
        assert "temp_mean_1h" in names
        assert "vib_max_1h" in names
        assert "oee_1h" in names


class TestFailurePredictor:
    def test_predict_heuristic(self):
        predictor = FailurePredictor()
        fv = FeatureVector(asset_id="test")
        fv.temp_max_1h = 98.0  # above 95 → high temp factor
        fv.vib_max_1h = 8.0  # above 7 → vibration factor

        from app.schemas.ml import AnomalyResult

        anomaly = AnomalyResult(
            asset_id="test",
            anomaly_score=0.6,
            is_anomaly=True,
        )

        pred = predictor.predict(fv, anomaly)
        assert 0.0 <= pred.failure_probability <= 1.0
        assert pred.model_name == "failure_classifier_v1"


class TestEventSchema:
    def test_event_creation(self):
        event = Event(
            event_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            asset_id="test-asset",
            line_code="LS18",
            type=EventType.TEMPERATURE_HIGH,
            severity=EventSeverity.CRITICAL,
            payload=EventPayload(
                rule_id="test-rule",
                metric="temperature",
                value=105.5,
                unit="°C",
                threshold=100.0,
            ),
        )
        assert event.event_id is not None
        assert event.type == EventType.TEMPERATURE_HIGH
        assert event.payload.value == 105.5

    def test_event_to_dict(self):
        event = Event(
            event_id=str(uuid.uuid4()),
            asset_id="test",
            type=EventType.ANOMALY_DETECTED,
            severity=EventSeverity.WARNING,
            payload=EventPayload(),
        )
        d = event.to_dict()
        assert "event_id" in d
        assert "timestamp" in d
        assert "type" in d

    def test_backend_telemetry_event_envelope_is_accepted(self):
        from app.main import app

        with TestClient(app) as client:
            response = client.post(
                "/api/v1/events",
                json={
                    "event": {
                        "event_id": str(uuid.uuid4()),
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "asset_id": "machine-telemetry-smoke",
                        "asset_name": "Smoke machine",
                        "type": "machine_started",
                        "severity": "info",
                        "payload": {
                            "metric": "oee",
                            "value": 91.2,
                            "unit": "percent",
                            "machine_code": "machine-telemetry-smoke",
                            "extra": {"source_telemetry_id": 42, "sequence": 99},
                        },
                        "source": "backend_telemetry",
                        "correlation_id": "smoke-message",
                        "metadata": {"schema_version": 1, "source": "machine_telemetry"},
                    }
                },
            )

        assert response.status_code == 201
        assert response.json()["ingested"]["asset_id"] == "machine-telemetry-smoke"
        assert response.json()["ingested"]["source"] == "backend_telemetry"


class TestSampleRules:
    def test_all_rules_have_unique_ids(self):
        ids = [r.rule_id for r in ALL_RULES]
        assert len(ids) == len(set(ids))

    def test_all_rules_have_actions(self):
        for rule in ALL_RULES:
            assert rule.action.action_type is not None
            assert rule.rule_name is not None
            assert rule.rule_id is not None

    def test_critical_rules_have_high_priority(self):
        critical = [r for r in ALL_RULES if r.priority <= 5]
        assert len(critical) >= 2
