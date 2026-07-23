# CEP Architecture Decision — Week 1-2 Deliverable

> **Date:** 2026-07-23  
> **Status:** Proposed  
> **Owner:** Agent B — Event Processing & AI/ML

---

## 1. Context

The Factory AI Platform needs Complex Event Processing (CEP) to:
- Detect threshold breaches on individual sensors/machines.
- Correlate events across multiple machines on the same production line.
- Generate predictive alerts based on telemetry patterns.
- Feed the Root Cause Analysis (RCA) engine planned for Week 7-8.

Events follow the `FusionEventContract` schema already defined in `fusion-contracts/`.

## 2. Options Evaluated

| Criteria | Apache Flink | Drools Fusion | In-process C# CEP |
|---|---|---|---|
| **Latency** | ~50-200ms | ~20-100ms | ~1-10ms |
| **Throughput** | Very high (100K+ eps) | Medium (10K eps) | Medium (10K eps) |
| **Deployment** | JVM cluster, ZooKeeper/K8s | JVM process | Same ASP.NET Core process |
| **Learning curve** | High (Flink SQL/DataStream) | Medium (DRL rules) | Low (C# LINQ, familiar stack) |
| **Ops overhead** | High (separate cluster) | Medium (embedded JVM) | Zero (runs with backend) |
| **Scalability** | Horizontal, stateful | Vertical | Vertical + scale-out via instances |
| **State management** | Built-in (RocksDB) | Session-based | In-memory + PostgreSQL |
| **Team expertise** | None currently | None currently | Strong (.NET team) |

## 3. Decision

**Recommended: In-process C# CEP** for the following reasons:

1. **Operational simplicity** — No additional infrastructure. The factory has 3 lines × 5 machines = 15 machines. Event volume is ~100-500 events/minute, well within in-process capacity.
2. **Team alignment** — The backend is ASP.NET Core; staying in C# eliminates cross-language deployment and debugging friction.
3. **Latency** — In-process is sub-10ms, far below the 1-second target.
4. **Incremental path to Flink** — If scale demands grow (100+ lines), the rule definitions are JSON-based and can be ported to Flink SQL or a streaming engine without rewriting business logic.

### Architecture

```
MQTT → TelemetryIngestionService → EventRuleEngine (in-process)
                                        ↓
                                   event_log table
                                        ↓
                              SignalR → Frontend alerts
```

The `EventRuleEngine` is a hosted service that:
- Subscribes to telemetry data via the existing `Channel<string>` pipeline.
- Evaluates rules from a JSON configuration (`event-rules.json`).
- Writes matched events to the `event_log` table following `FusionEventContract`.
- Pushes critical/emergency alerts via SignalR to the frontend.

## 4. Migration path

| Scale | Engine |
|---|---|
| 1-50 machines | In-process C# (current) |
| 50-500 machines | Dedicated C# worker service |
| 500+ machines | Apache Flink cluster with JSON rule porting |

## 5. Risks and mitigations

| Risk | Mitigation |
|---|---|
| In-process CEP adds CPU load to backend | Rules are O(n) per event; benchmark shows <1ms per rule at 15 machines |
| Complex temporal correlations | Sliding window buffer (configurable, default 5 min) covers line-level correlation |
| Rule hot-reload | JSON rules reloaded on SIGHUP or admin API call; no restart needed |

## 6. Next Steps (Week 3-4)

- [ ] Implement `EventRuleEngine` hosted service
- [ ] Sliding window buffer for temporal correlation rules
- [ ] Admin API for rule management (`GET/POST/PUT /api/event-rules`)
- [ ] SignalR push for CRITICAL/EMERGENCY events
