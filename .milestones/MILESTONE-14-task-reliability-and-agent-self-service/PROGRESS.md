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

## M14-T05 — Add unassigned/me filters to listTasks

- **Status**: done
- **Date**: 2026-08-17
- **Changed**: `packages/shared-contract/main.tsp`,
  `packages/shared-contract/tasker/health/v1/health.proto`,
  `packages/shared-contract/gen/ts/**` (regenerated, not hand-edited),
  `apps/backend/src/modules/tasks/tasks.handler.ts`,
  `apps/backend/src/modules/tasks/tasks.test.ts`
- **Verified**: `bun test src/modules/tasks/tasks.test.ts` — 21 pass, 0 fail.
  Full `bun test` in `apps/backend` — 1278 pass / 12 skip / 0 fail. `moon
  run gui:build` (tsc -b && vite build) still succeeds against the
  regenerated contract with no type errors. New test covers: `unassigned`
  returns exactly the task with no assignee; `me` on an agent context
  resolves via the agent's own token (there is nowhere in the request to
  even name a different agent) and returns only that agent's task, not one
  assigned to a different agent; `me` on a human context resolves against
  `userId`, correctly returning nothing when that human has no
  assignments; no filter returns all three tasks, unchanged from before
  this field existed; an unrecognized value is `InvalidArgument`.
