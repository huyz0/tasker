---
timestamp: 2026-11-10T13:07:47Z
decision: approved
---

# M57-T02 durable claim generation source review

Independent four-lens review covers current frozen T02 source, migrations,
contracts/generated clients, claimAttempts tests and populated upgrade/reboot
proof against ADR0043 and TC001–005. No implementation or journal was edited.

## Correctness

The winning insert returns its exact ta-ID directly; receipt creation is inside
the existing claim/idempotency managed unit with actual authenticated ownership
and a recorded claim time. Changed external correlation participates in request
hashing. Release checks an optional expected ID against the caller-held claim,
deletes that exact row and aborts a lost removal before writing a handoff. Human
unassignment locks/captures actual matching IDs before deleting/closing them.
First closure updates only previously open receipts. Owner-retention removal is
one managed unit, keeps snapshot owner identity/name and records system purge.
Task/project cascades remove receipt foreign-key rows before their parents.

## Architecture and security

Existing current task/org authorization and agent/human author boundaries remain
ahead of mutations and keyed replay. Caller-supplied ownership is not accepted;
another valid token for the same agent remains the same receipt owner. Optional
external correlation is bounded, nonblank and preserved exactly. No owner foreign
key erases snapshots on retention. Wire changes are additive optional claim/
release fields plus the receipt model; report association and ListTaskAttempts/
history exposure correctly remain staged for T03/T04. No new API scope, dependency
or external runtime status is introduced.

## Coverage

Tests assert real assignment/receipt IDs, immutable replay after release, stale
same-agent generation refusal without stray handoff/events, actual claim times,
manual/legacy omission, exact unassignment, owner snapshots and storage-failure
rollback. Reported real MySQL racing claims and trigger-induced release/unassign/
owner-purge rollbacks complement SQLite coverage. Historical migration boundaries
are pinned by tag, and populated reboot proof checks legacy release plus a new
post-upgrade receipt. Reported old-client unknown-field compatibility addresses
wire evolution rather than requiring old clients to adopt fencing.

No blocking source finding was identified. Reported expanded native/affected,
both-dialect upgrade, MySQL and old SDK results were not independently rerun by
this reviewer. The final status/archive invariance case/types and full36/final
head gates still require successful closure. Approval is scoped to T02 source;
T03 attribution and T04 reads/GUI are not claimed delivered. All prior ARCH/UX
versions remain preserved.

```yaml
findings: []
```
