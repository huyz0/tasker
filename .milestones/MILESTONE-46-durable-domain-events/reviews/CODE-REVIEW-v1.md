---
timestamp: 2026-11-08T09:16:53Z
decision: approved
---

# M46 transactional capture review (T02)

## Correctness

The pre-commit phase uses the owning transaction. Mutation, source event and
matching webhook delivery either commit together or roll back together. Deep
payload snapshots keep emission-time values. Authorized project routing survives
purge; inconsistent project/organization routing fails closed. Matching reads
current subscriptions, avoiding the legacy cached-absence gap. Delivery IDs
are deterministic and only an existing matching row suppresses an insert error.

## Coverage

Initial red run had no capture API. SQLite and real MySQL capture/replay: 11
pass. Tests cover commit, rollback, both storage failures, nested snapshot data,
purged routing, tenant/project filtering, new endpoints, keyed replay, unowned
publication and unscoped system events. A shallow snapshot corrupts the nested
value and fails; skipping pre-commit capture makes both failure cases wrongly
resolve and fail. Restored full local gate: 35 completed, no backend failures.
The existing webhook overlap test now freezes its clock after queuing pings,
so a wall-clock second boundary cannot leave every tested delivery not due.

## Architecture

Capture remains a library until T03/T04 supply relay/projector wiring. Both
schemas and embedded migrations include retained source events without entity
foreign keys. Legacy scripts/tests can still publish without capture enabled;
production activation will require a unit. Artifact publication includes its
full content and accepts 15 million characters, substantiating the bounded
broker reference in ADR-0040 rather than an oversized NATS payload.

## Security

Tenant/project matching excludes foreign endpoints and validates known project
ownership. No credential is persisted in event metadata. Business counters only
advance after successful commit. The activation review must still cover every
production emitter, including stalled-claim and schedule background paths;
this library review does not claim that wiring is complete.

## Findings

```yaml
findings: []
```
