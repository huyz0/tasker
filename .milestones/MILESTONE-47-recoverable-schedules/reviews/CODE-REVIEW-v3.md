---
timestamp: 2026-11-09T10:14:02Z
decision: rejected
---

# M47-T03 initial execution review

Independent reliability review found a manual terminal-admission summary gap.
It also requested fail-closed handling for non-finite token expiry. A real
SQLite process rerun independently exposed an initial scan lock conflict.

```yaml
findings:
  - file: apps/backend/src/modules/schedules/schedules.handler.ts
    line: 313
    severity: Medium
    comment: Failed manual admission returns before updating lastOutcome/lastRunAt. Persist that summary in the admission unit and preserve lastTaskId.
  - file: apps/backend/src/modules/schedules/occurrenceExecution.ts
    line: 49
    severity: Medium
    comment: Invalid Date expiry must fail closed. NaN compared with now otherwise permits the credential.
  - file: apps/backend/src/modules/schedules/schedules.handler.ts
    line: 334
    severity: Medium
    comment: A transient due-scan lock can abort pending recovery. Defer retryable scans safely; retain nonretryable failure reporting.
```

All three corrections have deterministic red-to-green regressions. Scope-poison
input equality also has a red reproducing two cross-project tasks before its
fix. Lease/transaction/private-workflow boundaries otherwise looked coherent.
Final process/fault evidence, full checks and re-review remain pending.
