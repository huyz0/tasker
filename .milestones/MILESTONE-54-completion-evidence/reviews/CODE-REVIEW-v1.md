---
timestamp: 2026-11-09T20:30:34Z
decision: rejected
---

# M54-T02 initial implementation review

Independent agent/reliability review finds literal-prefix and schema-fidelity
bugs, plus insufficient resource-bound proof. Source changes and new observed
reds address them before re-review; actual MySQL BOM red is observed as well.

```yaml
findings:
  - file: apps/backend/src/modules/artifacts/evidence.ts
    line: 24
    severity: medium
    comment: Default TextDecoder consumes a leading stored BOM, changing literal content and truncation. Preserve it and prove exact/truncated boundaries in both dialects.
  - file: apps/backend/src/modules/mcp/tools.ts
    line: 69
    severity: medium
    comment: Optional typed arguments silently accept null despite published nonnullable schemas. Reject explicit null before RPC and observe zero-call regressions.
  - file: apps/backend/src/modules/artifacts/evidence.test.ts
    line: 36
    severity: medium
    comment: A body selected under alias prefix can evade the projection guard. Observe raw returned bytes before decoding, source row cap before metadata lookups and alias body transfer; prove unbounded faults fail.
```
