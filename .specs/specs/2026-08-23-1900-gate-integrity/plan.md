# Gate Integrity — Plan

## Task 1 (this document) — Save the design record

This spec folder (`shape.md`, `plan.md`, `standards.md`), `ADR-0023`, and the
milestone spec under `.milestones/MILESTONE-26-gate-integrity/`. No product
code.

## Tasks 2 onward — tracked in `MILESTONE-26`, not duplicated here

Per `milestone-standard.md`, `MILESTONE.md`'s Task Breakdown is the single
source of truth. Summary, for orientation:

- **M26-T02** — `events:read` scope, required in `subscribeEvents`, with
  per-subject filtering in `shouldDeliver`.
- **M26-T03** — the sweep covers all twenty-one services and asserts its own
  coverage against `index.ts`.
- **M26-T04** — journal `when` inversion fixed in both dialects, plus a
  monotonicity guard.
- **M26-T05** — backend `typecheck` task, its errors cleared, wired into CI.
- **M26-T06** — verification and closeout.

One commit per task, TDD-first, reviewed before each commit, `moon check
--all` clean throughout.

## Where the design lives

`shape.md` for the findings and how each was verified; `ADR-0023` for the
event-feed decision and its rejected alternatives. Not restated here.
