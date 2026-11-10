---
timestamp: 2026-11-10T12:14:42Z
decision: approved
---

# M57-T01 owner-purge lifecycle amendment

ADR0043, UX and TC004 now explicitly require retention ownership removal to
capture actual assignment IDs, remove them and close only their receipts in a
managed unit. owner_purged/system with no fabricated principal ID describes the
recorded operation honestly. Owner identity/name snapshots survive on remaining
tasks; existing report-deletion policy is unchanged, and parent task/project/org
purges remove their receipts. Failure must roll back closure and removal together.
This resolves ARCH-v1 without adding process supervision or another permission.

Current ordinary authorization precedes optional receipt checks. Owner kind/ID,
task and organization are explicit; closed-receipt delayed association does not
grant access or reassign another principal's reports. Usage replay and artifact
duplicate-pair rules preserve correlation/provenance. Additive wire/migration,
bounded source filters and unsafe-old-writer downgrade boundaries are stated.
No further static architecture blocker was identified. UX-v1 separately tracks
freshness and filtered-write presentation boundaries before implementation.

```yaml
findings: []
```

This approves proposed architecture, not implemented behavior. Runtime both-DB,
race, wire, source-bound, browser and final-head gates remain future work. Prior
review versions are preserved; only review files were written.
