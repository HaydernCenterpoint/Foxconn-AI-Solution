---
tags: [project, repo]
updated: 2026-08-13
---

# Repo Map

| Path | Role | Note |
|---|---|---|
| `backend/` | ASP.NET Operations API, MQTT, CEP | Core data path |
| `frontend/` | React Operations UI | [[60 Systems/Operations Frontend]] |
| `ClientPLC/` | WPF PLC client | [[60 Systems/ClientPLC]] |
| `fusion-contracts/` | Shared C# contracts | v1 telemetry/event/asset |
| `contracts/v1/` | JSON Schema | Shared API conventions |
| `fusion-adapter/` | Outbox → ODF worker | [[60 Systems/Fusion Adapter]] |
| `infrastructure/` | Compose, SQL, PowerShell | Demo + staging runbooks |
| `factory-ai-platform/` | AI gateway / data services | Optional plane |
| `third_party/open-data-fusion/` | ODF **pin** | Demos run this |
| `Open-Data-Fusion/` | ODF product workspace | Not deploy authority |
| `Odysseus/` | Third-party AI workspace | Not FII core |
| `docs/` | Plans, evidence, ADRs | Canonical written evidence |
| `obsidian-fii-ai/` | This vault | Navigation, not runtime |
| `DESIGN.md` | UI source of truth | [[50 Design/Design Source of Truth]] |

`.omx/`, `.freebuff/`, `graphify-out/`, agent caches: tooling, not product.

## Related
- [[10 Project/Product Scope]]
- [[70 Conventions/Git and Pins]]
