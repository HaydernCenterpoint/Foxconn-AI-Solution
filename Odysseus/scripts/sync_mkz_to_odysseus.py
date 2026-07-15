"""Export concise, read-only MKZ Factory summaries for Odysseus RAG.

The MKZ data source is the authorized .NET REST API. This script deliberately
does not open a database connection and never exports raw PLC telemetry.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Mapping, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("mkz_sync")

ODYSSEUS_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ODYSSEUS_ROOT))

DEFAULT_BACKEND_URL = "http://127.0.0.1:5165"
REPORT_TIME_RANGES = ("today", "last_7_days", "month")
LOOPBACK_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})
REPORT_LABELS = {
    "today": "Today",
    "last_7_days": "Last 7 days",
    "month": "This month",
}
class Config:
    """Runtime paths and REST configuration for the exporter."""

    ODYSSEUS_ROOT = Path(os.getenv("ODYSSEUS_ROOT", str(ODYSSEUS_ROOT)))
    DATA_DIR = Path(os.getenv("ODYSSEUS_DATA_DIR", str(ODYSSEUS_ROOT / "data")))
    EXPORT_DIR = DATA_DIR / "mkz_exports"
    RAG_EXPORT_DIR = EXPORT_DIR / "rag"


class MKZRestError(RuntimeError):
    """Raised when the configured MKZ REST API cannot provide a response."""


class MKZRestClient:
    """Small GET-only client for the MKZ backend API."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        token: Optional[str] = None,
        timeout: float = 20.0,
        opener: Callable[..., Any] = urlopen,
    ) -> None:
        self.base_url = (base_url or os.getenv("MKZ_BACKEND_URL", DEFAULT_BACKEND_URL)).rstrip("/")
        self.token = token if token is not None else os.getenv("MKZ_BACKEND_TOKEN", "")
        self.timeout = timeout
        self._opener = opener
        self._validate_token_transport()

    def _validate_token_transport(self) -> None:
        parsed = urlparse(self.base_url)
        host = (parsed.hostname or "").lower()
        if self.token and parsed.scheme.lower() == "http" and host not in LOOPBACK_HOSTS:
            raise ValueError("MKZ_BACKEND_TOKEN requires HTTPS for a non-loopback backend")

    def headers(self) -> Dict[str, str]:
        headers = {"Accept": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def get(self, path: str, params: Optional[Mapping[str, Any]] = None) -> Any:
        path = path if path.startswith("/") else f"/{path}"
        filtered_params = {
            key: value
            for key, value in (params or {}).items()
            if value is not None and value != ""
        }
        query = urlencode(filtered_params)
        url = f"{self.base_url}{path}{'?' + query if query else ''}"
        request = Request(url, headers=self.headers(), method="GET")

        try:
            with self._opener(request, timeout=self.timeout) as response:
                status = getattr(response, "status", None)
                if status is None:
                    status = response.getcode()
                if not 200 <= status < 300:
                    raise MKZRestError(f"GET {path} returned HTTP {status}")
                payload = response.read().decode("utf-8")
        except HTTPError as exc:
            raise MKZRestError(f"GET {path} returned HTTP {exc.code}") from exc
        except URLError as exc:
            raise MKZRestError(f"GET {path} failed: {exc.reason}") from exc
        except OSError as exc:
            raise MKZRestError(f"GET {path} failed: {exc}") from exc
        except UnicodeDecodeError as exc:
            raise MKZRestError(f"GET {path} returned invalid UTF-8") from exc

        try:
            return json.loads(payload) if payload else {}
        except json.JSONDecodeError as exc:
            raise MKZRestError(f"GET {path} returned invalid JSON") from exc

    def fetch_dashboard(self) -> Mapping[str, Any]:
        return _as_mapping(self.get("/api/dashboard/summary"))

    def fetch_lines(self) -> List[Mapping[str, Any]]:
        return _as_mapping_list(self.get("/api/production-lines"))

    def fetch_active_alarms(self) -> List[Mapping[str, Any]]:
        return _as_mapping_list(self.get("/api/alarms", {"status": "ACTIVE", "limit": 100}))

    def fetch_report(self, time_range: str) -> Mapping[str, Any]:
        if time_range not in REPORT_TIME_RANGES:
            raise ValueError(f"Unsupported report time range: {time_range}")
        return _as_mapping(
            self.get(
                "/api/reports/query",
                {"timeRange": time_range, "lineId": "all", "machineId": "all"},
            )
        )

    def fetch_snapshot(self) -> Dict[str, Any]:
        """Fetch the limited, report-level data set needed for RAG summaries."""

        return {
            "fetched_at": _utc_timestamp(),
            "dashboard": self.fetch_dashboard(),
            "lines": self.fetch_lines(),
            "active_alarms": self.fetch_active_alarms(),
            "reports": {period: self.fetch_report(period) for period in REPORT_TIME_RANGES},
        }


def _as_mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _as_mapping_list(value: Any) -> List[Mapping[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, Mapping)]


def _value(data: Mapping[str, Any], *keys: str, default: Any = 0) -> Any:
    for key in keys:
        value = data.get(key)
        if value is not None:
            return value
    return default


def _utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _clean_text(value: Any, default: str = "N/A") -> str:
    if value is None:
        return default
    text = " ".join(str(value).split()).replace("|", "\\|")
    return text[:400] if text else default


def _format_number(value: Any) -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return _clean_text(value, default="0")
    if number.is_integer():
        return f"{int(number):,}"
    return f"{number:,.1f}".rstrip("0").rstrip(".")


def _report_document(period: str, report: Mapping[str, Any], generated_at: str) -> str:
    summary = _as_mapping(report.get("summary"))
    label = REPORT_LABELS[period]
    if not summary:
        return (
            f"# Production report: {label}\n\n"
            f"Generated: {generated_at}\n\n"
            "No report summary data was returned for this period.\n"
        )

    return (
        f"# Production report: {label}\n\n"
        f"Generated: {generated_at}\n\n"
        "## Summary\n\n"
        f"- Total production: {_format_number(_value(summary, 'totalProduction', 'total_production'))}\n"
        f"- Good units: {_format_number(_value(summary, 'totalGood', 'total_good'))}\n"
        f"- Scrap units: {_format_number(_value(summary, 'totalScrap', 'total_scrap'))}\n"
        f"- Yield rate: {_format_number(_value(summary, 'yieldRate', 'yield_rate'))}%\n"
        f"- Scrap rate: {_format_number(_value(summary, 'scrapRate', 'scrap_rate'))}%\n"
        f"- Average UPH: {_format_number(_value(summary, 'avgSpeed', 'avg_speed'))}\n"
        f"- Active machines: {_format_number(_value(summary, 'machinesCount', 'machines_count'))}\n"
    )


def build_rag_documents(snapshot: Mapping[str, Any], generated_at: Optional[str] = None) -> Dict[str, str]:
    """Build concise Markdown documents from whitelisted REST summary fields.

    Chart points, per-machine records, and every PLC telemetry field are
    intentionally excluded. The resulting documents are suitable for RAG
    reindexing without exposing raw process data.
    """

    generated_at = generated_at or _clean_text(snapshot.get("fetched_at"), default=_utc_timestamp())
    dashboard = _as_mapping(snapshot.get("dashboard"))
    lines = _as_mapping_list(snapshot.get("lines"))
    alarms = _as_mapping_list(snapshot.get("active_alarms"))
    reports = _as_mapping(snapshot.get("reports"))

    documents: Dict[str, str] = {
        "factory_dashboard.md": (
            "# Factory dashboard\n\n"
            f"Generated: {generated_at}\n\n"
            "## Operations at a glance\n\n"
            f"- Production lines: {_format_number(_value(dashboard, 'totalLines', 'total_lines'))}\n"
            f"- Machines: {_format_number(_value(dashboard, 'totalMachines', 'total_machines'))}\n"
            f"- Running: {_format_number(_value(dashboard, 'running'))}\n"
            f"- Idle: {_format_number(_value(dashboard, 'idle'))}\n"
            f"- Error: {_format_number(_value(dashboard, 'error'))}\n"
            f"- Offline: {_format_number(_value(dashboard, 'offline'))}\n"
            f"- Production today: {_format_number(_value(dashboard, 'totalProduction', 'total_production'))}\n"
            f"- Active alarms: {_format_number(_value(dashboard, 'activeAlarms', 'active_alarms'))}\n"
        ),
        "production_lines.md": _build_line_document(lines, generated_at),
        "active_alarms.md": _build_alarm_document(alarms, generated_at),
    }
    for period in REPORT_TIME_RANGES:
        documents[f"report_{period}.md"] = _report_document(
            period,
            _as_mapping(reports.get(period)),
            generated_at,
        )
    return documents


def _build_line_document(lines: List[Mapping[str, Any]], generated_at: str) -> str:
    header = "# Production lines\n\n" f"Generated: {generated_at}\n\n"
    if not lines:
        return header + "No production lines were returned.\n"

    sections = []
    for line in lines:
        name = _clean_text(_value(line, "name", default="Unnamed line"))
        description = _clean_text(_value(line, "description", default="No description"))
        machine_count = _format_number(_value(line, "machineCount", "machine_count"))
        sections.append(
            f"## {name}\n\n"
            f"- Machines: {machine_count}\n"
            f"- Description: {description}\n"
        )
    return header + "\n".join(sections)


def _build_alarm_document(alarms: List[Mapping[str, Any]], generated_at: str) -> str:
    header = "# Active alarms\n\n" f"Generated: {generated_at}\n\n"
    if not alarms:
        return header + "No active alarms were returned.\n"

    sections = []
    for alarm in alarms[:100]:
        severity = _clean_text(_value(alarm, "severity", default="UNKNOWN"))
        message = _clean_text(_value(alarm, "message", default="No message"))
        machine = _clean_text(_value(alarm, "machineName", "machine_name", default="Unassigned"))
        status = _clean_text(_value(alarm, "status", default="UNKNOWN"))
        created_at = _clean_text(_value(alarm, "createdAt", "created_at", default="N/A"))
        sections.append(
            f"## {severity}: {message}\n\n"
            f"- Machine: {machine}\n"
            f"- Status: {status}\n"
            f"- Created: {created_at}\n"
        )
    return header + "\n".join(sections)


def write_rag_documents(
    documents: Mapping[str, str], output_dir: Optional[Path] = None
) -> List[Path]:
    """Write the generated Markdown documents to the dedicated RAG directory."""

    directory = Path(output_dir or Config.RAG_EXPORT_DIR)
    directory.mkdir(parents=True, exist_ok=True)
    targets: List[tuple[Path, str]] = []
    for filename, content in documents.items():
        target = directory / filename
        if target.parent != directory or target.suffix.lower() != ".md":
            raise ValueError(f"RAG export filename must be a local Markdown file: {filename}")
        targets.append((target, content))

    for existing_path in directory.iterdir():
        if existing_path.suffix.lower() == ".md" and (
            existing_path.is_file() or existing_path.is_symlink()
        ):
            existing_path.unlink()

    written_paths: List[Path] = []
    for target, content in targets:
        temporary = target.with_suffix(".tmp")
        temporary.write_text(content.rstrip() + "\n", encoding="utf-8")
        temporary.replace(target)
        written_paths.append(target)
    logger.info("Wrote %s MKZ Markdown RAG summaries to %s", len(written_paths), directory)
    return written_paths


def reindex_rag_exports(output_dir: Optional[Path] = None) -> Mapping[str, Any]:
    """Reindex Markdown summaries and return a scheduler-safe success result."""

    directory = Path(output_dir or Config.RAG_EXPORT_DIR)
    try:
        from src.rag_vector import VectorRAG
    except Exception as exc:
        message = f"Chroma RAG could not initialize: {type(exc).__name__}"
        logger.error(message)
        return {"success": False, "message": message}

    try:
        rag = VectorRAG()
    except Exception as exc:
        message = f"Chroma RAG could not initialize: {type(exc).__name__}"
        logger.error(message)
        return {"success": False, "message": message}

    if not rag.healthy:
        message = "Chroma RAG is unhealthy; reindex was not attempted"
        logger.error(message)
        return {"success": False, "message": message}

    try:
        result = rag.reindex_directory(str(directory), file_extensions={".md"})
        if not isinstance(result, Mapping):
            logger.error("MKZ RAG reindex returned an invalid result")
            return {"success": False, "message": "MKZ RAG reindex returned an invalid result"}
        logger.info("MKZ RAG reindex result: %s", result.get("message", result))
        return result
    except Exception:
        logger.exception("MKZ RAG reindex raised an exception")
        return {"success": False, "message": "MKZ RAG reindex raised an exception"}


def export_rag_summaries(
    client: Optional[MKZRestClient] = None,
    output_dir: Optional[Path] = None,
) -> List[Path]:
    """Fetch REST summaries and write their RAG-safe Markdown representation."""

    snapshot = (client or MKZRestClient()).fetch_snapshot()
    documents = build_rag_documents(snapshot)
    return write_rag_documents(documents, output_dir=output_dir)


def main() -> None:
    parser = argparse.ArgumentParser(description="Export MKZ REST summaries to Odysseus RAG Markdown")
    parser.add_argument(
        "--export-only",
        action="store_true",
        help="Write Markdown summaries without attempting a Chroma RAG reindex",
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="Enable debug logging")
    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    try:
        written_paths = export_rag_summaries()
        if args.export_only:
            logger.info("Export-only mode complete; skipped Chroma RAG reindex")
        else:
            reindex_result = reindex_rag_exports()
            if (
                not isinstance(reindex_result, Mapping)
                or not reindex_result.get("success", False)
                or reindex_result.get("failed_count", 0) > 0
            ):
                message = (
                    reindex_result.get("message", reindex_result)
                    if isinstance(reindex_result, Mapping)
                    else "MKZ RAG reindex did not return a result"
                )
                logger.error("MKZ RAG reindex failed: %s", message)
                raise SystemExit(1)
        logger.info("MKZ REST export completed successfully (%s documents)", len(written_paths))
    except MKZRestError as exc:
        logger.error("MKZ REST export failed: %s", exc)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
