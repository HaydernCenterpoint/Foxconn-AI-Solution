from datetime import datetime

from connector import ColumnMapping, FileProcessor, FileWatcherConfig, FileWatcherConnector


def processor(tmp_path) -> FileProcessor:
    return FileProcessor(
        FileWatcherConfig(
            watch_dirs=[],
            processed_dir=str(tmp_path / "processed"),
            failed_dir=str(tmp_path / "failed"),
            archive_dir=str(tmp_path / "archive"),
        )
    )


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


def test_scan_once_imports_rows_and_moves_file(tmp_path, monkeypatch):
    watch_dir = tmp_path / "watch"
    processed_dir = tmp_path / "processed"
    failed_dir = tmp_path / "failed"
    archive_dir = tmp_path / "archive"
    state_file = tmp_path / "state.json"
    source_file = watch_dir / "telemetry.csv"
    source_file.parent.mkdir()
    source_file.write_text(
        "timestamp,machine_id,metric,value\n"
        "2026-07-28T12:00:00Z,M-1,temp,42.5\n"
        "not-a-date,M-2,temp,not-a-number\n",
        encoding="utf-8",
    )

    watcher = FileWatcherConnector(
        FileWatcherConfig(
            watch_dirs=[str(watch_dir)],
            processed_dir=str(processed_dir),
            failed_dir=str(failed_dir),
            archive_dir=str(archive_dir),
        ),
        state_file=str(state_file),
    )
    monkeypatch.setattr(watcher.processor, "_write_telemetry", lambda data: None)

    result = watcher.scan_once()

    assert result["rows_imported"] == 1
    assert result["rows_failed"] == 1
    assert result["files_processed"] == 1
    assert not source_file.exists()
    assert (processed_dir / source_file.name).exists()

    second_result = watcher.scan_once()

    assert second_result == result
    assert second_result["files_processed"] == 1
    assert (processed_dir / source_file.name).exists()
