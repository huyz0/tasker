# Phase: Define

Mint the epic. Conforms to `.specs/standards/epic-standard.md`.

## Gather

Interactive asks these one at a time and waits; autonomous derives each from the
topic plus `.specs/product/`.

1. **Title and the business problem it solves.**
2. **Scope** — must-have features, and the explicit exclusions. Out-of-scope is
   the half that stops an epic sprawling; never leave it empty.
3. **Dependencies** — blockers, prerequisites, related systems.
4. **Definition of Done** — acceptance criteria. MUST state explicitly that the
   implementation is fully working end to end, not scaffolded.
5. **Task breakdown** — the trackable sub-tasks.

## Allocate an id

Scan the live epics tree and the archive. Next id is `max(existing) + 1`, or
`0001` if both are empty. Ids are permanent.

## Write

Path and filename come from the work ledger's `epics` entry. Initialise every
frontmatter block — a missing key is indistinguishable from an unstarted phase.

```markdown
---
status: todo
designs:
  architecture: pending
  ux: pending
  qa_plan: pending
design_reviews:
  architecture: pending
  ux: pending
  qa_plan: pending
reviews:
  code: pending
  security: pending
  qa_implement: pending
  architecture_code: pending
created_at: [YYYY-MM-DD]
---

# [Title]

## Context & Objective
[Why this exists, and the end state.]

## Scope
### In Scope
### Out of Scope

## Dependencies
[Or "None identified."]

## Technical Approach
To be determined during technical planning.

## Definition of Done
- [ ] [Acceptance criteria, including end-to-end working behaviour]

## Task Breakdown
- [ ] [Task]
```

Set a block to `n/a` immediately if it is genuinely irrelevant — a backend-only
epic has no UX phase, and leaving it `pending` blocks the gate forever.
