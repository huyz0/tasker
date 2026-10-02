---
id: M39
title: Approval Gates on Agent Transitions
status: in-progress
goal: An organization can mark a task-type transition as needing a person's approval when an agent makes it, so an agent can propose "move to Done" but only a person can let it happen - without slowing the transitions nobody needs to watch.
depends_on: [M38]
surfaces: [contract, backend, cli, gui, specs]
exit_criteria_met: false
started_at: 2026-10-02
completed_at: null
---

# M39 — Approval Gates on Agent Transitions

## 1. Goal

A transition in a task type can be flagged **requires approval**. When an agent
makes that move, the status does not change: a pending approval is recorded,
the task's reviewers (or org admins) are notified, and the agent's response
says so. A person approves - the move happens, attributed to them - or rejects
with a reason the agent can read. People making the same move are not gated.

## 2. Why Now

The landscape review's first unscheduled item. Jira lets approved agent
updates through and logs them; GitHub holds workflows on agent pull requests
until a person approves. Tasker's only check on an agent finishing work was a
reviewer reading it after the fact.

## 3. Exit Criteria

- [ ] An agent's `UpdateTaskStatus` across a gated edge leaves the status
  unchanged and returns the pending approval; a person's does not.
- [ ] Only a person decides; approving applies the move (refused if the task
  moved meanwhile), rejecting records the reason; a decided approval cannot be
  decided again.
- [ ] Reviewers (else admins) are notified; `task.approval_requested`,
  `task.approval_decided` reach the feed and webhooks.
- [ ] Gate flag editable in the task-type editor; approvals answerable in the
  task dialog and the "Waiting on people" queue; CLI and MCP surface them.
- [ ] CI green on `main`.

## 4. Scope

**Out of scope:** multi-person approval, approval of anything but status moves.

## 5. Task Breakdown

- [x] **M39-T01** — ADR-0032; contract and schema.
- [x] **M39-T02** — Gated `UpdateTaskStatus`, decide/list RPCs, notifications, events.
- [ ] **M39-T03** — CLI and MCP.
- [ ] **M39-T04** — GUI: editor flag, dialog banner, queue.
- [ ] **M39-T05** — Docs and close.

## 6. Verification

```
moon run shared-contract:format backend:typecheck backend:test cli:test cli:docs-check :knip
moon run gui:lint gui:design-lint gui:typecheck gui:test gui:build gui:storybook-test :doc-drift
```

## 7. Risks

- **Stale approvals.** The task may move before a person decides; approving
  then re-checks the from-status and refuses rather than jumping the task.
