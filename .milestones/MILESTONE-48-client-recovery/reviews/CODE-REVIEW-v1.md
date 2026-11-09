---
timestamp: 2026-11-09T07:11:00Z
decision: rejected
---

# M48-T01 — Reconnect review

Independent read-only review ran 22 focused tests successfully, then found a
real QueryClient behavior not covered by those tests. Reconciliation reuses a
still-pending initial fetch when that query has no cached data; a late stale
snapshot can become the final result without a new source read.

```yaml
findings:
  - file: apps/gui/src/hooks/useLiveEvents.ts
    line: 136
    severity: High
    comment: Explicitly handle a pending initial read across reconnect. invalidateQueries alone does not cancel a query whose data is undefined. Add a real hook regression with a deferred initial snapshot and require a subsequent source read.
  - file: apps/gui/src/hooks/useLiveEvents.test.tsx
    line: 273
    severity: Medium
    comment: The test plan promises abandoned backoff and late old-scope isolation. Advance a cancelled wait and deliver a late frame after scope change/unmount to verify these outcomes, beyond checking signal.aborted.
```

Architecture/security otherwise pass: existing query machinery, bounded jitter,
no additional credentials or payload exposure, and unchanged offline threshold.
