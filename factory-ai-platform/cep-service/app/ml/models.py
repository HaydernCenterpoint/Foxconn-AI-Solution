"""
ML models for predictive alerting.

Provides:
- Anomaly detection (Isolation Forest)
- Failure prediction classifier
- Feature engineering pipeline
- Inference service (FastAPI-compatible)
"""

import logging
import os
import pickle
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

from app.schemas.ml import AnomalyResult, FailurePrediction, FeatureVector

logger = logging.getLogger(__name__)

MODELS_DIR = Path(__file__).parent.parent.parent / "models"
MODELS_DIR.mkdir(exist_ok=True)


class AnomalyDetector:
    """
    Isolation Forest-based anomaly detector.

    Trains on normal operating data and flags deviations.
    Zero-shot capable: generates synthetic baseline if no training data available.
    """

    def __init__(self, model_name: str = "isolation_forest_v1", version: str = "1.0.0"):
        self.model_name = model_name
        self.version = version
        self.model: Optional[IsolationForest] = None
        self.scaler = StandardScaler()
        self._trained = False
        self._load_or_train()

    def _load_or_train(self) -> None:
        model_path = MODELS_DIR / f"{self.model_name}_{self.version}.pkl"
        scaler_path = MODELS_DIR / f"{self.model_name}_scaler_{self.version}.pkl"

        if model_path.exists() and scaler_path.exists():
            try:
                with open(model_path, "rb") as f:
                    self.model = pickle.load(f)
                with open(scaler_path, "rb") as f:
                    self.scaler = pickle.load(f)
                self._trained = True
                logger.info("Loaded %s from disk", model_path)
                return
            except Exception as exc:
                logger.warning("Failed to load model, retraining: %s", exc)

        self._train_synthetic()
        self._save()

    def _train_synthetic(self) -> None:
        """
        Train on synthetic normal data when no real data is available.
        This enables the service to run immediately for development.
        """
        logger.info("Training Isolation Forest on synthetic baseline data")

        # Generate realistic "normal" operating data
        np.random.seed(42)
        n_samples = 1000

        data = {
            "temp_mean_1h": np.random.normal(75, 10, n_samples),
            "temp_std_1h": np.random.normal(3, 1, n_samples),
            "temp_max_1h": np.random.normal(85, 8, n_samples),
            "temp_trend_1h": np.random.normal(0, 0.5, n_samples),
            "vib_mean_1h": np.random.normal(3.5, 1, n_samples),
            "vib_std_1h": np.random.normal(0.5, 0.2, n_samples),
            "vib_max_1h": np.random.normal(5, 1.5, n_samples),
            "curr_mean_1h": np.random.normal(20, 5, n_samples),
            "curr_std_1h": np.random.normal(2, 0.5, n_samples),
            "oee_1h": np.random.normal(0.85, 0.05, n_samples),
        }

        # Add derived features
        feature_names = FeatureVector.feature_names()
        X = np.column_stack([data.get(fn, np.random.normal(0, 0.1, n_samples)) for fn in feature_names])

        # Clip to positive values
        X = np.clip(X, 0, None)

        # Scale
        X_scaled = self.scaler.fit_transform(X)

        # Train Isolation Forest
        self.model = IsolationForest(
            n_estimators=100,
            contamination=0.05,  # 5% expected anomalies
            random_state=42,
            n_jobs=-1,
        )
        self.model.fit(X_scaled)
        self._trained = True

        logger.info("Isolation Forest trained on %d synthetic samples", n_samples)

    def _save(self) -> None:
        model_path = MODELS_DIR / f"{self.model_name}_{self.version}.pkl"
        scaler_path = MODELS_DIR / f"{self.model_name}_scaler_{self.version}.pkl"
        try:
            with open(model_path, "wb") as f:
                pickle.dump(self.model, f)
            with open(scaler_path, "wb") as f:
                pickle.dump(self.scaler, f)
            logger.info("Saved model to %s", model_path)
        except Exception as exc:
            logger.warning("Failed to save model: %s", exc)

    def detect(self, features: FeatureVector) -> AnomalyResult:
        """
        Run anomaly detection on a feature vector.

        Returns an AnomalyResult with score, classification, and contributing features.
        """
        if not self._trained or self.model is None:
            return AnomalyResult(
                asset_id=features.asset_id,
                anomaly_score=0.0,
                is_anomaly=False,
                threshold=0.5,
                model_name=self.model_name,
                model_version=self.version,
            )

        X = np.array(features.to_array()).reshape(1, -1)
        X_scaled = self.scaler.transform(X)

        # anomaly_score: higher = more anomalous (0-1 range approximation)
        raw_score = self.model.decision_function(X_scaled)
        # Convert to 0-1 range where 1 = most anomalous
        anomaly_score = 1.0 - (raw_score - raw_score.min()) / (raw_score.max() - raw_score.min() + 1e-10)
        anomaly_score = float(np.clip(anomaly_score[0], 0.0, 1.0))

        is_anomaly = self.model.predict(X_scaled)[0] == -1

        # Compute feature contributions (simplified: abs deviation from mean)
        feature_names = FeatureVector.feature_names()
        X_orig = self.scaler.inverse_transform(X_scaled)
        contributions = {
            fn: abs(float(X_orig[0][i] - self.scaler.mean_[i]))
            for i, fn in enumerate(feature_names)
        }
        # Normalize
        max_contrib = max(contributions.values()) if contributions else 1.0
        if max_contrib > 0:
            contributions = {k: v / max_contrib for k, v in contributions.items()}

        result = AnomalyResult(
            asset_id=features.asset_id,
            anomaly_score=anomaly_score,
            is_anomaly=is_anomaly,
            threshold=0.5,
            feature_values={fn: features.to_array()[i] for i, fn in enumerate(feature_names)},
            contribution_scores=contributions,
            model_name=self.model_name,
            model_version=self.version,
        )
        return result


