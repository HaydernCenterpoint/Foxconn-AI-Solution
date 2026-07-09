"""
ERP Connector: Sync production orders, material consumption, downtime reasons
from external ERP system to TimescaleDB.

Supports incremental sync via last_modified_at timestamp.
Configurable via config.yaml or environment variables.

Usage:
    python -m connectors.erp.connector [--config config.yaml] [--once] [--daemon]

Environment Variables:
    ERP_API_URL: ERP system base URL
    ERP_API_KEY: API authentication key
    ERP_SYNC_INTERVAL: Seconds between sync cycles (default: 300)
"""

import argparse
import json
import logging
import os
import sys
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from enum import Enum
from pathlib import Path
from typing import Optional, Any
import threading
import traceback

import yaml
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('erp_connector.log')
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
class SyncProgress:
    last_sync_at: Optional[str] = None
    last_successful_sync: Optional[str] = None
    records_synced: int = 0
    errors: int = 0
    status: SyncStatus = SyncStatus.IDLE
    error_message: Optional[str] = None


@dataclass
class ERPConfig:
    api_url: str = "http://localhost:8080/api/erp"
    api_key: str = ""
    sync_interval: int = 300  # 5 minutes
    timeout: int = 30
    batch_size: int = 1000
    retry_attempts: int = 3
    retry_delay: float = 5.0
    entity_types: list = field(default_factory=lambda: [
        "production_orders",
        "material_consumption",
        "downtime_reasons",
        "quality_data"
    ])
    
    @classmethod
    def from_yaml(cls, path: str) -> "ERPConfig":
        with open(path, 'r') as f:
            data = yaml.safe_load(f)
        return cls(**data.get('erp', {}))
    
    @classmethod
    def from_env(cls) -> "ERPConfig":
        return cls(
            api_url=os.getenv('ERP_API_URL', 'http://localhost:8080/api/erp'),
            api_key=os.getenv('ERP_API_KEY', ''),
            sync_interval=int(os.getenv('ERP_SYNC_INTERVAL', '300')),
        )


@dataclass
class ProductionOrder:
    order_id: str
    material_id: str
    quantity: float
    unit: str
    status: str
    planned_start: datetime
    planned_end: datetime
    actual_start: Optional[datetime] = None
    actual_end: Optional[datetime] = None
    machine_id: Optional[str] = None
    line_id: Optional[str] = None
    created_at: Optional[datetime] = None
    modified_at: Optional[datetime] = None


@dataclass
class MaterialConsumption:
    record_id: str
    material_id: str
    material_name: str
    quantity: float
    unit: str
    consumption_date: datetime
    machine_id: Optional[str] = None
    order_id: Optional[str] = None
    modified_at: Optional[datetime] = None


@dataclass
class DowntimeReason:
    reason_id: str
    code: str
    description: str
    category: str
    machine_id: Optional[str] = None
    line_id: Optional[str] = None
    duration_minutes: Optional[float] = None
    modified_at: Optional[datetime] = None


class ERPSyncClient:
    """HTTP client for ERP API with retry logic"""
    
    def __init__(self, config: ERPConfig):
        self.config = config
        self.session = requests.Session()
        
        retry_strategy = Retry(
            total=config.retry_attempts,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)
        
        if config.api_key:
            self.session.headers.update({'Authorization': f'Bearer {config.api_key}'})
    
    def fetch_page(
        self,
        entity: str,
        since: Optional[datetime] = None,
        page: int = 1,
        page_size: int = 1000
    ) -> dict:
        """Fetch a page of data from ERP"""
        url = f"{self.config.api_url}/{entity}"
        params = {
            'page': page,
            'page_size': page_size,
        }
        if since:
            params['modified_since'] = since.isoformat()
        
        response = self.session.get(
            url,
            params=params,
            timeout=self.config.timeout
        )
        response.raise_for_status()
        return response.json()
    
    def fetch_all(
        self,
        entity: str,
        since: Optional[datetime] = None
    ) -> list:
        """Fetch all records for an entity, handling pagination"""
        all_records = []
        page = 1
        
        while True:
            data = self.fetch_page(entity, since, page, self.config.batch_size)
            records = data.get('records', data.get('data', []))
            
            if not records:
                break
            
            all_records.extend(records)
            
            # Check if there are more pages
            total = data.get('total', 0)
            if len(all_records) >= total:
                break
            
            page += 1
            time.sleep(0.5)  # Rate limiting
        
        return all_records


