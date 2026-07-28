from datetime import datetime

from connector import ColumnMapping, FileProcessor, FileWatcherConfig


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
