---
id: ADR-0027
status: accepted
date: 2026-10-02
milestone: M33
---

# Agents may release a claim they took, never an assignment they were given

## Context

M14 gave agents `ClaimTask` — take an unassigned task for yourself — and kept
`UnassignTask` human-only. `lib/scopes.ts` states why: "a token that can
reassign work to itself is a token that can help itself to any task in the
organization — or take itself off one it was given." Deciding who works on
what is an orchestration decision.

ADR-0017 then made handoff notes the way an agent passes unfinished work on:
"an agent about to lose its claim" records what it tried, what is blocked, and
the next step, and the next claimant sees it. But nothing lets the agent
*lose* the claim. The assignment row stays, so the next agent's `ClaimTask`
fails with `FailedPrecondition` until a human unassigns the task. The handoff
flow ADR-0017 describes cannot complete without a person in the loop — the
mission's "humans off the loop unless necessary", inverted.

Nothing in the data distinguishes a claim from an assignment: both are a
`task_assignments` row. `task_activity` records `claimed` and `assigned`
events, but its writes are best-effort (a failed write is logged, not fatal),
so it cannot be the authority for a permission check.

## Options

**(a) Let agents call `UnassignTask` on themselves.** Reopens exactly what
`scopes.ts` closed: an agent could drop work an orchestrator deliberately gave
it, and nobody would know until the task went stale.

**(b) Infer "self-claimed" from `task_activity`.** No schema change, but the
permission would depend on a best-effort log. A missed write would make a
legitimate release impossible, and a backfill bug could make an assignment
releasable.

**(c) Record how each assignment was made, and allow release of claims only.**
One column on `task_assignments` (`source`: `claim` | `assign`). `ClaimTask`
writes `claim`; `AssignTask` writes `assign`. A new `ReleaseTask` deletes the
caller's own row only when it is a `claim`, optionally recording a handoff note
in the same call. Existing rows default to `assign` — the conservative reading
— and are backfilled to `claim` where `task_activity` shows that holder claimed
it, which can only widen what an agent may release to what it actually took.

## Decision

We record each assignment's source and let any principal release an assignment
it holds by its own claim — never one a human gave it.

## Consequences

- The handoff flow completes without a human: record a handoff note, release,
  and the next agent's `ClaimTask` (or `ClaimNextTask`) succeeds.
- An orchestrator's assignment still binds: `ReleaseTask` on it is
  `PermissionDenied`, with a message saying to ask for it to be unassigned.
- `ReleaseTask` takes `tasks:write`, like `ClaimTask` — it is that grant's
  exact inverse and can only ever affect the caller's own row.
- A claim made before this migration whose `claimed` activity row was never
  written stays `assign` and cannot be self-released; a human can still
  unassign it. That gap closes as those tasks finish.
- Still foreclosed (ADR-0017): claim TTLs and automatic expiry. Release is
  voluntary.
