---
tags: [decision, odf]
decision: pin-is-authority
updated: 2026-08-13
---

# ODF Source Authority

## Decision
`third_party/open-data-fusion` is the preview pin. Demos run the pin.
`Open-Data-Fusion/` is the product workspace, not deploy authority.

## Why
Embedded tree and pin diverged. Release scripts must not silently deploy the embedded tree or a dirty submodule checkout.

## Allowed
- Point gitlink at a **reviewed** ODF commit
- MKZ config lives in FII, not by forking pin files ad hoc

## Forbidden
- Mix Events/Labels WIP into the pin checkout used for demos
- Treat local `npm audit` / CSS-only PRs as production ODF release

## Source
`docs/release-evidence/g0/odf-authority.md`

## Related
- [[60 Systems/Open Data Fusion]]
- [[70 Conventions/Git and Pins]]
