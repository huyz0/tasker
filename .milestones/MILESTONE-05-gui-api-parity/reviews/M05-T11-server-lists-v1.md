---
task: M05-T11
version: v1
timestamp: 2026-08-15
decision: approved
---

# Review — M05-T11 Server-driven filtering and sorting

## Correctness

The verify line — "filtering issues a new request rather than filtering in
memory" — passes, measured rather than asserted. Against the 150-task fixture:
151 cards on screen, then typing `Seed task #145` produced **one** further
`ListTasks` request carrying `filter: "Seed task #145"`, and one card. Clicking
the Title header sent `sort: "title:asc"`.

Both parameters have existed on `PageRequest` since M01 and the backend has
honoured them (`applyFilter`, `parseSort`, and a cursor that records which field
it was built for). The GUI sent neither.

```yaml
- file: apps/gui/src/features/Tasks/index.tsx
  line: 0
  severity: medium
  comment: >
    "Filter Tasks" was a button with no handler - a control that looks like a
    feature and does nothing, which is the same class of problem as this
    milestone's fabricated badges even though the fabrication lint does not
    match it (it looks for invented *state*, not inert controls). Replaced with
    a real, labelled filter box. Worth noting for M06: nothing currently fails
    the build for a button that does nothing.

- file: apps/gui/src/features/Tasks/index.tsx
  line: 0
  severity: medium
  comment: >
    The client-side sort it replaces was worse than redundant. The board fetches
    every page, but the table sorted whatever array was in hand - so with
    pagination it sorted a page and presented it as a sorted set. The filter
    parameters now travel on *every* page request, not just the first: the
    cursor records the field it was built for, and a continuation sent without
    them is a page of a different query.
```

## Test coverage

Five GUI tests, two of them rewrites. The rewrites are the interesting part: the
old ones asserted that rows reordered in the DOM, which is precisely the
behaviour being removed, so they were rewritten to assert the request — the
milestone's exit criterion is about where the work happens, not what lands on
screen.

New: the filter reaching the server, an empty box sending no filter at all
(rather than `filter: ""`, which the backend would treat as a filter matching
everything), and the ID header mapping to `createdAt`.

```yaml
- file: apps/backend/src/modules/tasks/tasks.handler.ts
  line: 0
  severity: low
  comment: >
    displayId is deliberately not a sortable column, and the ID header maps to
    createdAt instead. displayId is a string, so sorting by it puts "SEED-100"
    before "SEED-99" - which the *old* client-side sort did, via localeCompare.
    Ids are assigned in creation order, so createdAt is the same ordering done
    correctly. Both the handler and the GUI carry the reason.
```

## Architectural drift

None; this task removes code rather than adding it. The one judgement call is
the ID-to-createdAt mapping above, which trades a literal reading of the column
header for an ordering that is actually correct.

## Security

No new RPCs, no new authorization paths. `filter` and `sort` are handled by
`applyFilter` and `parseSort`, which escape the LIKE pattern and match the sort
field against a whitelist — a caller cannot name an arbitrary column, and both
were already covered by the existing pagination tests.

## Verdict

**Approved.** Two mediums (an inert control, and a sort that sorted a page while
claiming to sort a set), one low recorded.
