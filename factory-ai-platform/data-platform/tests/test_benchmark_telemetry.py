from datetime import datetime, timedelta, timezone
from uuid import UUID

import pytest

from scripts.benchmark_telemetry import build_workload, percentile


def test_percentile_uses_nearest_rank() -> None:
    values = list(range(1, 101))

    assert percentile(values, 0.50) == 50
    assert percentile(values, 0.95) == 95
    assert percentile(values, 0.99) == 99


def test_percentile_rejects_empty_values() -> None:
    with pytest.raises(ValueError, match="without values"):
        percentile([], 0.95)


def test_build_workload_cycles_every_asset_metric_pair() -> None:
    start_time = datetime(2026, 7, 21, tzinfo=timezone.utc)
    end_time = start_time + timedelta(days=7)
    assets = [
        UUID("00000000-0000-0000-0000-000000000001"),
        UUID("00000000-0000-0000-0000-000000000002"),
    ]

    workload = build_workload(
        assets,
        ("temperature", "vibration"),
        start_time,
        end_time,
        query_count=5,
    )

    assert [
        (request["asset_ids"], request["metrics"])
        for request in workload
    ] == [
        (str(assets[0]), "temperature"),
        (str(assets[0]), "vibration"),
        (str(assets[1]), "temperature"),
        (str(assets[1]), "vibration"),
        (str(assets[0]), "temperature"),
    ]
    assert all(request["bucket"] == "1h" for request in workload)
    assert all(request["aggregate"] == "avg" for request in workload)
