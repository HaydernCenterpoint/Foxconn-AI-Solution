from datetime import datetime
import uuid

import dualwrite
from connectors.file_watcher.connector import (
    ColumnMapping,
    FileProcessor,
    FileWatcherConfig,
    FileWatcherConnector,
)


def processor(tmp_path) -> FileProcessor:
    return FileProcessor(
        FileWatcherConfig(
            watch_dirs=[],
            processed_dir=str(tmp_path / "processed"),
            failed_dir=str(tmp_path / "failed"),
            archive_dir=str(tmp_path / "archive"),
        )
    )


def watcher(tmp_path):
    watch_dir = tmp_path / "watch"
    config = FileWatcherConfig(
        watch_dirs=[str(watch_dir)],
        processed_dir=str(tmp_path / "processed"),
        failed_dir=str(tmp_path / "failed"),
        archive_dir=str(tmp_path / "archive"),
    )
    return FileWatcherConnector(config, state_file=str(tmp_path / "state.json")), watch_dir


def test_transform_row_rejects_invalid_values(tmp_path):
    result = processor(tmp_path)._transform_row(
        {"timestamp": "not-a-date", "machine_id": "M-1", "metric": "temp", "value": "42"},
        ColumnMapping(),
        "sample.csv",
    )

    assert result is None


def test_transform_row_returns_valid_telemetry(tmp_path):
    result = processor(tmp_path)._transform_row(
        {"timestamp": "2026-07-28T12:00:00Z", "machine_id": "M-1", "metric": "temp", "value": "42.5"},
        ColumnMapping(),
        "sample.csv",
    )

    assert result["timestamp"] == datetime.fromisoformat("2026-07-28T12:00:00+00:00")
    assert result["asset_id"] == "M-1"
    assert result["metric"] == "temp"
    assert result["value"] == 42.5


def test_write_telemetry_maps_machine_code(tmp_path, monkeypatch):
    file_processor = processor(tmp_path)
    asset_id = "11111111-1111-1111-1111-111111111111"
    writes = []
    monkeypatch.setattr(file_processor, "_lookup_asset_id", lambda _: asset_id)
    monkeypatch.setattr(
        dualwrite,
        "write_telemetry",
        lambda **kwargs: writes.append(kwargs) or True,
    )

    file_processor._write_telemetry({
        "timestamp": datetime.fromisoformat("2026-07-28T12:00:00+00:00"),
        "asset_id": "M-1",
        "metric": "temp",
        "value": 42.5,
        "tags": {},
    })

    assert writes[0]["asset_id"] == uuid.UUID(asset_id)
    assert writes[0]["flush"] is True


def test_write_telemetry_rejects_failed_database_write(tmp_path, monkeypatch):
    file_processor = processor(tmp_path)
    asset_id = "11111111-1111-1111-1111-111111111111"
    monkeypatch.setattr(file_processor, "_lookup_asset_id", lambda _: asset_id)
    monkeypatch.setattr(dualwrite, "write_telemetry", lambda **_kwargs: False)

    try:
        file_processor._write_telemetry({
            "timestamp": datetime.fromisoformat("2026-07-28T12:00:00+00:00"),
            "asset_id": "M-1",
            "metric": "temp",
            "value": 42.5,
            "tags": {},
        })
    except RuntimeError as error:
        assert "rejected" in str(error)
    else:
        raise AssertionError("Expected failed database write to raise")


def test_write_telemetry_rejects_unknown_canonical_uuid(tmp_path, monkeypatch):
    file_processor = processor(tmp_path)
    writes = []
    monkeypatch.setattr(file_processor, "_lookup_asset_id", lambda _: None)
    monkeypatch.setattr(
        dualwrite,
        "write_telemetry",
        lambda **kwargs: writes.append(kwargs) or True,
    )

    try:
        file_processor._write_telemetry({
            "timestamp": datetime.fromisoformat("2026-07-28T12:00:00+00:00"),
            "asset_id": "11111111-1111-1111-1111-111111111111",
            "metric": "temp",
            "value": 42.5,
            "tags": {},
        })
    except ValueError as error:
        assert "No asset mapping" in str(error)
    else:
        raise AssertionError("Expected unknown canonical UUID to be rejected")

    assert writes == []


