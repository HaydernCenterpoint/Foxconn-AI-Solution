"""
Backfill Script: Migrate historical telemetry data to TimescaleDB

Resumable with progress tracking. Uses batch processing to avoid memory issues.
Supports checkpoint/resume on interruption.

Usage:
    python backfill.py [--batch-size 5000] [--workers 4] [--resume]

Environment Variables:
    POSTGRES_HOST: Database host (default: localhost)
    POSTGRES_PORT: Database port (default: 5432)
    POSTGRES_DB: Database name (default: factory_db)
    POSTGRES_USER: Database user (default: factory_user)
    POSTGRES_PASSWORD: Database password
    CHECKPOINT_FILE: Path to checkpoint file (default: .backfill_checkpoint.json)
"""

import argparse
import json
import logging
import os
import sys
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

import psycopg2
from psycopg2 import sql
from psycopg2.extras import execute_values

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('backfill.log')
    ]
)
logger = logging.getLogger(__name__)


@dataclass
class BackfillConfig:
    batch_size: int = 5000
    workers: int = 4
    checkpoint_file: str = '.backfill_checkpoint.json'
    source_table: str = 'machine_telemetry_history'
    target_table: str = 'telemetry'
    chunk_size: int = 1000  # Rows per insert batch


@dataclass
class BackfillProgress:
    last_processed_id: Optional[int] = None
    total_migrated: int = 0
    total_failed: int = 0
    last_updated: str = field(default_factory=lambda: datetime.now().isoformat())
    source_table: str = 'machine_telemetry_history'
    status: str = 'running'  # running, completed, failed, paused
    
    def save(self, filepath: str):
        with open(filepath, 'w') as f:
            json.dump(asdict(self), f, indent=2)
    
    @classmethod
    def load(cls, filepath: str) -> 'BackfillProgress':
        if Path(filepath).exists():
            with open(filepath, 'r') as f:
                data = json.load(f)
                return cls(**data)
        return cls()


