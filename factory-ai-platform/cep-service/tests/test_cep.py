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
from app.rules.sample_rules import (
    ALL_RULES,
    RULE_MULTI_MACHINE_FAILURE,
    RULE_VIBRATION_ANOMALY,
)
from app.schemas.event import Event, EventPayload, EventSeverity, EventType
from app.schemas.ml import FeatureVector
from app.schemas.rule import RuleStatus


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

    def test_n_within_accumulates_events_and_ignores_unconfigured_machines(self):
        engine = CEPEngine()
        engine.register_rule(RULE_MULTI_MACHINE_FAILURE.model_copy(deep=True))

        def machine_stopped(machine_code: str) -> Event:
            return Event(
                timestamp=datetime.now(timezone.utc),
                asset_id=f"asset-{machine_code}",
                line_code="LS18",
                type=EventType.MACHINE_STOPPED,
                severity=EventSeverity.CRITICAL,
                payload=EventPayload(machine_code=machine_code),
            )

        assert engine.evaluate_event(machine_stopped("Press-001")) == []
        assert engine.evaluate_event(machine_stopped("Outside-Allowlist")) == []
        assert engine.evaluate_event(machine_stopped("Press-002")) == []

        triggered = engine.evaluate_event(machine_stopped("Press-003"))

        assert len(triggered) == 1
        assert triggered[0].type == EventType.MULTI_MACHINE_FAILURE
        assert set(triggered[0].payload.extra["match_context"]["machines"]) == {
            "Press-001",
            "Press-002",
            "Press-003",
        }

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

    def test_rca_excludes_future_cross_scope_and_empty_line_candidates(self):
        from datetime import timedelta

        rca = RCAService()
        target_time = datetime.now(timezone.utc)
        candidates = [
            Event(
                event_id="future-same-asset",
                timestamp=target_time + timedelta(minutes=1),
                asset_id="asset-a",
                line_code="line-a",
                type=EventType.TEMPERATURE_HIGH,
                severity=EventSeverity.CRITICAL,
            ),
            Event(
                event_id="past-other-scope",
                timestamp=target_time - timedelta(minutes=1),
                asset_id="asset-b",
                line_code="line-b",
                type=EventType.TEMPERATURE_HIGH,
                severity=EventSeverity.CRITICAL,
            ),
            Event(
                event_id="past-empty-line-other-asset",
                timestamp=target_time - timedelta(minutes=1),
                asset_id="asset-c",
                line_code=None,
                type=EventType.TEMPERATURE_HIGH,
                severity=EventSeverity.CRITICAL,
            ),
        ]
        rca.add_events(candidates)

        scoped_target = Event(
            event_id="target-scoped",
            timestamp=target_time,
            asset_id="asset-a",
            line_code="line-a",
            type=EventType.MACHINE_STOPPED,
            severity=EventSeverity.CRITICAL,
        )
        empty_line_target = Event(
            event_id="target-empty-line",
            timestamp=target_time,
            asset_id="asset-d",
            line_code=None,
            type=EventType.MACHINE_STOPPED,
            severity=EventSeverity.CRITICAL,
        )

        scoped_result = rca.analyze(scoped_target)
        empty_line_result = rca.analyze(empty_line_target)

        assert scoped_result.root_cause_event_id == ""
        assert scoped_result.causal_chain == ["target-scoped"]
        assert empty_line_result.root_cause_event_id == ""
        assert empty_line_result.causal_chain == ["target-empty-line"]

    def test_rca_causal_chain_excludes_unrelated_intermediate_events(self):
        from datetime import timedelta

        rca = RCAService()
        target_time = datetime.now(timezone.utc)
        root = Event(
            event_id="valid-root",
            timestamp=target_time - timedelta(minutes=5),
            asset_id="asset-a",
            line_code="line-a",
            type=EventType.TEMPERATURE_HIGH,
            severity=EventSeverity.CRITICAL,
        )
        unrelated = Event(
            event_id="unrelated-intermediate",
            timestamp=target_time - timedelta(minutes=2),
            asset_id="asset-b",
            line_code="line-b",
            type=EventType.SENSOR_ERROR,
            severity=EventSeverity.CRITICAL,
        )
        target = Event(
            event_id="valid-target",
            timestamp=target_time,
            asset_id="asset-a",
            line_code="line-a",
            type=EventType.MACHINE_STOPPED,
            severity=EventSeverity.CRITICAL,
        )
        rca.add_events([root, unrelated])

        result = rca.analyze(target)

        assert result.root_cause_event_id == "valid-root"
        assert result.causal_chain == ["valid-root", "valid-target"]

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

    def test_rca_api_returns_causal_chain_for_ingested_precursor(self):
        from datetime import timedelta

        from app.main import app

        asset_id = f"machine-{uuid.uuid4()}"
        line_code = f"line-{uuid.uuid4()}"
        root_event_id = str(uuid.uuid4())
        target_event_id = str(uuid.uuid4())
        target_time = datetime.now(timezone.utc)

        with TestClient(app) as client:
            ingest_response = client.post(
                "/api/v1/events",
                json={
                    "event": {
                        "event_id": root_event_id,
                        "timestamp": (target_time - timedelta(minutes=1)).isoformat(),
                        "asset_id": asset_id,
                        "line_code": line_code,
                        "type": "temperature_high",
                        "severity": "critical",
                        "payload": {
                            "metric": "temperature",
                            "value": 105.0,
                            "unit": "celsius",
                        },
                        "source": "rca-api-test",
                    }
                },
            )
            rca_response = client.post(
                "/api/v1/rca",
                json={
                    "target_event": {
                        "event_id": target_event_id,
                        "timestamp": target_time.isoformat(),
                        "asset_id": asset_id,
                        "line_code": line_code,
                        "type": "machine_stopped",
                        "severity": "critical",
                        "payload": {"machine_code": asset_id},
                        "source": "rca-api-test",
                    }
                },
            )

        assert ingest_response.status_code == 201
        assert rca_response.status_code == 200
        result = rca_response.json()["rca"]
        assert result["root_cause_event_id"] == root_event_id
        assert result["root_cause_type"] == "temperature_high"
        assert result["causal_chain"][0] == root_event_id
        assert result["causal_chain"][-1] == target_event_id
        assert result["confidence_score"] == 1.0
        assert result["recommended_actions"]


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

    def test_compute_features_respects_one_and_twenty_four_hour_windows(self):
        from datetime import timedelta

        now = datetime.now(timezone.utc)
        points = [
            {"time": now - timedelta(hours=25), "metric": "temperature", "value": 999.0},
            {"time": now - timedelta(hours=2), "metric": "temperature", "value": 10.0},
            {"time": now - timedelta(minutes=30), "metric": "temperature", "value": 80.0},
            {"time": now, "metric": "temperature", "value": 100.0},
            {"time": now - timedelta(hours=2), "metric": "oee", "value": 0.7},
            {"time": now, "metric": "oee", "value": 0.9},
            {"time": now - timedelta(hours=25), "metric": "output_count", "value": 500.0},
            {"time": now - timedelta(hours=2), "metric": "output_count", "value": 20.0},
            {"time": now, "metric": "output_count", "value": 30.0},
        ]

        fv = FeatureEngineering.compute_features("asset-1", points)

        assert fv.temp_mean_1h == 90.0
        assert fv.temp_max_1h == 100.0
        assert fv.temp_mean_24h == pytest.approx(190.0 / 3.0)
        assert fv.temp_max_24h == 100.0
        assert fv.oee_1h == 0.9
        assert fv.oee_24h == pytest.approx(0.8)
        assert fv.cycle_count_24h == 50
        assert fv.features["temperature"]["mean_1h"] == 90.0

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

    def test_detect_score_distinguishes_inlier_from_extreme_outlier(self):
        detector = AnomalyDetector()
        normal = FeatureVector(
            asset_id="normal",
            temp_mean_1h=75.0,
            temp_std_1h=3.0,
            temp_max_1h=85.0,
            vib_mean_1h=3.5,
            vib_std_1h=0.5,
            vib_max_1h=5.0,
            curr_mean_1h=20.0,
            curr_std_1h=2.0,
            oee_1h=0.85,
            uptime_ratio_7d=1.0,
        )
        extreme = FeatureVector(
            asset_id="extreme",
            temp_mean_1h=180.0,
            temp_std_1h=25.0,
            temp_max_1h=220.0,
            vib_mean_1h=25.0,
            vib_std_1h=8.0,
            vib_max_1h=40.0,
            curr_mean_1h=100.0,
            curr_std_1h=30.0,
            curr_max_1h=150.0,
            oee_1h=0.2,
            uptime_ratio_7d=0.2,
        )

        normal_result = detector.detect(normal)
        extreme_result = detector.detect(extreme)

        assert normal_result.is_anomaly is False
        assert normal_result.anomaly_score < 0.5
        assert extreme_result.is_anomaly is True
        assert extreme_result.anomaly_score > 0.5
        assert extreme_result.anomaly_score > normal_result.anomaly_score

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

    def test_failure_batch_runs_anomaly_detection_when_result_is_omitted(self):
        from app.main import app

        with TestClient(app) as client:
            response = client.post(
                "/api/v1/ml/failure/predict-batch",
                json=[
                    {
                        "asset_id": "batch-asset",
                        "temp_mean_1h": 75.0,
                        "temp_max_1h": 85.0,
                        "vib_mean_1h": 3.5,
                        "vib_max_1h": 5.0,
                        "curr_mean_1h": 20.0,
                        "oee_1h": 0.85,
                    }
                ],
            )

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 1
        assert body["results"][0]["asset_id"] == "batch-asset"
        assert "error" not in body["results"][0]

    def test_failure_batch_fails_when_required_anomaly_detector_is_unavailable(
        self,
        monkeypatch,
    ):
        from app.api import ml_routes
        from app.main import app

        with TestClient(app) as client:
            monkeypatch.setattr(ml_routes, "_anomaly_detector", None)
            response = client.post(
                "/api/v1/ml/failure/predict-batch",
                json=[{"asset_id": "batch-asset"}],
            )

        assert response.status_code == 503
        assert response.json()["detail"] == "ML models not initialized"


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
