---
id: M32
title: Task Workspace Correctness
status: in-progress
goal: A human supervising agents from the task screen sees what the agents are doing as they do it, is never shown a stale or wrong value after their own edit, can only choose moves the server will accept, and is told when something failed instead of being shown an empty panel.
depends_on: [M30]
surfaces: [gui, specs]
exit_criteria_met: false
started_at: 2026-10-02
completed_at: null
---

# M32 — Task Workspace Correctness

## 1. Goal

With a task open, an agent's new note or handoff appears without a refresh.
Saving a title or picking a status shows the new value immediately and keeps
it. Escape closes only the topmost layer. A task link that fails or is slow
says so. A comment thread that failed to load says so, and an edit that failed
is not reported as a failed post. The status pickers offer only transitions
the task type allows. Agents appear by name, notes keep their line breaks, and
the audit trail renders its rows.

## 2. Why Now

The 2026-10-02 GUI review (read-only, every finding re-checked in code) found
these in the screen supervisors live in:

1. `eventQueryKeys.ts` maps `tasknote` to `['handoffNotes','task','reports']`;
   the notes panel and handoff summary read `['taskNotes', id]`. React Query
   matches whole key elements, so `'task'` never matches `'taskNotes'` — **the
   "watch the agent work" panel never live-updates.**
2. Editing a task or changing its status invalidates `['tasks', projectId]` only;
   the dialog reads `['task', id]` and shows the old value for up to 30 s.
3. A `window` keydown listener closes the task dialog on Escape alongside
   Radix's own handler — Escape on the delete confirm closes both, and discards
   unsaved description edits.
4. `/tasks/:id` renders `{expandedTask && …}` and never reads the query's
   loading or error state: a dead link does nothing at all.
5. `CommentContext` drops the list query's `error` ("No comments yet") and
   merges three mutations' errors into "Failed to post comment".
6. The status selects ignore the type's `transitions`, which the server
   enforces; bulk change across types partly fails with no detail.
7. Agent notes render as one `<p>` (line breaks lost); agents show as UUIDs.

M30-T11 also found the **Organizations audit trail never loaded** (fixed on
the server); no E2E asserted it rendered a row.

## 3. Exit Criteria

- [x] A `domain.tasknote.*` event refetches the open task's notes — pinned in
  `eventQueryKeys.test.ts`.
- [x] After a title edit or status change the dialog shows the new value
  without waiting for an event — pinned by component tests.
- [x] Escape on a dialog layered over the task dialog closes only that layer.
- [x] `/tasks/<missing-id>` renders an error with a way out; a slow load
  renders a loading state.
- [ ] A failed comment load renders an error with retry; edit/delete failures
  are labelled as such.
- [ ] The detail status select offers only the current status and its allowed
  targets.
- [ ] Notes render Markdown; agent names replace agent ids where the org's
  agents are known.
- [ ] An E2E spec asserts the audit trail renders at least one row.
- [ ] `moon run gui:lint gui:design-lint gui:typecheck gui:test gui:build`,
  `gui:storybook-test` and `gui:e2e` green in CI on `main`.

## 4. Scope

**In scope:** §2, the flaky `ArtifactUpload` test isolation bug, and the
review's deferred items that are defects (`formatDateTime` helper, raw
`in_progress` on Handoffs, Title Case button labels, set-password submit).

**Out of scope:**

- A per-task activity timeline and board filters by assignee/agent — new
  read API; candidates for a later milestone.
- Bulk reassign — new UI flow; later.
- Shared `Input`/`Badge` primitives across every feature — a refactor; the
  review recommends doing it feature by feature, outside a defect milestone.

## 5. Task Breakdown

- [x] **M32-T01** — Task-note events refresh the open task's notes.
  - **Files**: `apps/gui/src/lib/eventQueryKeys.ts` (+ test)
- [x] **M32-T02** — The task dialog shows its own edits immediately.
  - **Files**: `apps/gui/src/features/Tasks/index.tsx` (+ test)
- [x] **M32-T03** — Escape belongs to the topmost layer; a deep link that fails or loads says so.
  - **Files**: `apps/gui/src/features/Tasks/index.tsx` (+ test)
- [ ] **M32-T04** — Comment load and mutation errors are reported truthfully.
  - **Files**: `apps/gui/src/components/ui/comments/*` (+ test)
- [ ] **M32-T05** — Status pickers offer only allowed transitions.
  - **Files**: `apps/gui/src/features/Tasks/index.tsx` (+ test)
- [ ] **M32-T06** — Notes render Markdown; agents appear by name; one date formatter.
  - **Files**: `apps/gui/src/features/{Tasks,Handoffs}/index.tsx`, `src/lib/formatDateTime.ts`
- [ ] **M32-T07** — Copy and small UX fixes: Handoffs status labels, Title Case buttons, set-password submit, flaky upload test.
  - **Files**: as named in the journal
- [ ] **M32-T08** — Audit trail E2E, documentation and close.
  - **Files**: `apps/gui/tests/e2e/*.spec.ts`, `.milestones/STATE.md`

## 6. Verification

```
moon run gui:lint gui:design-lint gui:typecheck gui:test gui:build
moon run gui:storybook-test
cd apps/backend && bun run seed && STANDALONE=true ENABLE_TEST_LOGIN=true bun run src/index.ts &
cd apps/gui && bunx playwright test
```

## 7. Risks

- **GUI coverage thresholds (95%)** fail CI on any untested branch — every
  new branch gets a test in the same commit.
- **E2E fixtures are consumed** by some specs (notifications, reports); a
  local re-run needs a fresh seed.
