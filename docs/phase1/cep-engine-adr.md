# ADR: CEP engine for Phase 1 staging / Phase 2 path

Status: Accepted for Phase 1 MVP  
Date: 2026-07-22

## Context

Need CEP staging that receives backend telemetry events without JVM ops cost, while leaving a path to scale.

## Decision

Keep the in-process Python rules engine in `factory-ai-platform/cep-service` for Phase 1 staging and early Phase 2.

Reasons:

- Already wired (`CepStagingPublisher` → `POST /api/v1/events`)
- 10 sample rules + tests exist
- No extra cluster dependency for demo/staging
- Hot path isolated by async queue + feature flag

## Consequences

- Event store is in-memory staging (not system of record)
- Good for <100 rules / single node
- Phase 2 may still migrate alarm threshold rules here first

## Not choosing now

Apache Flink / Drools deferred until:

- multi-node fan-out needed, or
- rule count / window state exceeds single-process comfort, or
- ops team requires external stream runtime

Revisit owner: Event/AI lane at Phase 2 gate.
