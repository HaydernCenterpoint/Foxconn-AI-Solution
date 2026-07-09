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
import logging
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import psycopg2
from psycopg2.extras import RealDictCursor
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
POSTGRES_HOST = os.getenv('POSTGRES_HOST', 'localhost')
POSTGRES_PORT = int(os.getenv('POSTGRES_PORT', '5432'))
POSTGRES_DB = os.getenv('POSTGRES_DB', 'factory_db')
POSTGRES_USER = os.getenv('POSTGRES_USER', 'factory_user')
POSTGRES_PASSWORD = os.getenv('POSTGRES_PASSWORD', 'factory_secure_password_9988')


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


# Connector registry (in-memory state)
class ConnectorRegistry:
    """In-memory registry of connector processes"""
    
    _connectors: dict = {}
    _states: dict = {}
    
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
        if name == 'erp':
            from connectors.erp.connector import ERPConnector, ERPConfig
            config = ERPConfig.from_env()
            conn = ERPConnector(config)
            conn.start()
        elif name == 'file_watcher':
            from connectors.file_watcher.connector import FileWatcherConnector, FileWatcherConfig
            config = FileWatcherConfig.from_env()
            conn = FileWatcherConnector(config)
            conn.start()
        elif name == 'mes':
            from connectors.mes.connector import MESConnector, MESConfig
            config = MESConfig.from_env()
            conn = MESConnector(config)
            conn.start()
        else:
            raise HTTPException(status_code=404, detail=f"Unknown connector: {name}")
        
        return {"status": "started", "connector": name}
    except ImportError as e:
        raise HTTPException(status_code=400, detail=f"Connector module not available: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/connectors/{name}/stop")
async def stop_connector(name: str):
    """Stop a connector"""
    logger.info(f"Stopping connector: {name}")
    # In production, this would stop the connector process
    return {"status": "stopped", "connector": name}


@app.post("/connectors/{name}/sync")
async def trigger_sync(name: str, background_tasks: BackgroundTasks):
    """Trigger immediate sync for a connector"""
    logger.info(f"Triggering sync for: {name}")
    
    def run_sync():
        try:
            if name == 'erp':
                from connectors.erp.connector import ERPConnector, ERPConfig
                config = ERPConfig.from_env()
                conn = ERPConnector(config)
                conn.sync_once()
            elif name == 'file_watcher':
                from connectors.file_watcher.connector import FileWatcherConnector, FileWatcherConfig
                config = FileWatcherConfig.from_env()
                conn = FileWatcherConnector(config)
                conn.scan_once()
            elif name == 'mes':
                from connectors.mes.connector import MESConnector, MESConfig
                config = MESConfig.from_env()
                conn = MESConnector(config)
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


# Telemetry API
@app.get("/api/v1/telemetry/query")
async def query_telemetry(
    asset_ids: Optional[str] = Query(None, description="Comma-separated asset UUIDs"),
    metrics: Optional[str] = Query(None, description="Comma-separated metric names"),
    start_time: Optional[datetime] = Query(None, description="Start time (ISO 8601)"),
    end_time: Optional[datetime] = Query(None, description="End time (ISO 8601)"),
    bucket: Optional[str] = Query("5m", description="Time bucket: 5m, 15m, 1h, 1d"),
    limit: int = Query(1000, le=10000),
    aggregate: Optional[str] = Query(None, description="Aggregation: avg, min, max, sum")
):
    """
    Query telemetry data from TimescaleDB.
    
    Supports:
    - Filtering by asset_id and metric
    - Time range filtering
    - Time bucketing for downsampling
    - Basic aggregation
    """
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Build query
        params = []
        conditions = []
        
        # Determine aggregation level
        use_continuous_agg = False
        if bucket in ('1h', '1d'):
            use_continuous_agg = True
        
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
            conditions.append("time >= %s")
            params.append(start_time)
        
        if end_time:
            conditions.append("time <= %s")
            params.append(end_time)
        
        where_clause = " AND ".join(conditions) if conditions else "1=1"
        
        # Build aggregation
        agg_clause = ""
        group_clause = ""
        order_clause = "time DESC"
        
        if use_continuous_agg and not aggregate:
            # Use continuous aggregate for hourly/daily queries
            if bucket == '1h':
                table = 'telemetry_hourly'
                bucket_expr = "time_bucket('1 hour', bucket)"
            else:
                table = 'telemetry_daily'
                bucket_expr = "time_bucket('1 day', bucket)"
            
            query = f"""
                SELECT 
                    {bucket_expr} AS time,
                    asset_id,
                    metric,
                    AVG(avg_value) AS value,
                    COUNT(*) AS sample_count
                FROM {table}
                WHERE {where_clause}
                GROUP BY 1, 2, 3
                ORDER BY {order_clause}
                LIMIT %s
            """
            params.append(limit)
        elif aggregate:
            # Aggregation without continuous aggregate
            agg_func = aggregate.upper()
            if agg_func == 'AVG':
                agg_clause = f"{agg_func}(value)"
            elif agg_func in ('MIN', 'MAX', 'SUM', 'COUNT'):
                agg_clause = f"{agg_func}(value)"
            else:
                agg_clause = f"AVG(value)"
            
            group_clause = "GROUP BY asset_id, metric"
            
            query = f"""
                SELECT 
                    time_bucket('{bucket}', time) AS time,
                    asset_id,
                    metric,
                    {agg_clause} AS value
                FROM telemetry
                WHERE {where_clause}
                {group_clause}
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
        conn.close()
        
        results = []
        for row in rows:
            results.append({
                'time': row['time'].isoformat() if hasattr(row['time'], 'isoformat') else row['time'],
                'asset_id': str(row['asset_id']),
                'metric': row['metric'],
                'value': float(row['value']) if row['value'] else None,
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
