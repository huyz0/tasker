---
task: M05-T09
version: v1
timestamp: 2026-08-15
decision: approved
---

# Review — M05-T09 Task type editor

## Correctness

The verify line — "a custom state machine configured in the UI is enforced on
status change" — passes end to end, and it is the first time that enforcement
path has run against anything but its own fallback.

Built `Incident 1` in the browser with statuses `triage / mitigating / resolved`
and a single edge `triage → mitigating`. Then, over HTTP:

| Attempt | Result |
|---|---|
| `todo` | `invalid status "todo" for this task's type — expected one of: triage, mitigating, resolved` |
| `resolved` | `transition from "triage" to "resolved" is not allowed for this task's type` |
| `mitigating` | accepted |

`todo` is one of the built-in fallback statuses, so its rejection is the
evidence that the configured machine *replaced* the fallback rather than adding
to it.

```yaml
- file: apps/backend/src/modules/tasks/tasks.handler.ts
  line: 0
  severity: high
  comment: >
    deleteTaskStatusTransition was first written to look the edge up, return
    success when it was missing, and only then authorize. That answers "success"
    to any transition id at all, from any authenticated user, with the
    authorization check never running - and because it never throws, both
    deny-by-default sweeps would have counted it as classified. Caught while
    wiring the sweeps, not by reading. It now takes the taskTypeId too,
    authorizes against the type, and deletes on the exact pair, so it stays
    idempotent without the hole. A test pins it: a viewer is refused for an id
    that does not exist.

- file: apps/backend/src/db/schema.sqlite.ts
  line: 0
  severity: medium
  comment: >
    Ordering statuses is a schema change, not a sort. task_statuses had no
    position column, so the order was whatever the database returned - which
    puts "done" wherever it likes. Added `position` in both dialects with
    migrations that backfill by rowid (sqlite) and by id (mysql, which has no
    rowid), so existing rows keep the order they are displayed in today.
    createTaskStatus appends rather than inserting, because a new status
    arriving in the middle would silently reorder a live board.
```

## Test coverage

Backend: nine. The ones that carry weight are the reorder rejections — a partial
list, a duplicated id, and an id belonging to another type — because each one is
a way for two statuses to end up sharing a position, and none of them is visible
in the response. Plus the enforcement test that walks the same three attempts
the browser check made, and the authorization-without-the-row test above.

GUI: nineteen. Both directions of the move (the swap is written once and would
be wrong in exactly one direction), the two explanatory empty states, the
transition form disabled below two statuses, the id fallback for an edge naming
an unknown status, and both failure paths.

```yaml
- file: apps/gui/src/features/TaskTypes/index.tsx
  line: 0
  severity: low
  comment: >
    The 95% branch gate fired at 94.83% and named real gaps in this file and in
    T08's uploader: moving a status *down*, a blank type name, the placeholder
    option in the root-type select, an unreadable file, and the in-flight upload
    label. Fifth milestone running that this gate has named behaviour rather
    than demanding filler. One defensive branch remains uncovered by design -
    move()'s bounds check, unreachable because the buttons at each end are
    disabled. Kept: it guards against those two conditions drifting apart.
```

## Architectural drift

Two of the four things the task asks for did not exist: ordering (no column) and
removing a transition (no RPC). Both are in the design note with the reasoning.
Deleting a *status* is deliberately not built — tasks reference their status by
name, so a delete would leave tasks in a status their own type no longer
contains, and inventing a migration story for that is M08's call, not this
task's.

The editor is form-based with ↑/↓ buttons rather than drag-and-drop, which the
milestone explicitly allows. Each press sends the complete new order, so the
request is the same shape a drag implementation would send later.

## Security

`reorderTaskStatuses` and `deleteTaskStatusTransition` are user-only and require
a writer; neither appears in `AGENT_RPC_SCOPES`, with a comment saying why — a
token that can edit the state machine can grant itself an edge out of a status
it is not meant to leave. Both sweeps cover them.

One wire-level note for future clients: proto3 omits zero-valued scalars, so the
first status arrives with `position` absent in JSON rather than `0`. The GUI
never reads the number — the server returns the array already ordered — but a
client that sorts by `position` itself must treat a missing value as 0.

## Verdict

**Approved.** One high, found by the sweeps while wiring them and fixed by
moving authorization off the row being deleted; one medium (the schema change,
designed in with migrations for both dialects); one low recorded.
