# Task Handoff & Continuity — Shaping Notes

## Scope

A task-scoped continuity mechanism, distinct from M21's shared memory: an
agent about to lose its claim on an unfinished task can record what it
tried, what's blocked, and what the next step is, so whoever picks the
task up next — human or agent — doesn't start from zero. Exists because a
cloud agent in an ephemeral sandbox has no local disk to fall back on the
way a person coding locally does.

Small follow-on to M21, not a new module — extends the existing
`TaskNote`/`claimTask`/`getTask` surface with a typed distinction and one
new list RPC. Executed as a formal milestone
(`MILESTONE-22-task-handoff-continuity`) per explicit user request,
sized to roughly a third of M21 (8 tasks vs. 10, one ADR vs. three, no
new backend module, no new permission family).

## Decisions

- **Handoff notes are a typed distinction on the existing `TaskNote`, not
  a new entity.** `noteType: 'comment' | 'handoff'`, default `'comment'`.
  No new table, no new permission family, no new agent-token scope. See
  ADR-0017.
- **Agent-authored only** — matches `createTaskNote`'s existing
  restriction (a human principal is already denied `PermissionDenied`
  today). The problem this feature solves — no local disk — is a cloud
  agent's problem, not a human's; a human already has continuity for
  free. Confirmed directly with the user.
- **Not folded into the general task-notes panel.** The task detail view
  shows only a compact summary (count + the last few, truncated) with a
  click-through, not the full history inline. Confirmed directly with
  the user.
- **A new top-level cross-task "Handoffs" screen**, structured like the
  Memory screen got its own nav entry in M21, backed by a new
  `listHandoffNotes` RPC — one row per task (the latest handoff note
  only), so a human can see every task with pending handoff context at a
  glance without opening tasks one at a time. Confirmed directly with
  the user, chosen over a narrower per-task-only sub-view.
- **`claimTask` and `getTask` responses carry the latest handoff note
  directly**, nullable, via one shared helper — the moment an agent
  claims or inspects a task, any prior handoff context arrives in the
  same round trip. This is the part that most directly serves the
  original problem statement.
- **Claim TTL / auto-expiry / staleness detection is explicitly out of
  scope.** A genuine, separate scheduling/liveness problem; nothing like
  it exists anywhere in this codebase today (confirmed by exploration
  grep across the tasks module, `main.tsp`, `scopes.ts`,
  `idempotency.ts`). Named, not silently dropped.
- **No automatic promotion into beliefs.** A handoff note that turns out
  to contain a durable fact still requires an explicit `capture-belief`
  call — `Belief.sourceTaskNoteId` already supports citing it as
  evidence, no new plumbing needed for that link.

## Context

- **Visuals:** None.
- **References:** `apps/backend/src/modules/tasks/task_notes.handler.ts`
  and `tasks.handler.ts` (the surface being extended),
  `apps/gui/src/features/Memory/index.tx` (M21's top-level-screen
  precedent to mirror), `apps/gui/src/components/ui/statusStyles.ts`
  (the tone-pill idiom to reuse) — full detail in `references.md`.
- **Product alignment:** Same mission-level framing as M21
  (`.specs/product/mission.md` — "agents create/track/update work with
  minimal friction... humans stay off the loop by default"): this is
  infrastructure for a cloud agent to hand its own unfinished context to
  the next agent or person, without a human needing to be present at the
  handoff moment. Additive to `roadmap.md` the same way M15–M21 were.

## Standards Applied

- `.specs/standards/api-standard.md` — extend an existing contract-first
  RPC surface rather than invent one; `PageRequest`/`PageResponse` for
  the new `listHandoffNotes`; per-handler authorization.
- `.specs/standards/security-standard.md` — Zod at the boundary for the
  new `noteType` enum; RBAC ownership stays exactly as `TaskNote`'s
  today, no new gate to get wrong.
- `.specs/standards/frontend-standard.md` — container/presentational
  split, TanStack Query, mandatory Storybook stories for the new
  `Handoffs` screen.
- `.specs/standards/testing-standard.md` — 95% coverage gate, co-located
  tests, unit-heavy with integration against real SQLite.
- `.specs/standards/milestone-standard.md` — governs `MILESTONE.md`/
  `PROGRESS.md` format and the one-commit-per-task protocol.
