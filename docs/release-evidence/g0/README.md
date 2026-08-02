# G0 scope-lock evidence

This directory makes Gate G0 machine-checkable. It contains no credentials,
private plant data or invented owners.

Run:

```powershell
.\infrastructure\release\Test-G0ScopeLock.ps1 `
  -EvidenceDirectory .\docs\release-evidence\g0 `
  -OutputPath .\docs\release-evidence\g0\g0-result.json
```

The current evidence candidate is intentionally NO-GO. It does not become a
reproducible gate artifact until the evidence and validator are tracked by the
release commit. ODF patch reconciliation exists only in a dirty, unreviewed
submodule working tree; SLO ratification, component owners, schema approval and
external-input commitments are also incomplete. Filling placeholders without
real authority is a validation failure, not progress.

Authority chain:

1. `release-manifest.json` — release identity and source/schema decisions.
2. `pilot-slo.json` — ratified workload and numeric targets.
3. `external-input-ledger.json` — PLC, ERP, signing, staging and reviewer inputs.
4. `schema-decision.json` — proposed Operations schema boundary and approval state.
5. `adr-002-operations-schema.md` + `schema-inventory.md` — decision and source inventory.
6. `odf-authority.md` — full-tree divergence and unique-patch disposition.
