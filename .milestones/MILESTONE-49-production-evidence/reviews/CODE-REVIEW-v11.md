---
timestamp: 2026-11-21
decision: approved
reviewed_head: 2e8b14b884fcaf62bc70c018883015cb4087b1e5
---

# M49-T04 staged evidence review

Review by the implementation agent of actual records and workflow behavior.

## Correctness and coverage

Job 136860547110 completes real 4/100/1000-caller stages, then ten required
MySQL/NATS recovery cases and both acknowledged audit-loss/duplicate faults.
Measured callers are distinct scoped principals on two actual API PIDs, with
1000 pre-existing tasks and unchanged production defaults.

At 100 callers, all 1701 workflows complete. At 1000, only 57/3000 complete:
2943 errors, 822 acknowledged first writes, 194 additional committed intents
and 1984 absent intents. Independent task/source/audit rows reconcile at 1016,
with no lost/duplicate/changed identity and cleanup zero. Successful latency,
all-attempt latency, acknowledged-write throughput and complete-workflow
throughput stay distinct. The early operation cap is disclosed.

Five exact aggregate reports retain the baseline, both larger verified stages
and two earlier hosts. Earlier incomplete 1000-caller commands remain visible.
All 18 source checks pass, including exact 37 in 7m23.324s. Recovery experiments
are explicitly after load; controlled fixture clocks are not operator advice.

## Architecture and security

No production protocol, pool, limiter or retry behavior is changed to obtain
the figures. Machine/runtime/dataset scope and sampled-memory exclusions are
explicit. The 240-second external watchdog plus 45-second graceful allowance
bounds each fixture command; forced termination cannot establish valid cleanup.
Phase diagnostics contain fixed labels and aggregate counts only.

The final workflow removes its one-off feature trigger and uses the same
per-PR/per-main-SHA concurrency pattern as verified CI/integration. Every main
SHA keeps a proof; only superseded PR work cancels. Final combined-head checks
cover this narrow configuration and the retained evidence.

The results establish saturation, not an acceptable 1000-caller service level,
maximum fleet, steady-state queue stability or 20000-client validation. No
pool/driver root cause is inferred from Internal/deadline error codes alone.

```yaml
findings: []
```
