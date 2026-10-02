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
