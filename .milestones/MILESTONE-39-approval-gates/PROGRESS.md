# M39 — Progress Journal

## M39-T01 — ADR-0032; contract and schema

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `.specs/adr/ADR-0032-approval-gates-on-agent-transitions.md`,
  `packages/shared-contract/*` and generated code, `apps/backend/src/db/schema.{sqlite,mysql}.ts`,
  migrations `0055_approval_gates` / mysql `0042`, `src/db/approvalGates.migration.test.ts`
- **Verified**: backend `bun test` green; `shared-contract:format :knip
  :spec-drift backend:typecheck` green.
- **Notes**: ADR-0032: the gate is a flag on the transition edge (the unit
  being gated, edited where edges are drawn); an agent's gated move returns
  the pending approval rather than an error, and changes nothing; people are
  never gated; only people decide, and approving re-applies the move with the
  same compare-and-swap, so a task that moved meanwhile makes the approval
  stale rather than jumping it. Contract: `TaskStatusTransition.requiresApproval`,
  `SetTransitionApproval`, `UpdateTaskStatusResponse.pendingApproval`,
  `TransitionApproval`, Decide/Get/ListTransitionApprovals,
  `Task.pendingApprovalCount`. Existing transitions migrate ungated.
- **Next**: M39-T02

## M39-T02 — Gated `UpdateTaskStatus`, decide/list RPCs, notifications, events

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `src/modules/tasks/approvals.ts` (new), `tasks.handler.ts`
  (`applyStatusChange` extracted, gate check, `SetTransitionApproval`),
  `inputRequests.ts` (`waitingOnPeopleCounts`), `lib/notificationRegistry.ts`,
  `lib/scopes.ts`, `lib/cascadePurge.ts`, `modules/webhooks/events.ts`, the two
  gate sweeps, GUI webhook event list, `docs/webhooks.md`;
  `src/modules/tasks/approvals.test.ts` (12 tests).
- **Verified**: backend `bun test` 1984 pass; `backend:typecheck`, `:knip` green.
- **Notes**: The status change itself (CAS, activity, event, unblocked) is now
  one factory-level function, so approving applies exactly what a direct move
  does, attributed to the approver. Decisions are claimed with a conditional
  update before the move is applied, so two approvers cannot both apply it; a
  task that moved meanwhile turns the claim into `stale`. Open questions and
  pending approvals are counted for a page in one `UNION ALL` query, keeping
  the list query count where it was. Agents may read approvals
  (`tasks:read`); deciding and flagging edges are human-only.
- **Next**: M39-T03

## M39-T03 — CLI and MCP

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/cli/cmd/tasks_approvals.go` (new: `tasks approvals`,
  `approval`, `approve`, `reject`), `tasks.go` (held move on `update-status`,
  pending count on `get`), `tasktypes.go` (`gate-transition`, gate shown on
  `get`), tests; `docs/cli-reference.md` regenerated; MCP
  `get_transition_approval`, `list_transition_approvals`, `set_task_status`
  description; `docs/mcp.md`; MCP e2e case for a held move.
- **Verified**: `go test ./...` green; backend MCP tests 15 pass;
  `cli:docs-check`, `backend:typecheck` green.
- **Notes**: A held move is exit 0 with a sentence saying the task stays put
  and naming the request - it is not an error (ADR-0032), but it must not
  read as success either. No MCP tool decides an approval, asserted in the
  tool test alongside answering questions.
- **Next**: M39-T04

## M39-T04 — GUI: editor flag, dialog banner, queue

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `features/Tasks/Approvals.tsx` (new: `TaskApprovals`,
  `ApprovalsQueue`) with tests and stories; `PriorityBadge.tsx`
  (`AwaitingApprovalBadge`); `features/Tasks/index.tsx` (badge on board and
  table, approvals above questions in the task dialog, an Approvals section
  in "Waiting on people"); `features/TaskTypes/index.tsx` ("Needs approval"
  per transition); `scripts/rpc-coverage.mjs` exceptions.
- **Verified**: `gui:test` 1280 pass (coverage thresholds held),
  `gui:typecheck`, `gui:lint`, `gui:design-lint`, `gui:rpc-coverage`,
  `gui:query-error-coverage` green.
- **Notes**: Approve and reject sit on the pending item itself, with an
  optional reason; any outcome (including a stale refusal) refetches the
  task, board and lists. `rpc-coverage` - not in CI - had been red since M33
  on agent-only RPCs (claim-next, release, my-tasks, plan, ask, withdraw, get
  one question); each now has a reasoned exception, as does
  `getTransitionApproval`.
- **Next**: M39-T05
