# Addressable Screens — Plan

## Task 1 (this document) — Save the design record

This spec folder (`shape.md`, `plan.md`, `standards.md`), `ADR-0025`, and the
milestone spec under `.milestones/MILESTONE-28-addressable-screens/`. No
product code.

## Tasks 2 onward — tracked in `MILESTONE-28`, not duplicated here

Per `milestone-standard.md`, `MILESTONE.md`'s Task Breakdown is the single
source of truth. Summary:

- **M28-T02** — the shared test render helper, first, so the rest of the
  milestone lands against one setup rather than thirty.
- **M28-T03** — scope in the URL, synced into the store.
- **M28-T04** — every in-app link preserves scope.
- **M28-T05** — navigational state into the URL (Bin, Organizations, Memory,
  Task Types).
- **M28-T06** — the three latent bugs, each reproduced red first.
- **M28-T07** — breadcrumbs on every deep-linkable detail view.
- **M28-T08** — end-to-end proof, `NAVIGATION.md`, closeout.

One commit per task, TDD-first, reviewed before each commit, `moon check
--all` clean throughout.

## Where the design lives

`shape.md` for the audit and the decisions; `ADR-0025` for the URL scheme and
its rejected alternatives.
