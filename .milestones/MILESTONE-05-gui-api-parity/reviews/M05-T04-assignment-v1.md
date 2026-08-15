---
task: M05-T04
version: v1
timestamp: 2026-08-15
decision: approved
---

# Review — M05-T04 Assignment

## Correctness

The verify line — "assigning in the UI is visible via `cli tasks list`" — passes
end to end. Assigned `Member 0050000` to `SEED-145` in the browser; the CLI then
reports `SEED-145 -> Member 0050000 (person)`.

Twelve backend tests and fourteen component tests. The ones that carry weight
are the many-assignee case (a task can hold several, and showing "the assignee"
would hide the rest), the agent-vs-person removal pair (removing an agent must
not remove a person on the same task), and the batching test.

```yaml
- file: apps/gui/src/features/Tasks/AssigneePicker.tsx
  line: 0
  severity: high
  comment: >
    The first implementation paged through every organization member to fill a
    <select>. Against M03's 100,001-member fixture that issued roughly two
    thousand requests and never finished loading - the unbounded-list defect M03
    spent an entire milestone removing, reintroduced on the client by me, one
    milestone later. It now searches: one bounded page of 10, the typed text
    passed to the server's `filter`. Opening the picker costs 2 requests instead
    of ~2000, measured. This was invisible to the unit tests, which mock the
    transport and therefore cannot see how many calls a page costs; only running
    it against the real fixture showed it.

- file: apps/backend/src/modules/tasks/tasks.handler.ts
  line: 0
  severity: medium
  comment: >
    assigneesByTask resolves a whole page's assignees in a fixed number of
    queries rather than one per task, and a test asserts the query count stays
    under ten for a 25-task page. Written that way from the start because the
    obvious version - fetch assignments per task while mapping - makes a
    100-task page cost 100 round trips and grows with the page size. The test
    exists because the defect is invisible in output: both versions return
    identical data.
```

## Test coverage

Backend: assignee resolution for people, agents and mixed sets; empty list
rather than null; the batching bound; and for `unassignTask` — removes the named
one only, is idempotent, requires naming somebody, refuses a viewer, refuses a
different organization, and deletes the row rather than hiding it.

Component: the unassigned state, the multi-assignee list, person/agent labels,
grouping, server-side filtering, the "showing N of M" line, assign and unassign
for both kinds, both failure paths, and the distinction between "nothing
matched" and "nobody left".

```yaml
- file: apps/gui/src/features/Tasks/AssigneePicker.test.tsx
  line: 0
  severity: low
  comment: >
    Five tests initially failed for a reason unrelated to the code: they
    asserted on the menu before the candidates query had resolved. Fixed by
    waiting for a candidate to appear rather than by loosening the assertions.
    Worth noting because "the test failed, so the code is wrong" was the wrong
    conclusion here, and weakening the assertion would have been the wrong fix.
```

## Architectural drift

The task named only GUI files. Three things it did not anticipate were needed
and are recorded in the design note:

1. **`Task` had no assignee field** — the rows have existed since M01 and
   nothing could read them, which is *why* the card rendered a hardcoded avatar.
2. **There was no unassign** — a picker that cannot undo a mis-click is a trap,
   so `unassignTask` was added.
3. Both sweeps caught the new RPC immediately and it was classified: denied to
   viewers, denied to agents. A token that can unassign work can take itself off
   a task it was given, which is the same argument that keeps `assignTask`
   closed.

## Security

`unassignTask` gates on `assertOrgWriter` against the task's own organization,
resolved from the task rather than from the request. Deletion matches the exact
`(agentId, userId)` pair the assignment was created with — matching on taskId
plus whichever id happens to be set would remove a *different* assignment that
shares the task.

Assignee names are resolved server-side, so a client no longer needs the member
catalogue to render a task list — which is what made the 100k enumeration
avoidable in the first place.

```yaml
- file: apps/gui/src/features/Tasks/index.tsx
  line: 0
  severity: low
  comment: >
    The Kanban card is a <div role="button">, so its accessible name is now its
    entire text content, which includes the labels of the controls inside it.
    This surfaced while writing the browser check: getByRole('button', {name:
    'Assign…'}) matched the *card* and opened the detail view. The nesting works
    for a mouse and for a keyboard, but the accessible name is poor and controls
    nested inside a button are a known a11y smell. M06 owns interaction and
    accessibility; recorded here rather than restructured mid-task.
```

## Verdict

**Approved.** One high — an unbounded fetch I wrote and then found by running it
against the real fixture — fixed and measured. One medium (batching, designed in
rather than repaired), two lows recorded, one handed to M06.
