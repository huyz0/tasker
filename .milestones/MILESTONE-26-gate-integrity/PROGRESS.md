# M26 — Progress Journal

Append-only. Newest entry at the bottom. One entry per task attempt.

## M26-T01 — Save the design record (spec, ADR-0023)

- **Status**: done
- **Date**: 2026-08-23
- **Approach**: Write the spec folder from the three verified findings and
  `ADR-0023` deciding how an agent principal consumes the live event feed.
  The ADR's subject→scope table is derived from `AGENT_RPC_SCOPES`' existing
  read methods rather than invented, so the feed and the request path cannot
  drift. Docs only — no product code.
- **Changed**: `.specs/specs/2026-08-23-1900-gate-integrity/` (shape.md,
  plan.md, standards.md), `.specs/adr/ADR-0023-*.md`, this MILESTONE.md,
  STATE.md ledger + roadmap.
- **Verified**: all files exist; `moon run tasker:docs-lint` clean. A review
  subagent checked internal consistency and independently re-verified every
  load-bearing claim against the code — the "absence means denial" quote, the
  21 registrations vs the sweep's 17, `events.handler.ts:52`, the
  requireUser-throughout status of teams/roles/audit, both journal `when`
  inversions, the moon.yml asymmetry, the 130/83/34 error split, and the
  ADR's whole subject→scope table (confirmed complete against every
  `domain.<family>.` literal published anywhere, and each "Mirrors" cell
  matching `AGENT_RPC_SCOPES`). It returned **one block, four fixes and
  seven nits**, all applied:
  - **(BLOCK)** the migration fix as planned could not repair the database
    it was written for. One that skipped `0044` went on to apply `0045`–
    `0047`, so its watermark is `1788300000000` — past any corrected slot
    `0044` could occupy, since the correction must place it *below* `0045`.
    Raising the `when` fixes the future and reaches nothing already broken.
    T04 now also adds an idempotent repair migration at the head of each
    journal, and a new exit criterion proves it against exactly that
    database rather than the undamaged one.
  - **(fix)** ADR-0023 overstated the leak: the wire envelope is
    `{subject, orgId, projectId, occurredAt}` — no titles, no bodies, no
    entity ids. An unscoped token learns activity metadata, not content.
    Corrected in the Context, which also removes a self-contradiction with
    the Consequences section. The decision is unchanged.
  - **(fix)** `shape.md` said "twenty-one `router.service(...)`
    registrations" — there are eighteen, plus three that take the router and
    register themselves. Left uncorrected, an implementer matching
    `router.service(` would have written a self-coverage assertion that
    passes while being weaker than its own exit criterion claims: the exact
    failure class this milestone exists to remove.
  - **(fix)** two implementation constraints now named in T03, either of
    which would have cost a cycle to rediscover: `index.ts` runs at module
    scope so the sweep must read it as text, not import it; and
    `subscribeEvents` is an async generator, so the sweep's existing
    `await handler[method](...)` runs no body and asserts nothing unless
    driven with `.next()` — with T02's scope check required to sit ahead of
    the broker-unavailable throw, since the sweep builds handlers with a
    null connection.
  - **(nit→fix)** carved `domain.agent.token_*` out of the `agent` family:
    `agents:read` would otherwise grant, through the feed, the token
    visibility `listAgentTokens` categorically refuses — breaking the ADR's
    own absolutely-stated rule at family granularity.
  - Remaining nits applied: `SubscriptionScope`'s new field must be optional
    or every existing `eventScope` test breaks (now stated in standards.md
    as a design constraint rather than left as a trap); the backend
    typecheck belongs in CI's backend job, not beside the GUI's; a blank
    line was breaking the roadmap's M26 table row; and STATE.md's ledger
    total said "165 done" against an actual 207 — its parenthetical
    breakdown had silently omitted M08, M09, M11 and M12 (42 tasks).
- **Notes**: the blocker is the second time in three milestones that a
  review has caught a fix that would have closed a milestone with its own
  stated finding still live. Worth the pass every time.
- **Next**: M26-T02 (events:read scope + per-subject filtering).

## M26-T02 — events:read scope and per-subject filtering

- **Status**: done
- **Date**: 2026-08-23
- **Changed**: `events:read` added to `AGENT_SCOPES` and an `events` entry to
  `AGENT_RPC_SCOPES`; `subscribeEvents` now refuses an agent token that does
  not hold it, **ahead of** the broker probe; `eventScope.ts` gains an
  optional `agentScopes` on `SubscriptionScope`, a `SUBJECT_FAMILY_SCOPE` map
  derived from the existing read RPCs, an `AGENT_NEVER_DELIVERED` carve-out
  for `domain.agent.token_*`, and `agentMayReceive` applied as a fourth rule
  in `shouldDeliver`. Also brought two hand-maintained mirrors of the scope
  vocabulary back in step: the GUI token picker and `docs/agent-integration.md`.
- **Verified**: red first — 5 of the 8 new `eventScope` tests failed before
  the filter existed. Full backend suite 1802 pass / 0 fail; GUI 1087 pass.
  The pre-existing `eventScope` tests pass untouched, which is the guard that
  a human session's feed is unchanged.
- **Notes**: three things worth carrying forward.
  1. The existing handler test "resolves an agent's org from its token"
     built a principal with **no `scopes` field at all**, so the first
     version of the check crashed on `undefined.includes` rather than
     denying. Made the check `?.`-safe — a malformed principal must be
     refused, not produce a 500 — and covered it with its own test rather
     than only fixing the fixture.
  2. Placement of the scope check ahead of the broker probe is load-bearing,
     not stylistic: the agent-scope sweep builds handlers with a null
     connection, so a check after it would surface `Unavailable` where the
     sweep expects `PermissionDenied` — and T03 depends on that.
  3. **A third instance of this milestone's own theme, found while working:**
     the GUI's `SCOPES` array had never gained `memory:read`/`memory:write`
     from M21, so an operator could not grant the memory scopes from the
     Agents screen at all — the backend vocabulary and its GUI mirror had
     silently drifted for five milestones. Fixed alongside `events:read`.
- **Next**: M26-T03 (make the sweep self-covering).
