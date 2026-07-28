"""Benchmark one week of telemetry queries for 50 assets and 10 metrics.

The harness inserts an isolated synthetic dataset, exercises the live
data-platform HTTP API, writes an optional JSON report, and removes its data
unless --keep-data is explicitly requested.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable, Sequence
from uuid import UUID, uuid4

import httpx
from psycopg2.extras import Json, execute_values

from dualwrite import DBConfig


DEFAULT_METRICS = (
    "temperature",
    "vibration",
    "current_draw",
    "pressure",
    "flow_rate",
    "speed",
    "torque",
    "power",
    "oee",
    "yield_rate",
)


@dataclass(frozen=True)
class BenchmarkSummary:
    assets: int
    metrics: int
    days: int
    sample_interval_minutes: int
    seeded_rows: int
    queries: int
    concurrency: int
    successful_queries: int
    failed_queries: int
    duration_seconds: float
    throughput_qps: float
    p50_ms: float
    p95_ms: float
    p99_ms: float
    p95_target_ms: float
    qps_target: float
    passed: bool


def percentile(values: Sequence[float], percentile_value: float) -> float:
    """Return the nearest-rank percentile for a non-empty sequence."""
    if not values:
        raise ValueError("Cannot calculate a percentile without values")
    if not 0 <= percentile_value <= 1:
        raise ValueError("Percentile must be between 0 and 1")

    ordered = sorted(values)
    rank = max(0, int((len(ordered) * percentile_value) + 0.999999) - 1)
    return ordered[min(rank, len(ordered) - 1)]


def build_workload(
    asset_ids: Sequence[UUID],
    metrics: Sequence[str],
    start_time: datetime,
    end_time: datetime,
    query_count: int,
) -> list[dict[str, str | int]]:
    """Build a deterministic mixed asset/metric workload."""
    if not asset_ids or not metrics:
        raise ValueError("At least one asset and metric are required")
    if query_count < 1:
        raise ValueError("Query count must be positive")

    combinations = [
        (asset_id, metric)
        for asset_id in asset_ids
        for metric in metrics
    ]
    return [
        {
            "asset_ids": str(combinations[index % len(combinations)][0]),
            "metrics": combinations[index % len(combinations)][1],
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "bucket": "1h",
            "aggregate": "avg",
            "limit": 200,
        }
        for index in range(query_count)
    ]


def seed_dataset(
    db_config: DBConfig,
    asset_ids: Sequence[UUID],
    metrics: Sequence[str],
    start_time: datetime,
    end_time: datetime,
    sample_interval_minutes: int,
    run_id: str,
) -> int:
    """Insert benchmark-only assets and telemetry in one transaction."""
    with db_config.connect() as connection:
        with connection.cursor() as cursor:
            execute_values(
                cursor,
                """
                INSERT INTO assets (id, name, type, metadata)
                VALUES %s
                """,
                [
                    (
                        str(asset_id),
                        f"FII-BENCH-{index + 1:02d}",
                        "machine",
                        Json({"benchmark_run_id": run_id}),
                    )
                    for index, asset_id in enumerate(asset_ids)
                ],
                template="(%s::uuid, %s, %s, %s)",
            )
            cursor.execute(
                """
                WITH benchmark_assets AS (
                    SELECT asset_id, asset_index
                    FROM unnest(%s::uuid[]) WITH ORDINALITY AS item(asset_id, asset_index)
                ),
                benchmark_metrics AS (
                    SELECT metric, metric_index
                    FROM unnest(%s::text[]) WITH ORDINALITY AS item(metric, metric_index)
                )
                INSERT INTO telemetry (time, asset_id, metric, value, tags)
                SELECT
                    sample_time,
                    benchmark_assets.asset_id,
                    benchmark_metrics.metric,
                    benchmark_assets.asset_index
                        + benchmark_metrics.metric_index
                        + MOD(EXTRACT(EPOCH FROM sample_time)::bigint / 60, 100) / 10.0,
                    jsonb_build_object('benchmark_run_id', %s)
                FROM benchmark_assets
                CROSS JOIN benchmark_metrics
                CROSS JOIN generate_series(%s, %s, %s::interval) AS sample_time
                """,
                (
                    [str(asset_id) for asset_id in asset_ids],
                    list(metrics),
                    run_id,
                    start_time,
                    end_time,
                    f"{sample_interval_minutes} minutes",
                ),
            )
            inserted_rows = cursor.rowcount
        connection.commit()
    return inserted_rows


def cleanup_dataset(db_config: DBConfig, asset_ids: Sequence[UUID]) -> None:
    """Remove only rows owned by the current benchmark run."""
    with db_config.connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "DELETE FROM telemetry WHERE asset_id = ANY(%s::uuid[])",
                ([str(asset_id) for asset_id in asset_ids],),
            )
            cursor.execute(
                "DELETE FROM assets WHERE id = ANY(%s::uuid[])",
                ([str(asset_id) for asset_id in asset_ids],),
            )
        connection.commit()


def _run_request(
    client: httpx.Client,
    endpoint: str,
    params: dict[str, str | int],
) -> tuple[float, str | None]:
    started = time.perf_counter()
    try:
        response = client.get(endpoint, params=params)
        elapsed_ms = (time.perf_counter() - started) * 1000
        if response.status_code != 200:
            return elapsed_ms, f"HTTP {response.status_code}"
        payload = response.json()
        if not isinstance(payload, dict) or int(payload.get("count", 0)) < 1:
            return elapsed_ms, "query returned no telemetry"
        return elapsed_ms, None
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        elapsed_ms = (time.perf_counter() - started) * 1000
        return elapsed_ms, type(exc).__name__


def run_benchmark(
    base_url: str,
    api_key: str,
    workload: Sequence[dict[str, str | int]],
    concurrency: int,
    warmup_queries: int,
    timeout_seconds: float,
    p95_target_ms: float,
    qps_target: float,
    dataset: dict[str, int],
) -> BenchmarkSummary:
    """Run warm-up and measured requests against the live telemetry API."""
    endpoint = f"{base_url.rstrip('/')}/api/v1/telemetry/query"
    limits = httpx.Limits(
        max_connections=concurrency,
        max_keepalive_connections=concurrency,
    )
    with httpx.Client(
        headers={"X-Connector-API-Key": api_key},
        limits=limits,
        timeout=timeout_seconds,
    ) as client:
        health_response = client.get(f"{base_url.rstrip('/')}/health")
        health_response.raise_for_status()

        for params in workload[:warmup_queries]:
            _, error = _run_request(client, endpoint, params)
            if error is not None:
                raise RuntimeError(f"Warm-up telemetry query failed: {error}")

        started = time.perf_counter()
        with ThreadPoolExecutor(max_workers=concurrency) as executor:
            results = list(
                executor.map(
                    lambda params: _run_request(client, endpoint, params),
                    workload,
                )
            )
        duration_seconds = time.perf_counter() - started

    successful_latencies = [
        latency_ms for latency_ms, error in results if error is None
    ]
    failed_queries = len(results) - len(successful_latencies)
    if not successful_latencies:
        raise RuntimeError("All telemetry benchmark requests failed")

    throughput_qps = len(successful_latencies) / duration_seconds
    p95_ms = percentile(successful_latencies, 0.95)
    return BenchmarkSummary(
        assets=dataset["assets"],
        metrics=dataset["metrics"],
        days=dataset["days"],
        sample_interval_minutes=dataset["sample_interval_minutes"],
        seeded_rows=dataset["seeded_rows"],
        queries=len(results),
        concurrency=concurrency,
        successful_queries=len(successful_latencies),
        failed_queries=failed_queries,
        duration_seconds=round(duration_seconds, 3),
        throughput_qps=round(throughput_qps, 2),
        p50_ms=round(percentile(successful_latencies, 0.50), 2),
        p95_ms=round(p95_ms, 2),
        p99_ms=round(percentile(successful_latencies, 0.99), 2),
        p95_target_ms=p95_target_ms,
        qps_target=qps_target,
        passed=(
            failed_queries == 0
            and p95_ms < p95_target_ms
            and throughput_qps > qps_target
        ),
    )


def write_report(summary: BenchmarkSummary, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(
            {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "workload": "one-week hourly aggregate queries",
                **asdict(summary),
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def positive_int(value: str) -> int:
    parsed = int(value)
    if parsed < 1:
        raise argparse.ArgumentTypeError("value must be positive")
    return parsed


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Benchmark one week of Timescale telemetry through the live API",
    )
    parser.add_argument(
        "--base-url",
        default=os.getenv("DATA_PLATFORM_API_URL", "http://127.0.0.1:8084"),
    )
    parser.add_argument("--assets", type=positive_int, default=50)
    parser.add_argument("--metrics", type=positive_int, default=10)
    parser.add_argument("--days", type=positive_int, default=7)
    parser.add_argument("--sample-interval-minutes", type=positive_int, default=5)
    parser.add_argument("--queries", type=positive_int, default=1000)
    parser.add_argument("--concurrency", type=positive_int, default=32)
    parser.add_argument("--warmup-queries", type=int, default=25)
    parser.add_argument("--timeout-seconds", type=float, default=30.0)
    parser.add_argument("--p95-target-ms", type=float, default=500.0)
    parser.add_argument("--qps-target", type=float, default=100.0)
    parser.add_argument("--output", type=Path)
    parser.add_argument(
        "--keep-data",
        action="store_true",
        help="Retain synthetic benchmark rows instead of removing them",
    )
    args = parser.parse_args(argv)
    if args.metrics > len(DEFAULT_METRICS):
        parser.error(f"--metrics cannot exceed {len(DEFAULT_METRICS)}")
    if args.warmup_queries < 0:
        parser.error("--warmup-queries cannot be negative")
    if args.timeout_seconds <= 0:
        parser.error("--timeout-seconds must be positive")
    if args.p95_target_ms <= 0 or args.qps_target <= 0:
        parser.error("benchmark targets must be positive")
    return args


def main(argv: Iterable[str] | None = None) -> int:
    args = parse_args(argv)
    api_key = os.getenv("CONNECTOR_API_KEY", "").strip()
    if not api_key:
        print("CONNECTOR_API_KEY must be set; it is never accepted on the command line.", file=sys.stderr)
        return 2

    asset_ids = [uuid4() for _ in range(args.assets)]
    metrics = DEFAULT_METRICS[: args.metrics]
    run_id = uuid4().hex
    end_time = datetime.now(timezone.utc).replace(microsecond=0)
    start_time = end_time - timedelta(days=args.days)
    db_config = DBConfig.from_env()
    seeded = False

    try:
        print(
            f"Seeding {args.assets} assets x {args.metrics} metrics x "
            f"{args.days} days at {args.sample_interval_minutes}-minute intervals..."
        )
        seeded_rows = seed_dataset(
            db_config,
            asset_ids,
            metrics,
            start_time,
            end_time,
            args.sample_interval_minutes,
            run_id,
        )
        seeded = True
        workload = build_workload(
            asset_ids,
            metrics,
            start_time,
            end_time,
            args.queries,
        )
        summary = run_benchmark(
            args.base_url,
            api_key,
            workload,
            args.concurrency,
            min(args.warmup_queries, len(workload)),
            args.timeout_seconds,
            args.p95_target_ms,
            args.qps_target,
            {
                "assets": args.assets,
                "metrics": args.metrics,
                "days": args.days,
                "sample_interval_minutes": args.sample_interval_minutes,
                "seeded_rows": seeded_rows,
            },
        )
        if args.output:
            write_report(summary, args.output)

        print(json.dumps(asdict(summary), indent=2))
        return 0 if summary.passed else 1
    finally:
        if seeded and not args.keep_data:
            print("Removing synthetic benchmark data...")
            cleanup_dataset(db_config, asset_ids)


if __name__ == "__main__":
    raise SystemExit(main())
