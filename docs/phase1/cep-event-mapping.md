# CEP event mapping v1

## Contract fields

Required: `eventId`, `timestamp`, `assetId`, `type`, `severity`, `payload`  
Optional: `source`, `correlationId`

JSON schema: `contracts/v1/event.schema.json`  
Python model: `factory-ai-platform/cep-service/app/schemas/event.py`  
Publisher: `backend/Services/CepStagingPublisher.cs`

## Backend telemetry → CEP

| CEP field | Source |
| --- | --- |
| event_id | new GUID per publish |
| timestamp | `TelemetryCaptureInput.OccurredAt` |
| asset_id | `MachineId` (same UUID as assets MACHINE) |
| type | classify(status/alarm) → `raw_alarm` / `machine_stopped` / `machine_started` / `machine_idle` / `sensor_offline` |
| severity | `critical` if alarm active; else info/warning by status |
| payload.metric/value/unit | oee / uph / output_count |
| payload.extra.source_telemetry_id | primary `machine_telemetry.id` |
| source | `backend_telemetry` |
| correlation_id | MQTT message id when present |
| metadata.schema_version | `ContractV1.SchemaVersion` |

## Safety

- Publish only after primary telemetry commit.
- Queue full → drop + warn; never block/rollback MQTT path.
- CEP HTTP errors logged only.
- Flag default: `CepStaging:Enabled=false`.

## Rules loaded at staging boot

`factory-ai-platform/cep-service/app/rules/sample_rules.py` registers 10 rules (≥5 required), including threshold, multi-machine window, output drop, vibration, cascade.

## Smoke

`infrastructure/demo/Test-FullDemo.ps1` waits for CEP event with `source=backend_telemetry` for the smoke machine asset id.
