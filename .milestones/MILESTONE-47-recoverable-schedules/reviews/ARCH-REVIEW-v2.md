---
timestamp: 2026-11-09T09:21:12Z
decision: approved
---

# M47-T01 corrected design

Independent reliability and human-workflow reviewers approve the corrected
specification. Implementation evidence remains T02–T04, not inferred here.

Correctness: unique original-slot admission, revision/current-state checks,
common lock ordering, fenced leases and atomic work/terminal receipt remove both
crash gaps. The milestone Verify line now explicitly distinguishes provisional
rollback from durable post-commit identity. Current authority and frozen workflow
inputs remain separate, with receipts retained beyond retry-key expiration.

Coverage: TC-001–011 map all four exit criteria, both SQL dialects, actual child
process kills, frozen graph/status behavior, agent credential changes, failure
isolation, deletion/purge/upgrade and visible history. Silent expiry requires a
fresh bounded history read without an event. Corresponding fault checks remain
required during implementation.

Architecture: no executor or arbitrary graph RPC. Existing task/workflow units
and domain-event capture are reused; new snapshots are bounded and terminal
bodies cleared. Pause retains admitted intents; delete cancels unstarted ones,
while committed work survives. Old sweepers must stop before migration.

Security and UX: exact persisted credential revalidation, safe diagnostic
classes and metadata-only history queries are specified. Concrete creation and
eligibility wording, visible action consequences and schedule-owned task links
resolve v1; shared typography/tokens and existing navigation remain.

```yaml
findings: []
```
