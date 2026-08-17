# M14 Progress Journal

## M14-T01 — Fix description-clear no-op in updateTask

- **Status**: done
- **Date**: 2026-08-17
- **Changed**: `apps/backend/src/modules/tasks/tasks.handler.ts`,
  `apps/backend/src/modules/tasks/tasks.test.ts`
- **Verified**: `bun test src/modules/tasks/tasks.test.ts` — 16 pass, 0 fail
  (two new tests: `updateTask persists field changes, including clearing
  description to empty`, `getTask returns the full task including
  description, and denies non-members`). Reverting the schema change locally
  (`git stash` the handler edit only) makes the new "clearing description"
  assertion fail with `cleared.task.description` still equal to the
  pre-clear value, confirming the test catches the regression it targets.
- **Notes**: Root cause was `UpdateTaskSchema`'s Zod preprocess step
  (`v === "" ? undefined : v`) applied to `description`, which collapsed an
  explicit empty string into "field not provided" before `updateTask`'s
  `if (parsed.description !== undefined)` guard ever ran. The `title` field
  keeps the same preprocess deliberately (title is `min(1)`, so blank input
  should mean "unchanged", not "reject"); `description` has no such
  constraint and the wire (proto3 `optional string description = 3` in
  `packages/shared-contract/tasker/health/v1/health.proto`) already carries
  real presence information end to end, so the fix removes the preprocess
  for `description` only. `taskTypeId` keeps its preprocess — GUI never
  sends it as `""` (it's a select, not free text) and clearing a task's type
  is not a modeled operation, so left out of scope here. The GUI
  (`apps/gui/src/features/Tasks/index.tsx:775`) was already sending
  `description` unconditionally on every save, cleared or not — no client
  change was needed.
- **Next**: M14-T02

## M14-T02 — Fix updateTaskStatus concurrency race

- **Status**: done
- **Date**: 2026-08-17
- **Changed**: `apps/backend/src/modules/tasks/tasks.handler.ts`,
  `apps/backend/src/modules/tasks/tasks.test.ts`
- **Verified**: `bun test src/modules/tasks/` — 56 pass / 1 skip / 0 fail.
  New test `updateTaskStatus is safe under concurrent writers: exactly one
  racing change wins` fires two concurrent `updateTaskStatus` calls from the
  same starting status via `Promise.allSettled` and asserts exactly one
  fulfills and the other rejects with `Code.Aborted`. Reverting the CAS
  (restoring the old unconditional `db.update(...).where(eq(id, taskId))`)
  makes that test fail deterministically — checked by hand, not left as a
  claim.
- **Notes**: `updateTaskStatus` read the current status, validated the
  requested transition against it, then wrote unconditionally
  (`WHERE id = taskId`, no status precondition). Two callers racing the same
  task both read the same stale status, both validated successfully against
  it, and both wrote — whichever committed last won silently, and the
  loser's own response (a re-select after its own write) reported the
  *winner's* status back to it as if its own call had succeeded. Fixed with
  the smallest correct primitive named in the milestone's own Risks section:
  a single conditional `UPDATE ... WHERE id = ? AND status = ?` (the status
  just read), checking the driver's affected-row count
  (`.changes` on bun:sqlite, `result[0].affectedRows` on mysql2) and
  throwing `Code.Aborted` on zero. No new locking subsystem, no version
  column, no transaction — the existing read stays outside a transaction and
  the CAS on the write is sufficient because it is the *only* place a second
  writer's stale precondition could otherwise land unchecked. Confirmed the
  race is real on bun:sqlite for exactly this shape (plain awaited
  select-then-write, no transaction) via the same interleaving the
  pre-existing M03-T15 tests below already proved for `createTask`'s
  now-fixed counter claim — this is the same failure mode, one call site
  over.
- **Next**: M14-T03

## M14-T03 — Fix the archive-project dead end

- **Status**: done
- **Date**: 2026-08-17
- **Changed**: `apps/backend/src/modules/tasks/tasks.handler.ts`,
  `apps/backend/src/modules/projects/projects.test.ts`
- **Verified**: `bun test src/modules/projects/ src/modules/tasks/
  src/lib/authz.test.ts` — 101 pass / 1 skip / 0 fail. Full `bun test` at
  the repo root — 1274 pass / 12 skip / 0 fail. New test in
  `projects.test.ts`: archives a project with a live task, then asserts
  `deleteTask`, `purgeTask`, and `purgeProject` all still succeed
  afterward. Confirmed the failure by hand before the fix (a throwaway
  repro): `deleteTask` on a live task under an already-archived project
  threw `NotFound: Project not found`, and `purgeProject` separately threw
  `FailedPrecondition: project still has tasks...` — the two errors
  together are the dead end named in the milestone goal, since neither
  side of it could be resolved from the API.
- **Notes**: This was **not** a literal hang or DB-level deadlock —
  `archiveProject` is a single-row soft-delete with no cascade, so nothing
  ever blocks on a lock. The real defect: `archiveProject` never touches a
  project's tasks, so archiving a project that still has live tasks left
  those tasks stranded. `deleteTask` resolved its orgId via
  `getTaskOrgId(db, taskId)` with the default `includeDeleted=false`, which
  (correctly, per `authz.test.ts`'s existing pinned tests) propagates to
  the project lookup and excludes archived projects — so `deleteTask`
  reported "Project not found" for a perfectly live task the moment its
  parent project was archived. Meanwhile `purgeProject` requires zero
  remaining task rows (soft-deleted or not — it has to, or purging the
  project would orphan them), so there was no way to reach zero. Deliberately
  did **not** change `getTaskOrgId`'s own default behaviour or its
  `includeDeleted` coupling — that function's contract is exercised by
  named tests in `authz.test.ts` for the folder/artifact cases too, and
  changing it would have widened this fix into every read path that calls
  it. Instead, `deleteTask` alone now passes `includeDeleted: true`, which
  is exactly the operation an admin needs *after* archiving a project. As a
  side effect `deleteTask` is now idempotent on an already-deleted task
  (previously 404s), matching the idempotent-mutation convention already
  used elsewhere in this handler (`addTaskReviewer`, `assignTask`,
  `createTaskStatusTransition`); no existing test asserted the opposite.
  `purgeTask` already tolerated an archived project (it already passed
  `includeDeleted: true`, covered by an existing test) — it was solely
  `deleteTask` blocking the workflow.
- **Next**: M14-T04

## M14-T04 — Add missing test coverage (updateTaskType, transitions, reorder, assign/unassign)

- **Status**: done
- **Date**: 2026-08-17
- **Changed**: `apps/backend/src/modules/tasks/tasks.test.ts`
- **Verified**: `bun test src/modules/tasks/tasks.test.ts --coverage` —
  `tasks.handler.ts` rises from 87.84% funcs / 85.61% lines to **98.68%
  funcs / 98.64% lines**. 20 tests, all pass. Full `bun test` at the repo
  root — 1277 pass / 12 skip / 0 fail. Remaining uncovered lines are the
  mysql2-only branch of `createTask`'s counter claim (559, 563-569 -
  exercised only by the dialect-gated `tasks.mysql.test.ts`, correctly out
  of scope for the default sqlite suite) and one hard-to-trigger catch
  branch in `assignTask` (694, `assertCan` throwing something other than
  `PermissionDenied` for the assignee) - left uncovered and named here
  rather than contrived.
- **Notes**: `updateTask` and `getTask` were already covered by M14-T01;
  this task closed the rest of the review's list plus two more the
  coverage numbers surfaced once T01-T03 were in: `deleteTaskStatusTransition`
  and `reorderTaskStatuses` had *zero* coverage each, not just thin
  coverage - full handler bodies never once exercised. Added:
  `updateTaskType` (rename, reparent, self-parent rejection, cross-org
  parent rejection, not-found, outsider denial - field-level update
  confirmed by asserting a parentId-only update doesn't clobber a prior
  rename), `assignTask`'s cross-org-agent branch (an agent that exists but
  belongs to a different org, distinct from "agent not found"),
  `unassignTask` (idempotent removal, matched on the exact (agentId,
  userId) pair so it doesn't touch a different assignment sharing the same
  userId - caught my own test bug here first, see below),
  `deleteTaskStatusTransition` (idempotent delete, authorized against the
  type not the edge, not-found, outsider denial), and
  `reorderTaskStatuses` (full reorder, partial-list rejection, duplicate-id
  rejection, foreign-id rejection, not-found, outsider denial). Two of my
  own first-draft tests were themselves wrong and caught by running them:
  the unassign assertion counted a *different* assignment row that
  happened to share the same `userId` value (fixed by also filtering
  `isNull(agentId)`, matching the handler's own match condition), and the
  reorder not-found test sent `statusIds: []`, which trips the schema's
  own `min(1)` before the handler's NotFound check ever runs (fixed by
  sending a dummy non-empty array) - recorded because both are the kind of
  mistake that would have silently proven nothing if left unnoticed.
- **Next**: M14-T05
