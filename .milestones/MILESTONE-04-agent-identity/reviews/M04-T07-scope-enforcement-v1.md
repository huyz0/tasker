---
task: M04-T07
version: v1
timestamp: 2026-08-15
decision: approved
---

# Review — M04-T07 Enforce scopes per RPC

## Correctness

The verify line — a read-scoped token cannot create a task — passes, and the
error names the missing scope (`this token lacks the tasks:write scope`) rather
than a bare denial, which is the difference between an agent that can correct
itself and one that retries forever.

Thirty endpoints moved from `requireUser` (agents refused outright) to
`authorizePrincipal` with a named scope. One helper decides both principal
kinds, so the human path is unchanged — a member still writes, and a viewer is
still refused by `assertOrgWriter`, which is asserted directly so ADR-0006 does
not quietly lapse.

```yaml
- file: apps/backend/src/lib/scopes.ts
  line: 0
  severity: high
  comment: >
    AGENT_RPC_SCOPES is keyed by handler factory, and five methods were filed
    under `tasks` when they live in `taskManagement` — createTask, listTasks,
    listTaskReviewers, updateTask, updateTaskStatus. The effect was the worst
    available combination: the methods were migrated to authorizePrincipal, so
    they accepted tokens, while the sweep saw them as unmapped and therefore
    expected them to refuse. Caught by the sweep on its first real run, which
    is the entire argument for having written it. Fixed, and a comment on the
    map now says the key is the handler, not the subject.
```

## Test coverage

Two new suites, 13 tests. `scope-enforcement.test.ts` covers the verify line and
its neighbours: read-scoped cannot write, write-scoped can, read-scoped can
still read, a token with no scopes can do nothing, a correctly-scoped token
still cannot cross organizations, humans are unaffected, and a viewer is still
refused.

`agent-scope-sweep.test.ts` is the structural gate — the sibling of M03's viewer
sweep. It asserts three things across every method of every handler:
completeness (nothing unclassified), that unmapped methods refuse a token
holding *every* scope, and that each mapped method refuses a token holding every
scope *except* the one it names.

Both were proven by injection, and the first attempt is worth recording:

```yaml
- file: apps/backend/src/lib/agent-scope-sweep.test.ts
  line: 0
  severity: medium
  comment: >
    The first injection — opening deleteTask to agents without mapping it —
    appeared to prove the sweep could not catch an unmapped exposure. It had
    actually not applied: the edit matched on assertOrgWriter and deleteTask
    uses assertOrgAdmin, so the file was unchanged and the green run meant
    nothing. Re-run against the real edit, the sweep failed naming
    taskManagement.deleteTask. The lesson is the one this milestone keeps
    relearning: verify the injection landed before believing what the gate says
    about it, or a no-op reads as a passing test.
```

The third assertion (scope specificity) passes vacuously for any endpoint that
is mapped but still refuses agents for an unrelated reason. That is not a
present gap — every mapped endpoint is migrated — but it would silently become
one if a future entry were added to the map without migrating its handler. The
completeness test does not catch that direction.

## Architectural drift

Matches ADR-0008: one scope per RPC, closed vocabulary, deny-by-default for
anything unlisted, and no scope granting organization administration. `orgs` and
`auth` are asserted unreachable by a token holding all eight scopes.

Two deliberate absences, both recorded in the map itself rather than left to be
inferred:

- **Everything destructive** — archive, restore, purge, `deleteTask`. An agent
  that can purge a project escapes every other limit here.
- **`assignTask`** — a token that can reassign work to itself can help itself to
  any task in its organization. Deciding who picks up work is orchestration, and
  M10 owns delegation.

```yaml
- file: apps/backend/src/modules/tasks/tasks.handler.ts
  line: 0
  severity: low
  comment: >
    createTask now stamps createdBy as null for an agent principal, because the
    column references users.id and an agent is not a user. The task's author is
    recoverable — it is the token's agent — but not from this row, so "which
    agent created this task" is currently unanswerable in the database. M08 owns
    audit persistence and is the right place to fix it; noted here so it is not
    mistaken for an oversight.
```

## Security

The change opens 30 endpoints to a principal type that previously could not
reach any of them, so the risk is real and the sweep is what bounds it. An agent
is limited on three independent axes: its token's organization (checked every
call), the scopes on that token, and the map deciding which RPCs accept tokens
at all. Removing any one of the three does not silently widen the other two.

Worth stating plainly: scopes apply only to agents. A human's authority is still
their organization role, and no human gains or loses anything here. Giving
people a second parallel permission system is M10's decision, not a side effect
of adding tokens.

## Verdict

**Approved.** One high (the mis-keyed map, caught by the gate it shipped
alongside), one medium (an injection that silently did not apply), one low
(agent-created tasks have no recoverable author until M08).
