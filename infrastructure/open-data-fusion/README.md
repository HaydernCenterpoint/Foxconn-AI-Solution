# Open Data Fusion runtime

The upstream source lives in the `third_party/open-data-fusion` Git submodule and is pinned by the parent repository. Do not edit the submodule for MKZ-specific configuration; keep local deployment values in this directory.

## Local mapping preview

The `application-preview` profile is only for validating the MKZ-to-ODF mapping. It uses ODF's local SQLite persistence profile and must not be used as the retained business-data deployment.

~~~powershell
git submodule update --init --recursive
.\infrastructure\open-data-fusion\Start-OpenDataFusionPreview.ps1
.\infrastructure\open-data-fusion\Test-OpenDataFusionPreview.ps1
~~~

`Start-OpenDataFusionPreview.ps1` renders the existing Compose configuration before it starts anything, keeps overrides only in the current PowerShell process, and never creates an upstream `.env` file. The default API and Web entries are `http://127.0.0.1:54310` and `http://127.0.0.1:58088`. The script rejects an occupied requested port before Compose is allowed to recreate a container.

The template binds PostgreSQL to `55432`, Redis to `56379`, Grafana to `53000`, and Prometheus to `59090`. If the default PostgreSQL port is already used, choose a free port explicitly:

~~~powershell
.\infrastructure\open-data-fusion\Start-OpenDataFusionPreview.ps1 -PostgresPort 55433
.\infrastructure\open-data-fusion\Test-OpenDataFusionPreview.ps1
~~~

`Test-OpenDataFusionPreview.ps1` refuses non-loopback API/Web URLs. It creates a synthetic UUID tenant/project in the local preview volume, sends a canonical `mkz:ts:<machine-guid>:production_qty` bundle, and verifies that the latest `42/good` datapoint is returned. It is a local mapping proof, not a staging provisioning workflow.

## Retained business data

ODF's `docker-compose.production-like.yml` is a local/CI rehearsal overlay, not a production deployment topology. Use it to rehearse the PostgreSQL, Redis, object-storage, and Keycloak/OIDC boundaries before a staging release. A retained business-data environment must use a reviewed deployment equivalent with managed PostgreSQL, Redis, versioned object storage, OIDC, network isolation, backups, and a deployment secret manager.

Before enabling MKZ delivery outside the local preview, an authorized deployment owner must create the tenant/project through upstream's controlled `tenant:provision` workflow, assign the adapter service account `data:ingest` plus project membership, and supply all passwords/client secrets through the secret manager. Required rehearsal/deployment variables include `KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME`, `KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD`, `ODF_DEMO_USER_PASSWORD`, `ODF_CONNECTOR_CLIENT_SECRET`, `ODF_POSTGRES_ADMIN_PASSWORD`, and `ODF_REDIS_PASSWORD`; none belong in this repository.

## Stop and rollback

Stopping ODF does not stop or change ClientPLC, the MKZ MQTT server, the MKZ backend, or Operations UI. For a local preview, run:

```powershell
Push-Location third_party/open-data-fusion
docker compose --env-file ../../infrastructure/open-data-fusion/.env.example --profile application-preview down
Pop-Location
```

## Activate telemetry capture and delivery

Keep backend capture and adapter dispatch as two separately controlled switches. This lets the operational backend collect a local outbox backlog before any ODF API call is allowed.

Start the MKZ backend with capture enabled in its own terminal:

```powershell
$env:OpenDataFusion__CaptureEnabled = 'true'
dotnet run --project backend/backend.csproj
```

For a loopback-only adapter rehearsal, start the adapter in a separate terminal after the preview smoke command has produced a tenant/project UUID:

```powershell
$env:ConnectionStrings__MkzOperations = $env:MKZ_OPERATIONS_CONNECTION
$env:OpenDataFusion__DispatchEnabled = 'true'
$env:OpenDataFusion__TenantId = $env:ODF_TENANT_ID
$env:OpenDataFusion__ProjectId = $env:ODF_PROJECT_ID
$env:OpenDataFusion__PlantExternalId = 'mkz:plant:site-a'
$env:OpenDataFusion__PlantName = 'Site A'
$env:OpenDataFusion__Authentication__Mode = 'development'
$env:OpenDataFusion__Authentication__DevelopmentUser = 'local-user'
dotnet run --project fusion-adapter/Fusion.Adapter.csproj
```

The development identity above is for loopback preview only. For staging or production, set `Authentication__Mode` to a non-development value and provide `Authentication__TokenEndpoint`, `Authentication__ClientId`, `Authentication__ClientSecret`, and optional `Authentication__Scope` from the secret manager. The service account needs the ODF `data:ingest` permission plus membership in the configured project. Do not enable `OpenDataFusion__DispatchEnabled` until those prerequisites and the ODF acceptance evidence have been recorded.

## Adapter rollback

Set `OpenDataFusion__CaptureEnabled=false` before restarting the backend, then stop the Fusion Adapter. Do not delete `fusion_outbox` rows: pending events stay in MKZ PostgreSQL and are available for delivery after the adapter is restored. ODF is not called from ClientPLC or MqttServerService, so an ODF outage never blocks PLC/MQTT processing.