class BackfillRunner:
    
    METRIC_MAPPINGS = [
        ('production_count', 'production_count', 'int'),
        ('cycle_time', 'cycle_time', 'float'),
        ('cpu_percent', 'cpu_percent', 'float'),
        ('ram_percent', 'ram_percent', 'float'),
        ('uptime_seconds', 'uptime_seconds', 'float'),
    ]
    
    def __init__(self, config: BackfillConfig):
        self.config = config
        self.progress = BackfillProgress.load(config.checkpoint_file)
        self.progress.source_table = config.source_table
        self.conn = None
    
    def _get_connection(self):
        return psycopg2.connect(
            host=os.getenv('POSTGRES_HOST', 'localhost'),
            port=int(os.getenv('POSTGRES_PORT', '5432')),
            dbname=os.getenv('POSTGRES_DB', 'factory_db'),
            user=os.getenv('POSTGRES_USER', 'factory_user'),
            password=os.getenv('POSTGRES_PASSWORD', 'factory_secure_password_9988'),
        )
    
    def _get_batch_query(self) -> tuple[str, str, list]:
        """Returns (SELECT query, INSERT query template, params)"""
        
        if self.config.source_table == 'machine_telemetry_history':
            select_cols = [
                'id', 'machine_id', 'created_at', 'status', 'plc_connected',
                'production_count', 'cycle_time', 'cpu_percent', 'ram_percent', 'uptime_seconds'
            ]
            
            where_clause = ""
            params = []
            if self.progress.last_processed_id:
                where_clause = "WHERE id > %s"
                params = [self.progress.last_processed_id]
            
            select_query = f"""
                SELECT {', '.join(select_cols)}
                FROM {self.config.source_table}
                {where_clause}
                ORDER BY id
                LIMIT %s
            """
            params.append(self.config.batch_size)
            
            return select_query, params
        
        elif self.config.source_table == 'machine_hourly_production':
            where_clause = ""
            params = []
            if self.progress.last_processed_id:
                where_clause = "WHERE id > %s"
                params = [self.progress.last_processed_id]
            
            select_query = f"""
                SELECT id, machine_id, received_at, prod_date, prod_hour,
                       hourly_qty, produced_qty_start, produced_qty_end,
                       plc_run_time_start, plc_run_time_end,
                       avg_cpu, avg_ram, oee_availability
                FROM {self.config.source_table}
                {where_clause}
                ORDER BY id
                LIMIT %s
            """
            params.append(self.config.batch_size)
            
            return select_query, params
        
        elif self.config.source_table == 'machine_telemetry':
            where_clause = ""
            params = []
            if self.progress.last_processed_id:
                where_clause = "WHERE id > %s"
                params = [self.progress.last_processed_id]
            
            select_query = f"""
                SELECT id, machine_id, created_at, raw_json, sequence
                FROM {self.config.source_table}
                {where_clause}
                ORDER BY id
                LIMIT %s
            """
            params.append(self.config.batch_size)
            
            return select_query, params
        
        else:
            raise ValueError(f"Unknown source table: {self.config.source_table}")
    
    def _transform_history_row(self, row: dict) -> list:
        """Transform a machine_telemetry_history row to telemetry rows"""
        rows = []
        base_time = row['created_at']
        asset_id = row['machine_id']
        
        for col_name, metric_name, _ in self.METRIC_MAPPINGS:
            if row.get(col_name) is not None:
                rows.append((
                    base_time,
                    asset_id,
                    metric_name,
                    float(row[col_name]),
                    json.dumps({
                        'source_table': 'machine_telemetry_history',
                        'status': row.get('status'),
                        'plc_connected': row.get('plc_connected')
                    })
                ))
        
        return rows
    
    def _transform_hourly_row(self, row: dict) -> list:
        """Transform a machine_hourly_production row to telemetry rows"""
        rows = []
        
        prod_date = row['prod_date']
        prod_hour = row['prod_hour']
        hour_time = datetime.strptime(f"{prod_date} {prod_hour:02d}:00:00", "%Y-%m-%d %H:%M:%S")
        hour_time = hour_time.replace(tzinfo=psycopg2.tz.FixedOffsetTimezone(offset=420))  # +07:00
        
        asset_id = row['machine_id']
        tags_base = {
            'source_table': 'machine_hourly_production',
            'prod_date': str(prod_date),
            'prod_hour': prod_hour,
            'oee_availability': row.get('oee_availability')
        }
        
        metrics = [
            ('hourly_qty', row.get('hourly_qty')),
            ('produced_qty_start', row.get('produced_qty_start')),
            ('produced_qty_end', row.get('produced_qty_end')),
            ('plc_run_time', 
             (row.get('plc_run_time_end') or 0) - (row.get('plc_run_time_start') or 0)),
            ('avg_cpu', row.get('avg_cpu')),
            ('avg_ram', row.get('avg_ram')),
            ('oee_availability', row.get('oee_availability')),
        ]
        
        for metric_name, value in metrics:
            if value is not None:
                rows.append((
                    hour_time,
                    asset_id,
                    metric_name,
                    float(value),
                    json.dumps(tags_base)
                ))
        
        return rows
    
    def _transform_telemetry_row(self, row: dict) -> list:
        """Transform a machine_telemetry row (raw_json) to telemetry rows"""
        rows = []
        base_time = row['created_at']
        asset_id = row['machine_id']
        raw_json = row.get('raw_json', {})
        
        if isinstance(raw_json, str):
            raw_json = json.loads(raw_json)
        
        tags = {
            'source_table': 'machine_telemetry',
            'sequence': row.get('sequence'),
            'client_id': raw_json.get('clientId')
        }
        
        metrics = [
            ('production_count', raw_json.get('productionCount')),
            ('cpu_percent', raw_json.get('computer', {}).get('cpuPercent')),
            ('ram_percent', raw_json.get('computer', {}).get('ramPercent')),
            ('uptime_seconds', raw_json.get('computer', {}).get('uptimeSeconds')),
            ('plc_connected', 1 if raw_json.get('plcConnected') else 0),
        ]
        
        for metric_name, value in metrics:
            if value is not None:
                try:
                    rows.append((
                        base_time,
                        asset_id,
                        metric_name,
                        float(value),
                        json.dumps(tags)
                    ))
                except (TypeError, ValueError):
                    pass
        
        return rows
    
    def _process_batch(self, conn, rows: list) -> tuple[int, int]:
        """Insert rows into telemetry, return (success_count, failed_count)"""
        if not rows:
            return 0, 0
        
        insert_query = """
            INSERT INTO telemetry (time, asset_id, metric, value, tags)
            VALUES %s
            ON CONFLICT DO NOTHING
        """
        
        try:
            with conn.cursor() as cur:
                execute_values(
                    cur,
                    insert_query,
                    rows,
                    template="(%s, %s, %s, %s, %s::jsonb)",
                    page_size=self.config.chunk_size
                )
            conn.commit()
            return len(rows), 0
        except Exception as e:
            logger.error(f"Batch insert failed: {e}")
            conn.rollback()
            
            # Fallback: try one at a time
            success = 0
            failed = 0
            for row in rows:
                try:
                    with conn.cursor() as cur:
                        cur.execute("""
                            INSERT INTO telemetry (time, asset_id, metric, value, tags)
                            VALUES (%s, %s, %s, %s, %s::jsonb)
                            ON CONFLICT DO NOTHING
                        """, row)
                    conn.commit()
                    success += 1
                except Exception as e2:
                    logger.warning(f"Row insert failed: {e2}")
                    conn.rollback()
                    failed += 1
            
            return success, failed
    
    def run(self):
        """Main backfill loop"""
        logger.info(f"Starting backfill: {self.config}")
        logger.info(f"Resuming from checkpoint: {self.progress.last_processed_id}, "
                   f"total migrated: {self.progress.total_migrated}")
        
        try:
            self.conn = self._get_connection()
            
            while True:
                try:
                    select_query, params = self._get_batch_query()
                    
                    with self.conn.cursor() as cur:
                        cur.execute(select_query, params)
                        rows = cur.fetchall()
                        columns = [desc[0] for desc in cur.description]
                    
                    if not rows:
                        logger.info("No more rows to process. Migration complete!")
                        self.progress.status = 'completed'
                        self.progress.save(self.config.checkpoint_file)
                        break
                    
                    # Transform rows
                    transformed_rows = []
                    last_id = None
                    
                    for row in rows:
                        row_dict = dict(zip(columns, row))
                        last_id = row_dict['id']
                        
                        if self.config.source_table == 'machine_telemetry_history':
                            transformed_rows.extend(self._transform_history_row(row_dict))
                        elif self.config.source_table == 'machine_hourly_production':
                            transformed_rows.extend(self._transform_hourly_row(row_dict))
                        elif self.config.source_table == 'machine_telemetry':
                            transformed_rows.extend(self._transform_telemetry_row(row_dict))
                    
                    # Insert transformed rows
                    success, failed = self._process_batch(self.conn, transformed_rows)
                    
                    # Update progress
                    self.progress.last_processed_id = last_id
                    self.progress.total_migrated += success
                    self.progress.total_failed += failed
                    self.progress.last_updated = datetime.now().isoformat()
                    self.progress.save(self.config.checkpoint_file)
                    
                    logger.info(f"Batch processed: {len(rows)} source rows -> "
                              f"{success} telemetry rows inserted, {failed} failed. "
                              f"Total: {self.progress.total_migrated}")
                    
                    # Small delay to avoid overwhelming the DB
                    time.sleep(0.1)
                
                except KeyboardInterrupt:
                    logger.info("Interrupted. Saving checkpoint...")
                    self.progress.status = 'paused'
                    self.progress.save(self.config.checkpoint_file)
                    break
        
        except Exception as e:
            logger.error(f"Backfill failed: {e}")
            self.progress.status = 'failed'
            self.progress.save(self.config.checkpoint_file)
            raise
        
        finally:
            if self.conn:
                self.conn.close()
        
        return self.progress


