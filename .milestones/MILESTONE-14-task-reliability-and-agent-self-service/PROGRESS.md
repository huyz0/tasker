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
