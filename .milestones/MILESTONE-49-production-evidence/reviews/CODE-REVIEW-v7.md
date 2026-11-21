---
timestamp: 2026-11-21
decision: approved
reviewed_head: 3410e397be47bd648e407dc6c303cc4b094366b0
---

# M49-T02 verified-source review

Review by the implementation agent using the acceptance plan, current source and
actual hosted results. No local tests or services are claimed.

## Correctness and coverage

Two distinct API PIDs share an owned schema/broker and real sessions/scoped
principals. Same-key requests retain task/display identity; competing claims
produce one assignment. A second physical broker publication is acknowledged
before logical audit cardinality and producer identity are checked. A valid
revoked member session loses canonical source access and reconnected domain
delivery; positive owner delivery and the real heartbeat bound that observation.

Existing SQLite/MySQL process recovery covers killed writers, producer ACK
bookkeeping, broker restart, signed webhook stale-owner fencing and schedule
occurrence contention/recovery. Every declared required case executes:
both MySQL versions pass19 native and10 recovery cases with zero required skips.
The claim fault and both post-ACK audit faults fail their intended assertions,
reject cleanup aggregates and restore source bytes.

V4 schema ownership/teardown findings and v6 matcher typing are resolved.
The prior silent worker exit is not assigned a speculative cause; instrumented
source passes both dialects and now reports fixed stage/exit/signal diagnostics.
The existing browser suite's three skips are disclosed rather than counted
as passing coverage.

## Architecture and security

No production RPC, permission, persistence model or capacity claim changes.
Generated schema names override caller DB_NAME, generated broker labels govern
cleanup, all owned teardown steps are attempted and ambient state is restored.
Credentials stay in memory; temporary faults do not become runtime switches.
Native30second cold setup and bounded SQLite observer lock retries preserve
explicit operational query-latency and real outcome assertions.

The final configuration groups PR checks by workflow/PR, while every main SHA
has a separate group and main cancellation is disabled. This avoids obsolete
work without weakening any final-head gate. The one-off maintenance files are
absent from this task and removed from the dependent load draft.

## Actual verification

All10 CI44897279959 jobs and both Integration44897279964 jobs pass.
The exact repository gate passes36 tasks (7 cached) in8m1.445s:
GUI1764/backend2423/contract1158 plus builds. Browser E2E103 pass/three existing
skips; strict browser types, the restored native intent fault and rendered
accessibility/mobile overflow checks pass. Final metadata/configuration-head
CI still gates publication.

```yaml
findings: []
```
