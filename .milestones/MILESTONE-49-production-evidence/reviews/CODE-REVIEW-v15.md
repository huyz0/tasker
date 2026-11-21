---
timestamp: 2026-11-21
decision: approved
reviewed_head: e94372e2f29ca601c10eeb4fbda1d35d038bb350
---

# M49-T04 repeated staged evidence review

Implementation-agent review of actual source, four staged commands and
retained historical observations.

## Correctness and coverage

Both separate native-fetch 1000-caller commands settle, reconcile and clean
up within the unchanged external bound. They have 269/213 complete workflows
out of 3000, 2731/2787 errors, 393/384 acknowledged writes and 47/56 additional
confirmed commits. Each ends with 440 task/source/audit rows and no lost,
duplicate or changed identity. All request/error/uncertainty counts remain.

Logical peak1000 and configured native fetch limit1024 are explicit; socket
concurrency is not measured. Early operation-cap exhaustion, successful
versus all-attempt latency, API/generator RSS exclusions, hardware and
separate recovery tails are retained. A correct experiment is not a healthy
service-capacity result.

The actual stalled-endpoint deadline/cancellation tests and disabled-control
faults execute. Ten real MySQL/NATS recovery cases and both acknowledged audit
faults run after load. All18 non-skipped source checks pass, including
exact37 (7 cached) in4m18.434s.

## Architecture and security

No production pool, limiter, protocol or package changes. The generator-only
budget is omitted from owned API/consumer environments. Generated resources,
real principals, fixed phase privacy and source/ACKed audit oracles remain.
The240s/45s bound remains a failure guard, not a relaxed service timeout.

Ten exact records keep the older profiles and failed-publication100-caller
cohort alongside the repaired four-stage profile. The incomplete larger
runs/CODE-v13 are preserved. Different transport/hardware does not prove a
controlled performance improvement or establish a runtime/server root cause.
Main proof groups are unique per SHA; only superseded PR checks cancel.
Final combined-head verification remains required.

```yaml
findings: []
```
