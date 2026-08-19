---
id: ADR-0017
status: accepted
date: 2026-08-19
milestone: M22
---

# Handoff notes are a typed distinction on `TaskNote`, not a new entity

## Context

M22 introduces task-scoped continuity: an agent about to lose its claim
on an unfinished task records what it tried, what's blocked, and what
the next step is, so whoever picks the task up next — human or agent —
doesn't start from zero. This is deliberately not M21's belief system
(ADR-0014/0015/0016) — a handoff note is ephemeral, task-scoped
execution state that's dead the moment the task closes, not durable
project/org-scoped knowledge.

`TaskNote` already exists (`id`, `taskId`, `agentId`, `content`,
`createdAt`), already agent-authored only (`createTaskNote` denies a
human principal `PermissionDenied`), and is already readable via
`listTaskNotes`. The question is whether a handoff note needs its own
entity/table/RPC family, or fits inside what already exists.

## Options

**Add `noteType: 'comment' | 'handoff'` to the existing `TaskNote`,
default `'comment'`** (chosen). A handoff note is a `TaskNote` with
`noteType: 'handoff'` — same table, same authorization, same author
restriction, same lifecycle. One new column (`mysqlEnum` on MySQL, plain
`text` + Zod validation on SQLite, matching every other enum-like field
in this schema — this codebase has no TypeSpec `enum` construct
anywhere; every such field is a plain `string` with an inline comment
listing the allowed literals, enforced only in Zod). One new list RPC
(`listHandoffNotes`) for the cross-task browse case; two existing RPCs
(`claimTask`, `getTask`) gain one optional field each.

**Add a new `TaskHandoff` entity/table, mirroring `Belief`'s shape**
(rejected). Would require its own schema, its own handler, its own
`AGENT_RPC_SCOPES` entries, and its own authorization tests — full
infrastructure for a concept that is structurally identical to a
`TaskNote` (agent-authored, task-scoped, timestamped free text) except
for one label. M21 built a new module because beliefs have genuinely
different lifecycle semantics (status, supersession, promotion across
scope tiers, relations) that don't fit `TaskNote` at all; nothing about
a handoff note needs any of that.

**No schema change — treat it as a convention** (agents just write
"HANDOFF:" as a content prefix) (rejected). Cheapest to build, but
un-queryable: `listHandoffNotes`, the task-detail summary count, and the
`claimTask`/`getTask` surfacing all depend on being able to filter by
type at the database layer, not by scanning free text for a prefix that
nothing enforces an agent actually uses.

## Decision

`TaskNote.noteType` is `'comment' | 'handoff'`, default `'comment'`,
Zod-validated (no TypeSpec enum, matching this repo's established
convention — see `Belief.scopeType`/`SearchResult.type`). No new table,
no new permission family, no new agent-token scope: `listHandoffNotes`
is classified `tasks:read` in `AGENT_RPC_SCOPES.taskNotes`, alongside
`listTaskNotes`; writes stay on `comments:write`, exactly as today.
`claimTask` and `getTask` each gain an optional `latestHandoffNote:
TaskNote` field, populated by one shared `getLatestHandoffNote(db,
taskId)` helper. `listHandoffNotes(projectId, page?)` returns one row
per task — the latest handoff note only, grouped by `taskId`/
`MAX(createdAt)` — joined with `taskId`/`taskTitle`/`taskStatus`, backing
the new cross-task GUI screen and CLI list command.

## Consequences

**Easier.** Zero new authorization surface to get wrong — every existing
test covering `createTaskNote`'s agent-only restriction, `listTaskNotes`'s
`tasks:read` scope, and `assertTaskNoteAuthor`'s edit/delete ownership
check keeps working unchanged and continues to cover handoff notes for
free, since they're the same rows. An agent that already knows how to
call `tasker tasks note-add` needs only one new flag (`--type handoff`)
to use this feature, not a new command family to learn.

**Harder.** A handoff note can never carry structured fields a plain
comment doesn't (no dedicated "blocked reason" or "next step" columns) —
it's free text like every other `TaskNote`, so the `handoff-task` skill
(M22-T07) is what imposes structure on the *content*, not the schema.
If a future need for genuinely structured handoff data emerges (e.g.
machine-readable "next step" for automated re-dispatch), it's a new
decision layered on top of this one, not something this model already
supports.

**Foreclosed, for now.** Claim TTL, auto-expiry, or any liveness
detection for a stale claim — a real, separate scheduling problem;
nothing like it exists anywhere in this codebase today. This feature
makes handing off *possible and easy to find*; it does nothing to detect
or force a handoff that never happens. Also foreclosed: automatic
promotion of a handoff note's content into a belief — that stays a
manual, explicit `capture-belief` call, with `Belief.sourceTaskNoteId`
already available to cite a handoff note as evidence.
