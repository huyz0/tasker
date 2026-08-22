# M24 — Progress Journal

Append-only. Newest entry at the bottom. One entry per task attempt.

## M24-T01 — Save the design record (spec, ADR-0020, ADR-0021)

- **Status**: done
- **Date**: 2026-08-22
- **Changed**: `.specs/specs/2026-08-22-2100-project-reports-and-agent-insights/`
  (shape.md, references.md, plan.md, standards.md), `.specs/adr/ADR-0020-*.md`,
  `.specs/adr/ADR-0021-*.md`, this milestone's MILESTONE.md refinements,
  STATE.md.
- **Verified**: all files exist; `moon run tasker:docs-lint` clean (247
  files). A docs-consistency review subagent additionally spot-checked the
  load-bearing code claims (all four verified true against the handlers/
  schema) and returned APPROVED with fixes — all six FIX findings applied
  before this commit: (1) backfill now excludes soft-deleted tasks (an
  unpaired `+1` would sit in the CFD stack forever — the exact bug the
  `archived` kind prevents); (2) day-one-value claim made honest by
  carrying existing task_notes/comments history into the backfill; (3) the
  scorecard's "median cycle" column cut — it contradicted the deliberate
  cycle-time cut; (4) the authoritative `kind` vocabulary written into
  ADR-0020; (5) archived/restored row semantics (`from`/`to` NULL sides)
  specified for the CFD algebra; (6) T01's verify line corrected (no "ADR
  README index" exists to update).
- **Notes**: The three design-review subagent verdicts are preserved in
  references.md — they changed the feature materially (exception lists
  lead, trust-over-volume scorecard, no tabs, richer activity schema).
  Skipped a separate test plan: docs-only task, nothing executable.
- **Next**: M24-T02 (contract).
