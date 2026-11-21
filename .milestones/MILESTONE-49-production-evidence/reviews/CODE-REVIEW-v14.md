---
timestamp: 2026-11-21
decision: approved
reviewed_head: e94372e2f29ca601c10eeb4fbda1d35d038bb350
---

# M49-T03 repaired controller review

Review by the implementation agent using source, actual stalled-endpoint
observations and repeated real-service results. No local/independent-agent
execution is claimed.

## Correctness and coverage

The final v1 gate exposes a real request-phase stall. A shared transport
extraction then demonstrates that an accepted in-flight RPC ignores controller
abort: exactly one deadline pass and one intended cancellation failure.
The repaired transport uses the already-installed Connect Web/Bun fetch path.
A whole-unary-call interceptor combines request, controller and explicit
deadline signals and clears its timer, including response consumption.

Both real endpoint cases pass. Disabling deadline/cancellation control makes
each intended assertion fail after positive receipt; bytes are restored.
Seven core/input-fault tests and the actual late-SQL-commit proof also pass.
Two separate real 1000-caller commands finish reconciliation and cleanup.
Earlier incomplete cases and CODE-v13 rejection remain preserved.

All 18 non-skipped checks pass: exact 37 (7 cached) in 4m18.434s,
backend 2432/GUI 1764/contract 1158, both native dialect jobs and actual
faults, real browser/rendered UI, standalone and packaging/integration.

## Architecture and security

Only measurement tooling changes; no package/server/pool/limiter is changed.
The native fetch budget is explicitly reported and confined to the generator;
owned API/consumer children omit it and keep defaults. Real scoped identities,
generated resources, stable keys and SQL/source/audit oracles are preserved.
Unacknowledged commits remain separate from successes. No credential/body
appears in aggregate evidence or fixed phase observations.

The repeated burst still saturates severely: 269/213 complete workflows out
of 3000, with 2731/2787 errors. Correct measurement does not imply a healthy
fleet or select a server/runtime root cause. External bounds are unchanged.
Final atomic-assembly checks remain required before main publication.

```yaml
findings: []
```
