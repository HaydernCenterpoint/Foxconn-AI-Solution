"""
Connector Status API: FastAPI service for managing data connectors

Provides:
- GET /connectors - List all connectors and their status
- GET /connectors/{name} - Get specific connector status
- POST /connectors/{name}/start - Start a connector
- POST /connectors/{name}/stop - Stop a connector
- POST /connectors/{name}/sync - Trigger immediate sync
- GET /connectors/{name}/health - Health check
- GET /api/v1/telemetry/query - Query telemetry data
- GET /api/v1/events/query - Query events

Usage:
    uvicorn api.connector_api:app --host 0.0.0.0 --port 8084
"""

import json
import hashlib
import hmac
import logging
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import psycopg2
from psycopg2.extras import RealDictCursor
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import List, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="MKZ Data Platform - Connector API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

cors_origins = [
    origin.strip()
    for origin in os.getenv("CONNECTOR_CORS_ORIGINS", "").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=bool(cors_origins),
    allow_methods=["*"],
    allow_headers=["X-Connector-API-Key", "Content-Type"],
)

PUBLIC_PATHS = {"/health", "/docs", "/redoc", "/openapi.json"}


@app.middleware("http")
async def require_connector_api_key(request: Request, call_next):
    """Fail closed for data and connector-management routes."""
    if request.method == "OPTIONS" or request.url.path in PUBLIC_PATHS:
        return await call_next(request)

    configured_key = os.getenv("CONNECTOR_API_KEY", "").strip()
    if not configured_key:
        logger.error("CONNECTOR_API_KEY is not configured")
        return JSONResponse(
            status_code=503,
            content={"detail": "Connector API authentication is not configured"},
        )

    supplied_key = request.headers.get("X-Connector-API-Key", "")
    configured_digest = hashlib.sha256(configured_key.encode("utf-8")).digest()
    supplied_digest = hashlib.sha256(supplied_key.encode("utf-8")).digest()
    if not hmac.compare_digest(configured_digest, supplied_digest):
        return JSONResponse(
            status_code=401,
            content={"detail": "Invalid connector API key"},
        )

    return await call_next(request)

# Configuration
POSTGRES_HOST = os.getenv('POSTGRES_HOST', 'localhost')
POSTGRES_PORT = int(os.getenv('POSTGRES_PORT', '5432'))
POSTGRES_DB = os.getenv('POSTGRES_DB', 'factory_db')
POSTGRES_USER = os.getenv('POSTGRES_USER', 'factory_user')
POSTGRES_PASSWORD = os.getenv('POSTGRES_PASSWORD', '')
BUCKET_INTERVALS = {
    '5m': '5 minutes',
    '15m': '15 minutes',
    '1h': '1 hour',
    '1d': '1 day',
}
AGGREGATE_EXPRESSIONS = {
    'avg': 'AVG(value)',
    'min': 'MIN(value)',
    'max': 'MAX(value)',
    'sum': 'SUM(value)',
    'count': 'COUNT(value)',
}
ROLLUP_AGGREGATE_COLUMNS = {
    'avg': 'avg_value',
    'min': 'min_value',
    'max': 'max_value',
}


def get_db_connection():
    """Create database connection"""
    return psycopg2.connect(
        host=POSTGRES_HOST,
        port=POSTGRES_PORT,
        dbname=POSTGRES_DB,
        user=POSTGRES_USER,
        password=POSTGRES_PASSWORD,
        cursor_factory=RealDictCursor,
    )


# Pydantic models
class ConnectorStatus(BaseModel):
    name: str
    status: str
    last_sync_at: Optional[str] = None
    last_successful_sync: Optional[str] = None
    records_synced: int = 0
    errors: int = 0
    error_message: Optional[str] = None
    running: bool = False


class TelemetryQuery(BaseModel):
    asset_ids: Optional[List[str]] = None
    metrics: Optional[List[str]] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    bucket: Optional[str] = "5m"  # 5m, 15m, 1h, 1d
    limit: int = Field(default=1000, le=10000)


