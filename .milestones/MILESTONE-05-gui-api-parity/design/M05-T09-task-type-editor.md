---
task: M05-T09
surface: new Task Types view
date: 2026-08-15
---

# Configuring a task type's state machine

## What the task asks for, against what exists

| Asked | Exists |
|---|---|
| Create statuses | `createTaskStatus` ✓ |
| **Order** statuses | Nothing. `task_statuses` has no position column, so the order is whatever the database returns. |
| Define allowed transitions | `createTaskStatusTransition` ✓ — but nothing removes one |
| Set the root type on a template | `updateTemplate({ rootTaskTypeId })` ✓ |
| Enforcement | `validateStatusForTaskType` already enforces membership and edges on every status change |

So enforcement — the verify line — is already built and, until now, unreachable:
nothing in the GUI could configure a state machine, so the enforcement path only
ever ran against the fallback `todo / in-progress / done`.

## Ordering is a schema change, not a sort

Statuses are a pipeline: `todo → in progress → in review → done`. Alphabetical
order puts "done" first, and insertion order is only right until someone adds a
status in the middle. A board that renders its columns in an arbitrary order is
not a board.

So `task_statuses` gains `position INTEGER NOT NULL DEFAULT 0`, backfilled by
rowid so existing rows keep the order they have today, and `getTaskType` orders
by it. `reorderTaskStatuses({ taskTypeId, statusIds })` takes the complete list
in the new order and rejects a partial one — a reorder that accepted a subset
would silently leave the unnamed statuses at stale positions, which is how two
statuses end up sharing position 3.

## Deleting

- **Transitions can be deleted.** An editor that can only add edges is a trap:
  one mis-click and the state machine has a wrong edge for good. Adds
  `deleteTaskStatusTransition`.
- **Statuses cannot.** A status may have tasks sitting in it, and the schema has
  no way to say what happens to them — the transitions referencing it are
  foreign keys, and the tasks reference the status *by name*, so deleting one
  would leave tasks in a status their own type no longer contains. That needs a
  migration story (reassign? block? soft-delete?) that this task cannot invent
  responsibly. Recorded for M08, which owns the data model.

## The screen

A new `Task Types` view, one type at a time:

```
┌─ Task Types ────────────────────────────────────────────┐
│  Bug ▸  Story ▸  Epic ▸                    + New type   │
├─────────────────────────────────────────────────────────┤
│  Bug                                                     │
│                                                          │
│  Statuses                          [ + Add status ]      │
│    1. todo             ↑ ↓                               │
│    2. in progress      ↑ ↓                               │
│    3. done             ↑ ↓                               │
│                                                          │
│  Transitions                                             │
│    todo → in progress                              ✕     │
│    in progress → done                              ✕     │
│    [ from ▾ ] → [ to ▾ ]            [ Allow ]            │
│                                                          │
│  Used as the root type of: Default Template  [ Set ▾ ]   │
└─────────────────────────────────────────────────────────┘
```

Ordering is ↑/↓ buttons rather than drag-and-drop: keyboard-reachable by
construction, no pointer-only affordance, and M06 owns interaction polish. Each
press sends the whole new order, so the request is the same shape a future drag
implementation would send.

## What a reader has to be told

| State | What the user sees |
|---|---|
| **No statuses yet** | "This type has no statuses, so its tasks fall back to todo / in progress / done." — that *is* the behaviour in `validateStatusForTaskType`, and a bare empty list hides it. |
| **No transitions yet** | "Every status change is allowed until the first transition is defined." Same reason: with no edges the validator checks membership only, and a reader who assumes "no edges = nothing allowed" has it backwards. |
| **One status** | The transition form is disabled — an edge needs two ends. |
| **Duplicate edge** | Not offered; the pair is already in the list. |
| **Save failed** | The server's message, verbatim. |

Those first two lines matter more than the rest of the screen: the fallback is
invisible, surprising, and already shipped.

## Not in scope

- **A canvas / graph editor.** The milestone says a form-based editor and lets
  M06 decide whether a canvas is warranted.
- **Deleting statuses** — see above.
- **Renaming a status.** Tasks store their status by name, so a rename is a data
  migration wearing a text field. M08.
- **Per-status colour or category** (done-ness, in-progress-ness). The schema
  stores neither, and inventing them on screen is exactly what M05-T01's
  fabrication lint exists to catch.

## Accessibility

- The move buttons name their target and direction (`Move todo up`), not a bare
  arrow repeated down the list.
- Statuses render as an ordered list, so position is announced.
- The transition form's two selects have visible labels; "from"/"to" alone is
  not enough out of context.