- **Notes**: Added `assigneeFilter` (field 5) to `ListTasksRequest` in both
  the TypeSpec source and the hand-maintained `.proto` buf actually
  generates from (still two files kept in sync by hand - a standing gap
  named since M02/M04, not this task's to close), then ran `moon run
  shared-contract:compile` to regenerate the TS bindings rather than
  hand-editing generated code. Implemented as correlated `EXISTS`/`NOT
  EXISTS` subqueries against `taskAssignments` (`sql` template
  interpolating drizzle table/column objects for correct per-dialect
  quoting - confirmed the interpolation renders properly-quoted
  identifiers with a throwaway script before trusting it in the handler),
  not a `LEFT JOIN ... IS NULL`, specifically so a task with two assignees
  is never returned twice by the `unassigned`-is-false case and so
  `page.totalCount` (computed by `executePaginatedQuery` from the same
  `scope` condition) stays correct without a `DISTINCT`. `me` resolves the
  principal's own id server-side from `requirePrincipal` - the request has
  no field for a caller-supplied id at all, so there is no way to ask for
  another principal's queue by naming it, unlike a hypothetical
  `assigneeId` field would have allowed.
- **Next**: M14-T06

## M14-T06 — Add claimTask, the atomic agent self-claim primitive

- **Status**: done
- **Date**: 2026-08-17
- **Changed**: `packages/shared-contract/main.tsp`,
  `packages/shared-contract/tasker/health/v1/health.proto`,
  `packages/shared-contract/gen/ts/**` and `apps/cli/gen/**` (regenerated),
  `apps/backend/src/modules/tasks/tasks.handler.ts`,
  `apps/backend/src/lib/scopes.ts`,
  `apps/backend/src/lib/agent-scope-sweep.test.ts`,
  `apps/backend/src/lib/viewer-denial.test.ts`,
  `apps/backend/src/modules/tasks/tasks.test.ts`,
  `apps/gui/scripts/rpc-coverage.mjs`
- **Verified**: `bun test src/modules/tasks/tasks.test.ts` — 27 pass, 0
  fail, including a 5-way concurrent claim race (`Promise.allSettled`,
  exactly 1 fulfilled / 4 `FailedPrecondition`), re-run 5 times with no
  flake (unlike M14-T02's race test, this one doesn't depend on JS-level
  interleaving at all - the guarantee is the single SQL statement, so it
  cannot flake by construction). Full `bun test` in `apps/backend` — 1281
  pass / 12 skip / 0 fail, including both deny-by-default sweeps
  (`agent-scope-sweep.test.ts`, `viewer-denial.test.ts`), which failed
  immediately on the new unclassified RPC exactly as designed - see notes.
  `moon run gui:rpc-coverage` and `moon check --all` (27 tasks) both clean.
- **Notes**: The atomic primitive is one statement, not a transaction:
  `INSERT INTO task_assignments (...) SELECT ... WHERE NOT EXISTS (SELECT 1
  FROM task_assignments WHERE task_id = ?)` (MySQL needs `FROM DUAL` for
  the literal-only `SELECT`; SQLite must not have it). Confirmed the
  `NOT EXISTS` pattern renders correctly-quoted identifiers with a
  throwaway script before trusting it, same discipline as M14-T05. Chose
  this over reusing `updateTaskStatus`'s CAS-on-a-column shape because
  assignment is a separate table with a legitimately multi-row model (an
  agent plus a human reviewer can both be "assigned"), so the invariant
  being protected is "zero existing rows for this task", not "one column
  still equals what I read" - a job-queue claim, not an optimistic-lock
  update.

  Reused the existing `tasks:write` scope rather than adding a ninth to
  ADR-0008's closed eight-scope vocabulary — recorded in `lib/scopes.ts`'s
  own comment: `claimTask` can only ever assign the *caller*, and only onto
  an unassigned task, which is a strictly smaller grant than `assignTask`'s
  "name any assignee" (still deliberately closed to agents, per that same
  file's existing note - an agent that could reassign work to itself could
  also take itself off work it doesn't want, or hand a task to a different
  agent, neither of which `claimTask` permits). This is the one live
  question worth flagging for a future session: `AGENT_SCOPES` is described
  as closed in ADR-0008's own text, and this reuses an existing scope
  rather than opening that question, but if a later milestone finds itself
  reusing `tasks:write` for something *not* self-limited the way `claimTask`
  is, that is the moment to revisit the eighth-vs-ninth-scope decision for
  real rather than by precedent.

  Both deny-by-default sweeps (`agent-scope-sweep.test.ts`,
  `viewer-denial.test.ts`) failed the moment `claimTask` existed, unprompted
  - exactly the mechanism M03/M04 built them for. Fixed by: adding
  `claimTask: 'tasks:write'` to `AGENT_RPC_SCOPES` (with a comment
  explaining why this grant is safe where assignTask's is not), a sample
  request in each sweep's fixture map, and confirmed the "checks the
  specific scope it names" test still passes claimTask a principal missing
  `tasks:write` - which hits the scope check before ever reaching the SQL
  claim, so it can't be affected by the shared fixture task's assignment
  state regardless of test order. `gui:rpc-coverage` failed too;
  `claimTask` is excepted with a reason (agent-only primitive, distinct
  from the human assignee picker's `assignTask`) rather than wired into the
  GUI, since no task in this milestone scopes a GUI self-assign button -
  the exception says explicitly to wire it there and remove the exception
  if one is added later.
- **Next**: M14-T07

## M14-T07 — Add idempotency-key support to createTask/claimTask

- **Status**: done
- **Date**: 2026-08-17
- **Changed**: `packages/shared-contract/main.tsp`,
  `packages/shared-contract/tasker/health/v1/health.proto`,
  `packages/shared-contract/gen/ts/**` and `apps/cli/gen/**` (regenerated),
  `apps/backend/src/db/schema.sqlite.ts`, `apps/backend/src/db/schema.mysql.ts`,
  `apps/backend/drizzle-sqlite/0035_idempotency_keys.sql` +
  `apps/backend/drizzle-mysql/0022_idempotency_keys.sql` (hand-written, both
  registered in their `meta/_journal.json`), `apps/backend/src/lib/idempotency.ts`
  (new), `apps/backend/src/modules/tasks/tasks.handler.ts`,
  `apps/backend/src/modules/tasks/tasks.test.ts`
- **Verified**: `bun test src/modules/tasks/tasks.test.ts` — 25 pass, 0 fail;
  `lib/idempotency.ts` at 100% funcs/lines. Full `bun test` in
  `apps/backend` — 1283 pass / 12 skip / 0 fail. `moon check --all` (27
  tasks) clean, confirming the hand-written migration applies against a
  fresh SQLite DB through the normal migrator path (not just eyeballed
  SQL). New tests: `createTask` called twice with the same key creates
  exactly one row and both calls return the same id/displayId; a different
  key creates a genuinely new task; the *same* key string from a
  *different* principal does not collide (each caller has its own
  namespace); no key at all behaves exactly as before this field existed.
  `claimTask` called twice with the same key returns success both times
  with exactly one assignment row (without idempotency the second call
  would be `FailedPrecondition`, which is the actual bug being closed); a
  genuinely new claim attempt on an already-claimed task - no key, or a
  *different* key - still fails normally, proving idempotency replays one
  specific prior call rather than making claiming reentrant.
- **Notes**: **What this closes**: the realistic failure mode named in the
  original review - "no idempotency keys anywhere... a retried createTask
  call silently duplicates" - for a client that times out, gets control
  back, and retries sequentially with the same key. That case is fully
  closed for both `createTask` and `claimTask`. **What this deliberately
  does not close**, recorded in `lib/idempotency.ts`'s own docstring: two
  calls carrying the same key that are genuinely in flight at the same
  instant can both read "no stored response yet" before either writes one,
  both run the mutation, and only one wins the final cache insert - the
  loser still returns its own freshly computed result (never an error or a
  hang) but a second row really was created for `createTask`. Closing that
  fully needs a reservation row written *before* the mutation runs, with a
  caller-visible "still processing" state for whoever loses the
  reservation race - a materially bigger feature than "add a key column",
  and left for a future session per the milestone's own Risks section
  ("smallest correct primitive, not a new... subsystem"). Sequencing
  matters for correctness: `withIdempotency` wraps `createTask`'s entire
  body *including* the task-number claim, so a replay never touches the
  project's counter a second time either - wrapping only the final insert
  would have left the counter-increment unprotected.

  Schema: `idempotency_keys` keyed on `(principal_key, method,
  idempotency_key)` via a unique index, not a plain composite primary key,
  matching this codebase's existing convention (e.g. `api_tokens.token_hash`).
  `principal_key` is `"user:<id>"` / `"agent:<id>"` rather than two nullable
  FK columns, since a single row must reference either kind and a `references()`
  can only ever point at one table. No TTL/cleanup sweep exists yet - flagged
  in both the schema comment and here, since `retentionSweep.ts` already
  owns scheduled cleanup and is the natural place for it once one is
  needed. The hand-written migrations follow the exact `CREATE TABLE` +
  `CREATE UNIQUE INDEX` shape `0023_api_tokens.sql`/`0010_api_tokens.sql`
  already established for each dialect, including manually appending both
  `meta/_journal.json` files - required for the migrator to pick the file
  up at all, not optional bookkeeping, and easy to miss (the M13 handoff
  note about drizzle-sqlite snapshot drift is why these were hand-written
  rather than generated).
- **Next**: M14-T08

## M14-T08 — Wire linkTaskArtifact/unlinkTaskArtifact into the CLI

- **Status**: done
- **Date**: 2026-08-17
- **Changed**: `apps/cli/cmd/artifacts.go`, `apps/cli/cmd/artifacts_test.go`
- **Verified**: `go test ./...` in `apps/cli` — all pass, including 3 new
  tests (`TestArtifactsLinkTaskCommandSendsTaskAndArtifactIds`,
  `TestArtifactsLinkTaskCommandRequiresBothFlags`,
  `TestArtifactsUnlinkTaskCommandSendsTaskAndArtifactIds`). `moon check
  --all` (27 tasks) clean, including `cli:coverage` at 97.9%.
- **Notes**: Landed as `tasker artifacts link-task`/`unlink-task` rather
  than `tasker task link-artifact` (the milestone's original placeholder
  path) - the RPCs live on `ArtifactService`, and `artifacts.go` already
  had the `ArtifactServiceClient` wiring and the exact command shape to
  extend, so putting the new subcommands there (alongside `create`,
  `delete`, `restore`, `purge`) matched the existing structure better than
  starting a new file under `tasks.go` for two commands. `--task`/`--artifact`
  are both required flags, checked client-side before the RPC call, same
  pattern as `artifacts create`'s `--folder`/`--name` check.

  Caught my own test bug via a real gotcha this codebase had already
  named: `TestArtifactsLinkTaskCommandRequiresBothFlags` initially failed
  because Cobra/pflag flag values persist across `Execute()` calls on the
  same command instance within a test binary - the prior test's
  `--artifact art_1` was still set when this one only passed `--task`.
  `teams_test.go` had already hit and fixed the identical issue
  (`teamsCreateCmd.Flags().Set("name", "")`); followed the same fix here
  (`artifactsLinkTaskCmd.Flags().Set("artifact", "")`) rather than
  reordering tests to dodge it, which would only have hidden the same trap
  for the next person who adds a test.
- **Next**: M14-T09

## M14-T09 — De-duplicate Task Type CRUD across Projects and Task Types

- **Status**: done
- **Date**: 2026-08-17
- **Changed**: `apps/gui/src/features/Projects/index.tsx`,
  `apps/gui/src/features/Projects/index.test.tsx`,
  `apps/gui/src/features/TaskTypes/index.tsx`,
  `apps/gui/src/features/TaskTypes/index.test.tsx`
- **Verified**: `bun run test -- src/features/Projects src/features/TaskTypes`
  — 57 pass, 0 fail. Full `bun run test` — 59 files, 758 tests, 0 fail.
  `bun run test:coverage` — 95.31% branches (threshold 95%). `moon run
  gui:build` (tsc -b) and `moon check --all` (27 tasks) both clean.
- **Notes**: Removed the create+rename mini-editor from the Projects
  screen entirely - it duplicated `updateTaskType`/`createTaskType` with no
  visibility into the statuses or transitions a rename affects. Replaced
  with a read-only glance list (task type name chips, no controls) and a
  `Link to="/task-types"` ("Manage task types →"), including in the
  empty-state action. Added the missing half to the Task Types screen
  instead: a `Rename` control next to the selected type's heading, using
  the same inline edit/save/cancel shape the removed Projects editor used,
  now sitting directly above the Statuses/Transitions sections it renames
  alongside. `updateTaskType` itself was already exercised (M14-T04
  backend coverage); this is the GUI's first test of it.

  Test churn was larger than the feature change: removed 6 Projects tests
  that exercised the deleted create/rename UI (`lists and creates task
  types...`, `shows an error message when task type creation fails`, the
  task-type halves of `does not submit blank...`/`shows pending
  labels...`/`toggles the new-template and new-task-type forms...`, and
  all 3 rename tests), added 1 replacement (read-only list + link) and 4
  rename tests on the Task Types side (`renames the selected task type`,
  cancel, error, and a regression guard for the shape of bug this kind of
  state usually produces - `closing and reopening a different type does
  not leave the rename form open`).

  Shrinking Projects/index.tsx tripped the workspace's global 95% branch
  coverage gate (dropped to 94.88%) purely as an artifact of the file
  getting smaller - the specific lines flagged were **pre-existing**
  untested branches unrelated to this task (template/project rename's
  blank-submit guard and pending-label ternary; two `ListState` retry
  callbacks in Projects; three error-message branches and one retry
  callback in TaskTypes that had never been exercised). Closed all of them
  rather than treating the gate as noise: 9 new tests total across both
  files covering retry-after-failure for every `ListState` in both
  screens, blank-submit guards, and pending-label states for project and
  template rename, plus the three previously-untested TaskTypes error
  paths (failed transition add, failed transition removal, failed
  root-type change). None of this was in T09's original scope - it
  surfaced only because the gate is real and ran.
- **Next**: M14 review pass

## Review pass — M14 closed, 9/9 tasks, 8/8 exit criteria met

- **Status**: done
- **Date**: 2026-08-17
- **Verified**: Added one thing the task-level checks didn't cover: a real
  MySQL integration test for `claimTask`'s dialect-specific `FROM DUAL`
  branch (`tasks.mysql.test.ts`, gated behind `TASKER_MYSQL_INTEGRATION=1`,
  run against a live `docker compose` MySQL container this session, not
  skipped) — 8 concurrent agent claimants on one task, exactly 1 wins. Also
  confirmed the hand-written `idempotency_keys` MySQL migration
  (`0022_idempotency_keys.sql`) applies cleanly against that same live
  container and produces the expected schema and unique index
  (`DESCRIBE`/`SHOW INDEX`, not just eyeballed SQL) — the sqlite-only
  default suite would never have caught a MySQL-specific syntax error in
  either the migration or `claimTask`'s `FROM DUAL` variant. Final `moon
  check --all` — 27 tasks, clean. Backend: 1283 pass / 13 skip / 0 fail.
  GUI: 59 files / 758 tests, 95.31% branch coverage. CLI: all pass, 97.9%
  statement coverage.
- **What's true now that wasn't at the start**: clearing a task's
  description persists; two concurrent status changes never both "win";
  archiving a project with live tasks no longer stalls the admin cleanup
  workflow; `updateTask`, `getTask`, `updateTaskType`,
  `deleteTaskStatusTransition`, `reorderTaskStatuses`, `unassignTask`, and
  `assignTask`'s cross-org-agent branch all have real test coverage where
  before none did; an agent with a `tasks:write`-scoped token can list
  unassigned work and atomically claim exactly one task, racing agents
  included; `createTask`/`claimTask` are retry-safe against the realistic
  timeout-then-retry case; the CLI can link/unlink artifacts to tasks; and
  task-type CRUD lives in one GUI surface instead of two disagreeing ones.
- **What's still open, named rather than implied closed**: two genuinely
  concurrent calls carrying the same idempotency key are not fully
  deduplicated (M14-T07's documented scope limit — the realistic
  sequential-retry case is closed, the race-condition case needs a
  reservation-before-mutation redesign); a task dependency/subtask model
  and bulk task creation were scoped out to **M15** from the start (see
  MILESTONE.md §4 Out of Scope); a push/webhook/SSE surface for agents
  beyond polling remains M08's business, now with an explicit note that
  M08 should consider agent-token access to that connection, not just
  browser sessions; explicit task→repository/branch assignment stays
  regex-inferred, unowned by any scheduled milestone; and the
  `idempotency_keys` table has no TTL/cleanup sweep yet, flagged twice
  (schema comment and T07's own entry) for whoever next touches
  `retentionSweep.ts`.
- **One process note for a future session**: this milestone's plan
  (M14-T03's exit criterion, specifically) was rewritten mid-delivery
  after the actual root cause turned out to differ from the original
  one-line guess ("archiving with soft-deleted tasks" vs. the real bug,
  "archiving blocks cleanup of tasks that are still live") — confirmed by
  reproducing the failure by hand before writing the fix, not by trusting
  the milestone doc's own wording. Worth remembering next time a
  milestone is planned from a prior review's summary rather than from
  fresh code-reading: verify the mechanism before fixing it.
- **Not done this session, on record for whoever merges**: this branch
  (`feature/m14-task-reliability-and-agent-self-service`) is not merged to
  `main` or pushed to origin — left for explicit user action, the same
  convention M10 and M13 used.
