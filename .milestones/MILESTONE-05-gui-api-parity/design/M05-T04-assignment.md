---
task: M05-T04
surface: Tasks → card and detail
date: 2026-08-15
---

# Assigning a task

## What the task assumed, and what is actually there

The task lists only GUI files. Wiring `assignTask` needs more than that, and the
gap is worth stating before any code:

- **`Task` carries no assignee.** No field, no `listTaskAssignments` RPC. So
  "the assignee shown on the card and detail view" and the verify line
  "assigning in the UI is visible via `cli tasks list`" are both unreachable
  without a contract change. The assignment is stored — `task_assignments` has
  had rows since M01 — it has simply never been readable.
- **There is no unassign.** `assignTask` inserts and returns `success: true`,
  and is idempotent on an exact `(agentId, userId)` match. Nothing removes an
  assignment.

Both are in scope here, because a picker that cannot show its current value is
not a picker, and one that cannot undo a mis-click is a trap.

## The shape

One control on the card and the same control on the detail view. It lists
**people and agents together**, because the question a manager is answering is
"who is doing this", and making them first choose a *kind* of worker is a step
that exists only because the schema has two columns.

```
┌─ Assignees ─────────────────────────────┐
│  Ada Lovelace          person        ✕  │
│  Reviewer Bot          agent         ✕  │
│                                          │
│  [ Search people and agents…          ]  │
│  ── People ──                            │
│    Ada Lovelace                          │
│    Grace Hopper                          │
│  ── Agents ──                            │
│    Reviewer Bot                          │
│  Showing the first 10 of 100,001         │
└──────────────────────────────────────────┘
```

Grouped by kind, labelled per row. The grouping is navigational; the label is
what a reader needs when scanning who is on a task.

### It searches, it does not enumerate

The first version of this was a `<select>` filled by paging through every member
of the organization. Against M03's 100,001-member fixture it issued **two
thousand requests and never finished loading** — the exact unbounded-list defect
M03 spent a milestone removing, reintroduced on the client.

So the control searches instead. It fetches one bounded page, passes the typed
text to the server's `filter` parameter (`listOrgMembers` and `listAgents` both
support it), and says how many matches it is not showing. That also satisfies
this milestone's sixth exit criterion — filtering happens on the server — rather
than working against it.

A consequence worth stating: the picker is a search field, not a dropdown of
"everyone". In an organization of five that is marginally more typing. In an
organization of a hundred thousand it is the only thing that works, and the
five-person case still shows the whole list without typing anything.

## Why a list, not a single value

`task_assignments` is many-to-many and always has been: a task can carry several
assignees, and the backend's duplicate check is on the exact `(agentId, userId)`
pair, which only makes sense for a set. Rendering one "the assignee" would show
the first row of a set and silently hide the rest — and hiding an assignment is
worse than showing none, because the task looks unowned when it is not.

## States

| State | What the user sees |
|---|---|
| **No assignees** | "Unassigned", muted, plus the Assign control. Not an empty box — an unassigned task is a normal and actionable state, and it is the one a manager is looking for. |
| **Loading candidates** | The panel opens with "Searching…" rather than an empty list that looks like "nobody available". |
| **No matches** | "Nobody matches that." for a search that found nothing, and "No members or agents left to assign." when everyone is already on the task. Two different situations, and telling them apart is what stops someone retyping a name that was never going to appear. |
| **Assigning** | The chosen row appears immediately with a pending style; the menu closes. On failure it is removed and the error is shown. |
| **Assign failed** | Destructive text under the control, carrying the server's message — the realistic failures are permission and a stale candidate. |
| **Removing** | That row's ✕ disabled, others usable. |
| **Already assigned** | Candidates already on the task are not offered again. The server treats a duplicate as success, so re-offering them would produce a click that appears to do nothing. |

## Not in scope

- **Reassignment as one action** (remove + add atomically). Two steps, and the
  intermediate state is honest: the task genuinely has no assignee between them.
- **Assignment from the Kanban board by drag.** M06 owns interaction polish.
- **Notifying the assignee.** Nothing in the product notifies anyone yet; M11
  owns delivery.

## Accessibility

- Candidates are real `<button>` elements, so keyboard and screen-reader
  behaviour come from the platform rather than from a div with a click handler.
- The search field has a visible label, and the result count is announced via
  `role="status"` so a screen-reader user learns how many matched without
  reading the whole list.
- Each remove button names its target (`Remove Ada Lovelace from this task`),
  not a bare ✕ repeated down the list.
- The assignee list is a `<ul>`, so its length is announced.
