---
task: M05-T05
version: v1
timestamp: 2026-08-15
decision: approved
---

# Review — M05-T05 Reviewers

## Correctness

The verify line — "reviewers round-trip through the API" — passes with a second
client doing the reading. In the browser, `SEED-145` went from "No reviewers" to
`Member 0099999`; a separate `ListTaskReviewers` call over HTTP, sharing only
the session cookie, returned that reviewer with its resolved name; removing the
row in the UI left that same call returning an empty set. Reading it back
through the page's own cache would have proved nothing.

```yaml
- file: apps/backend/src/modules/tasks/tasks.handler.ts
  line: 0
  severity: medium
  comment: >
    listTaskReviewers returned userIds and nothing else, so any client wanting
    to show a name had to hold the member catalogue - which is exactly the
    pressure that produced M05-T04's two-thousand-request picker. Names are now
    resolved server-side in one batched lookup keyed on the distinct user ids,
    so the query count does not grow with the number of reviewers. The field
    falls back to the userId when a user row is missing rather than rendering
    blank, since a deleted user should still show *something* identifiable.
```

## Test coverage

Backend: six tests — the name resolved for one reviewer and for several, the
email used when an account has no display name, the id used when the account is
gone entirely, an empty list rather than null, and the batched lookup counted
(fewer than six `select` calls for two reviewers, so it does not grow per name).
The last of the fallbacks was written while reviewing: the code had it, nothing
exercised it, and a blank reviewer row reads as a rendering bug.

Component: twelve. The ones carrying weight are "lists reviewers by name, not by
id" (which asserts `u-1` is *absent*, the failure this replaces), "asks the
server to filter as you type", and the pair distinguishing "Nobody matches
that." from "Everyone is already reviewing."

```yaml
- file: apps/gui/src/features/Tasks/ReviewerPicker.tsx
  line: 0
  severity: low
  comment: >
    The 95% branch gate failed at 94.72% and named four real behaviours across
    the two pickers: the "Showing N of M" line, the two distinct empty states,
    Cancel, and `m.name || m.email` for a member who has been invited but has
    never signed in and therefore has no name. That last one is not cosmetic -
    without the fallback the row renders blank and cannot be picked. Fourth
    milestone running that this gate has named something real rather than
    demanding filler.
```

## Architectural drift

None. This is the same shape as `AssigneePicker` — bounded page, server-side
`filter`, count of what was matched but not shown — deliberately not shared with
it. They draw from different sets (`task_reviewers` references `users` only) and
answer different questions, so a single component with a `kind` flag would carry
a branch through every line for no reuse worth having.

## Security

`addTaskReviewer` and `removeTaskReviewer` are user-only: both sweeps classify
them as denied to agents, and an agent reviewing its own work is not a review.
`listTaskReviewers` is readable with `tasks:read`. The name resolution reads
`users` filtered to ids already returned by a query the caller was authorized
for, so it discloses nothing the caller could not already see.

## Verdict

**Approved.** One medium (the contract gap that forced clients to enumerate),
one low (the coverage gate naming a real empty-name case), no outstanding work.
