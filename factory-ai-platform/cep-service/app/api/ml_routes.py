"""
ML Inference API routes.

Provides endpoints for:
- Anomaly detection inference
- Failure prediction
- Feature computation
"""

import logging
from typing import Any, cast

from fastapi import APIRouter, HTTPException

from app.ml.models import AnomalyDetector, FailurePredictor, FeatureEngineering
from app.schemas.ml import AnomalyResult, FailurePrediction, FeatureVector
from app.schemas.telemetry import TelemetryPoint

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/ml", tags=["ML"])

# Initialize ML models (lazy — trained on startup)
_anomaly_detector: AnomalyDetector | None = None
_failure_predictor: FailurePredictor | None = None


def init_ml() -> None:
    global _anomaly_detector, _failure_predictor
    _anomaly_detector = AnomalyDetector()
    _failure_predictor = FailurePredictor()
    logger.info("ML models initialized")


# ── Feature engineering ────────────────────────────────────────


@router.post("/features/compute", response_model=FeatureVector)
async def compute_features(
    asset_id: str,
    telemetry: list[TelemetryPoint],
    failure_history_7d: int = 0,
) -> FeatureVector:
    """Compute ML feature vector from telemetry points."""
    points_dicts = [
        {"time": p.time, "metric": p.metric, "value": p.value} for p in telemetry
    ]
    features = FeatureEngineering.compute_features(
        asset_id=asset_id,
        telemetry_points=points_dicts,
        failure_history=failure_history_7d,
    )
    return features


# ── Anomaly detection ─────────────────────────────────────────


@router.post("/anomaly/detect", response_model=AnomalyResult)
async def detect_anomaly(features: FeatureVector) -> AnomalyResult:
    """Run anomaly detection on a feature vector."""
    if _anomaly_detector is None:
        raise HTTPException(status_code=503, detail="ML models not initialized")
    return _anomaly_detector.detect(features)


@router.post("/anomaly/detect-batch")
async def detect_anomaly_batch(
    requests: list[dict[str, Any]],
) -> dict[str, Any]:
    """Run anomaly detection on multiple asset feature vectors."""
    if _anomaly_detector is None:
        raise HTTPException(status_code=503, detail="ML models not initialized")

    results = []
    errors = []

    for i, req in enumerate(requests):
        try:
            # Reconstruct FeatureVector from dict
            fv = FeatureVector(**req)
            result = _anomaly_detector.detect(fv)
            results.append(result.model_dump(mode="json"))
        except Exception as exc:
            errors.append({"index": i, "error": str(exc)})

    return {
        "total": len(requests),
        "anomalies": len([r for r in results if r.get("is_anomaly")]),
        "results": results,
        "errors": errors,
    }


# ── Failure prediction ────────────────────────────────────────


@router.post("/failure/predict", response_model=FailurePrediction)
async def predict_failure(
    features: FeatureVector,
    anomaly_result: AnomalyResult | None = None,
) -> FailurePrediction:
    """Predict failure probability for an asset."""
    if _failure_predictor is None:
        raise HTTPException(status_code=503, detail="ML models not initialized")
    if anomaly_result is None:
        # Run anomaly detection first
        if _anomaly_detector is None:
            raise HTTPException(status_code=503, detail="ML models not initialized")
        anomaly_result = _anomaly_detector.detect(features)
    return _failure_predictor.predict(features, anomaly_result)


@router.post("/failure/predict-batch")
async def predict_failure_batch(
    requests: list[dict[str, Any]],
) -> dict[str, Any]:
    """Run failure prediction on multiple asset feature vectors."""
    if _failure_predictor is None:
        raise HTTPException(status_code=503, detail="ML models not initialized")
    anomaly_detector = _anomaly_detector
    requires_anomaly_detection = any(
        request.get("anomaly_result") is None for request in requests
    )
    if requires_anomaly_detection and anomaly_detector is None:
        raise HTTPException(status_code=503, detail="ML models not initialized")
    required_detector = cast(AnomalyDetector, anomaly_detector)

    results = []
    for req in requests:
        try:
            features = FeatureVector(**req)
            anomaly_payload = req.get("anomaly_result")
            if anomaly_payload is not None:
                anomaly_result = AnomalyResult(**anomaly_payload)
            else:
                anomaly_result = required_detector.detect(features)
            prediction = _failure_predictor.predict(features, anomaly_result)
            results.append(prediction.model_dump(mode="json"))
        except Exception as exc:
            logger.warning("Failure prediction error: %s", exc)
            results.append({"error": str(exc), "asset_id": req.get("asset_id")})

    high_risk = [r for r in results if r.get("risk_level") in ("high", "critical")]

    return {
        "total": len(requests),
        "high_risk_count": len(high_risk),
        "high_risk_assets": [r.get("asset_id") for r in high_risk],
        "results": results,
    }


# ── Combined inference ────────────────────────────────────────


@router.post("/infer")
async def infer(
    features: FeatureVector,
) -> dict[str, Any]:
    """
    Combined inference: anomaly detection + failure prediction.

    Returns both anomaly results and failure prediction in one call.
    """
    if _anomaly_detector is None or _failure_predictor is None:
        raise HTTPException(status_code=503, detail="ML models not initialized")

    anomaly_result = _anomaly_detector.detect(features)
    failure_prediction = _failure_predictor.predict(features, anomaly_result)

    return {
        "asset_id": features.asset_id,
        "anomaly": anomaly_result.model_dump(mode="json"),
        "failure_prediction": failure_prediction.model_dump(mode="json"),
    }