class EventQuery(BaseModel):
    asset_ids: Optional[List[str]] = None
    event_types: Optional[List[str]] = None
    severities: Optional[List[str]] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    limit: int = Field(default=100, le=1000)


class TelemetryPoint(BaseModel):
    time: datetime
    asset_id: str
    metric: str
    value: float
    tags: dict = {}


class EventPoint(BaseModel):
    event_id: str
    timestamp: datetime
    asset_id: str
    type: str
    severity: str
    payload: dict


class DLQResolveRequest(BaseModel):
    resolved_by: str = Field(default="admin", min_length=1, max_length=100)


# Connector registry (in-memory state)
class ConnectorRegistry:
    """In-memory registry of connector processes"""
    
    _connectors: dict = {}
    _states: dict = {}

    @classmethod
    def get_or_create(cls, name: str):
        """Return the live connector instance used by admin operations."""
        if name in cls._connectors:
            return cls._connectors[name]

        if name == 'erp':
            from connectors.erp.connector import ERPConnector, ERPConfig
            connector = ERPConnector(ERPConfig.from_env())
        elif name == 'file_watcher':
            from connectors.file_watcher.connector import FileWatcherConnector, FileWatcherConfig
            connector = FileWatcherConnector(FileWatcherConfig.from_env())
        elif name == 'mes':
            from connectors.mes.connector import MESConnector, MESConfig
            connector = MESConnector(MESConfig.from_env())
        else:
            raise HTTPException(status_code=404, detail=f"Unknown connector: {name}")

        cls._connectors[name] = connector
        return connector
    
    @classmethod
    def load_states(cls):
        """Load connector states from state files"""
        state_files = [
            ('erp', '.erp_connector_state.json'),
            ('file_watcher', '.file_watcher_state.json'),
            ('mes', '.mes_connector_state.json'),
        ]
        
        for name, filename in state_files:
            path = Path(filename)
            if path.exists():
                with open(path, 'r') as f:
                    data = json.load(f)
                    cls._states[name] = data
    
    @classmethod
    def get_status(cls, name: str) -> Optional[dict]:
        """Get connector status"""
        if name in cls._connectors:
            status = cls._connectors[name].get_status()
            status['name'] = name
            return status

        cls.load_states()
        
        if name in cls._states:
            state = cls._states[name]
            return {
                'name': name,
                'status': state.get('status', 'unknown'),
                'last_sync_at': state.get('last_sync_at'),
                'last_successful_sync': state.get('last_successful_sync'),
                'records_synced': state.get('records_synced', 0),
                'errors': state.get('errors', 0),
                'error_message': state.get('error_message'),
                'running': state.get('running', False)
            }
        
        # Try to determine status from process
        return {
            'name': name,
            'status': 'unknown',
            'running': False
        }
    
    @classmethod
    def get_all_statuses(cls) -> List[dict]:
        """Get all connector statuses"""
        cls.load_states()
        
        connectors = []
        for name in cls._states.keys():
            status = cls.get_status(name)
            if status:
                connectors.append(status)
        
        # Also include known connectors even if no state file
        for name in ['erp', 'file_watcher', 'mes']:
            if not any(c['name'] == name for c in connectors):
                connectors.append({
                    'name': name,
                    'status': 'unknown',
                    'running': False
                })
        
        return connectors


# API Routes
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        conn = get_db_connection()
        conn.close()
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "degraded", "database": "disconnected", "error": str(e)}


@app.get("/connectors", response_model=List[ConnectorStatus])
async def list_connectors():
    """List all connectors and their status"""
    statuses = ConnectorRegistry.get_all_statuses()
    return [ConnectorStatus(**s) for s in statuses]


@app.get("/connectors/{name}", response_model=ConnectorStatus)
async def get_connector(name: str):
    """Get specific connector status"""
    status = ConnectorRegistry.get_status(name)
    if not status:
        raise HTTPException(status_code=404, detail=f"Connector '{name}' not found")
    return ConnectorStatus(**status)


