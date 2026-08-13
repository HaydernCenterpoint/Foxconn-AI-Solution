---
tags: [system, moc]
updated: 2026-08-13
---

# Systems

Runtime map. Architecture: [[10 Project/Architecture Map]]

- [[60 Systems/ClientPLC]]
- [[60 Systems/Operations Backend]]
- [[60 Systems/Operations Frontend]]
- [[60 Systems/Fusion Adapter]]
- [[60 Systems/Open Data Fusion]]
- [[60 Systems/Odysseus]]
- [[60 Systems/Factory AI Platform]]

Data path: PLC → ClientPLC → MQTT → Backend → PostgreSQL. Side: Timescale, CEP, outbox → ODF.
