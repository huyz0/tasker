# M33 — Progress Journal

## M33-T01 — Contract and schema

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `.specs/adr/ADR-0027-agents-release-only-their-own-claims.md`
  (new); `packages/shared-contract/{main.tsp,tasker/health/v1/health.proto}`
  (`ClaimNextTask`, `ReleaseTask`, `ListMyTasks`, `GetIdentityResponse.agent`,
  `AgentIdentity`) and generated TS/Go;
  `drizzle-sqlite/0051_task_assignment_source.sql`,
  `drizzle-mysql/0038_task_assignment_source.sql`, journals,
  `db/schema.{sqlite,mysql}.ts`, embedded migrations;
  `modules/tasks/tasks.handler.ts` (ClaimTask writes `source='claim'`);
  `db/taskAssignmentSource.migration.test.ts` (new); `tasks.test.ts`
- **Verified**: `bun test` 1863+ pass; the backfill test stops the shipped
  chain before 0051, plants a claim, a human assignment and a holder whose
  only `claimed` row names someone else, and checks only the first becomes
  `claim`. GUI typecheck clean against the regenerated TS; knip clean.
- **Notes**: ADR-0027 records why release is limited to the caller's own
  claims and why that needs a column, not an inference from the best-effort
  activity log. The backfill can only under-count claims. Codegen used the
  local plugin template from M32-T06 (buf.build remote plugins unreachable).
- **Next**: M33-T02

## M33-T02 — ClaimNextTask

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/backend/src/modules/tasks/tasks.handler.ts`,
  `workQueue.test.ts` (new), `lib/scopes.ts`, `lib/agent-scope-sweep.test.ts`
- **Verified**: `bun test src/modules/tasks src/lib/agent-scope-sweep.test.ts`
  — green; five new tests, all failing first.
- **Notes**: ClaimTask's atomic insert and its post-claim steps are now two
  closures, `insertClaim` and `completeClaim`, shared by both RPCs — the claim
  semantics, activity row, event and handoff-note surfacing stay in one place.
  ClaimNextTask reads the 20 oldest open, unassigned candidates (terminal
  excluded via `terminalStatusSql`, optional type filter), tries them in a
  shuffled order so concurrent agents spread across the window instead of all
  hitting the head, and re-reads up to three times. Nothing to claim is an
  empty response; losing every race while work exists is `Aborted` — the
  retryable code, and exit 5 from the CLI — because "no work" would be false.
  Five concurrent claimers on five tasks get five distinct tasks.
- **Next**: M33-T03

## M33-T03 — ReleaseTask (ADR-0027)

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/backend/src/modules/tasks/{tasks,task_notes}.handler.ts`,
  `workQueue.test.ts`, `lib/scopes.ts`, `lib/agent-scope-sweep.test.ts`
- **Verified**: `bun test src/modules/tasks src/lib/agent-scope-sweep.test.ts`
  — 133 pass; six new tests, all failing first.
- **Notes**: Release removes the caller's own `task_assignments` row only when
  its `source` is `claim`; a person's assignment is `PermissionDenied` ("ask
  them to unassign it"), and a task the caller does not hold is
  `FailedPrecondition`. The delete is by row id, so a concurrent unassign or
  re-claim cannot make it remove someone else's assignment. With a handoff
  note, `comments:write` is checked *before* anything changes (a refusal must
  not leave the task released with no note), the note is written through
  CreateTaskNote's own path — now `recordTaskNote`, shared — and the next
  claimant receives it via `latestHandoffNote`. People may release their own
  claims too, but not with a handoff note (notes are agent-authored since
  M04). Publishes `domain.task.released`; the GUI's `task` entity mapping
  already invalidates on it.
- **Next**: M33-T04
