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
