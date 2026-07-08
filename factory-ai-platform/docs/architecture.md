# Factory AI Platform Architecture & Security Boundaries

## 1. System Topology

```text
Người dùng
    ↓
Odysseus (Chat interface / UI orchestration)
    ↓ OpenAI-compatible API
Factory AI Gateway (FastAPI, JWT authorization, intent router, audit log)
    ├── Router
    ├── Authentication & Scope checking
    ├── Tool / Agent Registries
    └── Specialized Agent Executors
          ├── Factory Data Agent (Invokes read-only REST tool endpoints)
          ├── Antigravity Bridge (Invokes sandboxed agy CLI)
          ├── Document Agent (Queries Vector DB for manuals / PDF logs)
          └── Report Agent (Invokes report compiling service)
```

## 2. Infrastructure Setup (Docker Compose)

The backend services are orchestrated via Docker Compose:
- **`postgres`**: Configured with `pgvector` for document indexing and local operational caching. Confiend strictly inside an internal-only private network (`db-net`).
- **`redis`**: Cache layer for chat sessions and high-throughput query rate limits.
- **`minio`**: Private S3-compliant object storage for uploaded engineering logs, manuals, and compiled reports.
- **`factory-ai-gateway`**: Routes traffic externally to client applications (e.g. Odysseus) and validates JWT signatures.
- **`antigravity-bridge`**: Executes sandboxed code analysis tasks. Confined inside `factory-net` and has no access to the `db-net` network.

---

## 3. Strict Security Boundaries (Safety Posture)

1. **No direct PLC connection**:
   The AI Agents have no capability to connect directly to the factory network or any PLC register. All operational details must be retrieved through read-only intermediary services or replicas.
2. **Read-only DB access**:
   Database access scopes are audited. The `postgres` credentials exposed to standard agents prevent any write or update operations to core production schemas.
3. **Gateway JWT & Scope checks**:
   Authentication is enforced via JWT containing specific user authorization parameters:
   - `sub`: User ID
   - `role`: Role class (`Admin`, `Supervisor`, `Engineer`, `Maintenance`, `Viewer`)
   - `siteScopes`: Restricts access to specific physical factories.
   - `lineScopes`: Restricts access to specific assembly lines (e.g. `LS18`).
   - `machineScopes`: Restricts access to specific machine stations.
4. **Sandboxed Engineering Agent**:
   The `antigravity-bridge` does not mount the host Docker socket, does not run with root permissions, and restricts CPU/RAM utilization to prevent denial-of-service (DoS) vulnerabilities during local code compilation.
5. **No arbitrary SQL execution**:
   Query tools use rigid inputs (Pydantic validated arguments like `lineCode` and `startTime`) rather than allowing raw SQL strings from the LLM, preventing SQL injection.
