---
id: ADR-0032
status: accepted
date: 2026-10-02
milestone: M39
---

# Approval gates are a flag on a transition, held for agents and decided by people

## Context

A task type's transitions are the state machine the server enforces (M19).
Anyone allowed to write a task may make any allowed move, agents included. For
some moves — into Done, into Released — an organization wants a person to say
yes before an agent's move takes effect. Today the only check is a reviewer
noticing afterwards. The 2026-10-02 landscape review found the pattern in Jira
(approved agent updates) and GitHub (agent PR workflows held for approval).

## Options

**Where the rule lives.**

- **(a) A flag on the transition edge.** It is exactly the unit being gated,
  it is edited in the editor that already draws the edges, and every task of
  that type follows the same rule.
- **(b) A per-project policy** ("agents may not finish tasks"). Coarser, and
  untyped tasks have no notion of which status is "finished" beyond `done`.
- **(c) A new permission** that agents lack. It would gate every move to a
  status, not the specific edge, and would push the decision onto token
  issuance instead of the workflow.

**What the agent sees.** An error, `FailedPrecondition`, makes the agent's
attempt look like a failure. A response carrying the pending approval says
what happened and gives the agent an id to follow.

## Decision

**(a)**, with the pending approval returned in the response.

- `task_status_transitions.requires_approval`, set with
  `SetTransitionApproval` (`tasktype:write`).
- When an **agent** makes a gated move, `UpdateTaskStatus` changes nothing.
  It records a `transition_approvals` row (from, to, the agent) and returns it
  as `pendingApproval`. If the same move is already pending for that task, the
  existing row comes back instead of a duplicate. People are never gated: a
  person making the move *is* the approval.
- **Only a person decides** (`DecideTransitionApproval`, `task:write`).
  Approving re-applies the move with the same compare-and-swap on the
  from-status that `UpdateTaskStatus` uses, attributed to the approver. If the
  task has moved since, approval is refused and the request is closed as stale.
  Rejecting records an optional reason. A decided request cannot be decided
  again.
- Notification and events follow the input-request pattern (ADR-0031):
  reviewers, else owners and admins, are told; `task.approval_requested` and
  `task.approval_decided` reach the feed and webhooks.
- The approval queue joins "Waiting on people".

## Consequences

- Untyped tasks cannot be gated. They have no transitions to flag; give the
  work a type to gate it.
- An agent's move is not an error, so an agent that ignores `pendingApproval`
  may assume the move happened. The MCP tool's description and the guide say
  to check, and `GetTask` shows the unchanged status.
- An approver approves the move as it was asked. Changing the target status
  means rejecting and moving the task directly.
