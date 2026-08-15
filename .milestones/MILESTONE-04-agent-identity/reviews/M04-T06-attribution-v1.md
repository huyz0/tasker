---
task: M04-T06
version: v1
timestamp: 2026-08-15
decision: approved
---

# Review — M04-T06 Derive attribution from the principal

## Correctness

The verify line — a human session can no longer author a comment as an agent —
holds, and the defect it closes was worse than the task described. Two separate
paths trusted the request body:

1. `createComment` filed the comment under any `agentId` the caller named, after
   checking only that the agent existed and was in the same org. Any member
   could put words in any agent's mouth.
2. `assertCommentAuthor` compared the *stored* `agentId` against one taken from
   the **request**, so any member could also edit or delete any agent-authored
   comment by naming that agent. The second is the sharper of the two and was
   not in the task's description — it was found by reading the function the task
   pointed at.

Both are now decided against the principal. Thirteen new tests in
`comments/attribution.test.ts` cover authorship for both principal kinds in both
directions: a human cannot author, edit or delete as an agent; an agent cannot
edit a human's comment or another agent's.

```yaml
- file: apps/backend/src/modules/tasks/task_notes.handler.ts
  line: 0
  severity: medium
  comment: >
    createTaskNote is now agent-only, which is a behaviour removal, not just a
    field removal. task_notes.agent_id is NOT NULL, so a note has no
    representable human author — before this, a human named an agent and the
    note was filed under a worker that never wrote it. Making the column
    nullable to keep human notes working would have been the alternative, and
    it was rejected: a "task note" is the agent's own working record, and
    comments already exist for humans. The cost is that `tasker tasks note-add`
    cannot be used by a logged-in human at all until M04-T09 ships --token.
    That is the milestone's stated breaking change arriving on schedule, not a
    surprise, but it is a real gap between T06 and T09.
```

## Test coverage

527 backend tests pass. Six pre-existing tests failed against the new contract
and were rewritten rather than deleted or coerced green:

- Three in `task_notes.test.ts` now build an agent principal, the shape the
  interceptor produces from a token, instead of a human context.
- Three in `comments.test.ts` collapsed into one. They asserted that a human
  could author as a named agent, and that the server would then validate that
  agent's existence and org. There is nothing left to validate — the agent id
  comes from a token the server issued and checked on the way in — so the
  replacement asserts the new contract: an `agentId` in the request is ignored
  and the human authors as themselves.

```yaml
- file: apps/backend/src/modules/comments/comments.handler.ts
  line: 0
  severity: low
  comment: >
    An old client still sending userId/agentId is not rejected — Zod strips
    unlisted keys, so the request succeeds and is attributed correctly. That is
    the deliberate choice over erroring on unknown fields: during the window
    where a deployed GUI or CLI has not been rebuilt, silently-correct
    attribution beats a hard failure, and the field is gone from the contract so
    no new client can learn to send it.
```

## Architectural drift

`agentId` is reserved rather than reused in the `.proto` — `reserved 3, 4;`
plus the field names — per `api-standard.md` §2, so an old client's field 4
cannot land in a future field. Both contract files were edited in parallel, as
this repository requires.

One deliberate departure from the task's wording. It says to delete the
`agentId` field from "comment, note and task request models". `assignTask` also
carries an `agentId`, and it was **kept**: that field is the *assignee*, not the
author. Removing it would delete the ability to assign work to an agent, which
is the product's core function rather than an attribution leak. Attribution is
about who wrote a thing; assignment is about who should do it, and a human
choosing which agent to task is exactly right.

```yaml
- file: apps/gui/moon.yml
  line: 0
  severity: high
  comment: >
    `moon check --all` passed while `moon run gui:build --force` failed with
    three type errors. The GUI tasks did not declare the generated contract as
    an input, so a contract change left their caches valid and the gate reported
    success on stale output — the same defect M03 found on
    shared-contract:compile, in four more places. CI would have caught it on a
    cold cache, but the pre-commit hook would not, which is the point of having
    it. All four gui tasks now list /packages/shared-contract/gen/**/*, and the
    fix was verified by touching the generated file and confirming the build
    re-runs instead of reporting cached.
```

## Security

This task exists to close an authorization hole, and the hole is closed on both
the create and the edit/delete paths. An agent's authorization is now its
token's org binding, checked on every call: an agent cannot comment on another
organization's task even though it is authenticated.

The agent-existence and agent-org lookups that `createComment` and
`createTaskNote` used to perform are gone. That is a reduction in code and in
queries, and it is safe for a structural reason: the agent id no longer comes
from the caller, so there is nothing left to validate about it.

Scope enforcement — a `comments:write` token being required to comment — is
**not** here. It is M04-T07, and until it lands any valid token can write a
comment within its own organization.

## Verdict

**Approved.** One high (the moon input gap, fixed and verified by injection),
one medium (task notes becoming agent-only, recorded with its cost), one low.
