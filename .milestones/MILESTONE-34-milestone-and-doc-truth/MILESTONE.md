---
id: M34
title: Milestone and Doc Truth
status: in-progress
goal: Every milestone file says what is actually true of the product — status, exit criteria and dates agree with the boxes beneath them and with the ledger — every closed criterion has evidence behind it, and a gate fails the build the next time they drift.
depends_on: []
surfaces: [specs, backend, gui]
exit_criteria_met: false
started_at: 2026-10-02
completed_at: null
---

# M34 — Milestone and Doc Truth

## 1. Goal

`.milestones/` is the handoff mechanism every session trusts first
(`AGENTS.md` §2). After this milestone: no `MILESTONE.md` claims a state its
own checkboxes contradict; M10's eight exit criteria are each either proven
by a test that exists or fixed until they are; the testing standard no longer
forbids a library the suite depends on; and `moon run :doc-drift` fails on any
of these drifting again.

## 2. Why Now

COUNCIL-0001 flagged it and every STATE "Now" entry since has carried it
forward unscheduled. The 2026-10-02 review confirmed and extended it:

- **M08** frontmatter: `status: todo`, `exit_criteria_met: false`, no
  completion date — over 11/11 tasks and 6/6 criteria checked.
- **M10** frontmatter: `done`, criteria met — over **0/8** criteria checked.
  Checking them now shows two have no test at all ("100 roles is a tested
  configuration"; "the permission matrix renders 100 roles without a
  performance cliff") and one is false: `updateOrgMemberRole` authorizes by
  comparing the caller's role name to `"owner"`, where criterion 3 says no
  handler names a role and ADR-0013 defines `org:owner` for exactly this.
- **M21, M22, M23**: `status: complete`, not a value the standard allows.
- `doc-drift` reads the STATE ledger and four documents; it never opens a
  `MILESTONE.md`, so none of this could fail a build.
- `testing-standard.md` §3: "**MSW is not installed**; do not reach for it" —
  while `msw` has carried the GUI suite since M12-T01. A session that loads
  that standard as binding is told to avoid the tool every test uses.

## 3. Exit Criteria

- [x] Every `MILESTONE.md`'s `status`, `exit_criteria_met` and `completed_at`
  agree with its boxes, and its status is one the standard allows.
- [x] Each of M10's eight criteria is checked with the evidence named, and the
  two untested ones have tests.
- [x] No handler authorizes by comparing a role name; the owner rule goes
  through `can(…, "org:owner")`.
- [ ] `moon run :doc-drift` fails on a milestone whose frontmatter contradicts
  its boxes, or whose ledger row disagrees — proven by the gate's own tests.
- [ ] `testing-standard.md` describes the GUI's real RPC mocking (MSW).
- [ ] CI green on `main`.

## 4. Scope

**In scope:** the files and gate above.

**Out of scope:** rewriting closed milestones' prose; the remaining standards
truth pass beyond MSW (COUNCIL-0001 candidate 5) — later.

## 5. Task Breakdown

- [x] **M34-T01** — M10 made true: the owner rule through `can()`, the two missing tests, each criterion checked with evidence.
  - **Files**: `apps/backend/src/modules/orgs/orgs.handler.ts`,
    `modules/roles/roles.test.ts`, `apps/gui/src/features/Roles/index.test.tsx`,
    `.milestones/MILESTONE-10-*/MILESTONE.md`
- [x] **M34-T02** — Frontmatter and ledger agree with the boxes (M08, M21–M23, M12's ledger row).
  - **Files**: those `MILESTONE.md` files, `.milestones/STATE.md`
- [ ] **M34-T03** — The gate: `doc-drift` checks every `MILESTONE.md` against its boxes and the ledger.
  - **Files**: `scripts/doc-drift.ts` (+ test), `moon.yml`
- [ ] **M34-T04** — Testing standard tells the truth about MSW; close.
  - **Files**: `.specs/standards/testing-standard.md`, `.milestones/STATE.md`

## 6. Verification

```
moon run :doc-drift :docs-lint :spec-drift :skills-check
moon run backend:test gui:test
```

## 7. Risks

- **A gate that is too strict** blocks legitimate in-progress states. It
  checks only contradictions a `done`/`todo` claim makes, and accepts `[~]`
  (dropped, per the standard) as resolved.
