import json
from datetime import datetime
from uuid import UUID

import pytest

from dualwrite import DBConfig
from dualwrite import DualWriteMode, TelemetryWriter
from dualwrite import dualwrite


def test_db_config_connect_uses_configured_values(monkeypatch):
    connection = object()
    calls = []
    monkeypatch.setattr(
        dualwrite.psycopg2,
        "connect",
        lambda **kwargs: calls.append(kwargs) or connection,
    )

    result = DBConfig(
        host="db",
        port=5433,
        dbname="factory",
        user="worker",
        password="secret",
    ).connect()

    assert result is connection
    assert calls == [{
        "host": "db",
        "port": 5433,
        "dbname": "factory",
        "user": "worker",
        "password": "secret",
    }]


@pytest.fixture(autouse=True)
def reset_default_writer(monkeypatch):
    monkeypatch.setattr(dualwrite, "_default_writer", None)


@pytest.mark.parametrize(
    ("mode", "expected_targets"),
    [
        (DualWriteMode.FULL, ["timescale", "postgres"]),
        (DualWriteMode.MIGRATION, ["timescale"]),
        (DualWriteMode.ROLLBACK, ["postgres"]),
    ],
)
def test_telemetry_mode_routes_to_expected_destinations(
    mode,
    expected_targets,
    monkeypatch,
):
    writer = TelemetryWriter(mode=mode)
    targets = []
    monkeypatch.setattr(
        writer,
        "_flush_to_ts",
        lambda _rows: targets.append("timescale") or True,
    )
    monkeypatch.setattr(
        writer,
        "_flush_to_pg_legacy",
        lambda _rows: targets.append("postgres") or True,
    )

    result = writer.write_telemetry(
        time=datetime(2026, 7, 28, 12, 0),
        asset_id=UUID("11111111-1111-1111-1111-111111111111"),
        metric="production_count",
        value=42,
        flush=True,
    )

    assert result is True
    assert targets == expected_targets


def test_default_writer_tracks_environment_mode_and_flushes_before_switch(
    monkeypatch,
):
    monkeypatch.setenv("DUAL_WRITE_MODE", "full")
    writer = dualwrite.get_writer()
    writer.flush_interval = 3600
    targets = []
    monkeypatch.setattr(
        writer,
        "_flush_to_ts",
        lambda _rows: targets.append("timescale") or True,
    )
    monkeypatch.setattr(
        writer,
        "_flush_to_pg_legacy",
        lambda _rows: targets.append("postgres") or True,
    )
    writer.write_telemetry(
        time=datetime(2026, 7, 28, 12, 0),
        asset_id=UUID("22222222-2222-2222-2222-222222222222"),
        metric="production_count",
        value=1,
    )

    monkeypatch.setenv("DUAL_WRITE_MODE", "rollback")
    switched_writer = dualwrite.get_writer()

    assert switched_writer is writer
    assert writer.mode == DualWriteMode.ROLLBACK
    assert targets == ["timescale", "postgres"]

    writer.write_telemetry(
        time=datetime(2026, 7, 28, 12, 1),
        asset_id=UUID("22222222-2222-2222-2222-222222222222"),
        metric="production_count",
        value=2,
        flush=True,
    )
    assert targets == ["timescale", "postgres", "postgres"]


def test_invalid_environment_mode_is_rejected(monkeypatch):
    monkeypatch.setenv("DUAL_WRITE_MODE", "unsafe")

    with pytest.raises(ValueError, match="Invalid DUAL_WRITE_MODE"):
        dualwrite.get_writer()


def test_failed_telemetry_flush_requeues_buffer(monkeypatch):
    writer = TelemetryWriter(mode=DualWriteMode.MIGRATION)
    monkeypatch.setattr(writer, "_flush_to_ts", lambda _rows: False)

    result = writer.write_telemetry(
        time=datetime(2026, 7, 28, 12, 0),
        asset_id=UUID("33333333-3333-3333-3333-333333333333"),
        metric="production_count",
        value=3,
        flush=True,
    )

    assert result is False
    assert len(writer._telemetry_buffer) == 1


def test_failed_event_flush_blocks_mode_switch_and_requeues(monkeypatch):
    writer = TelemetryWriter(mode=DualWriteMode.MIGRATION)
    monkeypatch.setattr(writer, "_flush_events_to_ts", lambda _rows: False)
    writer.write_event(
        timestamp=datetime(2026, 7, 28, 12, 0),
        asset_id=UUID("44444444-4444-4444-4444-444444444444"),
        event_type="erp_quality",
    )

    with pytest.raises(RuntimeError, match="Cannot change dual-write mode"):
        writer.set_mode(DualWriteMode.ROLLBACK)

    assert writer.mode == DualWriteMode.MIGRATION
    assert len(writer._event_buffer) == 1


def test_rollback_event_flush_fails_closed_and_requeues():
    writer = TelemetryWriter(mode=DualWriteMode.ROLLBACK)

    result = writer.write_event(
        timestamp=datetime(2026, 7, 28, 12, 0),
        asset_id=UUID("55555555-5555-5555-5555-555555555555"),
        event_type="erp_quality",
        flush=True,
    )

    assert result is False
    assert len(writer._event_buffer) == 1


def test_dead_letter_queue_persists_every_record(tmp_path, monkeypatch):
    writer = TelemetryWriter(mode=DualWriteMode.MIGRATION)
    records = [(index, f"record-{index}") for index in range(15)]
    monkeypatch.chdir(tmp_path)

    writer._dead_letter_queue("events", records, "write failed")

    files = list(tmp_path.glob("dlq_events_*.json"))
    assert len(files) == 1
    payload = json.loads(files[0].read_text())
    assert payload["count"] == len(records)
    assert len(payload["data"]) == len(records)
