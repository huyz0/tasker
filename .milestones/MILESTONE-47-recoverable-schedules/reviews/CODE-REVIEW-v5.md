---
timestamp: 2026-11-09T10:30:21Z
decision: rejected
---

# M47-T03 full-gate capture regression

The first full check reports two failures: the global agent-scope fixture has no
persisted token, and the existing M46 schedule capture test rejects inherited
foreign organization context in new admission/lease events. Coverage thresholds
pass; neither failure is waived.

The scope fixture must persist the same credential/scopes as its principal,
keeping its permission-denied assertion. The production capture path must derive
organization/project/actor from each actual occurrence, including queued, running
and failure events. The existing capture test now also checks a deliberately
wrong parent actor.

```yaml
findings:
  - file: apps/backend/src/modules/schedules/schedules.handler.ts
    line: 322
    severity: High
    comment: Admission events inherit a foreign parent context and durable capture rejects them. Scope every occurrence stage to its actual organization, project and author.
  - file: apps/backend/src/lib/agent-scope-sweep.test.ts
    line: 343
    severity: Medium
    comment: The authenticated-principal fixture lacks its persisted credential. Seed and synchronize that row instead of weakening revalidation or expected permission denial.
```

The isolated red retains the capture failure after the fixture is corrected.
Current context wrappers pass all 73 focused tests; final re-review and full
checks remain pending.
