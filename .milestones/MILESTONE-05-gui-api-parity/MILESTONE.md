---
id: M05
title: GUI / API Parity
status: in-progress
goal: Every capability the backend implements is reachable from the web interface, and nothing on screen is fabricated.
depends_on: [M01]
surfaces: [gui, contract]
exit_criteria_met: false
started_at: 2026-08-15
completed_at: null
---

# M05 — GUI / API Parity

## 1. Goal

A human manager can do their whole job in the browser: assign work to a person
or an agent, add reviewers, link evidence to a task, comment on an artifact,
upload a file, and configure a task type's state machine. Everything displayed
reflects stored data — there is no status badge, priority chip or user name
that the system does not actually know.

## 2. Why Now

The backend already implements `assignTask`, `addTaskReviewer`,
`linkTaskArtifact`, artifact comments, artifact upload, and task status
transitions; the CLI reaches all of them and the GUI reaches none. This is the
largest ratio of delivered value to new code in the plan — the work is wiring,
not construction. The fabricated UI removal belongs here because the same
screens are being touched.

## 3. Exit Criteria

- [ ] Every RPC in the contract is either called by the GUI or explicitly listed
      in this milestone as agent-only, with a reason.
- [ ] No component renders a hardcoded status, priority, assignee or user name.
- [ ] A task can be assigned to a human or an agent, and reviewers added and
      removed, entirely from the browser.
- [ ] An artifact can be uploaded, commented on, and linked to a task from the browser.
- [ ] A task type's statuses and transitions can be configured from the browser.
- [ ] List filtering and sorting are performed by the server, not the client.

## 4. Scope

**In Scope**: Tasks, Artifacts, Agents and Projects views; the assignment,
reviewer, link, comment, upload and task-type surfaces; removal of fabricated state.

**Out of Scope**: visual system corrections and accessibility (M06),
pagination and virtualization of these lists (M07), a graphical state-machine
editor — this milestone ships a form-based editor and M06 decides whether a
canvas is warranted.

## 5. Task Breakdown

### Remove fabrication

- [x] **M05-T01** — Delete the hardcoded `WORKING` badge and pulsing indicator
      from the agents list.
      - Files: `apps/gui/src/features/Agents/index.tsx`
      - Verify: no agent displays a status the system does not store.

- [x] **M05-T02** — Delete the `High Priority` chip and the `U` avatar from task cards.
      - Files: `apps/gui/src/features/Tasks/index.tsx`
      - Verify: nothing on a card is unbacked by data.

- [x] **M05-T03** — Render the signed-in user from `getIdentity`; extend the
      response with name and avatar.
      - Files: `apps/gui/src/components/layout/AppShell.tsx`,
        `modules/auth/auth.handler.ts`, `main.tsp`
      - Verify: the sidebar shows the actual logged-in account.

### Reach the API

- [x] **M05-T04** — Assignment: an assignee picker over org members and agents,
      calling `assignTask`, with the assignee shown on the card and detail view.
      - Files: `apps/gui/src/features/Tasks/`, new `AssigneePicker` component
      - Verify: assigning in the UI is visible via `cli tasks list`.

- [x] **M05-T05** — Reviewers: add, list and remove reviewers on the task detail.
      - Files: `apps/gui/src/features/Tasks/`
      - Verify: reviewers round-trip through the API.

- [x] **M05-T06** — Task-to-artifact links: link and unlink from both the task
      detail and the artifact view.
      - Files: `apps/gui/src/features/Tasks/`, `features/Artifacts/index.tsx`
      - Verify: a linked artifact appears on the task.

- [x] **M05-T07** — Artifact comments: mount the existing comment provider with
      `entityType="artifact"`.
      - Files: `apps/gui/src/features/Artifacts/index.tsx`
      - Verify: a comment on an artifact persists and re-renders.

- [x] **M05-T08** — Artifact upload: a file input that base64-encodes, detects
      content type, enforces the size limit, and previews images.
      - Files: `apps/gui/src/features/Artifacts/index.tsx`
      - Verify: an image uploaded in the browser renders after reload.

- [x] **M05-T09** — Task type editor: create and order statuses, define allowed
      transitions, set the root type on a template.
      - Files: new `apps/gui/src/features/TaskTypes/`, `App.tsx`
      - Verify: a custom state machine configured in the UI is enforced on status change.

- [x] **M05-T10** — Nested folder navigation in the artifact browser, matching the
      hierarchy the schema already stores.
      - Files: `apps/gui/src/features/Artifacts/index.tsx`
      - Verify: a folder tree three levels deep is navigable.

### Server-driven lists

- [x] **M05-T11** — Wire the Tasks filter control to the backend `filter`
      parameter and the table headers to the `sort` parameter.
      - Files: `apps/gui/src/features/Tasks/index.tsx`
      - Verify: filtering issues a new request rather than filtering in memory.

- [x] **M05-T12** — Audit every remaining RPC against GUI usage and record the
      agent-only exceptions in this file.
      - Verify: the exit criterion's list exists and is justified.

### RPC coverage: the exceptions

95 RPCs across 14 services. 92 are called by the GUI. The audit is enforced by
`apps/gui/scripts/rpc-coverage.mjs`, which runs on every build — a one-off audit
answers the question once, and the case that matters is the *next* RPC.

The three exceptions, and why:

| RPC | Why the GUI does not call it |
|---|---|
| `TaskNoteService.createTaskNote` | **Agent-only by design.** `task_notes.agent_id` is `NOT NULL`, so a note has no human author; M04 made the handler refuse a user principal outright rather than let a human file a note under a worker that never wrote it. The GUI reads, edits and deletes notes. |
| `ProjectService.getProject` | **Redundant here.** The GUI lists projects and holds them in cache, so a single-project read would be a second request for data already on the client. Agents and the CLI, which hold no list, use it. |
| `ProjectTemplateService.getTemplate` | **Redundant here**, for the same reason as `getProject`. |

The audit also found one genuine gap, now closed: `createAgentRole` was
unreachable, and since deploying an agent requires choosing a role, an
organization starting from nothing could not deploy its first agent from the
browser at all.

## 6. Verification

```bash
moon run gui:test
moon run gui:e2e
```

## 7. Risks

This milestone touches the most-tested components in the GUI; expect
substantial test churn. Write the test for each new interaction before the
interaction, per `testing-standard.md`, so the churn is intentional.
