"""
sync_mkz_to_odysseus.py

Script để đồng bộ dữ liệu từ MKZ Factory PLC database lên Odysseus.
"""

import os
import sys
import json
import logging
import argparse
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Any

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("mkz_sync")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


class Config:
    MKZ_DB = {
        "host": os.getenv("MKZ_DB_HOST", "localhost"),
        "port": int(os.getenv("MKZ_DB_PORT", "5432")),
        "database": os.getenv("MKZ_DB_NAME", "plc_monitoring"),
        "user": os.getenv("MKZ_DB_USER", "postgres"),
        "password": os.getenv("MKZ_DB_PASSWORD", "12345678"),
    }
    ODYSSEUS_ROOT = Path(os.getenv("ODYSSEUS_ROOT", str(Path(__file__).parent.parent)))
    DATA_DIR = ODYSSEUS_ROOT / "data"
    EXPORT_DIR = DATA_DIR / "mkz_exports"


def get_mkz_connection():
    try:
        import psycopg2
        import psycopg2.extras
        return psycopg2.connect(
            **Config.MKZ_DB,
            cursor_factory=psycopg2.extras.RealDictCursor
        )
    except ImportError:
        logger.error("psycopg2 not installed. Run: pip install psycopg2-binary")
        sys.exit(1)


def execute_query(query: str, params: tuple = None) -> List[Dict]:
    with get_mkz_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            return [dict(row) for row in cur.fetchall()]


def fetch_machines() -> List[Dict]:
    logger.info("Fetching machines...")
    query = """
        SELECT
            m.id, m.name, m.ip, m.status, m.machine_code,
            m.cpu_percent, m.ram_percent, m.uptime_seconds,
            m.approval_status, m.last_heartbeat, m.created_at,
            m.plc_connected, m.plc_brand, m.plc_ip,
            m.client_id, m.production_count,
            pl.name as line_name, pl.id as line_id
        FROM machines m
        LEFT JOIN line_machines lm ON m.id = lm.machine_id
        LEFT JOIN production_lines pl ON lm.line_id = pl.id
        ORDER BY m.name
    """
    return execute_query(query)


def fetch_production_lines() -> List[Dict]:
    logger.info("Fetching production lines...")
    query = """
        SELECT
            pl.id, pl.name, pl.description, pl.created_at,
            COUNT(DISTINCT lm.machine_id) as machine_count,
            COUNT(DISTINCT CASE WHEN UPPER(m.status) = 'RUNNING' THEN m.id END) as running_count,
            COUNT(DISTINCT CASE WHEN UPPER(m.status) = 'ERROR' THEN m.id END) as error_count
        FROM production_lines pl
        LEFT JOIN line_machines lm ON pl.id = lm.line_id
        LEFT JOIN machines m ON lm.machine_id = m.id
        GROUP BY pl.id, pl.name, pl.description, pl.created_at
        ORDER BY pl.name
    """
    return execute_query(query)


def fetch_active_alarms() -> List[Dict]:
    logger.info("Fetching active alarms...")
    query = """
        SELECT
            a.id, a.machine_id, a.severity, a.message,
            a.status, a.acknowledged_by, a.acknowledged_at,
            a.resolved_at, a.notes, a.created_at,
            m.name as machine_name
        FROM alarms a
        LEFT JOIN machines m ON a.machine_id = m.id
        WHERE UPPER(a.status) IN ('ACTIVE', 'ACKNOWLEDGED')
        ORDER BY
            CASE a.severity
                WHEN 'CRITICAL' THEN 1
                WHEN 'HIGH' THEN 2
                WHEN 'MEDIUM' THEN 3
                ELSE 4
            END,
            a.created_at DESC
        LIMIT 100
    """
    return execute_query(query)


