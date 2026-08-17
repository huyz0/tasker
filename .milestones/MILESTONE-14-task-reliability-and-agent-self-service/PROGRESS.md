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
