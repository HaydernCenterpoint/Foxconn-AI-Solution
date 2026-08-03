# Managed staging gate

This gate deliberately cannot be satisfied by CI or a loopback demo. Schema v2
binds the attestation to one managed environment and one release manifest. Each
of the 16 checks references a separate evidence manifest whose file hash is
recorded in the attestation. The evidence verifier checks those hashes,
environment/release bindings, evidence freshness, unique check/evidence IDs,
immutable artifact references, and contributor/reviewer independence.
The release manifest, reviewer-conflict JSON artifact, evidence manifests, and
raw artifacts are independently streamed and hashed. HTTPS artifact hosts must
be named exactly in `-ArtifactHosts` or `FII_MANAGED_ARTIFACT_HOSTS`; redirects,
credentials, query strings, IP literals, non-public DNS answers, reserved names,
`.example`, `.internal`, and single-label hosts are rejected. This exact host
allowlist is the authoritative anti-rebinding boundary, and every allowed host
is also resolved and checked before retrieval.

Live backend/frontend hosts follow the same exact-name policy through
`-ManagedHosts` or the comma-separated `FII_MANAGED_HOSTS`; wildcards and suffix
matching are not supported.

Only local, authority-free `file://` references are accepted. They require an
existing absolute `-ArtifactRoot` (or `FII_MANAGED_ARTIFACT_ROOT`), must be a
strict descendant rather than the root itself, and cannot cross a symlink,
junction, sibling-prefix, UNC path, or final resolved-path boundary. Path case
comparison follows the operating system. Synthetic `evidence://` references
cannot satisfy the gate.

The verifier captures one evaluation timestamp. Evidence timestamps must be in
strict capture-to-review-to-approval order, and the conflict check must strictly
precede approval. Approval may be at most five minutes ahead of evaluation for
documented clock skew. Evidence, review, conflict check, and approval each have
a maximum age of 30 days relative to that captured evaluation time. Retrieval
defaults to 10 MiB per object, 100 MiB in aggregate, and a 120-second deadline.
Output contains IDs and hashes, never artifact URLs or underlying exception
details.

Copy `managed-gate.example.json` and `managed-evidence.example.json` to an
evidence package outside the repository. Create one evidence manifest per
check, create the release and reviewer-conflict JSON artifacts from the supplied
examples, record every SHA-256 digest in the attestation, and have an independent
reviewer approve the package. Evidence producers must match a contributor by ID,
organization, and an approved producer role; reviewer ID and organization must
both remain independent.

Validate the package without making live requests:

```powershell
./infrastructure/staging/Test-ManagedStagingEvidence.ps1 `
  -AttestationPath ./managed-staging-attestation.json `
  -ArtifactRoot D:\approved-managed-staging-artifacts `
  -ArtifactHosts approved-artifacts.managed-domain
```

After evidence-only validation passes, run the live gate with real managed
staging hostnames (reserved example and loopback hosts are rejected before any
probe):

```powershell
$backendUrl = "https://api.staging.<managed-domain>/"
$frontendUrl = "https://staging.<managed-domain>/"
./infrastructure/staging/Test-ManagedStagingGate.ps1 `
  -BackendUrl $backendUrl `
  -FrontendUrl $frontendUrl `
  -ManagedHosts api.staging.managed-domain,staging.managed-domain `
  -ArtifactHosts approved-artifacts.managed-domain `
  -AttestationPath ./managed-staging-attestation.json `
  -ArtifactRoot D:\approved-managed-staging-artifacts `
  -OutputPath ./managed-staging-result.json
```

The gate requires exact managed-host allowlisting, rejects unsafe DNS targets,
disables probe redirects, verifies the evidence package, then probes the live
backend health and frontend endpoints. A local or synthetic pass is not a
managed pass or production-readiness claim.

Run the schema contract regression suite with:

```powershell
./infrastructure/staging/Test-ManagedStagingEvidence.Tests.ps1
```

The suite generates temporary manifests and real temporary raw artifacts, uses
their `file://` URIs, retrieves/reads them, and verifies their SHA-256 digests.
These fixtures are explicitly synthetic self-tests. They are deleted after each
test, never invoke the managed gate, and must never be copied into release
evidence or used to change project status.

Before the smoke test, set `ForwardedHeaders__KnownProxies__*` or
`ForwardedHeaders__KnownNetworks__*` to the exact HTTPS ingress sources.
Verify that two distinct forwarded client addresses receive independent login
rate-limit buckets, repeated database-health probes receive `429` plus
`Retry-After`, and the browser session works without a bearer token in local
storage.