class FailurePredictor:
    """
    Failure prediction model.

    Trains on historical failure data to predict:
    - Probability of failure in next 1 hour
    - Contributing factors
    - Recommended maintenance window

    Currently uses a heuristic scoring approach.
    Replace with trained classifier when labeled failure data is available.
    """

    def __init__(self, model_name: str = "failure_classifier_v1", version: str = "1.0.0"):
        self.model_name = model_name
        self.version = version
        self._trained = False

    def predict(self, features: FeatureVector, anomaly_result: AnomalyResult) -> FailurePrediction:
        """
        Generate a failure prediction based on features and anomaly score.

        Uses a heuristic scoring model until trained classifier data is available.
        """
        score = 0.0
        factors: list[str] = []

        # Anomaly score contribution
        score += anomaly_result.anomaly_score * 0.4

        # Temperature contribution
        if features.temp_max_1h > 95:
            score += 0.3
            factors.append("Nhiệt độ cao (max 1h > 95°C)")
        if features.temp_trend_1h > 1.0:
            score += 0.2
            factors.append("Nhiệt độ tăng nhanh")

        # Vibration contribution
        if features.vib_max_1h > 7.0:
            score += 0.25
            factors.append("Rung động cao (max 1h > 7mm/s)")

        # OEE contribution (low OEE = higher failure risk)
        if features.oee_1h < 0.75:
            score += 0.15
            factors.append(f"OEE thấp ({features.oee_1h:.0%})")

        # Failure history contribution
        if features.failure_count_7d > 2:
            score += 0.2
            factors.append(f"Nhiều lần lỗi gần đây ({features.failure_count_7d} lần/7 ngày)")

        # Clip to [0, 1]
        failure_probability = min(1.0, max(0.0, score))
        confidence = 0.7 if anomaly_result.is_anomaly else 0.5

        # Estimate time to failure
        if failure_probability > 0.8:
            time_to_failure_hours = 0.5  # 30 minutes
            window_hours = 1.0
        elif failure_probability > 0.6:
            time_to_failure_hours = 2.0  # 2 hours
            window_hours = 4.0
        elif failure_probability > 0.3:
            time_to_failure_hours = 8.0
            window_hours = 12.0
        else:
            time_to_failure_hours = None
            window_hours = None

        result = FailurePrediction(
            asset_id=features.asset_id,
            failure_probability=failure_probability,
            time_to_failure_hours=time_to_failure_hours,
            is_predicted_failure=failure_probability > 0.6,
            confidence=confidence,
            contributing_factors=factors,
            feature_importance={
                "anomaly_score": anomaly_result.anomaly_score,
                "temp_max": features.temp_max_1h,
                "vib_max": features.vib_max_1h,
                "oee": features.oee_1h,
                "failure_count_7d": float(features.failure_count_7d),
            },
            model_name=self.model_name,
            model_version=self.version,
            recommended_window_hours=window_hours,
        )
        return result


class FeatureEngineering:
    """
    Feature engineering pipeline for ML models.

    Converts raw telemetry windows into feature vectors.
    """

    @staticmethod
    def compute_features(
        asset_id: str,
        telemetry_points: list[dict[str, Any]],
        failure_history: int = 0,
    ) -> FeatureVector:
        """
        Compute a FeatureVector from a list of telemetry point dicts.

        telemetry_points: list of dicts with keys: time, metric, value
        """
        if not telemetry_points:
            return FeatureVector(asset_id=asset_id)

        # Group by metric
        by_metric: dict[str, list[tuple[datetime, float]]] = {}
        for p in telemetry_points:
            metric = p.get("metric", "unknown")
            by_metric.setdefault(metric, []).append((p["time"], p["value"]))

        fv = FeatureVector(asset_id=asset_id)

        for metric, values in by_metric.items():
            values.sort(key=lambda x: x[0])
            vals = [v for _, v in values]
            times = [t for t, _ in values]

            import statistics

            mean = statistics.mean(vals) if vals else 0
            std = statistics.stdev(vals) if len(vals) > 1 else 0
            mx = max(vals) if vals else 0

            # Compute trend (simple linear slope)
            trend = 0.0
            if len(vals) > 1 and len(times) > 1:
                dt = (times[-1] - times[0]).total_seconds() / 60.0
                if dt > 0:
                    trend = (vals[-1] - vals[0]) / dt

            # Assign to correct FeatureVector fields based on metric
            if metric == "temperature":
                fv.temp_mean_1h = mean
                fv.temp_std_1h = std
                fv.temp_max_1h = mx
                fv.temp_trend_1h = trend
            elif metric == "vibration":
                fv.vib_mean_1h = mean
                fv.vib_std_1h = std
                fv.vib_max_1h = mx
                fv.vib_trend_1h = trend
            elif metric == "current":
                fv.curr_mean_1h = mean
                fv.curr_std_1h = std
                fv.curr_max_1h = mx
            elif metric == "oee":
                fv.oee_1h = mean
            elif metric == "output_count":
                fv.cycle_count_24h = int(sum(vals))

        fv.failure_count_7d = failure_history

        return fv
