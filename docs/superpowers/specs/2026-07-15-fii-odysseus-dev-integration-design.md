# FII–Odysseus development integration

## Goal

Let FII Assistant answer questions about factory data while keeping the model
provider credential separate from factory-data access. This is a local
development integration; it must not require Odysseus to connect directly to
PostgreSQL.

## Chosen approach

1. Odysseus calls the selected cloud model through a provider API key stored on
   the Odysseus server. The key is never exposed to the FII frontend, MCP tool
   output, RAG documents, or repository configuration.
2. The read-only MKZ MCP server calls the FII .NET backend at
   `MKZ_BACKEND_URL` for live machine, alarm, dashboard, telemetry, and report
   data. `MKZ_BACKEND_TOKEN` remains optional for local development, but is a
   separate credential from the AI key.
3. A sync script reads historical summaries through the same REST API, writes
   concise documents to a dedicated export directory, and reindexes that
   directory in ChromaDB. It does not ingest raw PLC telemetry continuously.

## Data behavior

- Live questions use MCP tools and cite the data as current at query time.
- Historical questions use RAG summaries grouped by hour, shift, or day.
- Reindexing removes documents from the FII export directory before adding the
  current export, preventing stale or duplicate snapshot documents.
- MCP remains read-only: no commands can acknowledge alarms, update machines,
  or write to the factory backend.

## Development configuration

The development environment needs:

- Odysseus at `http://127.0.0.1:7000`.
- FII .NET backend at `http://127.0.0.1:5165`.
- ChromaDB at `http://127.0.0.1:8100`.
- An LLM endpoint registered in Odysseus with its API key, preferably through
  the admin endpoint/settings UI so it is encrypted at rest.

The repo contains only examples and variable names. A real provider API key is
supplied privately in the local environment or the Odysseus admin UI.

## Scope of this change

- Correct stale MKZ MCP configuration and REST route names.
- Replace the direct-database sync script with a backend REST-to-RAG sync.
- Add a development configuration example and documentation.
- Test the pure data transformation and REST request behavior without requiring
  a live provider key or factory database.

## Out of scope

- Storing a user-provided provider key in source control.
- Granting Odysseus write access to FII APIs.
- Production authorization and multi-tenant policy changes.
