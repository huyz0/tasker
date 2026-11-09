---
timestamp: 2026-11-09T05:00:00Z
decision: approved
---

# M46-T03 — Fenced relay library

Independent read-only reliability review and primary verification cover the relay, bounded broker references, SQLite behavior tests and isolated MySQL recovery case.

Correctness: lease-token predicates fence completion and retry; expiry permits a successor; persisted backoff retains source identity; storage failures await every active send before rejecting; delivered-only pruning cannot remove pending rows.

Coverage: nine SQLite cases cover retry/backoff, competing sweepers, stale success/failure, abort/drain, local projection, retention, storage-error drain and large payload references. Real MySQL proves competing ownership, expired-owner fencing and stable retry identity in an owned disposable schema. Removing token fencing fails both stale-owner tests; replacing allSettled with all fails the drain test.

Architecture: ADR-0040 still owns capture, reference messages, retry and retention. T02 already captures matching webhook delivery rows transactionally. This task supplies the relay library; T04 owns runtime installation/audit projection/network bounds and T05 owns separate-process crash evidence.

Security: broker references omit artifact/domain bodies and use stored tenant routing. No tenant labels or bodies enter pending-count telemetry. The MySQL fixture creates and removes only its generated schema.

```yaml
findings: []
```