@app.post("/connectors/{name}/start")
async def start_connector(name: str, background_tasks: BackgroundTasks):
    """Start a connector"""
    # In production, this would spawn the connector process
    logger.info(f"Starting connector: {name}")
    
    # Try to import and start the connector
    try:
        conn = ConnectorRegistry.get_or_create(name)
        conn.start()
        return {"status": "started", "connector": name}
    except HTTPException:
        raise
    except ImportError as e:
        raise HTTPException(status_code=400, detail=f"Connector module not available: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/connectors/{name}/stop")
async def stop_connector(name: str):
    """Stop a connector"""
    logger.info(f"Stopping connector: {name}")
    conn = ConnectorRegistry._connectors.get(name)
    if conn is None:
        raise HTTPException(status_code=404, detail=f"Connector '{name}' is not running")
    conn.stop()
    return {"status": "stopped", "connector": name}


@app.post("/connectors/{name}/sync")
async def trigger_sync(name: str, background_tasks: BackgroundTasks):
    """Trigger immediate sync for a connector"""
    logger.info(f"Triggering sync for: {name}")
    conn = ConnectorRegistry.get_or_create(name)
    
    def run_sync():
        try:
            if name == 'erp':
                conn.sync_once()
            elif name == 'file_watcher':
                conn.scan_once()
            elif name == 'mes':
                conn.sync_once()
        except Exception as e:
            logger.error(f"Sync failed for {name}: {e}")
    
    background_tasks.add_task(run_sync)
    return {"status": "sync_triggered", "connector": name}


@app.get("/connectors/{name}/health")
async def connector_health(name: str):
    """Check connector health"""
    status = ConnectorRegistry.get_status(name)
    if not status:
        raise HTTPException(status_code=404, detail=f"Connector '{name}' not found")
    
    healthy = status.get('status') in ('success', 'idle', 'running')
    return {
        "name": name,
        "healthy": healthy,
        "status": status.get('status'),
        "last_sync": status.get('last_successful_sync'),
        "errors": status.get('errors', 0)
    }


@app.get("/connectors/{name}/dlq")
async def list_connector_dlq(
    name: str,
    resolved: Optional[bool] = Query(False),
    limit: int = Query(100, ge=1, le=1000),
):
    """List connector dead-letter entries for administration."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT d.id, d.failed_at, d.reason, d.record_data,
                       d.retry_count, d.last_retry_at, d.resolved,
                       d.resolved_at, d.resolved_by
                FROM connector_dlq d
                JOIN connector_definitions c ON c.id = d.connector_id
                WHERE c.name = %s AND (%s IS NULL OR d.resolved = %s)
                ORDER BY d.failed_at DESC
                LIMIT %s
                """,
                (name, resolved, resolved, limit),
            )
            rows = cur.fetchall()
        return {'data': [dict(row) for row in rows], 'count': len(rows)}
    except psycopg2.Error as exc:
        logger.error("DLQ list failed for %s: %s", name, exc)
        raise HTTPException(status_code=503, detail="Connector DLQ is unavailable") from exc
    finally:
        if conn is not None:
            conn.close()


