---
tags: [home, moc]
status: staging-candidate
updated: 2026-08-13
---

# FII AI / MKZ Factory Monitor

On-prem industrial IoT. PLC → ClientPLC → MQTT → ASP.NET → PostgreSQL → React. ODF chỉ qua outbox. Odysseus không thuộc lõi FII.

## Snapshot
- **Release:** `NO-GO` / staging candidate. Authority: [[30 Decisions/Go No-Go 2026-07-31]]
- **Local W8:** passed (disposable Docker). Không thay W10 managed staging. [[20 Evidence/W8 Local Integration]]
- **UI:** Google Material 3 + Material Symbols trên Operations. [[50 Design/Design Source of Truth]]

## Maps
- [[10 Project/Status Snapshot]]
- [[10 Project/Product Scope]]
- [[10 Project/Repo Map]]
- [[10 Project/Architecture Map]]
- [[10 Project/Roadmap Remaining]]
- [[10 Project/Next Actions]]
- [[60 Systems/Systems]]
- [[20 Evidence/Evidence Index]]
- [[50 Design/Design Source of Truth]]
- [[70 Conventions/SPA Boundaries]]

## Do next
1. Docker + secrets/identity → [[10 Project/Next Actions]]
2. Managed staging 16 checks → [[40 Runbooks/Operator Package]]
3. Không claim production cho đến khi gate W10 pass

## Non-goals
- `@material/web`, merge 3 SPA, rewrite Odysseus `style.css` body
- LLM RCA / trained ML replacement
- Fake credentials / fake managed pass
- Deploy `Open-Data-Fusion/` thay vì pin `third_party/open-data-fusion`
