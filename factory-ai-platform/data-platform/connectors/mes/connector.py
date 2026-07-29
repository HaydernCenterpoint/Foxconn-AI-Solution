"""
MES Connector: Sync work orders, quality data, operator shifts
from Manufacturing Execution System to TimescaleDB.

Supports:
- Database direct connection (SQL Server, PostgreSQL)
- REST API connection
- Incremental sync via last_modified_at

Usage:
    python -m connectors.mes.connector [--config config.yaml] [--once] [--daemon]
"""

import argparse
import json
import logging
import os
import sys
import threading
import time
import traceback
from dataclasses import dataclass, field, asdict
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Optional

import yaml

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('mes_connector.log')
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
class MESConfig:
    connection_type: str = "api"  # 'api' or 'database'
    
    # API settings
    api_url: str = "http://localhost:8080/api/mes"
    api_key: str = ""
    
    # Database settings
    db_host: str = "localhost"
    db_port: int = 1433
    db_name: str = "mes_db"
    db_user: str = "sa"
    db_password: str = ""
    db_driver: str = "ODBC Driver 17 for SQL Server"
    
    # Sync settings
    sync_interval: int = 300
    batch_size: int = 1000
    entity_types: list = field(default_factory=lambda: [
        "work_orders",
        "quality_inspections",
        "operator_shifts"
    ])
    
    @classmethod
    def from_yaml(cls, path: str) -> "MESConfig":
        with open(path, 'r') as f:
            data = yaml.safe_load(f)
        return cls(**data.get('mes', {}))
    
    @classmethod
    def from_env(cls) -> "MESConfig":
        return cls(
            connection_type=os.getenv('MES_CONNECTION_TYPE', 'api'),
            api_url=os.getenv('MES_API_URL', 'http://localhost:8080/api/mes'),
            api_key=os.getenv('MES_API_KEY', ''),
            db_host=os.getenv('MES_DB_HOST', 'localhost'),
            db_port=int(os.getenv('MES_DB_PORT', '1433')),
            db_name=os.getenv('MES_DB_NAME', 'mes_db'),
            db_user=os.getenv('MES_DB_USER', 'sa'),
            db_password=os.getenv('MES_DB_PASSWORD', ''),
        )


class MESSyncClient:
    """MES data client (API or database)"""
    
    def __init__(self, config: MESConfig):
        self.config = config
    
    def fetch_work_orders(self, since: Optional[datetime] = None) -> list:
        """Fetch work orders"""
        if self.config.connection_type == 'api':
            return self._fetch_via_api('work_orders', since)
        else:
            return self._fetch_via_db_work_orders(since)
    
    def fetch_quality_inspections(self, since: Optional[datetime] = None) -> list:
        """Fetch quality inspection data"""
        if self.config.connection_type == 'api':
            return self._fetch_via_api('quality_inspections', since)
        else:
            return self._fetch_via_db_quality(since)
    
    def fetch_operator_shifts(self, since: Optional[datetime] = None) -> list:
        """Fetch operator shift data"""
        if self.config.connection_type == 'api':
            return self._fetch_via_api('operator_shifts', since)
        else:
            return self._fetch_via_db_shifts(since)
    
    def _fetch_via_api(self, entity: str, since: Optional[datetime] = None) -> list:
        """Fetch data via REST API"""
        import requests
        
        url = f"{self.config.api_url}/{entity}"
        params = {}
        if since:
            params['modified_since'] = since.isoformat()
        
        headers = {}
        if self.config.api_key:
            headers['Authorization'] = f'Bearer {self.config.api_key}'
        
        response = requests.get(url, params=params, headers=headers, timeout=30)
        response.raise_for_status()
        data = response.json()
        return data.get('records', data.get('data', []))
    
    def _connect_db(self):
        """Create database connection"""
        try:
            import pyodbc
        except ImportError:
            logger.error("pyodbc not installed. Install with: pip install pyodbc")
            raise ImportError("pyodbc required for database connection")
        
        conn_str = (
            f"DRIVER={{{self.config.db_driver}}};"
            f"SERVER={self.config.db_host},{self.config.db_port};"
            f"DATABASE={self.config.db_name};"
            f"UID={self.config.db_user};"
            f"PWD={self.config.db_password}"
        )
        return pyodbc.connect(conn_str)
    
    def _fetch_via_db_work_orders(self, since: Optional[datetime]) -> list:
        """Fetch work orders from database"""
        conn = self._connect_db()
        cursor = conn.cursor()
        
        query = """
            SELECT wo.WorkOrderId, wo.ProductId, wo.Quantity, wo.Status,
                   wo.PlannedStartDate, wo.PlannedEndDate,
                   wo.ActualStartDate, wo.ActualEndDate,
                   wo.MachineId, wo.LineId, wo.ModifiedAt
            FROM WorkOrders wo
            WHERE 1=1
        """
        params = []
        if since:
            query += " AND wo.ModifiedAt > ?"
            params.append(since)
        
        cursor.execute(query, params)
        columns = [desc[0] for desc in cursor.description]
        
        results = []
        for row in cursor.fetchall():
            results.append(dict(zip(columns, row)))
        
        conn.close()
        return results
    
    def _fetch_via_db_quality(self, since: Optional[datetime]) -> list:
        """Fetch quality inspections from database"""
        conn = self._connect_db()
        cursor = conn.cursor()
        
        query = """
            SELECT qi.InspectionId, qi.WorkOrderId, qi.MachineId,
                   qi.QuantityChecked, qi.QuantityPassed, qi.QuantityFailed,
                   qi.DefectRate, qi.InspectorId, qi.InspectionDate, qi.ModifiedAt
            FROM QualityInspections qi
            WHERE 1=1
        """
        params = []
        if since:
            query += " AND qi.ModifiedAt > ?"
            params.append(since)
        
        cursor.execute(query, params)
        columns = [desc[0] for desc in cursor.description]
        
        results = []
        for row in cursor.fetchall():
            results.append(dict(zip(columns, row)))
        
        conn.close()
        return results
    
    def _fetch_via_db_shifts(self, since: Optional[datetime]) -> list:
        """Fetch operator shifts from database"""
        conn = self._connect_db()
        cursor = conn.cursor()
        
        query = """
            SELECT os.ShiftId, os.OperatorId, os.OperatorName,
                   os.MachineId, os.LineId, os.ShiftDate,
                   os.ShiftType, os.StartTime, os.EndTime, os.ModifiedAt
            FROM OperatorShifts os
            WHERE 1=1
        """
        params = []
        if since:
            query += " AND os.ModifiedAt > ?"
            params.append(since)
        
        cursor.execute(query, params)
        columns = [desc[0] for desc in cursor.description]
        
        results = []
        for row in cursor.fetchall():
            results.append(dict(zip(columns, row)))
        
        conn.close()
        return results


