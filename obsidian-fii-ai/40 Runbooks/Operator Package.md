---
tags: [runbook, staging]
updated: 2026-07-31
---

# Operator Package

Use this as the managed-staging checklist.

## Source
Full package: [[20 Evidence/Managed Staging Package]]
Repo: `docs/release-evidence/2026-07-31-managed-staging-operator-package.md`

## 16 managed checks
1. backend-https-ingress
2. frontend-https-ingress
3. certificate-lifetime
4. mqtt-tls
5. mqtt-device-auth
6. mqtt-topic-isolation
7. secret-manager-delivery
8. operations-db-tls
9. timescale-db-tls
10. managed-backup
11. restore-drill
12. retention-policies
13. dual-write-validation
14. dual-write-rollback
15. live-erp-mes-connector
16. independent-full-stack-smoke

## Gate command
```powershell
./infrastructure/staging/Test-ManagedStagingGate.ps1 `
  -BackendUrl https://api.staging.example.com/ `
  -FrontendUrl https://staging.example.com/ `
  -AttestationPath ./managed-staging-attestation.json `
  -OutputPath ./managed-staging-result.json
```

Rules:
- HTTPS only
- No loopback
- Exactly 16 checks
- Evidence required for every check
- Independent reviewer approval within 30 days