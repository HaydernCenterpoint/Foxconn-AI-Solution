# Open Data Fusion runtime

The upstream source lives in the `third_party/open-data-fusion` Git submodule and is pinned by the parent repository. Do not edit the submodule for MKZ-specific configuration; keep local deployment values in this directory.

## Local mapping preview

The `application-preview` profile is only for validating the MKZ-to-ODF mapping. It uses ODF's local SQLite persistence profile and must not be used as the retained business-data deployment.

```powershell
git submodule update --init --recursive
Copy-Item infrastructure/open-data-fusion/.env.example third_party/open-data-fusion/.env
Push-Location third_party/open-data-fusion
docker compose --env-file .env --profile application-preview config --quiet
docker compose --env-file .env --profile application-preview up -d
Invoke-WebRequest http://127.0.0.1:54310/ready
Pop-Location
```

The ODF Web entry is available at `http://127.0.0.1:58088` and the API is available at `http://127.0.0.1:54310`. The template binds PostgreSQL to `55432`, Redis to `56379`, Grafana to `53000`, and Prometheus to `59090`, avoiding the ports already used by MKZ and Factory AI.

## Retained business data

Use ODF's `docker-compose.production-like.yml` for any environment that retains business data. Set PostgreSQL persistence, Redis, object storage, Keycloak/OIDC, and all passwords/client secrets through the deployment secret manager. The required production-like variables include `KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME`, `KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD`, `ODF_DEMO_USER_PASSWORD`, `ODF_CONNECTOR_CLIENT_SECRET`, `ODF_POSTGRES_ADMIN_PASSWORD`, and `ODF_REDIS_PASSWORD`; none belong in this repository.

## Stop and rollback

Stopping ODF does not stop or change ClientPLC, the MKZ MQTT server, the MKZ backend, or Operations UI. For a local preview, run:

```powershell
Push-Location third_party/open-data-fusion
docker compose --env-file .env --profile application-preview down
Pop-Location
```

## Activate telemetry capture and delivery

Keep backend capture and adapter dispatch as two separately controlled switches. This lets the operational backend collect a local outbox backlog before any ODF API call is allowed.

Start the MKZ backend with capture enabled in its own terminal:

```powershell
$env:OpenDataFusion__CaptureEnabled = 'true'
dotnet run --project backend/backend.csproj
```

Start the adapter in a separate terminal only after an ODF tenant/project and its ingest identity have been provisioned:

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

For production, change Authentication__Mode to a non-development value and provide Authentication__TokenEndpoint, Authentication__ClientId, Authentication__ClientSecret, and optional Authentication__Scope from the secret manager. The service account needs the ODF data:ingest permission plus membership in the configured project.

## Adapter rollback

Set `OpenDataFusion__CaptureEnabled=false` before restarting the backend, then stop the Fusion Adapter. Do not delete `fusion_outbox` rows: pending events stay in MKZ PostgreSQL and are available for delivery after the adapter is restored. ODF is not called from ClientPLC or MqttServerService, so an ODF outage never blocks PLC/MQTT processing.
