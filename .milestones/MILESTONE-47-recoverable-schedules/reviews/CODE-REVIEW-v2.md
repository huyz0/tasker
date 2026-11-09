---
timestamp: 2026-11-09T09:47:00Z
decision: approved
---

# M47-T02 corrected admission foundations

Independent reliability re-review approves the corrected foundations with no
remaining blocking findings. Final serial full check passes all 35 tasks (10 cached), with backend 2139
pass / zero failures and GUI 1350 pass / 95.26% branches.

Correctness: archived projects remain lockable for authorized schedule cleanup;
creation still rejects them. Original-slot admission, advancement and queued or
failed domain events share one managed unit. Post-insert failure rolls all of
it back; removing that unit leaves one orphan occurrence and fails the new test.

Coverage: ten focused/migration tests pass after restoration. Separate-process
contention and SIGKILL after admission pass for SQLite and MySQL (26 assertions).
Legacy SQLite rows survive the additive migration and unique-slot enforcement;
populated MySQL upgrade evidence remains T04 work, not an observed claim here.

Architecture: frozen workflow inputs preserve parent description, author order,
deduplicated dependencies and resolved statuses. Current revision/state checks
and project→schedule locking serialize admission with edits/deletion. Tombstones
cancel recoverable rows and retain authorized metadata-only history.

Security: current organization permission remains required for cleanup; safe
classification details/logs exclude raw error bodies. Internal snapshot helpers
are not RPCs. Legacy split firing, frozen-input consumption, leases and manual
intent identity remain explicitly unfinished T03 work; this milestone has not
been published or declared complete.

```yaml
findings: []
```