def test_scan_once_imports_rows_and_moves_file(tmp_path, monkeypatch):
    watch_dir = tmp_path / "watch"
    processed_dir = tmp_path / "processed"
    failed_dir = tmp_path / "failed"
    archive_dir = tmp_path / "archive"
    state_file = tmp_path / "state.json"
    source_file = watch_dir / "telemetry.csv"
    source_file.parent.mkdir()
    source_contents = (
        "timestamp,machine_id,metric,value\n"
        "2026-07-28T12:00:00Z,M-1,temp,42.5\n"
        "not-a-date,M-2,temp,not-a-number\n"
    )
    source_file.write_text(source_contents, encoding="utf-8")
    config = FileWatcherConfig(
        watch_dirs=[str(watch_dir)],
        processed_dir=str(processed_dir),
        failed_dir=str(failed_dir),
        archive_dir=str(archive_dir),
    )

    watcher = FileWatcherConnector(config, state_file=str(state_file))
    telemetry = []
    monkeypatch.setattr(watcher.processor, "_write_telemetry", telemetry.append)

    result = watcher.scan_once()

    assert result["rows_imported"] == 1
    assert result["rows_failed"] == 1
    assert result["files_processed"] == 1
    assert telemetry == [
        {
            "timestamp": datetime.fromisoformat("2026-07-28T12:00:00+00:00"),
            "asset_id": "M-1",
            "metric": "temp",
            "value": 42.5,
            "tags": {"source_file": str(source_file)},
        }
    ]
    assert not source_file.exists()
    assert (processed_dir / source_file.name).exists()

    source_file.write_text(source_contents, encoding="utf-8")
    restarted_watcher = FileWatcherConnector(config, state_file=str(state_file))
    restarted_telemetry = []
    monkeypatch.setattr(
        restarted_watcher.processor, "_write_telemetry", restarted_telemetry.append
    )

    restarted_result = restarted_watcher.scan_once()

    assert restarted_watcher.progress.files_processed == 1
    assert restarted_watcher.progress.rows_imported == 1
    assert restarted_watcher.progress.rows_failed == 1
    assert restarted_watcher.progress.last_file == str(source_file)
    assert restarted_result == result
    assert restarted_telemetry == []
    assert source_file.exists()
    assert (processed_dir / source_file.name).exists()


def test_missing_required_csv_header_moves_file_to_failed(tmp_path, monkeypatch):
    watcher_connector, watch_dir = watcher(tmp_path)
    source_file = watch_dir / "telemetry.csv"
    source_file.write_text(
        "timestamp,machine_id,metric\n"
        "2026-07-28T12:00:00Z,M-1,temp\n",
        encoding="utf-8",
    )
    telemetry = []
    monkeypatch.setattr(watcher_connector.processor, "_write_telemetry", telemetry.append)

    result = watcher_connector.scan_once()

    assert result["files_failed"] == 1
    assert result["files_processed"] == 0
    assert result["rows_imported"] == 0
    assert result["rows_failed"] == 0
    assert telemetry == []
    assert not source_file.exists()
    assert (tmp_path / "failed" / source_file.name).exists()
    assert not (tmp_path / "processed" / source_file.name).exists()
    assert not (tmp_path / ".processed_hashes.json").exists()


def test_unmapped_asset_moves_file_to_failed(tmp_path, monkeypatch):
    watcher_connector, watch_dir = watcher(tmp_path)
    source_file = watch_dir / "telemetry.csv"
    source_file.write_text(
        "timestamp,machine_id,metric,value\n"
        "2026-07-28T12:00:00Z,UNKNOWN,temp,42.5\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(watcher_connector.processor, "_lookup_asset_id", lambda _: None)

    result = watcher_connector.scan_once()

    assert result["files_failed"] == 1
    assert result["files_processed"] == 0
    assert result["rows_failed"] == 1
    assert not source_file.exists()
    assert (tmp_path / "failed" / source_file.name).exists()


def test_csv_with_valid_headers_and_no_rows_is_processed(tmp_path, monkeypatch):
    watcher_connector, watch_dir = watcher(tmp_path)
    source_file = watch_dir / "empty.csv"
    source_file.write_text(
        "timestamp,machine_id,metric,value\n",
        encoding="utf-8",
    )
    telemetry = []
    monkeypatch.setattr(watcher_connector.processor, "_write_telemetry", telemetry.append)

    result = watcher_connector.scan_once()

    assert result["files_failed"] == 0
    assert result["files_processed"] == 1
    assert result["rows_imported"] == 0
    assert result["rows_failed"] == 0
    assert telemetry == []
    assert not source_file.exists()
    assert (tmp_path / "processed" / source_file.name).exists()


def test_parser_failure_moves_file_to_failed_without_recording_hash(tmp_path, monkeypatch):
    watcher_connector, watch_dir = watcher(tmp_path)
    source_file = watch_dir / "broken.xlsx"
    source_file.write_bytes(b"not an Excel workbook")

    def fail_to_parse(*_args, **_kwargs):
        raise ValueError("invalid workbook")

    monkeypatch.setattr(watcher_connector.processor, "process_file", fail_to_parse)

    result = watcher_connector.scan_once()

    assert result["files_failed"] == 1
    assert result["files_processed"] == 0
    assert result["rows_imported"] == 0
    assert result["rows_failed"] == 0
    assert not source_file.exists()
    assert (tmp_path / "failed" / source_file.name).exists()
    assert not (tmp_path / "processed" / source_file.name).exists()
    assert not (tmp_path / ".processed_hashes.json").exists()