class ERPConnector:
    """
    Main ERP connector class.
    
    Handles:
    - Incremental sync via last_modified_at
    - Transformation to TimescaleDB events
    - Error handling and dead letter queue
    - Status tracking and health monitoring
    """
    
    def __init__(
        self,
        config: ERPConfig,
        state_file: str = ".erp_connector_state.json"
    ):
        self.config = config
        self.state_file = state_file
        self.progress = self._load_state()
        self.client = ERPSyncClient(config)
        self._lock = threading.Lock()
        self._running = False
        self._thread: Optional[threading.Thread] = None
        
        # Dead letter queue
        self._dlq_dir = Path("dlq")
        self._dlq_dir.mkdir(exist_ok=True)
    
    def _load_state(self) -> SyncProgress:
        """Load sync progress from state file"""
        if Path(self.state_file).exists():
            with open(self.state_file, 'r') as f:
                data = json.load(f)
                data['status'] = SyncStatus(data.get('status', 'idle'))
                return SyncProgress(**data)
        return SyncProgress()
    
    def _save_state(self):
        """Save sync progress to state file"""
        with self._lock:
            data = asdict(self.progress)
            data['status'] = self.progress.status.value
            with open(self.state_file, 'w') as f:
                json.dump(data, f, indent=2, default=str)
    
    def _write_dlq(self, entity: str, records: list, error: str):
        """Write failed records to dead letter queue"""
        dlq_file = self._dlq_dir / f"erp_{entity}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(dlq_file, 'w') as f:
            json.dump({
                'entity': entity,
                'error': error,
                'count': len(records),
                'timestamp': datetime.now().isoformat(),
                'records': records[:100]  # Store first 100 as sample
            }, f, indent=2, default=str)
        logger.warning(f"Dead letter queue written: {dlq_file}")
    
    def _transform_production_order(self, record: dict) -> dict:
        """Transform ERP production order to event"""
        return {
            'event_type': 'erp_production_order',
            'severity': 'info',
            'payload': {
                'order_id': record.get('order_id'),
                'material_id': record.get('material_id'),
                'quantity': record.get('quantity'),
                'unit': record.get('unit'),
                'status': record.get('status'),
                'planned_start': record.get('planned_start'),
                'planned_end': record.get('planned_end'),
                'actual_start': record.get('actual_start'),
                'actual_end': record.get('actual_end'),
                'machine_id': record.get('machine_id'),
                'line_id': record.get('line_id'),
                'source': 'erp',
                'raw_data': record
            },
            'asset_id': record.get('machine_id') or record.get('line_id')
        }
    
    def _transform_material_consumption(self, record: dict) -> dict:
        """Transform material consumption record to event"""
        return {
            'event_type': 'erp_material_consumption',
            'severity': 'info',
            'payload': {
                'record_id': record.get('record_id'),
                'material_id': record.get('material_id'),
                'material_name': record.get('material_name'),
                'quantity': record.get('quantity'),
                'unit': record.get('unit'),
                'consumption_date': record.get('consumption_date'),
                'machine_id': record.get('machine_id'),
                'order_id': record.get('order_id'),
                'source': 'erp',
                'raw_data': record
            },
            'asset_id': record.get('machine_id')
        }
    
    def _transform_downtime_reason(self, record: dict) -> dict:
        """Transform downtime reason to event"""
        severity = 'info'
        if record.get('category') in ('breakdown', 'failure'):
            severity = 'error'
        elif record.get('category') in ('maintenance', 'changeover'):
            severity = 'warning'
        
        return {
            'event_type': 'erp_downtime',
            'severity': severity,
            'payload': {
                'reason_id': record.get('reason_id'),
                'code': record.get('code'),
                'description': record.get('description'),
                'category': record.get('category'),
                'machine_id': record.get('machine_id'),
                'line_id': record.get('line_id'),
                'duration_minutes': record.get('duration_minutes'),
                'source': 'erp',
                'raw_data': record
            },
            'asset_id': record.get('machine_id') or record.get('line_id')
        }
    
    def _transform_quality_data(self, record: dict) -> dict:
        """Transform quality data to event"""
        return {
            'event_type': 'erp_quality',
            'severity': 'info',
            'payload': {
                'inspection_id': record.get('inspection_id'),
                'order_id': record.get('order_id'),
                'machine_id': record.get('machine_id'),
                'quantity_checked': record.get('quantity_checked'),
                'quantity_passed': record.get('quantity_passed'),
                'defect_rate': record.get('defect_rate'),
                'inspection_date': record.get('inspection_date'),
                'source': 'erp',
                'raw_data': record
            },
            'asset_id': record.get('machine_id')
        }
    
    def _process_entity(self, entity: str) -> tuple[int, int]:
        """Process a single entity type, return (synced, errors)"""
        since = None
        if self.progress.last_successful_sync:
            since = datetime.fromisoformat(self.progress.last_successful_sync)
        
        try:
            records = self.client.fetch_all(entity, since)
        except Exception as e:
            logger.error(f"Failed to fetch {entity}: {e}")
            self._write_dlq(entity, [], str(e))
            return 0, 1
        
        if not records:
            return 0, 0
        
        # Transform records
        transformed = []
        if entity == 'production_orders':
            for rec in records:
                try:
                    transformed.append(self._transform_production_order(rec))
                except Exception as e:
                    logger.warning(f"Transform failed for {entity}: {e}")
                    self.progress.errors += 1
        
        elif entity == 'material_consumption':
            for rec in records:
                try:
                    transformed.append(self._transform_material_consumption(rec))
                except Exception as e:
                    logger.warning(f"Transform failed: {e}")
                    self.progress.errors += 1
        
        elif entity == 'downtime_reasons':
            for rec in records:
                try:
                    transformed.append(self._transform_downtime_reason(rec))
                except Exception as e:
                    logger.warning(f"Transform failed: {e}")
                    self.progress.errors += 1
        
        elif entity == 'quality_data':
            for rec in records:
                try:
                    transformed.append(self._transform_quality_data(rec))
                except Exception as e:
                    logger.warning(f"Transform failed: {e}")
                    self.progress.errors += 1
        
        # Write to TimescaleDB via dualwrite
        try:
            self._write_events(transformed)
            synced = len(transformed)
            logger.info(f"Synced {synced} {entity} records")
            return synced, 0
        except Exception as e:
            logger.error(f"Failed to write {entity}: {e}")
            self._write_dlq(entity, transformed, str(e))
            return 0, len(transformed)
    
    def _write_events(self, events: list):
        """Write events to TimescaleDB using dualwrite"""
        from dualwrite import write_event
        import uuid
        
        for event in events:
            write_event(
                timestamp=datetime.now(),
                asset_id=uuid.UUID(event.get('asset_id') or '00000000-0000-0000-0000-000000000000'),
                event_type=event['event_type'],
                severity=event['severity'],
                payload=event['payload'],
                source='erp'
            )
    
    def sync_once(self) -> SyncProgress:
        """Run a single sync cycle"""
        logger.info("Starting ERP sync cycle")
        self.progress.status = SyncStatus.RUNNING
        self.progress.last_sync_at = datetime.now().isoformat()
        self._save_state()
        
        total_synced = 0
        total_errors = 0
        
        try:
            for entity in self.config.entity_types:
                synced, errors = self._process_entity(entity)
                total_synced += synced
                total_errors += errors
            
            self.progress.status = SyncStatus.SUCCESS
            self.progress.last_successful_sync = datetime.now().isoformat()
            self.progress.records_synced += total_synced
            self.progress.errors = total_errors
            logger.info(f"Sync complete: {total_synced} records, {total_errors} errors")
        
        except Exception as e:
            logger.error(f"Sync failed: {e}")
            self.progress.status = SyncStatus.FAILED
            self.progress.error_message = str(e)
            traceback.print_exc()
        
        self._save_state()
        return self.progress
    
    def _run_loop(self):
        """Background sync loop"""
        logger.info(f"Starting background sync (interval: {self.config.sync_interval}s)")
        
        while self._running:
            try:
                self.sync_once()
            except Exception as e:
                logger.error(f"Sync loop error: {e}")
            
            # Wait for next sync
            for _ in range(self.config.sync_interval):
                if not self._running:
                    break
                time.sleep(1)
        
        logger.info("ERP connector stopped")
    
    def start(self):
        """Start background sync"""
        if self._running:
            logger.warning("Already running")
            return
        
        self._running = True
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        logger.info("ERP connector started")
    
    def stop(self):
        """Stop background sync"""
        self._running = False
        if self._thread:
            self._thread.join(timeout=10)
        self.progress.status = SyncStatus.PAUSED
        self._save_state()
        logger.info("ERP connector paused")
    
    def get_status(self) -> dict:
        """Get current connector status"""
        return {
            'name': 'erp_connector',
            'status': self.progress.status.value,
            'last_sync_at': self.progress.last_sync_at,
            'last_successful_sync': self.progress.last_successful_sync,
            'records_synced': self.progress.records_synced,
            'errors': self.progress.errors,
            'error_message': self.progress.error_message,
            'running': self._running
        }


def main():
    parser = argparse.ArgumentParser(description='ERP Connector')
    parser.add_argument('--config', type=str, help='Config file path')
    parser.add_argument('--once', action='store_true', help='Run sync once and exit')
    parser.add_argument('--daemon', action='store_true', help='Run as background daemon')
    parser.add_argument('--state-file', type=str, default='.erp_connector_state.json')
    
    args = parser.parse_args()
    
    # Load config
    if args.config and Path(args.config).exists():
        config = ERPConfig.from_yaml(args.config)
    else:
        config = ERPConfig.from_env()
    
    connector = ERPConnector(config, state_file=args.state_file)
    
    if args.daemon or not args.once:
        connector.start()
        try:
            while True:
                time.sleep(10)
                status = connector.get_status()
                logger.info(f"Status: {status['status']}, "
                          f"synced: {status['records_synced']}, "
                          f"errors: {status['errors']}")
        except KeyboardInterrupt:
            connector.stop()
    else:
        result = connector.sync_once()
        print(json.dumps(asdict(result), indent=2, default=str))


if __name__ == '__main__':
    main()
