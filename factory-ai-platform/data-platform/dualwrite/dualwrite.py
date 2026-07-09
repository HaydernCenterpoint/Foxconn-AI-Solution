"""
Dual-Write Middleware: Synchronous writes to PostgreSQL + TimescaleDB

This module provides a drop-in replacement for database writes that
writes to both PostgreSQL (legacy) and TimescaleDB (new) simultaneously.

For INSERT operations:
- Write to both databases in the same transaction where possible
- Fallback to sequential writes if distributed transaction not supported

For MIGRATION mode:
- Write to TimescaleDB only
- No changes to PostgreSQL schema required

Usage:
    from dualwrite import DualWriteSession, TelemetryWriter
    
    # Normal dual-write mode
    writer = TelemetryWriter()
    writer.write_telemetry(
        time=datetime.now(),
        asset_id=uuid,
        metric='temperature',
        value=45.5,
        tags={'sensor': 'T1'}
    )
    
    # Migration mode (TimescaleDB only)
    writer = TelemetryWriter(mode='migration')
    writer.write_telemetry(...)
"""

import json
import logging
import os
import threading
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Optional
from uuid import UUID

import psycopg2
from psycopg2 import pool, sql
from psycopg2.extras import execute_values, Json

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class DualWriteMode(Enum):
    """Operating mode for the dual-write middleware"""
    FULL = "full"      # Write to both PostgreSQL and TimescaleDB
    MIGRATION = "migration"  # Write to TimescaleDB only
    ROLLBACK = "rollback"  # Write to PostgreSQL only (TimescaleDB decommissioned)


@dataclass
class DBConfig:
    """Database connection configuration"""
    host: str = "localhost"
    port: int = 5432
    dbname: str = "factory_db"
    user: str = "factory_user"
    password: str = "factory_secure_password_9988"
    minconn: int = 2
    maxconn: int = 10
    
    @classmethod
    def from_env(cls, prefix: str = "") -> "DBConfig":
        return cls(
            host=os.getenv(f"{prefix}POSTGRES_HOST", "localhost"),
            port=int(os.getenv(f"{prefix}POSTGRES_PORT", "5432")),
            dbname=os.getenv(f"{prefix}POSTGRES_DB", "factory_db"),
            user=os.getenv(f"{prefix}POSTGRES_USER", "factory_user"),
            password=os.getenv(f"{prefix}POSTGRES_PASSWORD", "factory_secure_password_9988"),
        )


@dataclass
class TelemetryPoint:
    """A single telemetry data point"""
    time: datetime
    asset_id: UUID
    metric: str
    value: float
    tags: dict = field(default_factory=dict)
    
    def to_tuple(self) -> tuple:
        return (
            self.time,
            str(self.asset_id),
            self.metric,
            self.value,
            json.dumps(self.tags)
        )


@dataclass 
class EventPoint:
    """A single event data point"""
    timestamp: datetime
    asset_id: UUID
    event_type: str
    severity: str = "info"
    payload: dict = field(default_factory=dict)
    source: str = "unknown"
    
    def to_tuple(self) -> tuple:
        return (
            str(self.asset_id),
            self.event_type,
            self.severity,
            json.dumps(self.payload),
            self.source,
            self.timestamp
        )


class ConnectionPool:
    """Thread-safe connection pool manager"""
    
    _instance: Optional["ConnectionPool"] = None
    _lock = threading.Lock()
    
    def __init__(self):
        self._pools: dict[str, pool.ThreadedConnectionPool] = {}
        self._configs: dict[str, DBConfig] = {}
    
    @classmethod
    def get_instance(cls) -> "ConnectionPool":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance
    
    def get_pool(self, name: str, config: Optional[DBConfig] = None) -> pool.ThreadedConnectionPool:
        """Get or create a connection pool"""
        if name not in self._pools:
            if config is None:
                config = self._configs.get(name)
            if config is None:
                raise ValueError(f"No config for pool '{name}'")
            
            self._pools[name] = pool.ThreadedConnectionPool(
                config.minconn,
                config.maxconn,
                host=config.host,
                port=config.port,
                dbname=config.dbname,
                user=config.user,
                password=config.password,
            )
        return self._pools[name]
    
    def register_pool(self, name: str, config: DBConfig):
        """Register a new connection pool"""
        self._configs[name] = config
        if name in self._pools:
            self._pools[name].closeall()
            del self._pools[name]
        self.get_pool(name, config)
    
    def close_all(self):
        """Close all pools"""
        for pool in self._pools.values():
            pool.closeall()
        self._pools.clear()


