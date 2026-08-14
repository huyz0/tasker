# Phase: Design

Produce the artifacts that bind implementation: architecture, UX, and a test plan.

Load via `context-inject`: `.specs/product/architecture.md`, `tech-stack.md`, and
the `api-standard`, `ui-ux-standard` or `test-plan-standard` that the epic's
surface calls for.

## Applicability first

Read the epic's scope and decide which of the three phases apply. Mark any that
do not `n/a` in **both** `designs` and `design_reviews`. Deciding this up front is
what keeps the gate honest later.

## Architecture

- Identify the decisions that are genuinely decisions — a choice with a real
  alternative and a consequence.
- Write `ARCHITECTURE.md` at the ledger's `architecture_design` path, plus one
  `ADR-*.md` per decision: context, options considered, choice, consequences.
- Document the sequence flows that cross a component boundary.
- Set `designs.architecture: completed`.

## UX

- Cover the target screens and the critical user flows, including the empty,
  loading, error and permission-denied states — the states implementations skip.
- Mockups plus Mermaid flow diagrams, at the ledger's `ux_design` path.
- Conform to `.specs/standards/ui-ux-standard.md` and `.specs/design/`.
- Set `designs.ux: completed`.

## Test plan

- `TEST-PLAN.md` at the ledger's `test_plan` path, conforming to
  `.specs/standards/test-plan-standard.md`.
- Pure Given/When/Then scenarios. Every acceptance criterion in the Definition of
  Done maps to at least one scenario, and every scenario is executable — a
  scenario nobody can run is a comment.
- Cover the edge cases the architecture exposes, not just the happy path.
- Set `designs.qa_plan: completed`.

## Close

Set the epic `status: design-ready` and hand off to the design-review phase. The
test plan is now a contract: implementation works inside those scenarios.
