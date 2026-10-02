---
id: ADR-0028
status: accepted
date: 2026-10-02
milestone: M35
---

# A task graph of blockers, parents and origins; claim-next takes ready work by priority

## Context

`ClaimNextTask` (M33) claims the oldest open, unassigned task. Nothing says one
task must wait for another, which task matters more, that a task is part of a
larger one, or that it was discovered while working on another. Every
agent-first tracker reviewed on 2026-10-02 has these
(`.specs/reviews/2026-10-02-ai-native-landscape.md`): Beads (`bd ready`,
P0–P3, parent-child, discovered-from), Taskmaster (`next_task` by priority over
satisfied dependencies), GitHub (blocked-by, sub-issues), Linear (priority,
sub-issues). Without them an agent can be handed work that cannot succeed yet,
and important work waits behind old work.

## Options

**Relations.**

- **(a) One table per relation.** Separate dependency and origin tables, plus
  a parent column. More tables, each simpler.
- **(b) A parent column plus one `task_links(task_id, linked_task_id, kind)`
  table** for the many-to-many relations (`blocked_by`, `discovered_from`).
  New link kinds are rows, not migrations.
- **(c) Everything in `task_links`, parent included.** One table, but "a task
  has at most one parent" becomes a handler rule instead of a column's shape,
  and listing children needs the link index instead of a plain column index.

**Priority.** An integer 0–4 with Linear's meaning (0 none, 1 urgent … 4
low), or a free-form string. The integer orders in SQL without a lookup, and
"none sorts last" is a single `CASE`.

**Cycle safety.** Check in the handler before insert (a bounded walk of the
blocker graph), or with a transaction-level lock on the graph.

## Decision

**(b)**, with an integer priority, and a pre-insert cycle check without a
lock.

- A blocking link may join any two tasks in the **same organization**
  (cross-project dependencies are common: a backend task blocking a client
  task). A parent must be in the **same project**. Links to self, across
  organizations, or closing a cycle are `InvalidArgument`. At most one
  `discovered_from` per task.
- A task is **ready** when it is not deleted, not terminal, has no assignee,
  and every task blocking it is terminal or deleted. A deleted blocker no
  longer blocks: binning a task must not strand its dependents.
- `ClaimNextTask` orders by priority (1, 2, 3, 4, then 0), then creation
  time. Priority is strict; age is not: M33's candidate window (the 20 oldest
  ready tasks) is shuffled *within* each priority so concurrent claimers
  spread out instead of racing for one row. `ListTasks(ready: true)` filters
  to the same set and sorts by priority on request (`sort: "priority:asc"`).
- Links are written with `tasks:write` / `task:write`, read with
  `tasks:read` / `task:read`. Agents may link: recording discovered work and
  dependencies is exactly what an agent breaking down work does.
- Moving a task to a terminal status publishes `domain.task.unblocked` for
  each task it blocked that now has no unfinished blocker.

## Consequences

- Two concurrent links (A blocked by B, B blocked by A) can both pass the
  check. The result is fail-safe: both tasks become never-ready, so nothing is
  claimed that should not be. Removing either link repairs it, and the
  dialog shows both blockers. A lock was judged not worth its cost for that.
- The cycle walk is bounded (1,000 visited tasks). A graph deeper than that is
  refused rather than walked — a guard against a request that walks the whole
  organization.
- Parent and child are not tied by status. Closing a parent does not close
  its children, and vice versa; that is the task type's policy, not the
  graph's.
- No foreign keys on the link columns, matching `entity_labels`: purge removes
  a task's links in `purgeTaskCascade`, and a dangling id reads as "no such
  relation".
