---
id: ADR-0034
status: accepted
date: 2026-10-02
milestone: M41
---

# Compaction is a written summary plus a digest assembled at read time

## Context

An agent following a discovered-from link, picking up a handoff, or checking
how a similar task went reads the old task's whole history: description,
comments, notes, questions, plan, relations. The history grows; the useful
part does not. The 2026-10-02 landscape review found Beads "compacting" old
closed issues into summaries agents read instead, and handoff tools that pass
a summary rather than a thread.

## Options

- **(a) Delete or truncate old history** once it is summarized. Saves rows;
  loses the audit trail people rely on, and cannot be undone.
- **(b) Generate summaries in the server** with a model. Tasker has no model
  and no budget to spend one on the user's behalf.
- **(c) Store a summary an agent writes, and assemble a bounded digest from
  the existing tables on read.** Nothing is lost; the digest is as fresh as
  the tables; the only stored artifact is the summary itself.

## Decision

**(c).**

- `tasks.summary` (≤ 4,000 characters) with who wrote it and when, set by
  `SetTaskSummary` (`tasks:write`), replaced whole, cleared with empty text.
  GetTask carries it; lists do not.
- `GetTaskDigest` (`tasks:read`) returns one document: the task (with plan,
  usage, summary and waiting counts), the latest handoff note, up to 20
  answered questions, relations capped at 50 per kind, when it finished, and
  `truncated` when a cap cut something off. It runs a fixed number of
  queries whatever the task's size, and is never stored, so it cannot go
  stale.
- `ListCompactionCandidates` (`tasks:read`) finds a project's terminal tasks
  with no summary that finished (last moved to a terminal status, from the
  activity log; else created) before a cutoff, oldest first - the work list
  for a maintenance agent. Summarizing a task takes it off the list, so the
  list has a limit and a count but no cursor.

## Consequences

- History is never removed. "Compaction" here saves *reading*, not storage.
- A summary is only as good as its author; it records who wrote it.
- Comments are deliberately not in the digest: they are the long tail the
  summary exists to replace, and remain one call away.
