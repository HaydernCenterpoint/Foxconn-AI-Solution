"""
HTTP client for the CEP service.

Used by other services (gateway, etc.) to communicate with the CEP service.
"""

from typing import Any

import httpx


class CEPClient:
    """
    HTTP client for the CEP service REST API.

    Provides typed access to event ingestion, alerting, RCA, and ML inference.
    """

    def __init__(self, cep_url: str = "http://localhost:8085", timeout: float = 30.0):
        self.cep_url = cep_url.rstrip("/")
        self._timeout = timeout
        self._client = httpx.Client(timeout=timeout)

    def close(self) -> None:
        self._client.close()

    def _get(self, url: str, params: dict[str, Any] | None = None) -> Any:
        resp = self._client.get(url, params=params)
        resp.raise_for_status()
        return resp.json()

    def _post(self, url: str, data: dict[str, Any]) -> Any:
        resp = self._client.post(url, json=data)
        resp.raise_for_status()
        return resp.json()

    def _patch(self, url: str, data: dict[str, Any] | None = None) -> Any:
        resp = self._client.patch(url, json=data)
        resp.raise_for_status()
        return resp.json()

    # ── Event endpoints ───────────────────────────────────────────

    def ingest_event(self, event: dict[str, Any]) -> dict[str, Any]:
        """Ingest an event into the CEP engine."""
        return self._post(f"{self.cep_url}/api/v1/events", {"event": event})

    def ingest_events_batch(self, events: list[dict[str, Any]]) -> dict[str, Any]:
        """Ingest multiple events at once."""
        return self._post(f"{self.cep_url}/api/v1/events/batch", events)

    def query_events(
        self,
        asset_id: str | None = None,
        line_code: str | None = None,
        event_type: str | None = None,
        severity: str | None = None,
        start_time: str | None = None,
        end_time: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Query events from the CEP event store."""
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if asset_id:
            params["asset_id"] = asset_id
        if line_code:
            params["line_code"] = line_code
        if event_type:
            params["event_type"] = event_type
        if severity:
            params["severity"] = severity
        if start_time:
            params["start_time"] = start_time
        if end_time:
            params["end_time"] = end_time
        return self._get(f"{self.cep_url}/api/v1/events", params=params)

    # ── Alert endpoints ──────────────────────────────────────────

    def get_alerts(
        self,
        asset_id: str | None = None,
        line_code: str | None = None,
        status: str | None = None,
        severity: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Get alerts with optional filters."""
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if asset_id:
            params["asset_id"] = asset_id
        if line_code:
            params["line_code"] = line_code
        if status:
            params["status"] = status
        if severity:
            params["severity"] = severity
        return self._get(f"{self.cep_url}/api/v1/alerts", params=params)

    def acknowledge_alert(self, alert_id: str, user: str = "system") -> dict[str, Any]:
        """Acknowledge an alert."""
        return self._patch(f"{self.cep_url}/api/v1/alerts/{alert_id}/acknowledge", {})

    def resolve_alert(self, alert_id: str, user: str = "system") -> dict[str, Any]:
        """Resolve an alert."""
        return self._patch(f"{self.cep_url}/api/v1/alerts/{alert_id}/resolve", {})

    # ── RCA endpoint ────────────────────────────────────────────

    def run_rca(self, event_id: str) -> dict[str, Any]:
        """Run root cause analysis on an event."""
        return self._post(f"{self.cep_url}/api/v1/rca", {"event_id": event_id})

    # ── Stats ──────────────────────────────────────────────────

    def get_stats(self) -> dict[str, Any]:
        """Get CEP engine statistics."""
        return self._get(f"{self.cep_url}/api/v1/stats")

    # ── ML endpoints ───────────────────────────────────────────

    def compute_features(
        self,
        asset_id: str,
        telemetry: list[dict[str, Any]],
        failure_history_7d: int = 0,
    ) -> dict[str, Any]:
        """Compute ML feature vector from telemetry."""
        return self._post(
            f"{self.cep_url}/api/v1/ml/features/compute",
            {"asset_id": asset_id, "telemetry": telemetry, "failure_history_7d": failure_history_7d},
        )

    def detect_anomaly(self, features: dict[str, Any]) -> dict[str, Any]:
        """Run anomaly detection on a feature vector."""
        return self._post(f"{self.cep_url}/api/v1/ml/anomaly/detect", features)

    def predict_failure(
        self,
        features: dict[str, Any],
        anomaly_result: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Predict failure probability for an asset."""
        payload = {"features": features}
        if anomaly_result:
            payload["anomaly_result"] = anomaly_result
        return self._post(f"{self.cep_url}/api/v1/ml/failure/predict", payload)

    def infer(self, features: dict[str, Any]) -> dict[str, Any]:
        """Combined inference: anomaly detection + failure prediction."""
        return self._post(f"{self.cep_url}/api/v1/ml/infer", features)

    # ── Rule management ────────────────────────────────────────

    def list_rules(self) -> dict[str, Any]:
        """List all CEP rules."""
        return self._get(f"{self.cep_url}/api/v1/rules")

    def get_rule(self, rule_id: str) -> dict[str, Any]:
        """Get a specific rule."""
        return self._get(f"{self.cep_url}/api/v1/rules/{rule_id}")

    def update_rule(self, rule_id: str, status: str) -> dict[str, Any]:
        """Update a rule (e.g., activate/suspend)."""
        return self._patch(f"{self.cep_url}/api/v1/rules/{rule_id}", {"status": status})

    # ── Health ────────────────────────────────────────────────

    def health(self) -> dict[str, Any]:
        """Check CEP service health."""
        return self._get(f"{self.cep_url}/health")