@app.post("/connectors/{name}/dlq/{dlq_id}/retry")
async def retry_connector_dlq(name: str, dlq_id: int):
    """Retry one unresolved ERP DLQ record and resolve it on success."""
    if name != 'erp':
        raise HTTPException(
            status_code=400,
            detail=f"Connector '{name}' does not support record retry",
        )

    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT d.id, d.record_data, d.resolved
                FROM connector_dlq d
                JOIN connector_definitions c ON c.id = d.connector_id
                WHERE d.id = %s AND c.name = %s
                FOR UPDATE
                """,
                (dlq_id, name),
            )
            row = cur.fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail="DLQ entry not found")
            if row['resolved']:
                raise HTTPException(status_code=409, detail="DLQ entry is already resolved")

            connector = ConnectorRegistry.get_or_create(name)
            try:
                connector.retry_dlq_record(row['record_data'])
            except Exception as exc:
                cur.execute(
                    """
                    UPDATE connector_dlq
                    SET retry_count = retry_count + 1,
                        last_retry_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                    """,
                    (dlq_id,),
                )
                conn.commit()
                logger.warning("DLQ retry failed for %s/%s: %s", name, dlq_id, exc)
                raise HTTPException(status_code=502, detail="DLQ retry failed") from exc

            cur.execute(
                """
                UPDATE connector_dlq
                SET retry_count = retry_count + 1,
                    last_retry_at = CURRENT_TIMESTAMP,
                    resolved = TRUE,
                    resolved_at = CURRENT_TIMESTAMP,
                    resolved_by = 'retry'
                WHERE id = %s
                """,
                (dlq_id,),
            )
        conn.commit()
        return {"status": "resolved", "connector": name, "dlq_id": dlq_id}
    except HTTPException:
        conn.rollback()
        raise
    except psycopg2.Error as exc:
        if conn is not None:
            conn.rollback()
        logger.error("DLQ retry transaction failed for %s/%s: %s", name, dlq_id, exc)
        raise HTTPException(status_code=503, detail="Connector DLQ is unavailable") from exc
    finally:
        if conn is not None:
            conn.close()


@app.post("/connectors/{name}/dlq/{dlq_id}/resolve")
async def resolve_connector_dlq(
    name: str,
    dlq_id: int,
    request: DLQResolveRequest,
):
    """Manually resolve one connector dead-letter entry."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE connector_dlq d
                SET resolved = TRUE,
                    resolved_at = CURRENT_TIMESTAMP,
                    resolved_by = %s
                FROM connector_definitions c
                WHERE d.id = %s
                  AND d.connector_id = c.id
                  AND c.name = %s
                  AND NOT d.resolved
                RETURNING d.id
                """,
                (request.resolved_by, dlq_id, name),
            )
            row = cur.fetchone()
            if row is None:
                raise HTTPException(
                    status_code=404,
                    detail="Unresolved DLQ entry not found",
                )
        conn.commit()
        return {"status": "resolved", "connector": name, "dlq_id": dlq_id}
    except HTTPException:
        conn.rollback()
        raise
    except psycopg2.Error as exc:
        if conn is not None:
            conn.rollback()
        logger.error("DLQ resolve failed for %s/%s: %s", name, dlq_id, exc)
        raise HTTPException(status_code=503, detail="Connector DLQ is unavailable") from exc
    finally:
        if conn is not None:
            conn.close()


# Telemetry API
@app.get("/api/v1/telemetry/query")
async def query_telemetry(
    asset_ids: Optional[str] = Query(None, description="Comma-separated asset UUIDs"),
    metrics: Optional[str] = Query(None, description="Comma-separated metric names"),
    start_time: Optional[datetime] = Query(None, description="Start time (ISO 8601)"),
    end_time: Optional[datetime] = Query(None, description="End time (ISO 8601)"),
    bucket: Optional[str] = Query("5m", description="Time bucket: 5m, 15m, 1h, 1d"),
    limit: int = Query(1000, ge=1, le=10000),
    aggregate: Optional[str] = Query(None, description="Aggregation: avg, min, max, sum, count")
):
    """
    Query telemetry data from TimescaleDB.
    
    Supports:
    - Filtering by asset_id and metric
    - Time range filtering
    - Time bucketing for downsampling
    - Basic aggregation
    """
    bucket_interval = BUCKET_INTERVALS.get(bucket or '')
    if bucket_interval is None:
        raise HTTPException(status_code=400, detail="Unsupported telemetry bucket")

    aggregate_name = aggregate.strip().lower() if aggregate else None
    aggregate_expression = None
    if aggregate_name:
        aggregate_expression = AGGREGATE_EXPRESSIONS.get(aggregate_name)
        if aggregate_expression is None:
            raise HTTPException(status_code=400, detail="Unsupported telemetry aggregation")

    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Build query
        params = []
        conditions = []
        
        # Determine aggregation level
        rollup_column = ROLLUP_AGGREGATE_COLUMNS.get(aggregate_name or 'avg')
        use_continuous_agg = (
            bucket in ('1h', '1d')
            and rollup_column is not None
            and start_time is None
            and end_time is None
        )
        time_column = 'bucket' if use_continuous_agg else 'time'
        
        # Build WHERE clause
        if asset_ids:
            asset_list = [a.strip() for a in asset_ids.split(',')]
            placeholders = ','.join(['%s'] * len(asset_list))
            conditions.append(f"asset_id IN ({placeholders})")
            params.extend(asset_list)
        
        if metrics:
            metric_list = [m.strip() for m in metrics.split(',')]
            placeholders = ','.join(['%s'] * len(metric_list))
            conditions.append(f"metric IN ({placeholders})")
            params.extend(metric_list)
        
        if start_time:
            conditions.append(f"{time_column} >= %s")
            params.append(start_time)
        
        if end_time:
            conditions.append(f"{time_column} <= %s")
            params.append(end_time)
        
        where_clause = " AND ".join(conditions) if conditions else "1=1"
        
        # Build aggregation
        order_clause = "time DESC"
        
        if use_continuous_agg:
            # Use continuous aggregate for hourly/daily queries
            if bucket == '1h':
                table = 'telemetry_hourly'
            else:
                table = 'telemetry_daily'
            
            query = f"""
                SELECT 
                    bucket AS time,
                    asset_id,
                    metric,
                    {rollup_column} AS value
                FROM {table}
                WHERE {where_clause}
                ORDER BY bucket DESC
                LIMIT %s
            """
            params.append(limit)
        elif aggregate_expression:
            # Aggregation without continuous aggregate
            query = f"""
                SELECT 
                    time_bucket('{bucket_interval}', time) AS time,
                    asset_id,
                    metric,
                    {aggregate_expression} AS value
                FROM telemetry
                WHERE {where_clause}
                GROUP BY 1, 2, 3
                ORDER BY {order_clause}
                LIMIT %s
            """
            params.append(limit)
        else:
            # Raw data query
            query = f"""
                SELECT time, asset_id, metric, value, tags
                FROM telemetry
                WHERE {where_clause}
                ORDER BY {order_clause}
                LIMIT %s
            """
            params.append(limit)
        
        cur.execute(query, params)
        rows = cur.fetchall()
        
        results = []
        for row in rows:
            results.append({
                'time': row['time'].isoformat() if hasattr(row['time'], 'isoformat') else row['time'],
                'asset_id': str(row['asset_id']),
                'metric': row['metric'],
                'value': float(row['value']) if row['value'] is not None else None,
                'tags': row.get('tags', {})
            })
        
        return {
            'data': results,
            'count': len(results),
            'query': {
                'asset_ids': asset_ids,
                'metrics': metrics,
                'start_time': start_time.isoformat() if start_time else None,
                'end_time': end_time.isoformat() if end_time else None,
                'bucket': bucket,
                'aggregate': aggregate
            }
        }
    
    except Exception as e:
        logger.error(f"Telemetry query failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn is not None:
            conn.close()


@app.get("/api/v1/events/query")
async def query_events(
    asset_ids: Optional[str] = Query(None),
    event_types: Optional[str] = Query(None),
    severities: Optional[str] = Query(None),
    start_time: Optional[datetime] = Query(None),
    end_time: Optional[datetime] = Query(None),
    limit: int = Query(100, le=1000)
):
    """Query events from TimescaleDB"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        params = []
        conditions = []
        
        if asset_ids:
            asset_list = [a.strip() for a in asset_ids.split(',')]
            placeholders = ','.join(['%s'] * len(asset_list))
            conditions.append(f"asset_id IN ({placeholders})")
            params.extend(asset_list)
        
        if event_types:
            type_list = [t.strip() for t in event_types.split(',')]
            placeholders = ','.join(['%s'] * len(type_list))
            conditions.append(f"type IN ({placeholders})")
            params.extend(type_list)
        
        if severities:
            sev_list = [s.strip() for s in severities.split(',')]
            placeholders = ','.join(['%s'] * len(sev_list))
            conditions.append(f"severity IN ({placeholders})")
            params.extend(sev_list)
        
        if start_time:
            conditions.append("timestamp >= %s")
            params.append(start_time)
        
        if end_time:
            conditions.append("timestamp <= %s")
            params.append(end_time)
        
        where_clause = " AND ".join(conditions) if conditions else "1=1"
        
        query = f"""
            SELECT event_id, timestamp, asset_id, type, severity, payload, source
            FROM events
            WHERE {where_clause}
            ORDER BY timestamp DESC
            LIMIT %s
        """
        params.append(limit)
        
        cur.execute(query, params)
        rows = cur.fetchall()
        conn.close()
        
        results = []
        for row in rows:
            results.append({
                'event_id': str(row['event_id']),
                'timestamp': row['timestamp'].isoformat() if hasattr(row['timestamp'], 'isoformat') else row['timestamp'],
                'asset_id': str(row['asset_id']),
                'type': row['type'],
                'severity': row['severity'],
                'payload': row.get('payload', {}),
                'source': row.get('source')
            })
        
        return {
            'data': results,
            'count': len(results)
        }
    
    except Exception as e:
        logger.error(f"Events query failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/assets")
