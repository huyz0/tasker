---
id: M41
title: Task Digests
status: in-progress
goal: An agent that needs an old or long task's context gets it in one compact read - a summary written once by whoever closed it, plus the facts Tasker already knows - instead of replaying the whole history.
depends_on: [M38, M40]
surfaces: [contract, backend, cli, gui, specs]
exit_criteria_met: false
started_at: 2026-10-02
completed_at: null
---

# M41 — Task Digests

## 1. Goal

`SetTaskSummary` records a short, durable summary of a task (outcome,
decisions, gotchas), typically written by the agent that finished it.
`GetTaskDigest` returns one bounded document: the summary, final status,
holders, plan, the latest handoff note, answered questions, relations and
usage - assembled by the server, no model involved. `ListCompactionCandidates`
finds finished tasks past an age with no summary, so a maintenance agent can
summarize a backlog. CLI, MCP and GUI expose all three.

## 2. Why Now

The landscape review's third unscheduled item: Beads "compacts" old closed
issues so agents read summaries, and Amp hands off a summary instead of a
thread. With discovered-from links (M35) agents follow work back to its
origin; the origin's full history is the expensive way to read it.

## 3. Exit Criteria

- [ ] `SetTaskSummary` (≤ 4,000 chars, `tasks:write`) and the summary on
  GetTask.
- [ ] `GetTaskDigest` is bounded (latest handoff, ≤ 20 answered questions,
  ≤ 50 relations per kind) and costs a fixed number of queries.
- [ ] `ListCompactionCandidates` returns only terminal, unsummarized tasks
  finished before the cutoff.
- [ ] CLI, MCP tools, GUI summary panel; CI green on `main`.

## 4. Scope

**Out of scope:** deleting history (summaries add, never remove); generating
summaries server-side (Tasker has no model; agents write them).

## 5. Task Breakdown

- [x] **M41-T01** — Contract and schema.
- [ ] **M41-T02** — Summary, digest and candidates RPCs.
- [ ] **M41-T03** — CLI and MCP.
- [ ] **M41-T04** — GUI.
- [ ] **M41-T05** — Docs and close.

## 6. Verification

As M39.

## 7. Risks

- **Digest drift.** It is assembled from the same tables the screens read, at
  read time - never stored - so it cannot go stale.
