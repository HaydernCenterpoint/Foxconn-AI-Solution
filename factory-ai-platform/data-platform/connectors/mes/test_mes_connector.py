from pathlib import Path

import pytest

import dualwrite
from connectors.mes.connector import MESConfig, MESConnector


def connector(tmp_path: Path) -> MESConnector:
    return MESConnector(
        MESConfig(entity_types=[]),
        state_file=str(tmp_path / "mes-state.json"),
    )


def test_write_events_rejects_missing_asset(tmp_path):
    with pytest.raises(ValueError, match="asset identifier"):
        connector(tmp_path)._write_events([{
            "event_type": "mes_quality",
            "severity": "info",
            "payload": {},
            "asset_id": None,
        }])


def test_write_events_propagates_failed_flush(tmp_path, monkeypatch):
    writes = []
    monkeypatch.setattr(
        dualwrite,
        "write_event",
        lambda **kwargs: writes.append(kwargs) or False,
    )

    with pytest.raises(RuntimeError, match="Dual-write rejected MES event"):
        connector(tmp_path)._write_events([{
            "event_type": "mes_quality",
            "severity": "info",
            "payload": {},
            "asset_id": "11111111-1111-1111-1111-111111111111",
        }])

    assert writes[0]["flush"] is True
