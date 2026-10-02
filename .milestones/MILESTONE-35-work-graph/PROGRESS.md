# M35 — Progress Journal

## M35-T01 — ADR-0028; contract and schema

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `.specs/adr/ADR-0028-a-task-graph-of-blockers-parents-and-origins.md`,
  `packages/shared-contract/{main.tsp,tasker/health/v1/health.proto}` and
  generated code, `apps/backend/src/db/schema.{sqlite,mysql}.ts`, migrations
  `0052_work_graph` / mysql `0039_work_graph`,
  `src/db/workGraph.migration.test.ts`
- **Verified**: backend `bun test` 1887 pass; contract round-trip 900 pass;
  `go build ./...`.
- **Notes**: `Task` gains `priority` (0 none, 1 urgent … 4 low),
  `parentTaskId`, `blockedByOpenCount`; create/update/list/claim-next gain the
  matching fields; `AddTaskLink`/`RemoveTaskLink`/`ListTaskLinks` and
  `TaskRef`. `task_links` is one directed row per relation, unique per
  (task, linked, kind), indexed both ways. MySQL's unique key is 544 chars ×
  4 bytes, inside InnoDB's 3,072. `moon run shared-contract:compile` cannot run
  in this sandbox (buf's remote plugins are unreachable); generated with the
  local plugins, as in M33.
- **Next**: M35-T02

## M35-T02 — Priority

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/backend/src/modules/tasks/{tasks.handler.ts,taskGraph.ts}`
  (+ `workGraph.test.ts`), `apps/backend/src/db/query-builder.ts`
- **Verified**: backend `bun test` 1889 pass; the cross-page sort test failed
  first with a bun:sqlite binding error.
- **Notes**: Create/update/get/list carry `priority`; `ListTasks` filters it
  and sorts `priority:asc` urgent-first with "none" last, through a rank
  expression. That exposed a paginator bug no existing list could hit: the
  cursor decoder turned *every* number into a `Date`, so a numeric sort key
  could not page. It now converts only for date columns (`dataType ===
  "date"`), and the new `cursorFields` option names the row key a cursor reads
  when the sort key is not the visible value. Task responses now go through
  one `toWireTask`, which also replaces six copies of the `createdAt` ISO
  conversion. `ListMyTasks` sorts by priority too.
- **Next**: M35-T03

## M35-T03 — Links and parents

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/backend/src/modules/tasks/{taskGraph.ts,tasks.handler.ts}`
  (+ `workGraph.test.ts`), `lib/cascadePurge.ts`, `lib/scopes.ts`,
  `lib/{viewer-denial,agent-scope-sweep}.test.ts`
- **Verified**: backend `bun test` 1896 pass; knip, typecheck green.
- **Notes**: `AddTaskLink`/`RemoveTaskLink` (idempotent, `tasks:write`) and
  `ListTaskLinks` (`tasks:read`) - blockers, dependents, origin, discovered,
  parent, children, each as a `TaskRef` with a `terminal` flag. `CreateTask`
  takes `parentTaskId`, `blockedBy` and `discoveredFromTaskId`, all validated
  before the insert, so a bad blocker leaves no task behind (tested by count).
  `UpdateTask.parentTaskId` sets, or with "" clears. Refused: self links,
  other organizations, missing tasks, a blocking cycle (bounded BFS), a second
  origin, a parent in another project or below the task. Purging a task removes
  its links both ways and orphans its children; purging a project removes links
  that cross out of it. Agents may link (ADR-0028).
- **Next**: M35-T04

## M35-T04 — Ready work

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/backend/src/modules/tasks/{taskGraph.ts,tasks.handler.ts}`
  (+ `workGraph.test.ts`, `taskGraph.sql.test.ts`), `assignment.test.ts`,
  `.specs/adr/ADR-0028-*.md`, `packages/shared-contract/main.tsp` (comment)
- **Verified**: backend `bun test` 1902 pass; knip, typecheck green.
- **Notes**: `ClaimNextTask` takes only ready tasks (no unfinished, undeleted
  blocker), by priority rank then age, optionally by label. Its M33 shuffle
  now runs *within* each priority - shuffling the whole window would have let
  a claimer take a low task over a free urgent one. Consequently "oldest
  first" holds only approximately within a priority; the first test asserted
  strict age and failed on exactly that, so the ADR, the exit criterion and
  the test now say what is true. `ListTasks` gains `ready`, `labelId`,
  `parentTaskId`; every task response carries `blockedByOpenCount` (one
  grouped query per page - `assignment.test.ts`'s query bound +1, not per
  task). Finishing a task, or binning a live one, publishes
  `domain.task.unblocked` per dependent with no open blocker left. The first
  version of the predicate passed a drizzle alias into a raw template, which
  renders as the bare alias ("no such table: blocker"); SQLite's suite caught
  it, and `taskGraph.sql.test.ts` now pins the MySQL text, which CI cannot run.
- **Next**: M35-T05

## M35-T05 — CLI

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/cli/cmd/{tasks.go,tasks_queue.go,tasks_graph.go}`
  (+ `tasks_graph_test.go`), `docs/cli-reference.md`
- **Verified**: `go test ./cmd/` green; `moon run cli:format cli:vet
  cli:docs-check cli:coverage-gate` green, coverage 94.6%.
- **Notes**: `tasks create --priority --parent --blocked-by --discovered-from`,
  `tasks update --priority --parent` (`--parent ""` clears; unset sends
  nothing), `tasks list --ready --priority --label --parent` and `--sort
  priority`, `tasks claim-next --label`, and `tasks link add|remove|list`
  (`--kind blocked-by|discovered-from`). Priorities are names or 0-4; a bad
  one exits 6 before any request, through a new `invalidArgf` so client-side
  argument errors share the server's exit code. Lists show `{urgent, blocked
  by 2}` only when there is something to say.
- **Next**: M35-T06
