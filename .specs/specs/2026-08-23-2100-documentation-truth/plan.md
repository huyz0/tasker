# Documentation Truth — Plan

## Task 1 (this document) — Save the design record

This spec folder (`shape.md`, `plan.md`, `standards.md`), `ADR-0024`, and the
milestone spec under `.milestones/MILESTONE-27-documentation-truth/`. No
product code.

## Tasks 2 onward — tracked in `MILESTONE-27`, not duplicated here

Per `milestone-standard.md`, `MILESTONE.md`'s Task Breakdown is the single
source of truth. Summary:

- **M27-T02** — correct `README.md`.
- **M27-T03** — correct `.specs/product/architecture.md`.
- **M27-T04** — correct `.specs/design/NAVIGATION.md`.
- **M27-T05** — build the `doc-drift` gate and demonstrate it against the
  pre-M27 text from git history.
- **M27-T06** — verification and closeout.

Documents are corrected before the gate is added, so no commit leaves
`moon check --all` red; the historical demonstration in T05 supplies the
evidence that the gate genuinely bites.

## Where the design lives

`shape.md` enumerates every false statement and the code that disproves it;
`ADR-0024` records how staleness is detected and what was rejected.
