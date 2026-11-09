---
timestamp: 2026-11-09T08:40:00Z
decision: rejected
---

# M48-T04 — Journey evidence review

Independent read-only browser review approved real source RPC/SQL with controlled
stream bytes and background-page focus isolation, but requested stronger proof
and the remaining planned journeys. Native review independently ran all four
binary cases successfully and found a failure-cleanup gap.

```yaml
findings:
  - file: apps/gui/tests/e2e/live-recovery.spec.ts
    line: 30
    severity: Medium
    comment: Add-task renders before ListTasks settles. Require initial source data, a new read after the controlled frame and corresponding deliberate failure evidence to exclude a pending-read false positive.
  - file: apps/gui/tests/e2e/live-recovery.spec.ts
    line: 60
    severity: Medium
    comment: TEST-PLAN-0048 also promises actual browser scope-change and offline-fallback journeys; hook tests alone do not fulfill those browser claims.
  - file: apps/cli/cmd/recovery_journeys_linux_test.go
    line: 69
    severity: Medium
    comment: Failure after Start but before Wait kills a child through context cancellation without reaping it. Start one waiter immediately and register cleanup that cancels/kills and awaits completion on every path. Remove the unnecessarily tight one-second wall assertion; the bounded subprocess and exit classification already detect missing deadlines.
```
