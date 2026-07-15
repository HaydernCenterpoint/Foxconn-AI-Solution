# FII Factory + Odysseus Integration Guide

## Overview

Odysseus answers factory questions through the FII .NET backend REST API. It
does not open a direct connection to the factory database. The AI provider key
and the backend credential are separate secrets with separate responsibilities.

| Setting | Used for | Development default |
| --- | --- | --- |
| `OPENAI_API_KEY` | Odysseus calling an AI provider | Set only on the Odysseus server when using a hosted model. |
| `MKZ_BACKEND_URL` | Odysseus and the MCP server reading FII data | `http://127.0.0.1:5165` |
| `MKZ_BACKEND_TOKEN` | Optional authorization for FII backend requests | Blank when local read endpoints do not require a token. |

Never send the provider key to the frontend, MCP configuration, prompts, or
factory data store. A backend token is not an AI provider key and must not be
used to configure a model.

## Development setup

1. Copy `.env.integration.example` to `.env` and edit it locally.
2. Set `OPENAI_API_KEY` only if Odysseus will call a hosted AI provider.
3. Start the FII backend on `http://127.0.0.1:5165`.
4. Start Odysseus from its project directory:

```powershell
.\venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 7000
```

5. Sign in to Odysseus as an administrator and verify the bridge from the
   browser UI or an internal trusted tool path. A bare, unauthenticated shell
   request to `http://127.0.0.1:7000/api/mkz/health` deliberately returns
   HTTP 401, including when it originates from the local machine.

### FastEmbed first-run download in development

Keep `HF_HUB_DISABLE_XET=1` in the local development `.env`. It prevents the
first FastEmbed ONNX model download from hanging in this development
environment. Docker forwards this opt-in setting only to FastEmbed consumers:
the `odysseus` application and `mkz-sync` service, when the local `.env`
supplies it. Do not add it to the ChromaDB service; ChromaDB does not download
or run the FastEmbed model. Re-evaluate the workaround before using it in a
production deployment.

To configure the model itself, use **Settings > Models** in Odysseus to add
the provider endpoint and select a model. Keep the provider key server-side;
Odysseus stores endpoint keys in its encrypted endpoint field rather than
returning them from the endpoint list API.

## REST bridge endpoints

### Access control and backend token transport

Only the listed read-only FII bridge endpoints below require Odysseus
authentication through a signed-in administrator session, or the internal
trusted tool path used by Odysseus itself. The HTTP bridge is admin-only in this
development setup because the shared MCP server cannot provide a distinct scope
for each browser user. Bearer/API tokens are deliberately not accepted by
`require_admin`; they use a separate scoped-integration authorization model.
There is no anonymous factory-proxy exemption. This policy does **not** cover
the separately mounted `/api/mkz/gateway/...` namespace, which has its own
gateway integration and authorization rules. `AUTH_ENABLED=false` remains an
explicit, trusted-local development mode and must not be exposed remotely.

`MKZ_BACKEND_TOKEN` requires HTTPS for a non-loopback backend. It may be sent
over HTTP only to a direct loopback backend such as `localhost`, `127.0.0.1`,
or `::1`; Odysseus rejects a backend token configured with remote plaintext
HTTP. HTTPS is allowed for any backend address.

| Endpoint | Description |
| --- | --- |
| `/api/mkz/health` | Checks FII backend reachability |
| `/api/mkz/dashboard` | Dashboard KPIs and totals |
| `/api/mkz/machines` | Machine list |
| `/api/mkz/production-lines` | Production-line list |
| `/api/mkz/alarms` | Alarm list |
| `/api/mkz/reports/production` | Production report data |
| `/api/mkz/telemetry` | Live or recent telemetry |
| `/api/mkz/system-info` | REST bridge routing information |

The bridge intentionally does **not** expose FII audit logs. They are sensitive
and will remain unavailable through both REST and MCP until the FII backend has
a dedicated least-privilege audit-read policy for this integration.

Production reports accept only `today`, `last_7_days`, or `month`. Both
`line_id` and `machine_id` default to `all`; when supplied, each must be either
`all` or a canonical UUID. Empty or malformed selectors are rejected rather
than widened to an all-factory query. The bridge does not publish the current
backend shift ranges because they do not yet match the factory's operational
shift calendar.

Examples below show the endpoint shapes for calls made by a signed-in
administrator session or an internal trusted tool; they are not public URLs:

- `GET /api/mkz/dashboard`
- `GET /api/mkz/alarms?status=ACTIVE`
- `GET /api/mkz/reports/production?time_range=last_7_days`

## Register the read-only MCP server

The current local Odysseus instance keeps the `mkz_factory` MCP server
disabled. FII data is already available through the scheduled/direct RAG sync,
which lets Odysseus answer factory questions from the indexed summaries without
granting every chat user a direct backend reader. Enable this MCP server only
for a trusted single-administrator development session, or after implementing
per-user factory authorization for direct tool calls. Do not enable it for a
shared or remotely exposed deployment.

In **Settings > MCP Servers > Add**, configure:

| Field | Value |
| --- | --- |
| Command | `python` |
| Args | `mcp_servers/plc_mcp_server.py` |
| `MKZ_BACKEND_URL` | `http://127.0.0.1:5165` |

The static MCP template deliberately omits `MKZ_BACKEND_TOKEN` so the MCP
subprocess inherits it from the process environment. Set the optional
read-only backend token on the Odysseus service environment instead of adding
an empty value to the MCP configuration; an empty static value would override
the inherited token. Follow the HTTPS/non-loopback transport rule above.

The available MCP tools are limited to reading machines, lines, alarms,
dashboard data, production reports, telemetry, and bridge information. They
cannot execute SQL or change factory data. Sensitive audit logs are intentionally
not exposed until a least-privilege backend policy exists.

## Troubleshooting

### Bridge health reports `unhealthy`

- Confirm that the FII backend is listening on `127.0.0.1:5165`.
- Check that `MKZ_BACKEND_URL` matches the backend address.
- If the backend now requires authorization, configure a read-only
  `MKZ_BACKEND_TOKEN` and restart Odysseus.

### Model does not appear in Odysseus

- Check that the provider key is present only in the Odysseus server
  environment or the protected endpoint configuration.
- In **Settings > Models**, verify the provider endpoint and refresh its model
  list.

### Semantic memory is unavailable

ChromaDB must be available at the configured host and port before RAG can
store or retrieve factory summaries. Live telemetry remains a direct REST/MCP
query source; it should not be treated as durable historical memory.
