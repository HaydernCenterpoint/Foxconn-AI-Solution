# Managed staging operator package

Date: 2026-07-31 21:14:18 +07:00
Branch: `dev` @ `6d34850`
Operator: ultragoal G003
Release state: **staging candidate** (not production-ready)

This package reuses existing scripts/docs. It does not invent a managed
environment, ERP endpoint, certificates, or reviewer approval.

## 1. Source-of-truth artifacts

| Area | Artifact |
| --- | --- |
| Secrets | `docs/security-secrets.md` |
| Dual-write rollback | `factory-ai-platform/data-platform/docs/rollback_plan.md` |
| Gate verifier | `infrastructure/staging/Test-ManagedStagingGate.ps1` |
| Gate template | `infrastructure/staging/managed-gate.example.json` |
| Gate policy | `infrastructure/staging/README.md` |
| Local no-fixture residual | `docs/release-evidence/2026-07-31-local-nofixture-blocker.md` |
| Live alert residual | `docs/release-evidence/2026-07-31-live-alert-residual-gap.md` |

## 2. Secret-manager delivery checklist

Inject only from the deployment secret manager. Never commit values.

### Backend / Operations
- `ConnectionStrings__DefaultConnection`
- `ConnectionStrings__Timescale`
- `Jwt__Key` (>= 32 bytes)
- `Mqtt__EncryptionKey`
- `MqttServer__DeviceTokens__<client-id>`
- `MqttServer__Tls__CertificatePath`
- `MqttServer__Tls__CertificatePassword`
- `MqttServer__Tls__Port`
- `ConnectorApi__ApiKey`
- `ForwardedHeaders__KnownProxies__*` or `ForwardedHeaders__KnownNetworks__*`

### ClientPLC
- `FII_MQTT_DEVICE_TOKEN`
- `mqttUseTls=true` for production broker

### Data platform / connectors
- `CONNECTOR_API_KEY` (same secret as `ConnectorApi__ApiKey`)
- `ERP_API_URL`
- `ERP_API_KEY`
- `ERP_SYNC_INTERVAL`
- `DUAL_WRITE_MODE`
- `LEGACY_POSTGRES_HOST`
- `LEGACY_POSTGRES_PORT`
- `LEGACY_POSTGRES_DB`
- `LEGACY_POSTGRES_USER`
- `LEGACY_POSTGRES_PASSWORD`

### Factory AI / Odysseus (if deployed)
- `POSTGRES_PASSWORD`
- `MINIO_ROOT_PASSWORD`
- `JWT_SECRET`
- `AI_SERVICE_PASSWORD`
- `LLM_API_KEY`
- `ASSET_DATABASE_URL`
- `ASSET_SYNC_DATABASE_URL`
- `CEP_POSTGRES_URL`

Evidence for gate check `secret-manager-delivery`: secret-manager path names + deployment revision IDs, not secret values.

## 3. HTTPS / trusted proxy / cookie notes

1. Deploy backend and frontend behind managed HTTPS ingress only.
2. Configure exact ingress IP/CIDR in `ForwardedHeaders__Known*`.
3. Verify:
   - browser session works via HttpOnly cookie without bearer token in localStorage
   - two distinct forwarded client IPs get independent login rate-limit buckets
   - repeated health probes return `429` + `Retry-After`
   - cookie `Secure` + `SameSite` behavior under HTTPS
4. Gate checks covered:
   - `backend-https-ingress`
   - `frontend-https-ingress`
   - `certificate-lifetime`

## 4. MQTT TLS / device auth

1. Mount broker PFX and set `MqttServer__Tls__CertificatePath`.
2. Disable plaintext listener in production.
3. Bind one device token per client ID.
4. Prove wrong token is rejected and topic ownership is enforced.
5. Gate checks covered:
   - `mqtt-tls`
   - `mqtt-device-auth`
   - `mqtt-topic-isolation`

## 5. Database TLS / backup / retention

1. Require TLS for Operations PostgreSQL and TimescaleDB.
2. Capture managed backup job ID and restore-drill evidence to a separate retained database.
3. Confirm retention/compression policies remain enabled after restore.
4. Gate checks covered:
   - `operations-db-tls`
   - `timescale-db-tls`
   - `managed-backup`
   - `restore-drill`
   - `retention-policies`

## 6. Dual-write validation and rollback rehearsal

Follow `factory-ai-platform/data-platform/docs/rollback_plan.md` exactly.

Sequence:

```text
migration -> full -> rollback -> migration
```

Rules:
- Use unique telemetry identifiers.
- In `rollback` mode, pause ERP/MES event connectors.
- Prove legacy write probe and restore previous mode without code changes.
- Attach evidence to:
  - `dual-write-validation`
  - `dual-write-rollback`

## 7. One real ERP path

Prefer ERP over MES. MES remains optional/fails closed.

Operator steps:
1. Provide one real `ERP_API_URL` + `ERP_API_KEY`.
2. Load canonical rows into `asset_mapping_rules` for the ERP external IDs.
3. Run incremental ERP sync.
4. Verify mapped events land, unresolved mappings enter DLQ, retry/resolve path works.
5. Attach durable evidence under gate check `live-erp-mes-connector`.

No real ERP endpoint is configured in this workspace, so this check stays pending until a data owner supplies the endpoint and mappings.

## 8. 16-check attestation package

Copy the template outside git if needed, then fill evidence references:

```powershell
Copy-Item .\infrastructure\staging\managed-gate.example.json .\managed-staging-attestation.json
```

Required checks (exactly these 16):

1. `backend-https-ingress`
2. `frontend-https-ingress`
3. `certificate-lifetime`
4. `mqtt-tls`
5. `mqtt-device-auth`
6. `mqtt-topic-isolation`
7. `secret-manager-delivery`
8. `operations-db-tls`
9. `timescale-db-tls`
10. `managed-backup`
11. `restore-drill`
12. `retention-policies`
13. `dual-write-validation`
14. `dual-write-rollback`
15. `live-erp-mes-connector`
16. `independent-full-stack-smoke`

Rules enforced by `Test-ManagedStagingGate.ps1`:
- Backend/frontend URLs must be HTTPS and non-loopback
- Reviewer name required
- `approvedAtUtc` required and not older than 30 days
- Every check must be `passed` with non-empty evidence
- Live probes hit backend `/api/health` and frontend root

Run only after independent reviewer approval:

```powershell
./infrastructure/staging/Test-ManagedStagingGate.ps1 `
  -BackendUrl https://api.staging.example.com/ `
  -FrontendUrl https://staging.example.com/ `
  -AttestationPath ./managed-staging-attestation.json `
  -OutputPath ./managed-staging-result.json
```

## 9. Independent full-stack smoke

Minimum smoke after staging is live:
1. Operator login cookie path works on HTTPS frontend.
2. MQTT device publishes accepted telemetry.
3. Dual-write/source uniqueness holds.
4. Open alert can be listed and acknowledged by operator role.
5. Asset health returns current score/history.
6. ERP mapped entity resolves; unmapped entity enters DLQ.
7. Rollback rehearsal evidence is attached.

This is gate check `independent-full-stack-smoke`.

## 10. Current package status

| Work item | Status |
| --- | --- |
| Operator package assembled | Done in this document |
| Local no-fixture residual documented | Done |
| Managed HTTPS / certs / secret manager | External blocker |
| Real ERP endpoint + mappings | External blocker |
| 16-check evidence filled | Pending external execution |
| Independent reviewer approval | Pending |
| Managed gate pass | Pending |

## Claim boundary

G003 completes the operator package and evidence map. It does **not** claim managed staging has been provisioned or accepted.