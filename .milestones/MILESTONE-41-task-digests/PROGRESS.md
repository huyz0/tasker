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

## M41-T03 — CLI and MCP

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/cli/cmd/tasks_digest.go` (new: `tasks summary
  set|clear`, `tasks digest`, `tasks compaction-candidates`),
  `tasks_graph.go` (`printRelations` shared with the digest), `tasks.go`
  (summary on `get`), `cmd/tasks_digest_test.go`; `docs/cli-reference.md`
  regenerated; MCP `set_task_summary`, `get_task_digest`,
  `list_compaction_candidates` with an e2e case; `docs/mcp.md`.
- **Verified**: `go test ./...` green; backend MCP tests 17 pass;
  `cli:docs-check`, `backend:typecheck`, `:knip` green.
- **Notes**: `summary set --file -` reads stdin, so an agent can pipe a
  summary it wrote. An empty summary is refused client-side with a pointer
  to `summary clear`, which says what it does. The digest's text view says
  on stderr when a list was capped and where to read all of it.
- **Next**: M41-T04

## M41-T04 — GUI

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `features/Tasks/TaskSummary.tsx` (new: the Summary section of
  the task dialog - rendered Markdown with author and time; write, edit,
  clear with a 4,000-character counter), tests and stories;
  `features/Tasks/index.tsx`; `index.test.tsx` (summary shown in the
  dialog); `scripts/rpc-coverage.mjs` exceptions for `getTaskDigest` and
  `listCompactionCandidates`.
- **Verified**: `gui:test` 1291 pass (coverage thresholds held);
  `gui:typecheck`, `gui:lint`, `gui:design-lint`, `gui:rpc-coverage`,
  `gui:query-error-coverage` green.
- **Notes**: The summary sits above the plan: on an old task it is the first
  thing worth reading. The panel is keyed by task so a draft never leaks
  into the next task opened. The digest and the candidate list are agent
  reads; the dialog already shows every part of a digest.
- **Next**: M41-T05

## M41-T05 — Docs and close

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `docs/agent-integration.md` §16; the landscape review notes
  M39-M41 delivered; `cmd/tasks_digest.go` (blank summary lines print
  without indentation); milestone closed, STATE.
- **Verified**: live smoke on the seeded standalone backend - an agent lists
  52 candidates from the seed, pipes a summary in on stdin, the task drops
  off the list (51), and `tasks digest` shows the summary, finish time,
  usage and relations; GUI (Playwright on the dev server): the summary in
  the dialog, and a person writing one on another task. `:docs-lint`,
  `:doc-drift` green.
- **Notes**: Exit criteria met; CI on `main` verified after the push.
- **Next**: none - M39-M41 delivered.
