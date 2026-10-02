# M41 — Progress Journal

## M41-T01 — Contract and schema

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `.specs/adr/ADR-0034-task-summaries-and-digests.md`,
  `packages/shared-contract/*` and generated code,
  `apps/backend/src/db/schema.{sqlite,mysql}.ts` (summary columns on
  `tasks`), migrations `0057_task_summaries` / mysql `0044`,
  `src/db/taskSummaries.migration.test.ts`, `tasks.handler.ts` (raw summary
  columns never reach the wire as-is).
- **Verified**: backend `bun test` 1998 pass; `backend:typecheck`,
  `gui:typecheck`, `:knip`, `:spec-drift`, contract round-trip green.
- **Notes**: ADR-0034: compaction saves reading, not storage - an agent
  writes a summary, the server assembles a bounded digest from the live
  tables at read time, and nothing is deleted. Contract: `SetTaskSummary`,
  `GetTaskDigest` (`TaskDigest` reuses `ListTaskLinksResponse` for
  relations), `ListCompactionCandidates` (limit and count, no cursor -
  summarizing removes a row), `Task.summary`.
- **Next**: M41-T02

## M41-T02 — Summary, digest and candidates RPCs

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `src/modules/tasks/digest.ts` (new), `tasks.handler.ts`
  (summary on GetTask; the digest composes the factory's own `getTask` and
  `listInputRequests`), `taskGraph.ts` (`listLinks` takes a cap),
  `lib/scopes.ts`, both gate sweeps, `modules/webhooks/events.ts`
  (`task.summary_updated`), GUI webhook event list, `docs/webhooks.md`;
  `src/modules/tasks/digest.test.ts` (6 tests).
- **Verified**: backend `bun test` 2005 pass; `backend:typecheck`, `:knip`
  green.
- **Notes**: The digest reads through GetTask and ListInputRequests rather
  than re-implementing them, so it shows exactly what the screens show; caps
  are detected by asking for one more than the cap. A query-counting test
  holds a task with 22 answered questions and 53 children to within four
  selects of an empty one (batched name and ref lookups, never per row).
  Candidates: terminal by the same SQL rule as everywhere else, finished
  time from the last terminal move in the activity log (else creation),
  oldest first. Found while building it: drizzle leaves columns unqualified
  at the top of a select list but qualifies them inside a nested fragment,
  so a correlated subquery in a select field must be nested - noted at the
  call site.
- **Next**: M41-T03
