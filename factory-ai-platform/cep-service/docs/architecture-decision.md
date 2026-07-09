# Architecture Decision: CEP Engine Technology Stack

**Date:** 2026-07-09
**Author:** Agent B — Event Processing & AI/ML Engineer
**Status:** DECIDED — Python-based rules engine (Phase 1), Apache Flink (Phase 2)

---

## Context

The MKZ Factory Monitor needs a Complex Event Processing (CEP) engine to:
1. Detect threshold breaches and pattern events from real-time telemetry
2. Generate alerts with sub-second latency
3. Scale to support multiple production lines
4. Integrate with ML models for predictive alerting
5. Provide root cause analysis

We evaluated three options:
- **Apache Flink** — distributed stream processing
- **Drools** — JVM-based rules engine
- **Python-based rules engine** — custom in-process evaluation

---

## Decision

**Phase 1 (Weeks 1-4): Python-based rules engine**
**Phase 2 (Weeks 5-8): Migrate pattern rules to Apache Flink**

### Why not Drools?
Drools requires JVM infrastructure, adds operational complexity, and has poor Python interoperability — critical since the ML models are Python-based.

### Why not Flink from day 1?
Flink is operationally heavy for our current scale (~10 rules, single-line deployment). The Python engine handles <100 rules efficiently at sub-second latency. Migrate to Flink when rule count exceeds 100 or multi-node scaling is needed.

---

## Evaluation Matrix

| Criteria | Python Engine | Drools | Apache Flink |
|----------|--------------|--------|--------------|
| **Setup complexity** | Low | Medium | High |
| **Latency (P99)** | <100ms | <200ms | <50ms |
| **Rule count (efficient)** | <100 | <500 | <10,000 |
| **Python ML integration** | Native | Poor | Moderate |
| **Stateful patterns** | Basic | Excellent | Excellent |
| **Operational overhead** | Low | Medium | High |
| **Cost** | $0 | $0 (JVM host) | $0 (self-hosted) |
| **Team expertise** | High | Low | Medium |
| **Horizontal scaling** | No | No | Yes |
| **Event time processing** | Limited | Yes | Yes |

---

## Decision Criteria

1. **Time-to-value**: Python engine is ready immediately; Drools/Flink need infrastructure
2. **ML integration**: Python ↔ Python is seamless; Drools needs bridge; Flink needs Python UDFs
3. **Operational complexity**: Docker Compose already handles our microservices
4. **Scale trajectory**: Current factory has ~10 lines; no immediate need for distributed CEP
5. **Team skills**: Python-heavy team; JVM expertise limited

---

## Implementation Details

### Python Engine (Phase 1)
- In-process rule evaluation in `app/rules/engine.py`
- Thread-safe with `threading.RLock`
- Background async evaluation loop (`asyncio`)
- Event window buffering for pattern rules
- Latency target: <100ms event→alert

### Migration Triggers (when to move to Flink)
- Rule count exceeds 100
- Latency P99 exceeds 500ms
- Multi-node deployment required (>1 factory)
- Complex stateful patterns needed (sessionization, order-sensitive sequences)

### Apache Flink (Phase 2)
- Deploy via Docker Compose
- Python Table API for rule definitions
- Kafka as event bus (replace direct REST ingestion)
- Connectors: PostgreSQL (state), Redis (caching)
- Estimated migration effort: 2 weeks

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Python engine can't handle load | Low | Medium | Benchmark early; Flink migration path exists |
| State loss on restart | Low | High | Persist event buffer to Redis on shutdown |
| ML integration latency | Medium | Low | Async inference; cache predictions |

---

## Conclusion

The Python-based rules engine is the right choice for Phase 1. It provides immediate value with minimal complexity, full Python ML integration, and a clear migration path to Apache Flink when scale demands it. Drools is excluded due to JVM overhead and poor Python interop.