def run_all_sources(config: BackfillConfig) -> dict:
    """Run backfill for all source tables in sequence"""
    results = {}
    
    sources = [
        'machine_telemetry_history',
        'machine_hourly_production',
        'machine_telemetry',
    ]
    
    for source in sources:
        logger.info(f"\n{'='*60}")
        logger.info(f"Migrating: {source}")
        logger.info(f"{'='*60}\n")
        
        config.source_table = source
        config.checkpoint_file = f".backfill_checkpoint_{source}.json"
        
        runner = BackfillRunner(config)
        progress = runner.run()
        results[source] = asdict(progress)
        
        if progress.status == 'failed':
            logger.error(f"Migration failed for {source}. Stopping.")
            break
    
    return results


def main():
    parser = argparse.ArgumentParser(description='Backfill historical telemetry to TimescaleDB')
    parser.add_argument('--batch-size', type=int, default=5000,
                       help='Number of rows to fetch per batch (default: 5000)')
    parser.add_argument('--workers', type=int, default=4,
                       help='Number of worker threads (default: 4)')
    parser.add_argument('--resume', action='store_true',
                       help='Resume from existing checkpoint')
    parser.add_argument('--source', type=str, choices=[
                       'machine_telemetry_history', 'machine_hourly_production',
                       'machine_telemetry', 'all'],
                       default='all', help='Source table to migrate')
    parser.add_argument('--checkpoint-file', type=str,
                       default='.backfill_checkpoint.json',
                       help='Checkpoint file path')
    
    args = parser.parse_args()
    
    config = BackfillConfig(
        batch_size=args.batch_size,
        workers=args.workers,
        checkpoint_file=args.checkpoint_file
    )
    
    if args.source == 'all':
        results = run_all_sources(config)
        logger.info(f"\n{'='*60}")
        logger.info("BACKFILL COMPLETE")
        logger.info(f"{'='*60}")
        for source, result in results.items():
            logger.info(f"{source}: {result}")
    else:
        config.source_table = args.source
        runner = BackfillRunner(config)
        result = runner.run()
        logger.info(f"\nBackfill result: {asdict(result)}")


if __name__ == '__main__':
    main()