async def list_assets(
    type: Optional[str] = Query(None, description="Filter by asset type"),
    limit: int = Query(100, le=1000)
):
    """List all assets"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        query = "SELECT id, name, type, parent_id, metadata, created_at FROM assets"
        params = []
        
        if type:
            query += " WHERE type = %s"
            params.append(type)
        
        query += " ORDER BY name LIMIT %s"
        params.append(limit)
        
        cur.execute(query, params)
        rows = cur.fetchall()
        conn.close()
        
        results = []
        for row in rows:
            results.append({
                'id': str(row['id']),
                'name': row['name'],
                'type': row['type'],
                'parent_id': str(row['parent_id']) if row['parent_id'] else None,
                'metadata': row['metadata'],
                'created_at': row['created_at'].isoformat() if hasattr(row['created_at'], 'isoformat') else row['created_at']
            })
        
        return {'data': results, 'count': len(results)}
    
    except Exception as e:
        logger.error(f"Assets query failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/stats/summary")
async def get_stats_summary():
    """Get summary statistics"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        stats = {}
        
        # Telemetry count
        cur.execute("SELECT COUNT(*) as count FROM telemetry")
        stats['telemetry_total'] = cur.fetchone()['count']
        
        # Telemetry count last 24h
        cur.execute("SELECT COUNT(*) as count FROM telemetry WHERE time > NOW() - INTERVAL '24 hours'")
        stats['telemetry_24h'] = cur.fetchone()['count']
        
        # Events count
        cur.execute("SELECT COUNT(*) as count FROM events")
        stats['events_total'] = cur.fetchone()['count']
        
        # Events count last 24h
        cur.execute("SELECT COUNT(*) as count FROM events WHERE timestamp > NOW() - INTERVAL '24 hours'")
        stats['events_24h'] = cur.fetchone()['count']
        
        # Unique assets
        cur.execute("SELECT COUNT(DISTINCT asset_id) as count FROM telemetry")
        stats['unique_assets'] = cur.fetchone()['count']
        
        # Unique metrics
        cur.execute("SELECT COUNT(DISTINCT metric) as count FROM telemetry")
        stats['unique_metrics'] = cur.fetchone()['count']
        
        conn.close()
        
        return stats
    
    except Exception as e:
        logger.error(f"Stats query failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8084)
