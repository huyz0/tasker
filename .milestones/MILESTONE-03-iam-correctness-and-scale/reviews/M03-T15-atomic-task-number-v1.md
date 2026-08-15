---
task: M03-T15
version: v1
timestamp: 2026-08-15
decision: approved
---

# Review — M03-T15 Make the task-number claim atomic

## Correctness

Eight concurrent `createTask` calls against one project returned `ENG-1` eight
times. The display id is the human-readable handle people paste into chat and
search for, so every task in a project sharing one is not a cosmetic defect.

The cause is the one M03-T03 found in `purgeOrg`: `db.transaction(async …)` on
bun:sqlite commits when the callback *returns*, which for an async callback is
before its first statement runs. The SQLite path is now synchronous end to end —
no `await` inside the callback, so nothing can interleave between the read and
the write — and MySQL keeps the awaited form with `SELECT … FOR UPDATE`.

```yaml
- file: apps/backend/src/modules/tasks/tasks.handler.ts
  line: 372
  severity: high
  comment: >
    The comment that used to sit above this claim was the mistake, not just the
    code. It asserted "SQLite's single-writer model makes this atomic without
    locking", which is true of one statement and false of a read-modify-write
    spanning two awaits — between the awaited SELECT and the awaited UPDATE the
    event loop is free to run another request's SELECT, which is exactly what
    happened. The replacement comment says what protects the claim in each
    dialect rather than asserting that nothing needs to.
```

## Test coverage

Three cases, all committed: concurrent creates claim distinct numbers, the
project's counter ends where the claims did, and sequential creates still
number consecutively.

The counter assertion matters independently. A claim that hands out unique ids
but leaves `nextTaskNumber` behind produces ids that are unique today and
collide with the next batch — which would have passed a distinctness-only test.

The third case is a control: it passed before the fix and must keep passing, so
"the numbers are distinct" cannot be satisfied by breaking numbering entirely.

## Architectural drift

Both `db.transaction` call sites in the codebase are now dialect-split with the
reason recorded inline. The audit the task asked for found no third site —
`grep '\.transaction('` across `apps/backend/src` returns exactly `orgs.handler.ts`
and `tasks.handler.ts`, plus a comment in `db.ts`.

That is the whole population *today*. Nothing prevents the next person writing
`await db.transaction(async …)` and getting silence, which is the residual risk
below.

## Security

No authorization change.

```yaml
- file: apps/backend/src/db/db.ts
  line: 0
  severity: medium
  comment: >
    The residual risk is that this defect is invisible and repeatable. Both
    occurrences were found by accident — purgeOrg's while writing a rollback
    test, this one while investigating that. A third would look identical:
    correct-reading code, a passing test suite, and wrong behaviour only under
    concurrency or failure. A lint rule or a wrapper that refuses an async
    callback on the sqlite driver would make it structural rather than
    remembered. Out of scope here; flagged for M12, which owns test depth.
```

## Verdict

**Approved.** One high finding (the misleading comment, corrected) and one
medium recorded as residual risk for M12.
