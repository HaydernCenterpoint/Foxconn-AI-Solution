# FII–Odysseus Development Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make FII Assistant use an API-key-backed LLM while retrieving FII data through read-only backend APIs and indexing concise history into RAG.

**Architecture:** The model provider credential remains in Odysseus server configuration. A read-only MCP server and the optional `/api/mkz` proxy call the FII backend at `MKZ_BACKEND_URL`. The historical sync writes Markdown summaries under `data/mkz_exports/rag` and reindexes that directory in ChromaDB.

**Tech Stack:** Python, FastAPI, MCP, httpx, ChromaDB, pytest, ASP.NET Core REST API.

---

### Task 1: Correct the read-only backend bridge

**Files:**

- Modify: `Odysseus/mcp_servers/plc_mcp_server.py`
- Modify: `Odysseus/routes/mkz_routes.py`
- Modify: `Odysseus/mcp_servers/plc_mcp_config.json`
- Test: `Odysseus/tests/test_mkz_rest_bridge.py`

- [ ] **Step 1: Write failing route/default tests**

```python
def test_factory_bridge_uses_local_backend_development_default(monkeypatch):
    monkeypatch.delenv("MKZ_BACKEND_URL", raising=False)
    module = importlib.reload(importlib.import_module("mcp_servers.plc_mcp_server"))
    assert module.BACKEND_URL == "http://127.0.0.1:5165"

def test_factory_bridge_uses_plural_audit_route():
    assert "/api/audit-logs" in source_text
```

- [ ] **Step 2: Run the targeted test before the change**

Run: `Odysseus\\venv\\Scripts\\python.exe -m pytest Odysseus\\tests\\test_mkz_rest_bridge.py -q`

Expected: FAIL because the current default is port 5000 and the audit route is singular.

- [ ] **Step 3: Make the REST bridge match the backend contract**

```python
BACKEND_URL = os.getenv(
    "MKZ_BACKEND_URL", os.getenv("BACKEND_URL", "http://127.0.0.1:5165")
)

# Audit access must route to the backend's plural controller route.
data = await backend_get("/api/audit-logs", params)
```

Keep every listed MCP tool read-only. Update the MCP JSON to expose only tools
implemented by `plc_mcp_server.py`; its `env` must contain `MKZ_BACKEND_URL`
and optional `MKZ_BACKEND_TOKEN`, never PostgreSQL credentials.

- [ ] **Step 4: Run the targeted test after the change**

Run: `Odysseus\\venv\\Scripts\\python.exe -m pytest Odysseus\\tests\\test_mkz_rest_bridge.py -q`

Expected: PASS.

### Task 2: Replace direct database sync with REST-to-RAG sync

**Files:**

- Modify: `Odysseus/scripts/sync_mkz_to_odysseus.py`
- Test: `Odysseus/tests/test_mkz_sync.py`

- [ ] **Step 1: Write failing pure-function tests**

```python
def test_build_rag_documents_creates_overview_and_reports():
    documents = sync.build_rag_documents(snapshot)
    assert set(documents) >= {"factory_overview.md", "active_alarms.md", "production_today.md"}
    assert "18,450" in documents["factory_overview.md"]

def test_write_rag_documents_replaces_previous_export(tmp_path):
    sync.write_rag_documents(tmp_path, {"factory_overview.md": "new"})
    assert (tmp_path / "factory_overview.md").read_text(encoding="utf-8") == "new"
```

- [ ] **Step 2: Run the targeted test before the change**

Run: `Odysseus\\venv\\Scripts\\python.exe -m pytest Odysseus\\tests\\test_mkz_sync.py -q`

Expected: FAIL because the direct-SQL script has no REST client or RAG document writer.

- [ ] **Step 3: Implement the backend client and bounded summaries**

```python
class FactoryBackendClient:
    def get(self, path, params=None):
        response = self.client.get(f"{self.base_url}{path}", params=params, headers=self.headers)
        response.raise_for_status()
        return response.json()

def reindex_rag_directory(directory):
    rag = VectorRAG()
    if not rag.healthy:
        raise RuntimeError("ChromaDB is unavailable")
    return rag.reindex_directory(str(directory), file_extensions={".md"})
```

Fetch dashboard, lines, active alarms, and reports for `today`,
`shift_morning`, `shift_night`, and `last_7_days`. Write Markdown only; do not
index raw PLC telemetry. Preserve `--export-only` so data generation can be
verified without ChromaDB.

- [ ] **Step 4: Run the targeted test after the change**

Run: `Odysseus\\venv\\Scripts\\python.exe -m pytest Odysseus\\tests\\test_mkz_sync.py -q`

Expected: PASS.

### Task 3: Add safe development configuration and operator documentation

**Files:**

- Modify: `Odysseus/.env.integration.example`
- Modify: `Odysseus/INTEGRATION.md`

- [ ] **Step 1: Replace the direct-database configuration surface**

```dotenv
MKZ_BACKEND_URL=http://127.0.0.1:5165
# MKZ_BACKEND_TOKEN=development-only-read-token
# OPENAI_API_KEY=keep-this-in-a-local-env-file-only
CHROMADB_HOST=127.0.0.1
CHROMADB_PORT=8100
```

The example must contain no real secret and must explain that model API keys
are separate from backend credentials.

- [ ] **Step 2: Document the one-time local setup**

```text
1. Start backend and ChromaDB.
2. Add the model provider in Odysseus Admin → Models with an API key.
3. Add the MKZ Factory MCP server using the bundled JSON config.
4. Run the REST-to-RAG sync once; then ask a dashboard or shift question.
```

- [ ] **Step 3: Validate configuration does not contain factory database credentials**

Run: `rg -n "MKZ_DB_|MKZ_DB_PASSWORD|psycopg2" Odysseus\\.env.integration.example Odysseus\\mcp_servers\\plc_mcp_config.json Odysseus\\scripts\\sync_mkz_to_odysseus.py`

Expected: no matches.

### Task 4: Run local verification

**Files:**

- Verify only: `Odysseus/tests/test_mkz_rest_bridge.py`
- Verify only: `Odysseus/tests/test_mkz_sync.py`

- [ ] **Step 1: Run static and targeted tests**

Run: `Odysseus\\venv\\Scripts\\python.exe -m pytest Odysseus\\tests\\test_mkz_rest_bridge.py Odysseus\\tests\\test_mkz_sync.py -q`

Expected: PASS.

- [ ] **Step 2: Run sync in export-only mode against the local backend**

Run: `Odysseus\\venv\\Scripts\\python.exe Odysseus\\scripts\\sync_mkz_to_odysseus.py --export-only`

Expected: a refreshed `Odysseus\\data\\mkz_exports\\latest_export.json` only when the backend is reachable; otherwise a clear backend connection error.

- [ ] **Step 3: Verify Odysseus and service health**

Run: `Invoke-RestMethod http://127.0.0.1:7000/api/health` and `Invoke-RestMethod http://127.0.0.1:7000/api/mkz/health`

Expected: Odysseus healthy; MKZ health healthy after backend starts.
