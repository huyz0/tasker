---
id: M38
title: Agent Plan and Input Requests
status: in-progress
goal: A person watching a task sees the agent's plan and how far through it the agent is, and when an agent cannot proceed without a human it asks a question on the task, the right person is notified, and the answer reaches the agent.
depends_on: [M35]
surfaces: [contract, backend, cli, gui, specs]
exit_criteria_met: false
started_at: 2026-10-02
completed_at: null
---

# M38 — Agent Plan and Input Requests

## 1. Goal

An agent publishes a **plan** on a task — an ordered list of steps, each
pending, in progress, done or skipped — replacing it whole on every update.
An agent that needs a decision opens an **input request** on the task: a
question, optionally with choices. The task shows it as waiting on input,
reviewers (or else org admins) get an in-app notification, and a person
answers it; the answer is returned to the agent by the event feed, webhook
and a read RPC. Open input requests are listable across the organization so a
human can work the queue of agents waiting on them.

## 2. Why Now

The landscape review ranks it fifth: Linear's Agent Plan and `elicitation`
activity, A2A's `input-required` state and Asana's checkpoints. This is the
point where the mission says humans step "in" the loop, and today an agent's
only way to ask is a free-text comment nobody is notified of.

## 3. Exit Criteria

- [ ] `SetTaskPlan` replaces the plan atomically; `GetTask` returns it; steps
  are bounded (≤ 50, each ≤ 500 chars).
- [ ] `RequestInput` / `AnswerInputRequest` / `ListInputRequests`; only a
  human answers; an answered request cannot be answered twice.
- [ ] Opening a request notifies through the notification registry (a new
  renderer, no type branches); answering publishes an event the asking agent
  receives.
- [ ] GUI: plan with progress in the task dialog; an input request banner with
  an answer form; an "Waiting on you" list.
- [ ] CLI and MCP tools for all of it; CI green on `main`.

## 4. Scope

**Out of scope:** blocking status transitions while input is pending (a type
policy choice), agent-to-agent questions.

## 5. Task Breakdown

- [x] **M38-T01** — ADR-0031; contract and schema.
- [x] **M38-T02** — Plan RPC.
- [x] **M38-T03** — Input requests: RPCs, notifications, events.
- [x] **M38-T04** — CLI and MCP tools.
- [ ] **M38-T05** — GUI.
- [ ] **M38-T06** — Docs and close.

## 6. Verification

```
moon run backend:typecheck backend:test cli:test gui:test :knip :doc-drift
```

## 7. Risks

- **Notification noise.** One notification per request per recipient, through
  the existing registry; no reminders in this milestone.