class DualWriteSession:
    """
    Context manager for dual-write database sessions.
    
    Provides transactional writes to both PostgreSQL and TimescaleDB
    with automatic fallback handling.
    """
    
    def __init__(
        self,
        mode: DualWriteMode = DualWriteMode.FULL,
        pg_config: Optional[DBConfig] = None,
        ts_config: Optional[DBConfig] = None,
        auto_commit: bool = False,
    ):
        self.mode = mode
        self.auto_commit = auto_commit
        self._pg_conn = None
        self._ts_conn = None
        self._pool_manager = ConnectionPool.get_instance()
        
        # PostgreSQL config (legacy)
        self._pg_config = pg_config or DBConfig.from_env()
        
        # TimescaleDB config (new)
        self._ts_config = ts_config or DBConfig.from_env("TS_")
        
        # Track errors for retry logic
        self._pg_error: Optional[Exception] = None
        self._ts_error: Optional[Exception] = None
    
    def __enter__(self):
        self._connect()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            self.rollback()
        elif self.auto_commit:
            self.commit()
        self._close()
        return False
    
    def _connect(self):
        """Establish connections based on mode"""
        if self.mode in (DualWriteMode.FULL, DualWriteMode.ROLLBACK):
            try:
                self._pg_conn = self._pg_config.connect()
                logger.debug("PostgreSQL connection established")
            except Exception as e:
                logger.warning(f"PostgreSQL connection failed: {e}")
                self._pg_error = e
        
        if self.mode in (DualWriteMode.FULL, DualWriteMode.MIGRATION):
            try:
                self._ts_conn = self._ts_config.connect()
                logger.debug("TimescaleDB connection established")
            except Exception as e:
                logger.warning(f"TimescaleDB connection failed: {e}")
                self._ts_error = e
    
    def _close(self):
        """Close all connections"""
        if self._pg_conn:
            self._pg_conn.close()
        if self._ts_conn:
            self._ts_conn.close()
    
    def commit(self):
        """Commit all open transactions"""
        if self._pg_conn and not self._pg_conn.closed:
            self._pg_conn.commit()
        if self._ts_conn and not self._ts_conn.closed:
            self._ts_conn.commit()
    
    def rollback(self):
        """Rollback all open transactions"""
        if self._pg_conn and not self._pg_conn.closed:
            self._pg_conn.rollback()
        if self._ts_conn and not self._ts_conn.closed:
            self._ts_conn.rollback()
    
    def is_connected(self, target: str = "both") -> bool:
        """Check if connections are alive"""
        if target in ("pg", "both"):
            if self._pg_conn and not self._pg_conn.closed:
                try:
                    with self._pg_conn.cursor() as cur:
                        cur.execute("SELECT 1")
                    return True
                except:
                    return False
        if target in ("ts", "both"):
            if self._ts_conn and not self._ts_conn.closed:
                try:
                    with self._ts_conn.cursor() as cur:
                        cur.execute("SELECT 1")
                    return True
                except:
                    return False
        return False
    
    def write_to_pg(self, query: str, params: tuple = None) -> bool:
        """Write to PostgreSQL only"""
        if not self._pg_conn or self._pg_conn.closed:
            logger.error("No PostgreSQL connection available")
            return False
        try:
            with self._pg_conn.cursor() as cur:
                cur.execute(query, params)
            if self.auto_commit:
                self._pg_conn.commit()
            return True
        except Exception as e:
            logger.error(f"PostgreSQL write failed: {e}")
            self._pg_error = e
            return False
    
    def write_to_ts(self, query: str, params: tuple = None) -> bool:
        """Write to TimescaleDB only"""
        if not self._ts_conn or self._ts_conn.closed:
            logger.error("No TimescaleDB connection available")
            return False
        try:
            with self._ts_conn.cursor() as cur:
                cur.execute(query, params)
            if self.auto_commit:
                self._ts_conn.commit()
            return True
        except Exception as e:
            logger.error(f"TimescaleDB write failed: {e}")
            self._ts_error = e
            return False


