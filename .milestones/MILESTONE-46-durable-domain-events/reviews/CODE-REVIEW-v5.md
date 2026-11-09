---
timestamp: 2026-11-09T05:56:00Z
decision: approved
---

# M46-T06 — Webhook fencing and deadline

Independent read-only review found no blocking issue. It ran 18 focused tests
(73 assertions); primary verification also added DNS-deadline/reporter-drain
cases, ran real MySQL fencing/counter rollback and all 35 local gates.

Correctness: token+pending predicates protect every result before endpoint
updates; row/counters/auto-disable state roll back together. Due time is checked
again when claiming. Abort prevents further leases; all active workers settle
before surfacing a callback/storage error.

Coverage: all four stale success/failure combinations, endpoint persistence
failure, drain, throwing reporter, real trickling HTTP and stalled DNS pass.
Existing signing, redirect, SSRF and retry/disable policy tests pass. Real MySQL
recovery passes. Removing token fencing fails SQLite/MySQL regressions; early
worker rejection fails the drain test; omitting the total timer fails trickling
response acceptance. Full backend: 2120 pass, 41 gated skips, zero failures.

Architecture: HTTP remains outside the SQL unit. Nullable additive lease fields
preserve legacy rows; old workers must stop before new ownership guarantees
apply. Sender total ceiling is ten seconds, below the sixty-second lease.

Security: connection-time address validation, no redirects and HMAC signatures
remain intact. Deadline rejection precedes request destruction for Bun's event
ordering. No public RPC or authorization expansion is introduced.

```yaml
findings:
  - file: apps/backend/src/lib/notificationRegistry.ts
    line: 201
    severity: Low
    comment: Existing admin notification insertion remains best effort; this task guarantees atomic delivery result and endpoint state, not atomic notification persistence. ADR and test plan state the narrower guarantee.
```
