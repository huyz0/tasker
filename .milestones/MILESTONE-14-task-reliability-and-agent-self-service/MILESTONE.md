---
id: M14
title: Task Reliability & Agent Self-Service
status: todo
goal: Task mutations are correct under concurrent and retried writes, and an agent can discover, claim and complete work through the API/CLI with no human broker in the loop.
depends_on: [M04, M05]
surfaces: [backend, gui, cli, contract]
exit_criteria_met: false
started_at: null
completed_at: null
---

# M14 — Task Reliability & Agent Self-Service

## 1. Goal

A task edit never silently discards a field, two writers never race a status
change into an inconsistent state, and archiving a project with live tasks
never deadlocks. On top of that corrected foundation, an agent holding a
scoped token can find unclaimed work, claim exactly one task atomically, and
retry any create safely — without a human assigning it first. This is the
condition named as the project's stated main goal ("for AI agents to use")
and, on inspection, not yet met: `assignTask` requires a human session, there
is no atomic claim primitive, and no mutating task RPC accepts an idempotency
key.

## 2. Why Now

This milestone was scoped from a deep review of task type, task state
management and task editing (2026-08-17) covering UI, UX, API, implementation
and test depth, followed by a dedicated pass on the agent-facing surface. Two
things came out of it that no existing milestone owns:

1. **Three live defects** in the task edit/status/archive paths, found by
   reading `tasks.handler.ts` and `projects.handler.ts` against their own
   tests rather than by report — none is caught by the current suite, which
   is itself T04 below.
2. **The product's own stated purpose is unmet.** ADR-0008 built a genuine
   agent-identity system (scoped tokens, `authorizePrincipal`), but the
   write paths an autonomous loop actually needs — claim work, retry safely —
   were never extended to accept an agent principal. M10 closed the human
   RBAC story; this closes the agent one, which is the one the product is
   named for.

Both halves live in the same handler and the same review, so they ship as one
milestone rather than being split across the human-facing and agent-facing
backlogs.

## 3. Exit Criteria

- [ ] Clearing a task's description via `updateTask` persists an empty
      description — verified by a test that asserts the read-back value, not
      just a 2xx response.
- [ ] Two concurrent `updateTaskStatus` calls on the same task never both
      succeed against a stale precondition; the loser gets a typed error, not
      a silently overwritten status.
- [ ] Archiving a project whose tasks are already soft-deleted completes
      without deadlocking or hanging.
- [ ] An agent token with the right scope can list tasks filtered to
      "unassigned" and claim one atomically; a second agent racing the same
      claim gets a typed failure, not a second assignment.
- [ ] `createTask` and `claimTask` accept an idempotency key; replaying the
      same key returns the original result rather than creating a duplicate.
- [ ] `tasker task link-artifact` exists in the CLI and round-trips against a
      running backend.
- [ ] Task type status/transition editing lives in exactly one GUI surface;
      the other no longer offers a second, incomplete copy of the same CRUD.
- [ ] `moon check --all` is clean and every new/changed behaviour above is
      covered by a test that fails without the fix (verified by reverting the
      fix locally and observing the test fail, per each task's own note).

## 4. Scope

**In Scope**: the three bug fixes named above; test coverage for the
handler paths the original review found untested (`updateTask`, `getTask`,
`updateTaskType`, the `assignTask` cross-org-agent branch); an agent-claim
RPC and its authorization/scope; an idempotency-key mechanism scoped to task
creation and claiming; CLI wiring for `linkTaskArtifact`; de-duplicating the
Task Type CRUD surface between the Projects and Task Types screens.

**Out of Scope, with owners**: a task dependency/subtask/blocking model —
genuinely new data model and UI, large enough to be its own milestone
(**M15**, to be planned after this one closes); bulk/batch task creation
(**M15**); a push/webhook/SSE surface for agents beyond polling — this is
already M08's business (`M08-T07`'s streaming endpoint), and M08 should
consider whether agent tokens, not just browser sessions, can hold that
connection when it is built; explicit task→repository/branch assignment
(PR association stays regex-inferred) — flagged for whichever milestone next
touches `repositories.handler.ts`, none currently scheduled.

## 5. Task Breakdown

- [ ] **M14-T01** — Fix the description-clear no-op: an explicit empty string
      in `UpdateTaskSchema` must be distinguished from an omitted field and
      persisted.
      - Files: `apps/backend/src/modules/tasks/tasks.handler.ts`,
        `apps/gui/src/features/Tasks/index.tsx`
      - Verify: `bun test src/modules/tasks/` — a new case asserts
        `getTask` returns `description: ""` after clearing it.

