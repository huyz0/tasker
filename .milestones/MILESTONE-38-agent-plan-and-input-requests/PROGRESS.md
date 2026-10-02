# M38 — Progress Journal

## M38-T01 — ADR-0031; contract and schema

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `.specs/adr/ADR-0031-agent-plans-and-input-requests.md`,
  `packages/shared-contract/{main.tsp,tasker/health/v1/health.proto}` and
  generated code, `apps/backend/src/db/schema.{sqlite,mysql}.ts`, migrations
  `0054_plans_and_input_requests` / mysql `0041`, `src/db/inputRequests.migration.test.ts`,
  `modules/tasks/tasks.handler.ts` (`toWireTask` parses the plan)
- **Verified**: backend `bun test` 1955 pass; `moon run shared-contract:format
  :knip :spec-drift backend:typecheck` green.
- **Notes**: ADR-0031: the plan is one JSON column replaced whole (last
  write wins - it belongs to whoever works the task); questions are their
  own `input_requests` records, and only a person answers - an agent
  answering would let it approve its own decision. Answers reach the asker
  through the event feed, webhooks (the events are `task.*`) or
  `GetInputRequest`. `Task` gains `plan` (GetTask only) and
  `openInputRequestCount`; TaskService gains SetTaskPlan, RequestInput,
  AnswerInputRequest, CancelInputRequest, GetInputRequest,
  ListInputRequests. `getTask` selects every column, so the raw plan text
  would have reached the wire as a string where the contract has a list;
  `toWireTask` now parses it.
- **Next**: M38-T02

## M38-T02 — Plan RPC

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/backend/src/modules/tasks/tasks.handler.ts`
  (+ `planAndInput.test.ts`), `lib/scopes.ts`, `lib/{agent-scope-sweep,viewer-denial}.test.ts`,
  `modules/webhooks/events.ts`, `apps/gui/src/features/Organizations/Webhooks.tsx`,
  `docs/webhooks.md`
- **Verified**: backend `bun test` 1959 pass; knip, typecheck green; GUI
  Webhooks tests 9 pass.
- **Notes**: `SetTaskPlan` (`tasks:write`) replaces the plan whole; titles
  are trimmed, 1-500 characters, at most 50 steps, status one of pending /
  in_progress / done / skipped; an empty list clears it. GetTask returns the
  plan; lists return it empty. Publishes `domain.task.plan_updated` with step
  and done counts - added to the webhook event vocabulary, the GUI's event
  picker and the webhooks guide, so a watcher can follow progress.
- **Next**: M38-T03