def fetch_production_summary(days: int = 7) -> Dict:
    logger.info(f"Fetching production summary (last {days} days)...")

    daily_query = f"""
        SELECT
            prod_date,
            SUM(hourly_qty) as total_output,
            AVG(avg_cpu) as avg_cpu,
            AVG(avg_ram) as avg_ram,
            COUNT(DISTINCT machine_id) as active_machines
        FROM machine_hourly_production
        WHERE prod_date >= CURRENT_DATE - INTERVAL '{days} days'
        GROUP BY prod_date
        ORDER BY prod_date DESC
    """
    daily = execute_query(daily_query)

    machine_query = f"""
        SELECT
            m.id, m.name, m.machine_code, m.status,
            COALESCE(SUM(mhp.hourly_qty), 0) as total_output,
            AVG(mhp.avg_cpu) as avg_cpu,
            AVG(mhp.avg_ram) as avg_ram
        FROM machines m
        LEFT JOIN machine_hourly_production mhp ON m.id = mhp.machine_id
            AND mhp.prod_date >= CURRENT_DATE - INTERVAL '{days} days'
        WHERE m.id IN (SELECT machine_id FROM line_machines)
        GROUP BY m.id, m.name, m.machine_code, m.status
        ORDER BY total_output DESC
    """
    machines = execute_query(machine_query)

    return {
        "period_days": days,
        "daily_production": daily,
        "machine_breakdown": machines,
        "generated_at": datetime.now().isoformat(),
    }


def fetch_dashboard_summary() -> Dict:
    logger.info("Fetching dashboard summary...")

    status_query = "SELECT status, COUNT(*) as count FROM machines GROUP BY status"
    status_counts = execute_query(status_query)
    status_dict = {str(row['status']).upper(): row['count'] for row in status_counts}

    production_query = """
        SELECT
            COALESCE(SUM(hourly_qty), 0) as total_output,
            COUNT(DISTINCT machine_id) as active_machines
        FROM machine_hourly_production
        WHERE prod_date = CURRENT_DATE
    """
    production = execute_query(production_query)

    alarm_query = "SELECT COUNT(*) as count FROM alarms WHERE UPPER(status) = 'ACTIVE'"
    alarms = execute_query(alarm_query)

    return {
        "timestamp": datetime.now().isoformat(),
        "machines": {
            "total": sum(status_dict.values()),
            "running": status_dict.get("RUNNING", 0),
            "idle": status_dict.get("IDLE", 0),
            "error": status_dict.get("ERROR", 0),
            "offline": status_dict.get("OFFLINE", 0),
        },
        "production_today": {
            "output": production[0]['total_output'] if production else 0,
            "active_machines": production[0]['active_machines'] if production else 0,
        },
        "active_alarms": alarms[0]['count'] if alarms else 0,
    }


def export_all_data() -> Dict[str, Any]:
    logger.info("Starting full data export...")

    data = {
        "export_timestamp": datetime.now().isoformat(),
        "machines": fetch_machines(),
        "production_lines": fetch_production_lines(),
        "active_alarms": fetch_active_alarms(),
        "production_summary": fetch_production_summary(),
        "dashboard": fetch_dashboard_summary(),
    }

    Config.EXPORT_DIR.mkdir(parents=True, exist_ok=True)

    export_file = Config.EXPORT_DIR / f"full_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(export_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, default=str)
    logger.info(f"Export saved to: {export_file}")

    latest_file = Config.EXPORT_DIR / "latest_export.json"
    with open(latest_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, default=str)
    logger.info(f"Latest export saved to: {latest_file}")

    return data


