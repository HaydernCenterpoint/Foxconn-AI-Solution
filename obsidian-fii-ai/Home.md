---
tags: [home, fii-ai, release]
status: staging-candidate
updated: 2026-07-31
---

# FII AI / Foxconn AI Solution

## Snapshot
- **Release state:** `NO-GO` / **staging candidate**
- **Ultragoal:** complete (5/5 stories)
- **Local product intelligence:** implemented + fixture-tested
- **Live no-fixture path:** blocked (Docker + secrets/identity missing)
- **Production claim:** not allowed yet

## Maps
- [[10 Project/Status Snapshot]]
- [[10 Project/Architecture Map]]
- [[10 Project/Roadmap Remaining]]
- [[10 Project/Next Actions]]
- [[30 Decisions/Go No-Go 2026-07-31]]
- [[20 Evidence/Evidence Index]]
- [[40 Runbooks/Operator Package]]

## One-line truth
Local implementation is largely done. Remaining work is external runtime, managed staging, one real ERP, and the 16-check gate.

## Do next
1. Start Docker Desktop
2. Inject approved secrets/identity
3. Run Start-FullDemo + Test-FullDemo + e2e:live
4. Execute managed staging package
5. Fill 16 checks + independent reviewer
6. Only then decide go/canary

## Non-goals
- New product features
- LLM RCA / causal graph
- Trained ML replacement
- Fake credentials / fake managed pass
- Rebase PR #21 unless concrete ODF gap is proved