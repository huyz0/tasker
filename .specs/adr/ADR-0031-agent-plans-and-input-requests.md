---
id: ADR-0031
status: accepted
date: 2026-10-02
milestone: M38
---

# Agent plans live on the task; input requests are their own records, answered only by people

## Context

The mission puts humans "on or in the loop only when necessary". Tasker shows a
person what an agent did (notes, handoffs, activity), but not what it *intends*
to do, and gives an agent no structured way to stop and ask. Today an agent
that needs a decision writes a comment, nobody is notified, and the agent
cannot tell when or whether it was answered. The 2026-10-02 landscape review
found the same two primitives across the field: Linear's Agent Plan, replaced
whole on every update, and its `elicitation` activity; A2A's `input-required`
task state; Asana's checkpoints.

## Options

**Plan.**

- **(a) A table of steps**, updated one step at a time. That needs ordering and
  diffing, and races between two writers make the order meaningless.
- **(b) One JSON column on the task, replaced whole.** Last write wins. The
  plan belongs to whoever is working the task, so there is nothing to merge.
  Size is bounded at 50 steps of 500 characters each.

**Questions.**

- **(c) A new task status.** It cannot work with typed state machines: every
  type would need an extra state and the transitions into and out of it.
- **(d) A comment convention.** Not queryable, nothing to notify on, and no
  answered state.
- **(e) An `input_requests` record**, with the question, optional choices, the
  asker, the answer, who answered, and a status of open, answered or
  cancelled.

## Decision

**(b)** for plans and **(e)** for questions.

- `SetTaskPlan` replaces a task's plan; `GetTask` returns it. Lists do not,
  because a plan is detail and lists stay light (M07-T01). Steps are
  `pending`, `in_progress`, `done` or `skipped`. It takes `tasks:write`.
- `RequestInput` opens a question on a task (`tasks:write`). It notifies the
  task's reviewers, or the organization's owners and admins when the task has
  none — the same recipients as stalled-claim alerts (ADR-0022) — and
  publishes `domain.task.input_requested`.
- **Only a person answers.** `AnswerInputRequest` requires a human session and
  `task:write` on the task. An agent answering would let an agent approve its
  own decision, which defeats the point. An answered or cancelled request
  cannot be answered again; a conditional update decides a concurrent second
  answer. It publishes `domain.task.input_answered` with the answer.
- The asker hears back three ways, without a new channel: the event feed, a
  webhook (the event is a `task.*` event, so M37 carries it), or polling
  `GetInputRequest`.
- The asker, or an admin, may cancel an open request.
- Each task carries `openInputRequestCount`, so lists can flag a task that is
  waiting on a person. `ListInputRequests` across the organization is the
  queue of agents waiting on people.

## Consequences

- A plan has no history. A step's past states are not kept; the activity log
  and notes record what happened. History can be added later as events.
- An open request does not block anything. An agent may keep working, or
  release the task with a handoff note pointing at the question. Blocking a
  transition while input is pending is a task-type policy, left out of scope.
- Questions are agent → person only. A person asking an agent is a comment.
