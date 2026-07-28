# Runtime secrets and MQTT TLS

No production credential belongs in Git, an image layer, or a command-line
argument. The deployment platform must mount files and inject environment
variables from its secret manager.

## Required backend secrets

| Environment variable | Purpose |
| --- | --- |
| `ConnectionStrings__DefaultConnection` | Operational PostgreSQL connection |
| `ConnectionStrings__Timescale` | TimescaleDB connection |
| `Jwt__Key` | Shared JWT signing key, at least 32 bytes |
| `Mqtt__EncryptionKey` | MQTT payload encryption key |
| `MqttServer__DeviceTokens__<client-id>` | Token bound to one MQTT client ID |
| `MqttServer__Tls__CertificatePassword` | Password for the mounted PFX |
| `ConnectorApi__ApiKey` | Backend-only key for the connector status proxy |

Set `MqttServer__Tls__CertificatePath` to the mounted PFX path and
`MqttServer__Tls__Port` to the exposed TLS port. Production enables TLS and
disables the plaintext listener by default. Development may explicitly use
the plaintext endpoint, but device-token authentication and topic ownership
checks still apply.

`ConnectorApi__ApiKey` must contain the same secret as the data-platform
`CONNECTOR_API_KEY`. Never expose either value through a `VITE_*` variable;
the browser accesses connector status through the authenticated backend proxy.

Client PLC receives its device token through `FII_MQTT_DEVICE_TOKEN`; the
token is never written to the local configuration JSON. Set `mqttUseTls` to
`true` when connecting to the production broker.

## Browser sessions and trusted ingress

The web frontend uses the backend's HttpOnly session cookie and does not keep
the login bearer token or unsigned JWT claims in browser storage. Bearer
tokens remain available for non-browser clients.

The API applies a global rate limit plus stricter login and database-health
limits. Configure the exact managed ingress address or network before staging:

```text
ForwardedHeaders__KnownProxies__0=10.0.0.10
ForwardedHeaders__KnownNetworks__0=10.20.0.0/16
```

Use only entries owned by the deployment ingress. Do not accept forwarded
headers from arbitrary peers. The default configuration trusts loopback only,
so an unconfigured external ingress remains rate-limited as one shared source
instead of allowing spoofed client addresses.

## Factory AI services

The platform Compose file requires `POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD`,
`JWT_SECRET`, `AI_SERVICE_PASSWORD`, `LLM_API_KEY`, `ASSET_DATABASE_URL`,
`ASSET_SYNC_DATABASE_URL`, and `CEP_POSTGRES_URL`. Supply complete,
URL-encoded database URLs instead of interpolating raw passwords. Copy
`factory-ai-platform/infrastructure/env.example` to a local ignored `.env`,
or inject equivalent variables through the orchestrator.

Rotate a device token by updating both the broker secret and its single
client deployment, then restart the broker because its token map is loaded at
startup. Revoke a device by removing that client-ID entry and restarting the
broker.
