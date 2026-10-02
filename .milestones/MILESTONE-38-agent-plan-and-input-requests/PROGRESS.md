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

## M38-T03 — Input requests

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/backend/src/modules/tasks/{inputRequests.ts,tasks.handler.ts}`
  (+ `planAndInput.test.ts`, `assignment.test.ts` bound), `lib/notificationRegistry.ts`,
  `lib/cascadePurge.ts`, `lib/scopes.ts`, `lib/{agent-scope-sweep,viewer-denial}.test.ts`,
  `modules/webhooks/events.ts`, `apps/gui/src/features/Organizations/Webhooks.tsx`, `docs/webhooks.md`
- **Verified**: backend `bun test` 1969 pass; knip, typecheck green. (M37's
  `gui:storybook-test`, outstanding at its T06 commit, finished green: a11y,
  and nothing wider than 375px across 130 stories.)
- **Notes**: `RequestInput` (`tasks:write`) records a question with up to ten
  suggested answers, publishes `domain.task.input_requested`, and notifies the
  task's reviewers, or else the org's owners/admins (the stalled-claim
  recipients), never the asker - best-effort, after the question exists.
  `AnswerInputRequest` is people-only (ADR-0031) and decided by a conditional
  update, so of two racing answers exactly one wins (tested); it publishes
  `domain.task.input_answered` with the answer. `CancelInputRequest`: the
  asker or an org admin. `GetInputRequest` lets an agent poll;
  `ListInputRequests` gives one task's history or the organization's open
  queue (agents' org implied). Tasks carry `openInputRequestCount` (one
  grouped query per page - the assignment query bound +1 again). Purge removes
  a task's questions. The three events join the webhook vocabulary. Both
  permission gates first returned NotFound on a placeholder id - they now run
  against seeded questions, so the scope check is what they test.
- **Next**: M38-T04

## M38-T04 — CLI and MCP tools

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/cli/cmd/{tasks_plan.go,tasks.go}` (+ `tasks_plan_test.go`),
  `docs/cli-reference.md`, `apps/backend/src/modules/mcp/tools.ts` (+ test),
  `docs/mcp.md`, `.specs/product/architecture.md` (service count)
- **Verified**: `moon run cli:format cli:vet cli:test cli:docs-check
  cli:coverage-gate :knip backend:typecheck :docs-lint` green (CLI coverage
  94.5%); `bun test src/modules/mcp` 14 pass.
- **Notes**: CLI: `tasks plan set <task> --step "[status:]title"...` (a
  prefix only counts when it is a real status, so "Note: x" stays a title;
  no steps clears), `tasks plan show`, `tasks ask --question --option`,
  `tasks answer`, `tasks question`, `tasks cancel-question`, `tasks questions
  [--org|--task] [--status]`; `tasks get` now shows the plan and open
  questions. MCP: `set_task_plan`, `request_input`, `get_input_request`,
  `list_input_requests`, `cancel_input_request` (25 tools) - and a test that
  no tool maps to AnswerInputRequest. The MCP validator learned arrays of
  objects (shape, enums, no stray fields), with the error naming the shape.
  The architecture's service count had been one short since before M37; it
  now matches `index.ts`.
- **Next**: M38-T05

## M38-T05 — GUI

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/gui/src/features/Tasks/{TaskPlan.tsx,InputRequests.tsx,PriorityBadge.tsx,index.tsx}`
  (+ tests and stories), `apps/gui/src/lib/eventQueryKeys.ts` (+ test)
- **Verified**: `moon run gui:lint gui:design-lint gui:typecheck gui:test
  gui:build gui:storybook-test` green - 1271 tests, 98.4% / 95.2%; storybook
  a11y 0 violations and no overflow at 375px across 134 stories. **Live**, on
  the restarted backend: an agent set a plan and asked a question over MCP;
  `tasks get` showed the plan and "Waiting on a person"; a person answered
  through the CLI; the agent's own attempt to answer over RPC was
  `permission_denied`; the agent read the answer back over MCP; the admin's
  bell had "MCP Scout asks on SEED-162"; the webhook receiver verified
  `task.plan_updated`, `task.input_requested`, `task.input_answered`.
- **Notes**: The task dialog opens with the task's questions (open first,
  each with option chips that fill the answer and a free-text box, then past
  answers and withdrawn ones) and shows the agent's plan with a progress bar
  that counts done and skipped. Cards and table rows get "Needs input". The
  Tasks header's "Waiting on people" opens the organization's open-question
  queue, each linked to its task. `inputRequests` joins the task entity's
  event keys. Two catches: my insertion anchor first put the queue dialog
  inside `TaskNotesPanel` (every dialog test crashed on `showQuestions is not
  defined`) - a plain `tsc -p .` in apps/gui does not typecheck `src`, so
  `moon run gui:typecheck` is the check to trust; and design-lint refused
  `transition-all` on the progress bar.
- **Next**: M38-T06

## M38-T06 — Docs and close

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `docs/agent-integration.md` (new §13), `.specs/product/architecture.md`,
  `.milestones/STATE.md`
- **Verified**: `moon run :docs-lint :doc-drift` green.
- **Notes**: §13 is the agent's side of the loop - share a plan, ask, hear back
  by polling, the event feed or a webhook, and keep working or hand off while
  waiting. M38 closed: 6/6 tasks, 5/5 criteria, each a test in
  `planAndInput.test.ts`, the MCP/CLI suites, the GUI suites, or the live T05
  run.
- **Next**: none - M35-M38 delivered.
