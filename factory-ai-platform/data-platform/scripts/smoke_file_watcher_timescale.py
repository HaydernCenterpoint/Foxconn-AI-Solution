"""Live File Watcher -> TimescaleDB smoke check."""

from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

from connectors.file_watcher.connector import FileWatcherConfig, FileWatcherConnector
from dualwrite import DBConfig


def main() -> None:
    asset_id = uuid4()
    machine_code = f"FII-SMOKE-{asset_id.hex[:8]}"
    db = DBConfig.from_env("TS_")

    with db.connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO assets (id, name, type, metadata)
                VALUES (%s, %s, 'machine', jsonb_build_object('machine_code', %s))
                """,
                (str(asset_id), machine_code, machine_code),
            )
        connection.commit()

    try:
        with TemporaryDirectory(prefix="fii-file-watcher-") as temp_dir:
            root = Path(temp_dir)
            incoming = root / "incoming"
            incoming.mkdir()
            source = incoming / "telemetry.csv"
            source.write_text(
                "timestamp,machine_id,metric,value\n"
                f"{datetime.now(timezone.utc).isoformat()},{machine_code},temperature,42.5\n",
                encoding="utf-8",
            )

            watcher = FileWatcherConnector(
                FileWatcherConfig(
                    watch_dirs=[str(incoming)],
                    processed_dir=str(root / "processed"),
                    failed_dir=str(root / "failed"),
                    archive_dir=str(root / "archive"),
                ),
                state_file=str(root / "state.json"),
            )
            progress = watcher.scan_once()
            assert progress["files_processed"] == 1, progress
            assert progress["rows_imported"] == 1, progress
            assert progress["files_failed"] == 0, progress

        with db.connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT value
                    FROM telemetry
                    WHERE asset_id = %s AND metric = 'temperature'
                    ORDER BY time DESC
                    LIMIT 1
                    """,
                    (str(asset_id),),
                )
                row = cursor.fetchone()
                assert row is not None and float(row[0]) == 42.5, row
        print("File Watcher -> TimescaleDB smoke passed")
    finally:
        with db.connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute("DELETE FROM telemetry WHERE asset_id = %s", (str(asset_id),))
                cursor.execute("DELETE FROM assets WHERE id = %s", (str(asset_id),))
            connection.commit()


if __name__ == "__main__":
    main()
