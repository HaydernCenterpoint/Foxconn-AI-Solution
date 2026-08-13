---
tags: [convention, secrets]
updated: 2026-08-13
---

# Secrets

No production credential in Git, images, or argv.

## Source
`docs/security-secrets.md`

## Pattern
Platform mounts files / injects env from a secret manager.

## Never
- Commit `.env`, `credentials.json`, appsettings secrets
- Expose `CONNECTOR_API_KEY` via `VITE_*`
- Store MQTT device token in ClientPLC JSON config
- Put JWT / session bearer in browser storage (cookie session)

## Related
- [[10 Project/Next Actions]]
- [[40 Runbooks/Operator Package]]