def create_vector_documents(data: Dict[str, Any]) -> List[Dict]:
    documents = []

    for machine in data.get("machines", []):
        doc = {
            "id": f"machine_{machine['id']}",
            "content": f"""
Machine: {machine['name']}
Status: {machine['status']}
Machine Code: {machine.get('machine_code', 'N/A')}
IP: {machine.get('ip', 'N/A')}
CPU: {machine.get('cpu_percent', 0):.1f}%
RAM: {machine.get('ram_percent', 0):.1f}%
Production Line: {machine.get('line_name', 'N/A')}
Approval: {machine.get('approval_status', 'N/A')}
PLC Connected: {machine.get('plc_connected', False)}
Production Count: {machine.get('production_count', 0)}
""".strip(),
            "metadata": {
                "type": "machine",
                "name": machine['name'],
                "status": machine['status'],
                "line": machine.get('line_name'),
            }
        }
        documents.append(doc)

    for line in data.get("production_lines", []):
        doc = {
            "id": f"line_{line['id']}",
            "content": f"""
Production Line: {line['name']}
Machines: {line.get('machine_count', 0)}
Running: {line.get('running_count', 0)}
Errors: {line.get('error_count', 0)}
Created: {line.get('created_at', 'N/A')}
""".strip(),
            "metadata": {
                "type": "production_line",
                "name": line['name'],
            }
        }
        documents.append(doc)

    for alarm in data.get("active_alarms", []):
        doc = {
            "id": f"alarm_{alarm['id']}",
            "content": f"""
Alarm: {alarm.get('severity', 'UNKNOWN')} - {alarm.get('message', 'No message')}
Status: {alarm.get('status', 'N/A')}
Machine: {alarm.get('machine_name', 'N/A')}
Created: {alarm.get('created_at', 'N/A')}
Acknowledged By: {alarm.get('acknowledged_by', 'N/A')}
""".strip(),
            "metadata": {
                "type": "alarm",
                "severity": alarm.get('severity'),
                "status": alarm.get('status'),
                "machine": alarm.get('machine_name'),
            }
        }
        documents.append(doc)

    summary = data.get("dashboard", {})
    doc = {
        "id": "dashboard_summary",
        "content": f"""
Factory Dashboard - {summary.get('timestamp', 'N/A')}

Machines: Total={summary.get('machines', {}).get('total', 0)},
Running={summary.get('machines', {}).get('running', 0)},
Offline={summary.get('machines', {}).get('offline', 0)}

Production Today: {summary.get('production_today', {}).get('output', 0)} units
Active Alarms: {summary.get('active_alarms', 0)}
""".strip(),
        "metadata": {"type": "dashboard_summary", "timestamp": summary.get('timestamp')}
    }
    documents.append(doc)

    return documents


def save_vector_documents(documents: List[Dict]):
    Config.EXPORT_DIR.mkdir(parents=True, exist_ok=True)

    vector_file = Config.EXPORT_DIR / "vector_documents.json"
    with open(vector_file, 'w', encoding='utf-8') as f:
        json.dump(documents, f, indent=2, ensure_ascii=False)
    logger.info(f"Saved {len(documents)} vector documents to: {vector_file}")

    md_file = Config.EXPORT_DIR / "mkz_report.md"
    with open(md_file, 'w', encoding='utf-8') as f:
        f.write("# MKZ Factory Report\n\n")
        f.write(f"Generated: {datetime.now().isoformat()}\n\n")
        f.write("## Machines\n\n")
        for doc in documents:
            if doc['metadata'].get('type') == 'machine':
                f.write(f"### {doc['metadata']['name']} ({doc['metadata']['status']})\n\n")
                f.write(doc['content'] + "\n\n")
    logger.info(f"Saved markdown report to: {md_file}")


def cleanup_old_exports():
    if not Config.EXPORT_DIR.exists():
        return
    cutoff = datetime.now() - timedelta(days=30)
    for file in Config.EXPORT_DIR.glob("full_export_*.json"):
        if datetime.fromtimestamp(file.stat().st_mtime) < cutoff:
            file.unlink()
            logger.info(f"Deleted old export: {file.name}")


def main():
    parser = argparse.ArgumentParser(description="Sync MKZ Factory data to Odysseus")
    parser.add_argument("--export-only", action="store_true", help="Only export data")
    parser.add_argument("--days", type=int, default=7, help="Days for summary")
    parser.add_argument("-v", action="store_true", help="Verbose")
    args = parser.parse_args()

    if args.v:
        logging.getLogger().setLevel(logging.DEBUG)

    try:
        data = export_all_data()
        if not args.export_only:
            documents = create_vector_documents(data)
            save_vector_documents(documents)
        cleanup_old_exports()
        logger.info("Sync completed successfully!")
    except Exception as e:
        logger.error(f"Sync failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
