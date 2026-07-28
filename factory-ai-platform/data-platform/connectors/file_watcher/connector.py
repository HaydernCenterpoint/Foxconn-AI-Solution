"""
File Watcher Connector: Monitor network folder for Excel/CSV reports
and import them into TimescaleDB.

Features:
- Watch multiple directories
- Support Excel (.xlsx, .xls) and CSV files
- Validate file structure before import
- Configurable column mappings
- Incremental import (track processed files)
- Dead letter queue for failed imports

Usage:
    python -m connectors.file_watcher.connector [--config config.yaml] [--daemon]

Environment Variables:
    FILE_WATCHER_DIRS: Comma-separated list of directories to watch
    FILE_WATCHER_POLL_INTERVAL: Seconds between directory polls (default: 30)
"""

import argparse
import csv
import hashlib
import json
import logging
import os
import shutil
import sys
import threading
import time
import traceback
from dataclasses import dataclass, field, asdict
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Optional, Callable, Any

import yaml

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('file_watcher.log')
    ]
)
logger = logging.getLogger(__name__)


class SyncStatus(Enum):
    IDLE = "idle"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    PAUSED = "paused"


@dataclass
class FileWatcherConfig:
    watch_dirs: list[str] = field(default_factory=lambda: ["./incoming"])
    poll_interval: int = 30
    processed_dir: str = "./processed"
    failed_dir: str = "./failed"
    archive_dir: str = "./archived"
    batch_size: int = 1000
    file_patterns: list[str] = field(default_factory=lambda: ["*.xlsx", "*.xls", "*.csv"])
    max_file_age_seconds: int = 60  # Wait for file to finish writing
    skip_header_rows: int = 1
    
    @classmethod
    def from_yaml(cls, path: str) -> "FileWatcherConfig":
        with open(path, 'r') as f:
            data = yaml.safe_load(f)
        return cls(**data.get('file_watcher', {}))
    
    @classmethod
    def from_env(cls) -> "FileWatcherConfig":
        dirs = os.getenv('FILE_WATCHER_DIRS', './incoming').split(',')
        return cls(
            watch_dirs=[d.strip() for d in dirs],
            poll_interval=int(os.getenv('FILE_WATCHER_POLL_INTERVAL', '30')),
        )


@dataclass
class ColumnMapping:
    """Map file columns to TimescaleDB schema"""
    timestamp_col: str = "timestamp"
    asset_id_col: str = "machine_id"
    metric_col: str = "metric"
    value_col: str = "value"
    tags_cols: dict = field(default_factory=dict)  # Additional columns to include as tags


@dataclass
class ImportProgress:
    files_processed: int = 0
    files_failed: int = 0
    rows_imported: int = 0
    rows_failed: int = 0
    last_file: Optional[str] = None
    last_import_at: Optional[str] = None


