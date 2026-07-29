# Managed staging gate

This gate deliberately cannot be satisfied by CI or a loopback demo. Copy
`managed-gate.example.json` to an evidence artifact outside the repository,
attach a durable evidence reference to each of the 16 checks, and have an
independent reviewer approve it.

Run:

```powershell
./infrastructure/staging/Test-ManagedStagingGate.ps1 `
  -BackendUrl https://api.staging.example.com/ `
  -FrontendUrl https://staging.example.com/ `
  -AttestationPath ./managed-staging-attestation.json `
  -OutputPath ./managed-staging-result.json
```

The script rejects HTTP and loopback URLs, rejects incomplete/stale
attestations, requires exactly the canonical 16 checks, and probes the live
backend health and frontend endpoints. A local pass is not a production
readiness claim.

Before the smoke test, set `ForwardedHeaders__KnownProxies__*` or
`ForwardedHeaders__KnownNetworks__*` to the exact HTTPS ingress sources.
Verify that two distinct forwarded client addresses receive independent login
rate-limit buckets, repeated database-health probes receive `429` plus
`Retry-After`, and the browser session works without a bearer token in local
storage.
