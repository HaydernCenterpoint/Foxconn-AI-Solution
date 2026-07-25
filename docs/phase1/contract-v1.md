# Contract V1 index

Version: v1 / schemaVersion 1

| File | Role |
| --- | --- |
| `contracts/v1/asset.schema.json` | Asset catalog record |
| `contracts/v1/telemetry.schema.json` | Logical telemetry point |
| `contracts/v1/event.schema.json` | CEP/event bus record |
| `contracts/v1/api-convention.json` | `/api/v1`, Bearer JWT, problem+json |
| `fusion-contracts/ContractV1.cs` | Code constants |
| `fusion-contracts/AssetCatalogContract.cs` | Asset type/code invariants |
| `fusion-contracts/TelemetryFusionContracts.cs` | Fusion telemetry event factory |

Breaking change rule: bump `ContractV1.SchemaVersion` / `x-schema-version` and add tests.

Tests: `backend.Tests/ContractV1Tests.cs`, `backend.Tests/AssetCatalogContractTests.cs` (run in CI via `dotnet test backend.Tests`).
