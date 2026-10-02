---
id: M35
title: Work Graph
status: in-progress
goal: Tasks carry a priority, can block one another, nest under a parent and record the task they were discovered from — and an agent asking for the next piece of work gets the most important task whose prerequisites are finished.
depends_on: [M33]
surfaces: [contract, backend, cli, gui, specs]
exit_criteria_met: false
started_at: 2026-10-02
completed_at: null
---

# M35 — Work Graph

## 1. Goal

A task has a priority (none, urgent, high, medium, low). A task can be
*blocked by* other tasks in its organization, can have a *parent* in its
project, and can record the task it was *discovered from*. A task is **ready**
when it is open, unassigned and every task blocking it is finished.
`ClaimNextTask` claims the highest-priority ready task (oldest first within a
priority); `ListTasks` can filter to ready work, by priority, by label and by
parent. Finishing a task announces the tasks it unblocked. The CLI and GUI
show and edit all of it.

## 2. Why Now

`.specs/reviews/2026-10-02-ai-native-landscape.md`: dependencies with a
"ready work" query (Beads `bd ready`, Taskmaster `next_task`, GitHub
`is:blocked`) and priority (Linear, Beads, Taskmaster, Factory) are what every
agent-first tracker gives an agent deciding what to do next. Tasker's
`ClaimNextTask` (M33) is oldest-first only and will hand an agent a task whose
prerequisite is still open — work that cannot succeed. An agent that finds
follow-up work has no way to say where it came from, and a large task cannot
be split. `ListTasks` cannot filter by label, so label-based routing is
impossible.

## 3. Exit Criteria

- [ ] `ClaimNextTask` never claims a task with an unfinished blocker, and
  among ready tasks claims strictly by priority (urgent first, none last),
  choosing among the oldest of that priority — proven by tests on both.
- [ ] A blocking link that would create a cycle, cross organizations or point
  at the task itself is `InvalidArgument`; a parent that would create a cycle
  or cross projects likewise.
- [ ] `ListTasks` filters `ready`, `priority`, `labelId` and `parentTaskId`;
  each `Task` carries `priority`, `parentTaskId` and `blockedByOpenCount`.
- [ ] Moving a task to a terminal status publishes `domain.task.unblocked`
  for each dependent it left with no open blocker.
- [ ] Links and priority are covered by the agent-scope and viewer-denial
  gates; a viewer cannot change either.
- [ ] CLI: `tasks create/update --priority --parent`, `tasks create
  --blocked-by --discovered-from`, `tasks link add|remove|list`, `tasks list
  --ready --priority --label --parent`.
- [ ] GUI: priority shown in list and board and editable in the task dialog;
  the dialog lists blockers, dependents, subtasks and origin, and edits
  blockers and parent; list filters by priority and ready.
- [ ] `docs/agent-integration.md` describes the ready-work loop; CI green on
  `main`.

## 4. Scope

**In scope:** the above, ADR-0028, migrations for both dialects.

**Out of scope:**

- Automatic status changes from the graph (e.g. closing a parent when its
  children close) — policy belongs to the task type, not the graph.
- Estimates, due dates, SLAs — no demand signal for agent-first work yet.
- Graph visualisation beyond lists in the dialog.

## 5. Task Breakdown

- [x] **M35-T01** — ADR-0028; contract and schema: `priority`, `parent_task_id`, `task_links`.
  - **Files**: `.specs/adr/ADR-0028-*.md`, `packages/shared-contract/*`,
    `apps/backend/src/db/schema.*.ts`, migrations
- [x] **M35-T02** — Priority: create, update, list filter and sort.
  - **Files**: `apps/backend/src/modules/tasks/tasks.handler.ts` (+ test)
- [x] **M35-T03** — Links: add, remove, list; parent; cycle and tenancy checks.
  - **Files**: `apps/backend/src/modules/tasks/taskLinks.ts` (+ test), handler
- [x] **M35-T04** — Ready work: `blockedByOpenCount`, list filters, claim-next order, `domain.task.unblocked`.
  - **Files**: as T02, `taskActivity.ts`
- [x] **M35-T05** — CLI.
  - **Files**: `apps/cli/cmd/tasks*.go`, `docs/cli-reference.md`
- [x] **M35-T06** — GUI: priority everywhere, relations panel, filters.
  - **Files**: `apps/gui/src/features/Tasks/*`
- [ ] **M35-T07** — Docs, skill, E2E and close.
  - **Files**: `docs/agent-integration.md`, `.specs/product/architecture.md`,
    `apps/gui/tests/e2e/*`, `.milestones/STATE.md`

## 6. Verification

```
moon run backend:typecheck backend:test cli:test cli:docs-check :knip
moon run gui:lint gui:typecheck gui:test gui:build
moon run :doc-drift :docs-lint :spec-drift :skills-check
```

## 7. Risks

- **Ready-work query cost.** `NOT EXISTS` over open blockers per candidate is
  indexed on `task_links(task_id)` and bounded by claim-next's window; the
  `blockedByOpenCount` for a page is one grouped query, not one per row.
- **Cycle checks race.** Two concurrent links A→B and B→A can each pass the
  check. Accepted and documented in ADR-0028: a cycle only makes both tasks
  never-ready (fail-safe — nothing is claimed wrongly), and removing either
  link repairs it.