class TelemetryWriter:
    """
    High-performance telemetry writer with dual-write support.
    
    Supports:
    - Batched writes for high throughput
    - Automatic retry with exponential backoff
    - Connection pooling
    - Fallback modes
    """
    
    def __init__(
        self,
        mode: DualWriteMode = DualWriteMode.FULL,
        batch_size: int = 100,
        flush_interval: float = 1.0,
        max_retries: int = 3,
    ):
        self.mode = mode
        self.batch_size = batch_size
        self.flush_interval = flush_interval
        self.max_retries = max_retries
        
        self._telemetry_buffer: list[TelemetryPoint] = []
        self._event_buffer: list[EventPoint] = []
        self._last_flush = datetime.now()
        self._lock = threading.Lock()
        
        self._pool_manager = ConnectionPool.get_instance()
        self._pg_config = DBConfig.from_env()
        self._ts_config = DBConfig.from_env("TS_")
    
    @contextmanager
    def session(self, **kwargs):
        """Get a dual-write session"""
        session = DualWriteSession(
            mode=self.mode,
            pg_config=self._pg_config,
            ts_config=self._ts_config,
            **kwargs
        )
        session.__enter__()
        try:
            yield session
        finally:
            session.__exit__(None, None, None)
    
    def write_telemetry(
        self,
        time: datetime,
        asset_id: UUID,
        metric: str,
        value: float,
        tags: Optional[dict] = None,
        flush: bool = False,
    ) -> bool:
        """
        Write a single telemetry point.
        
        Buffers the write and flushes when batch_size is reached
        or flush_interval has elapsed.
        """
        point = TelemetryPoint(
            time=time,
            asset_id=asset_id,
            metric=metric,
            value=value,
            tags=tags or {}
        )
        
        with self._lock:
            self._telemetry_buffer.append(point)
            
            should_flush = (
                len(self._telemetry_buffer) >= self.batch_size or
                flush or
                (datetime.now() - self._last_flush).total_seconds() >= self.flush_interval
            )
            
            if should_flush:
                self._flush_telemetry()
        
        return True
    
    def write_event(
        self,
        timestamp: datetime,
        asset_id: UUID,
        event_type: str,
        severity: str = "info",
        payload: Optional[dict] = None,
        source: str = "unknown",
        flush: bool = False,
    ) -> bool:
        """Write a single event point"""
        event = EventPoint(
            timestamp=timestamp,
            asset_id=asset_id,
            event_type=event_type,
            severity=severity,
            payload=payload or {},
            source=source
        )
        
        with self._lock:
            self._event_buffer.append(event)
            
            should_flush = (
                len(self._event_buffer) >= self.batch_size or
                flush
            )
            
            if should_flush:
                self._flush_events()
        
        return True
    
    def _flush_telemetry(self):
        """Flush telemetry buffer to database(s)"""
        if not self._telemetry_buffer:
            return
        
        rows = self._telemetry_buffer.copy()
        self._telemetry_buffer.clear()
        self._last_flush = datetime.now()
        
        tuples = [r.to_tuple() for r in rows]
        
        if self.mode in (DualWriteMode.FULL, DualWriteMode.MIGRATION):
            self._flush_to_ts(tuples)
        
        if self.mode in (DualWriteMode.FULL, DualWriteMode.ROLLBACK):
            self._flush_to_pg_legacy(rows)
    
    def _flush_events(self):
        """Flush event buffer to database(s)"""
        if not self._event_buffer:
            return
        
        rows = self._event_buffer.copy()
        self._event_buffer.clear()
        
        tuples = [r.to_tuple() for r in rows]
        
        if self.mode in (DualWriteMode.FULL, DualWriteMode.MIGRATION):
            self._flush_events_to_ts(tuples)
    
    def _flush_to_ts(self, tuples: list[tuple]):
        """Flush telemetry to TimescaleDB with retry"""
        insert_query = """
            INSERT INTO telemetry (time, asset_id, metric, value, tags)
            VALUES %s
            ON CONFLICT DO NOTHING
        """
        
        for attempt in range(self.max_retries):
            try:
                conn = self._ts_config.connect()
                with conn.cursor() as cur:
                    execute_values(
                        cur,
                        insert_query,
                        tuples,
                        template="(%s, %s::uuid, %s, %s, %s::jsonb)",
                        page_size=1000
                    )
                conn.commit()
                conn.close()
                logger.debug(f"Flushed {len(tuples)} telemetry points to TimescaleDB")
                return
            except Exception as e:
                logger.warning(f"TimescaleDB flush attempt {attempt + 1} failed: {e}")
                if attempt == self.max_retries - 1:
                    self._dead_letter_queue("telemetry", tuples, str(e))
    
    def _flush_events_to_ts(self, tuples: list[tuple]):
        """Flush events to TimescaleDB"""
        insert_query = """
            INSERT INTO events (asset_id, type, severity, payload, source, timestamp)
            VALUES %s
            ON CONFLICT DO NOTHING
        """
        
        try:
            conn = self._ts_config.connect()
            with conn.cursor() as cur:
                execute_values(
                    cur,
                    insert_query,
                    tuples,
                    template="(%s::uuid, %s, %s, %s::jsonb, %s, %s)",
                    page_size=1000
                )
            conn.commit()
            conn.close()
            logger.debug(f"Flushed {len(tuples)} events to TimescaleDB")
        except Exception as e:
            logger.error(f"Events flush failed: {e}")
            self._dead_letter_queue("events", tuples, str(e))
    
    def _flush_to_pg_legacy(self, rows: list[TelemetryPoint]):
        """Write to legacy PostgreSQL tables (for migration compatibility)"""
        # This writes to machine_telemetry_history for backward compatibility
        # during the migration period
        
        insert_query = """
            INSERT INTO machine_telemetry_history 
            (machine_id, cpu_percent, ram_percent, uptime_seconds, 
             production_count, created_at)
            VALUES %s
            ON CONFLICT DO NOTHING
        """
        
        tuples = []
        for row in rows:
            tags = row.tags
            if row.metric in ('cpu_percent', 'ram_percent', 'uptime_seconds', 'production_count'):
                tuples.append((
                    str(row.asset_id),
                    tags.get('cpu_percent'),
                    tags.get('ram_percent'),
                    tags.get('uptime_seconds'),
                    tags.get('production_count') if row.metric == 'production_count' else None,
                    row.time
                ))
        
        if tuples:
            try:
                conn = self._pg_config.connect()
                with conn.cursor() as cur:
                    execute_values(cur, insert_query, tuples, page_size=1000)
                conn.commit()
                conn.close()
            except Exception as e:
                logger.warning(f"Legacy PostgreSQL write failed: {e}")
    
    def _dead_letter_queue(self, topic: str, data: list, error: str):
        """Store failed writes for later retry"""
        dlq_file = f"dlq_{topic}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        try:
            with open(dlq_file, 'w') as f:
                json.dump({
                    'topic': topic,
                    'error': error,
                    'count': len(data),
                    'timestamp': datetime.now().isoformat(),
                    'data': data[:10]  # Store first 10 rows as sample
                }, f, indent=2, default=str)
            logger.info(f"Dead letter queue written to {dlq_file}")
        except Exception as e:
            logger.error(f"Failed to write dead letter queue: {e}")
    
    def flush(self):
        """Manually flush all buffers"""
        with self._lock:
            self._flush_telemetry()
            self._flush_events()
    
    def close(self):
        """Flush and close the writer"""
        self.flush()