@dataclass
class MESProgress:
    last_sync_at: Optional[str] = None
    last_successful_sync: Optional[str] = None
    records_synced: int = 0
    errors: int = 0
    status: SyncStatus = SyncStatus.IDLE
    error_message: Optional[str] = None


class MESConnector:
    """MES data connector"""
    
    def __init__(
        self,
        config: MESConfig,
        state_file: str = ".mes_connector_state.json"
    ):
        self.config = config
        self.state_file = state_file
        self.progress = self._load_state()
        self.client = MESSyncClient(config)
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
    
    def _load_state(self) -> MESProgress:
        """Load sync progress"""
        if Path(self.state_file).exists():
            with open(self.state_file, 'r') as f:
                data = json.load(f)
                data['status'] = SyncStatus(data.get('status', 'idle'))
                return MESProgress(**data)
        return MESProgress()
    
    def _save_state(self):
        """Save sync progress"""
        with self._lock:
            data = asdict(self.progress)
            data['status'] = self.progress.status.value
            with open(self.state_file, 'w') as f:
                json.dump(data, f, indent=2, default=str)
    
    def _transform_work_order(self, record: dict) -> dict:
        """Transform work order to event"""
        status_severity = 'info'
        if record.get('Status') in ('blocked', 'hold'):
            status_severity = 'warning'
        elif record.get('Status') == 'completed':
            status_severity = 'info'
        elif record.get('Status') == 'cancelled':
            status_severity = 'warning'
        
        return {
            'event_type': 'mes_work_order',
            'severity': status_severity,
            'payload': {
                'work_order_id': record.get('WorkOrderId'),
                'product_id': record.get('ProductId'),
                'quantity': record.get('Quantity'),
                'status': record.get('Status'),
                'planned_start': record.get('PlannedStartDate'),
                'planned_end': record.get('PlannedEndDate'),
                'actual_start': record.get('ActualStartDate'),
                'actual_end': record.get('ActualEndDate'),
                'machine_id': record.get('MachineId'),
                'line_id': record.get('LineId'),
                'source': 'mes'
            },
            'asset_id': record.get('MachineId') or record.get('LineId')
        }
    
    def _transform_quality(self, record: dict) -> dict:
        """Transform quality inspection to event"""
        severity = 'info'
        defect_rate = record.get('DefectRate', 0)
        if defect_rate > 5:
            severity = 'error'
        elif defect_rate > 2:
            severity = 'warning'
        
        return {
            'event_type': 'mes_quality',
            'severity': severity,
            'payload': {
                'inspection_id': record.get('InspectionId'),
                'work_order_id': record.get('WorkOrderId'),
                'machine_id': record.get('MachineId'),
                'quantity_checked': record.get('QuantityChecked'),
                'quantity_passed': record.get('QuantityPassed'),
                'quantity_failed': record.get('QuantityFailed'),
                'defect_rate': defect_rate,
                'inspector_id': record.get('InspectorId'),
                'inspection_date': record.get('InspectionDate'),
                'source': 'mes'
            },
            'asset_id': record.get('MachineId')
        }
    
    def _transform_shift(self, record: dict) -> dict:
        """Transform operator shift to event"""
        return {
            'event_type': 'mes_shift',
            'severity': 'info',
            'payload': {
                'shift_id': record.get('ShiftId'),
                'operator_id': record.get('OperatorId'),
                'operator_name': record.get('OperatorName'),
                'machine_id': record.get('MachineId'),
                'line_id': record.get('LineId'),
                'shift_date': record.get('ShiftDate'),
                'shift_type': record.get('ShiftType'),
                'start_time': record.get('StartTime'),
                'end_time': record.get('EndTime'),
                'source': 'mes'
            },
            'asset_id': record.get('MachineId') or record.get('LineId')
        }
    
    def _write_events(self, events: list):
        """Write events to TimescaleDB"""
        from dualwrite import write_event
        import uuid
        
        for event in events:
            asset_id = event.get('asset_id')
            if not asset_id:
                raise ValueError("MES event does not contain an asset identifier")
            try:
                canonical_asset_id = uuid.UUID(str(asset_id))
            except ValueError as exc:
                raise ValueError(
                    f"MES asset identifier {asset_id!r} is not a canonical UUID"
                ) from exc
            
            written = write_event(
                timestamp=datetime.now(),
                asset_id=canonical_asset_id,
                event_type=event['event_type'],
                severity=event['severity'],
                payload=event['payload'],
                source='mes',
                flush=True,
            )
            if not written:
                raise RuntimeError(
                    f"Dual-write rejected MES event {event['event_type']!r}"
                )
    
    def _process_entity(self, entity: str) -> tuple[int, int]:
        """Process a single entity type"""
        since = None
        if self.progress.last_successful_sync:
            since = datetime.fromisoformat(self.progress.last_successful_sync)
        
        try:
            if entity == 'work_orders':
                records = self.client.fetch_work_orders(since)
                transformed = [self._transform_work_order(r) for r in records]
            elif entity == 'quality_inspections':
                records = self.client.fetch_quality_inspections(since)
                transformed = [self._transform_quality(r) for r in records]
            elif entity == 'operator_shifts':
                records = self.client.fetch_operator_shifts(since)
                transformed = [self._transform_shift(r) for r in records]
            else:
                return 0, 0
            
            if transformed:
                self._write_events(transformed)
            
            logger.info(f"Synced {len(transformed)} {entity}")
            return len(transformed), 0
        
        except Exception as e:
            logger.error(f"Failed to sync {entity}: {e}")
            traceback.print_exc()
            return 0, 1
    
    def sync_once(self) -> MESProgress:
        """Run a single sync cycle"""
        logger.info("Starting MES sync")
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
        
        except Exception as e:
            logger.error(f"Sync failed: {e}")
            self.progress.status = SyncStatus.FAILED
            self.progress.error_message = str(e)
        
        self._save_state()
        return self.progress
    
    def _run_loop(self):
        """Background sync loop"""
        while self._running:
            try:
                self.sync_once()
            except Exception as e:
                logger.error(f"Sync loop error: {e}")
            
            for _ in range(self.config.sync_interval):
                if not self._running:
                    break
                time.sleep(1)
    
    def start(self):
        """Start background sync"""
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
    
    def stop(self):
        """Stop background sync"""
        self._running = False
        if self._thread:
            self._thread.join(timeout=10)
        self.progress.status = SyncStatus.PAUSED
        self._save_state()
    
    def get_status(self) -> dict:
        """Get current status"""
        return {
            'name': 'mes_connector',
            'status': self.progress.status.value,
            'last_sync_at': self.progress.last_sync_at,
            'last_successful_sync': self.progress.last_successful_sync,
            'records_synced': self.progress.records_synced,
            'errors': self.progress.errors,
            'error_message': self.progress.error_message,
            'running': self._running
        }


def main():
    parser = argparse.ArgumentParser(description='MES Connector')
    parser.add_argument('--config', type=str)
    parser.add_argument('--once', action='store_true')
    parser.add_argument('--daemon', action='store_true')
    parser.add_argument('--state-file', type=str, default='.mes_connector_state.json')
    
    args = parser.parse_args()
    
    if args.config and Path(args.config).exists():
        config = MESConfig.from_yaml(args.config)
    else:
        config = MESConfig.from_env()
    
    connector = MESConnector(config, state_file=args.state_file)
    
    if args.daemon:
        connector.start()
        try:
            while True:
                time.sleep(30)
                logger.info(connector.get_status())
        except KeyboardInterrupt:
            connector.stop()
    else:
        result = connector.sync_once()
        print(json.dumps(asdict(result), indent=2, default=str))


if __name__ == '__main__':
    main()
