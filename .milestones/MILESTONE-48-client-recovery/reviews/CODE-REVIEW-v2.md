---
timestamp: 2026-11-09T07:16:00Z
decision: approved
---

# M48-T01 — Corrected initial-read recovery

Independent read-only review reran all 25 focused tests and approved the
correction. No further material findings remain.

Correctness: explicitly cancel active reads before reconciliation. TanStack
cancellation settles its retryer immediately without waiting on a hung network
request. A fresh read replaces an in-flight initial snapshot; its late response
cannot overwrite current data. The stopped guard after cancellation prevents
an abandoned effect from invalidating a replacement scope.

Coverage: real QueryClient/useQuery tests cover ready, heartbeat and domain
first-frame recovery, active source refetch, inactive stale marking without a
fetch, delayed initial reads, late old-scope frames, abandoned backoff and
unmount. Deterministic samples exercise both jitter bounds, the capped tier and
reset after recovery. Existing targeted invalidation, initial-ready honesty,
offline polling and real streaming-envelope cases remain green. Removing
initial-read cancellation or jitter deliberately fails the targeted regressions.

Architecture: existing query and connection state machinery is retained. A
domain event as the first recovery frame uses one broad reconciliation, avoiding
a redundant second targeted request. Timer completion removes its abort
listener instead of retaining one per retry.

Security/UX: no new endpoint, credential handling or tenant payload. Existing
connection status, polling threshold and query error presentation remain in use.
Only active queries are cancelled/refetched; inactive cache is marked stale.
No visual component or story changes are necessary for this hook.

```yaml
findings: []
```