class FileProcessor:
    """Process Excel and CSV files"""
    
    def __init__(self, config: FileWatcherConfig):
        self.config = config
        self._ensure_dirs()
    
    def _ensure_dirs(self):
        """Create necessary directories"""
        for dir_path in [
            self.config.processed_dir,
            self.config.failed_dir,
            self.config.archive_dir
        ] + self.config.watch_dirs:
            Path(dir_path).mkdir(parents=True, exist_ok=True)
    
    def _get_file_hash(self, filepath: Path) -> str:
        """Get MD5 hash of file for deduplication"""
        with open(filepath, 'rb') as f:
            return hashlib.md5(f.read()).hexdigest()
    
    def _wait_for_file_ready(self, filepath: Path) -> bool:
        """Wait for file to finish being written"""
        for _ in range(self.config.max_file_age_seconds):
            try:
                # Try to open exclusively
                with open(filepath, 'rb') as f:
                    f.read(1)
                return True
            except IOError:
                time.sleep(1)
        return False
    
    def _read_csv(self, filepath: Path) -> list[dict]:
        """Read CSV file"""
        rows = []
        with open(filepath, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                rows.append(dict(row))
        return rows
    
    def _read_excel(self, filepath: Path) -> list[dict]:
        """Read Excel file (requires openpyxl or xlrd)"""
        try:
            import openpyxl
        except ImportError:
            logger.error("openpyxl not installed. Install with: pip install openpyxl")
            raise ImportError("openpyxl required for Excel support")
        
        rows = []
        wb = openpyxl.load_workbook(filepath, read_only=True)
        sheet = wb.active
        
        # Get headers
        headers = [cell.value for cell in sheet[1]]
        
        # Skip configured header rows
        for row_idx in range(2 + self.config.skip_header_rows, sheet.max_row + 1):
            row_values = [cell.value for cell in sheet[row_idx]]
            if all(v is None for v in row_values):
                continue
            row_dict = {headers[i]: row_values[i] for i in range(len(headers))}
            rows.append(row_dict)
        
        wb.close()
        return rows
    
    def process_file(self, filepath: Path) -> tuple[list[dict], str]:
        """
        Process a file and return rows.
        Returns (rows, file_type)
        """
        ext = filepath.suffix.lower()
        
        if ext == '.csv':
            return self._read_csv(filepath), 'csv'
        elif ext in ('.xlsx', '.xls'):
            return self._read_excel(filepath), 'excel'
        else:
            raise ValueError(f"Unsupported file type: {ext}")
    
    def _transform_row(self, row: dict, mapping: ColumnMapping, source_file: str) -> Optional[dict]:
        """Transform one validated row to the telemetry event format."""
        try:
            timestamp = self._parse_timestamp(row.get(mapping.timestamp_col))
            asset_id = str(row.get(mapping.asset_id_col, '')).strip()
            metric = str(row.get(mapping.metric_col, '')).strip()
            value = float(row.get(mapping.value_col))

            if not asset_id or not metric:
                raise ValueError("asset_id and metric are required")

            tags = {'source_file': source_file}
            for tag_name, col_name in mapping.tags_cols.items():
                if col_name in row and row[col_name] not in (None, ''):
                    tags[tag_name] = row[col_name]

            return {
                'timestamp': timestamp,
                'asset_id': asset_id,
                'metric': metric,
                'value': value,
                'tags': tags
            }
        except (TypeError, ValueError) as e:
            logger.warning("Row transform failed: %s", e)
            return None

    def _parse_timestamp(self, value: str) -> datetime:
        """Parse a supported timestamp or raise for invalid input."""
        text = str(value or '').strip()
        if not text:
            raise ValueError("timestamp is required")

        try:
            return datetime.fromisoformat(text.replace('Z', '+00:00'))
        except ValueError:
            formats = (
                '%d/%m/%Y %H:%M:%S',
                '%m/%d/%Y %H:%M:%S',
                '%Y-%m-%d',
            )
            for fmt in formats:
                try:
                    return datetime.strptime(text, fmt)
                except ValueError:
                    continue

        raise ValueError(f"invalid timestamp: {text}")
    
    def import_file(
        self,
        filepath: Path,
        mapping: ColumnMapping
    ) -> tuple[int, int]:
        """
        Import a file with given column mapping.
        Returns (success_count, failure_count)
        """
        if not self._wait_for_file_ready(filepath):
            logger.error(f"File not ready after {self.config.max_file_age_seconds}s: {filepath}")
            return 0, 0
        
        try:
            rows, file_type = self.process_file(filepath)
        except Exception as e:
            logger.error(f"Failed to process file {filepath}: {e}")
            return 0, 0
        
        success = 0
        failed = 0
        
        for row in rows:
            transformed = self._transform_row(row, mapping, str(filepath))
            if transformed:
                try:
                    self._write_telemetry(transformed)
                    success += 1
                except Exception as e:
                    logger.warning(f"Write failed: {e}")
                    failed += 1
            else:
                failed += 1
        
        return success, failed
    
    def _write_telemetry(self, data: dict):
        """Write telemetry to TimescaleDB"""
        from dualwrite import write_telemetry
        import uuid
        
        asset_id = data['asset_id']
        # Validate UUID format
        try:
            uuid.UUID(str(asset_id))
        except ValueError:
            # Try to look up by machine_code
            asset_id = self._lookup_asset_id(asset_id)
        
        write_telemetry(
            time=data['timestamp'],
            asset_id=uuid.UUID(asset_id) if asset_id else uuid.UUID('00000000-0000-0000-0000-000000000000'),
            metric=data['metric'],
            value=data['value'],
            tags=data['tags']
        )
    
    def _lookup_asset_id(self, machine_code: str) -> str:
        """Look up asset UUID from machine code"""
        import psycopg2
        
        try:
            conn = psycopg2.connect(
                host=os.getenv('POSTGRES_HOST', 'localhost'),
                port=int(os.getenv('POSTGRES_PORT', '5432')),
                dbname=os.getenv('POSTGRES_DB', 'factory_db'),
                user=os.getenv('POSTGRES_USER', 'factory_user'),
                password=os.getenv('POSTGRES_PASSWORD', 'factory_secure_password_9988'),
            )
            cur = conn.cursor()
            cur.execute(
                "SELECT id FROM assets WHERE metadata->>'machine_code' = %s LIMIT 1",
                (machine_code,)
            )
            result = cur.fetchone()
            conn.close()
            if result:
                return str(result[0])
        except Exception as e:
            logger.warning(f"Asset lookup failed: {e}")
        
        return '00000000-0000-0000-0000-000000000000'


class FileWatcherConnector:
    """
    Main file watcher connector.
    
    Features:
    - Watch multiple directories
    - Configurable column mappings per file pattern
    - Processed/failed directory management
    - Status tracking
    """
    
    # Default column mapping
    DEFAULT_MAPPING = ColumnMapping(
        timestamp_col='timestamp',
        asset_id_col='machine_id',
        metric_col='metric',
        value_col='value',
        tags_cols={
            'line_code': 'line_code',
            'shift': 'shift',
            'operator': 'operator'
        }
    )
    
    def __init__(
        self,
        config: FileWatcherConfig,
        state_file: str = ".file_watcher_state.json"
    ):
        self.config = config
        self.state_file = state_file
        self.progress = self._load_state()
        self.processor = FileProcessor(config)
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        
        # File tracking
        self._processed_hashes: set = set()
        self._load_processed_hashes()
    
    def _load_state(self) -> ImportProgress:
        """Load import progress"""
        if Path(self.state_file).exists():
            with open(self.state_file, 'r') as f:
                return ImportProgress(**json.load(f))
        return ImportProgress()
    
    def _save_state(self):
        """Save import progress"""
        with self._lock:
            with open(self.state_file, 'w') as f:
                json.dump(asdict(self.progress), f, indent=2, default=str)
    
    def _load_processed_hashes(self):
        """Load processed file hashes"""
        hash_file = Path(self.state_file).parent / ".processed_hashes.json"
        if hash_file.exists():
            with open(hash_file, 'r') as f:
                self._processed_hashes = set(json.load(f))
    
    def _save_processed_hashes(self):
        """Save processed file hashes"""
        hash_file = Path(self.state_file).parent / ".processed_hashes.json"
        with open(hash_file, 'w') as f:
            json.dump(list(self._processed_hashes), f)
    
    def _should_process(self, filepath: Path) -> bool:
        """Check if file should be processed"""
        if not filepath.exists():
            return False
        
        # Check extension
        ext = filepath.suffix.lower()
        valid_exts = ['.csv', '.xlsx', '.xls']
        if ext not in valid_exts:
            return False
        
        # Check hash
        file_hash = self.processor._get_file_hash(filepath)
        if file_hash in self._processed_hashes:
            logger.debug(f"Skipping already processed file: {filepath}")
            return False
        
        return True
    
    def _process_file(self, filepath: Path):
        """Process a single file"""
        logger.info(f"Processing file: {filepath}")
        
        try:
            success, failed = self.processor.import_file(filepath, self.DEFAULT_MAPPING)
            
            # Update progress
            self.progress.files_processed += 1
            self.progress.rows_imported += success
            self.progress.rows_failed += failed
            self.progress.last_file = str(filepath)
            self.progress.last_import_at = datetime.now().isoformat()
            
            # Mark as processed
            file_hash = self.processor._get_file_hash(filepath)
            self._processed_hashes.add(file_hash)
            self._save_processed_hashes()
            
            # Move to processed directory
            dest = Path(self.config.processed_dir) / filepath.name
            counter = 1
            while dest.exists():
                dest = Path(self.config.processed_dir) / f"{filepath.stem}_{counter}{filepath.suffix}"
                counter += 1
            shutil.move(str(filepath), str(dest))
            logger.info(f"Processed: {filepath} ({success} rows, {failed} failed)")
        
        except Exception as e:
            logger.error(f"Failed to process {filepath}: {e}")
            self.progress.files_failed += 1
            traceback.print_exc()
            
            # Move to failed directory
            try:
                dest = Path(self.config.failed_dir) / filepath.name
                shutil.move(str(filepath), str(dest))
            except Exception:
                pass
    
    def _scan_directory(self, watch_dir: str):
        """Scan a directory for new files"""
        dir_path = Path(watch_dir)
        if not dir_path.exists():
            logger.warning(f"Watch directory does not exist: {watch_dir}")
            return
        
        for filepath in dir_path.iterdir():
            if filepath.is_file() and self._should_process(filepath):
                self._process_file(filepath)
    
    def _run_loop(self):
        """Main watch loop"""
        logger.info(f"Starting file watcher (poll interval: {self.config.poll_interval}s)")
        
        while self._running:
            for watch_dir in self.config.watch_dirs:
                self._scan_directory(watch_dir)
            
            time.sleep(self.config.poll_interval)
        
        logger.info("File watcher stopped")
    
    def start(self):
        """Start watching directories"""
        if self._running:
            logger.warning("Already running")
            return
        
        self._running = True
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        logger.info("File watcher started")
    
    def stop(self):
        """Stop watching directories"""
        self._running = False
        if self._thread:
            self._thread.join(timeout=10)
        self._save_state()
        logger.info("File watcher stopped")
    
    def scan_once(self):
        """Scan directories once (for manual trigger)"""
        for watch_dir in self.config.watch_dirs:
            self._scan_directory(watch_dir)
        self._save_state()
        return asdict(self.progress)
    
    def get_status(self) -> dict:
        """Get current status"""
        return {
            'name': 'file_watcher_connector',
            'watch_dirs': self.config.watch_dirs,
            'poll_interval': self.config.poll_interval,
            'files_processed': self.progress.files_processed,
            'files_failed': self.progress.files_failed,
            'rows_imported': self.progress.rows_imported,
            'rows_failed': self.progress.rows_failed,
            'last_file': self.progress.last_file,
            'last_import_at': self.progress.last_import_at,
            'running': self._running
        }


def main():
    parser = argparse.ArgumentParser(description='File Watcher Connector')
    parser.add_argument('--config', type=str, help='Config file path')
    parser.add_argument('--daemon', action='store_true', help='Run as background daemon')
    parser.add_argument('--scan', action='store_true', help='Scan once and exit')
    parser.add_argument('--state-file', type=str, default='.file_watcher_state.json')
    
    args = parser.parse_args()
    
    if args.config and Path(args.config).exists():
        config = FileWatcherConfig.from_yaml(args.config)
    else:
        config = FileWatcherConfig.from_env()
    
    watcher = FileWatcherConnector(config, state_file=args.state_file)
    
    if args.daemon:
        watcher.start()
        try:
            while True:
                time.sleep(30)
                status = watcher.get_status()
                logger.info(f"Status: running={status['running']}, "
                          f"processed={status['files_processed']}, "
                          f"imported={status['rows_imported']}")
        except KeyboardInterrupt:
            watcher.stop()
    elif args.scan:
        result = watcher.scan_once()
        print(json.dumps(result, indent=2))
    else:
        # Default: run once
        result = watcher.scan_once()
        print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