- [ ] **M14-T02** — Make `updateTaskStatus` safe under concurrent writers: a
      version/precondition check (or a transaction with row-level locking on
      the dialects that support it) so a losing writer gets a typed
      conflict instead of silently clobbering the winner's status.
      - Files: `apps/backend/src/modules/tasks/tasks.handler.ts`, schema/migration
        if a version column is needed (both dialects)
      - Verify: a test that fires two concurrent updates against the same row
        and asserts exactly one succeeds and the other returns a conflict.

- [ ] **M14-T03** — Fix the archive-project deadlock: `archiveProject` must
      complete when a project's tasks are already soft-deleted, and
      `getProjectOrgId`/`getTaskOrgId` must resolve consistently for
      already-deleted rows on the archive path.
      - Files: `apps/backend/src/modules/projects/projects.handler.ts`,
        `apps/backend/src/lib/authz.ts`
      - Verify: a test archives a project with soft-deleted tasks and asserts
        it returns within the test timeout with the project archived.

- [ ] **M14-T04** — Add the missing functional test coverage the original
      review found absent: `updateTask` (full field matrix, not just status),
      `getTask`, `updateTaskType`, and `assignTask`'s cross-org-agent branch.
      - Files: `apps/backend/src/modules/tasks/tasks.test.ts`
      - Verify: `bun test src/modules/tasks/` coverage on `tasks.handler.ts`
        rises above its prior 87.84% funcs / 85.61% lines, with the specific
        previously-uncovered ranges now exercised.

- [ ] **M14-T05** — Add an agent-claimable work query: an `unassigned` filter
      on `listTasks` (and, if useful, an `assignedToMe` filter resolved from
      the calling principal) so an agent can find work without paging
      everything and filtering client-side.
      - Files: `packages/shared-contract/main.tsp` + hand-maintained
        `.proto`, `apps/backend/src/modules/tasks/tasks.handler.ts`
      - Verify: a test asserts the filter returns only tasks with no
        assignee, against a fixture with a mix.

- [ ] **M14-T06** — Add `claimTask`: an agent-scoped RPC that atomically
      assigns the calling agent to a task only if it is currently unassigned
      (single conditional `UPDATE ... WHERE assignee IS NULL`, not
      read-then-write), authorized via `authorizePrincipal` with a new scope
      alongside the existing eight in ADR-0008's vocabulary.
      - Files: `main.tsp` + `.proto`, `tasks.handler.ts`, `lib/authz.ts`
        (`AGENT_RPC_SCOPES`), `.specs/adr/ADR-0008-agent-tokens.md` (scope
        addition recorded)
      - Verify: a test races two `claimTask` calls (same task, two agent
        principals) via `Promise.all` and asserts exactly one succeeds.

- [ ] **M14-T07** — Add idempotency-key support: `createTask` and `claimTask`
      accept an optional client-supplied key; replaying the same key for the
      same principal returns the original result instead of a second write.
      - Files: `main.tsp` + `.proto`, `tasks.handler.ts`, a small
        `idempotency_keys` table + migration (both dialects) keyed on
        `(principal, key)` with the stored response and a TTL
      - Verify: a test calls `createTask` twice with the same key and asserts
        one task exists and both calls return the same id.

- [ ] **M14-T08** — Wire `linkTaskArtifact`/`unlinkTaskArtifact` into the CLI;
      today the RPCs exist but only the GUI calls them.
      - Files: `apps/cli/cmd/task.go` (or wherever task subcommands live),
        `apps/cli/internal/backend/client.go`
      - Verify: `tasker task link-artifact --task <id> --artifact <id> --json`
        against a running backend returns the created link; `cli:test` green.

- [ ] **M14-T09** — De-duplicate Task Type CRUD: the Projects screen currently
      offers create+rename with no status/transition editor, while the Task
      Types screen offers the full editor with no rename. Pick the Task
      Types screen as canonical (it already owns the state machine), move
      rename there, and turn the Projects screen's control into a link to
      it rather than a second, partial editor.
      - Files: `apps/gui/src/features/Projects/index.tsx`,
        `apps/gui/src/features/TaskTypes/index.tsx`
      - Verify: `apps/gui` test suite for both features green; no UI path
        left where renaming a task type is possible without seeing its
        statuses, or vice versa.

## 6. Verification

```bash
moon run backend:test
moon run gui:test
moon run cli:test
moon check --all
```

## 7. Risks

T02 and T06/T07 both add write-path checks to the hottest handler in the
backend (`tasks.handler.ts`, already ~900 lines) — do them as the smallest
correct primitive (a single conditional `UPDATE`, not a new locking
subsystem) so they compose rather than fight each other; T06's claim and
T02's status-conflict check should share one precondition mechanism if
possible rather than inventing two. T07's idempotency table needs a TTL/
cleanup story or it grows unbounded — note the retention policy in the
migration comment rather than leaving it implicit. The CLI change (T08) and
GUI change (T09) are low-risk and independent of the backend tasks; they can
land in either order.