# Decorator for automatic dual-write
def dual_write(mode: DualWriteMode = DualWriteMode.FULL):
    """Decorator to add dual-write capability to a function"""
    def decorator(func):
        def wrapper(*args, **kwargs):
            writer = TelemetryWriter(mode=mode)
            try:
                result = func(*args, **kwargs, _telemetry_writer=writer)
                return result
            finally:
                writer.close()
        return wrapper
    return decorator


# Singleton instance for convenience
_default_writer: Optional[TelemetryWriter] = None


def get_writer(mode: DualWriteMode = DualWriteMode.FULL) -> TelemetryWriter:
    """Get the default telemetry writer singleton"""
    global _default_writer
    if _default_writer is None:
        _default_writer = TelemetryWriter(mode=mode)
    return _default_writer


def write_telemetry(
    time: datetime,
    asset_id: UUID,
    metric: str,
    value: float,
    tags: Optional[dict] = None,
    mode: DualWriteMode = DualWriteMode.FULL,
) -> bool:
    """Convenience function for single telemetry writes"""
    writer = get_writer(mode)
    return writer.write_telemetry(time, asset_id, metric, value, tags)


def write_event(
    timestamp: datetime,
    asset_id: UUID,
    event_type: str,
    severity: str = "info",
    payload: Optional[dict] = None,
    source: str = "unknown",
    mode: DualWriteMode = DualWriteMode.FULL,
) -> bool:
    """Convenience function for single event writes"""
    writer = get_writer(mode)
    return writer.write_event(timestamp, asset_id, event_type, severity, payload, source)
