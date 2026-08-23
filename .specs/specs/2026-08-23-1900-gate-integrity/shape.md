# Gate Integrity — Shaping Notes

## Scope

Three defects, one theme: a gate that is trusted, is cited as evidence, and
does not cover what it claims. Backend-and-specs only; no product capability
changes for a human user.

## How these were found

A holistic "what's left?" review after M25 closed, run by verifying claims
against code rather than reading the ledger. Every numbered milestone was
`done` and the roadmap fully delivered, so the interesting question was not
"what is unbuilt" but "what is believed that is not true." All three findings
below were confirmed at the source before this milestone was planned — none
came from a document.

## The three findings

**1. The agent-scope sweep's completeness guarantee is false.** Verified by
diffing the twenty-one services registered in `index.ts` — eighteen through
`router.service(...)` plus `search`, `dashboard` and `reports`, which take
the router and register themselves — against the hand-assembled `handlers`
map in `agent-scope-sweep.test.ts`:
`events`, `teams`, `roles` and `audit` are absent. Three are safe by
construction (`requireUser` throughout). `EventService.subscribeEvents` is
not — it takes `requirePrincipal`, and `events.handler.ts:52` hands an agent
its whole organization's feed with no scope consulted. Design decision and
its alternatives: `ADR-0023`.

Note the two registration forms, because they decide how T03's assertion
must be written: matching only `router.service(` finds eighteen, and since
those other three are already in the handler map, such an assertion would
pass while being weaker than it claims — the precise failure class this
milestone exists to remove. The robust key is the `createXHandler` factory
identifier, which appears literally in both files.

The root cause is worth stating separately from the symptom: the guarantee
depends on a list someone must remember to extend. That is why M26-T03 makes
the map assert its own coverage rather than merely adding four entries — the
next handler must not be able to slip through the same way.

**2. The migration ledger can silently skip a migration.** Verified by
reading the journals against `embeddedMigrations.ts:108`, which selects
pending work with `m.when > lastAppliedAt`. SQLite `0044_audit_log` carries
`when=1787232705138` against its predecessor's `1788000000000`; MySQL
`0031_audit_log` is the same nine-day inversion. A database that reached
`0043`/`0030` and then upgraded never creates `audit_log`, and fails later in
the projector rather than at migration time. Fresh installs are unaffected —
with no `lastAppliedAt`, everything runs — which is exactly why this survived
every green CI run.

The fix is two numbers. The deliverable is the guard: a test asserting each
journal is strictly increasing by `when`, so the class cannot return. This
was found once already (recorded during M24) and deliberately left; it does
not get cheaper.

**3. The backend has no `typecheck` task.** Verified against
`apps/backend/moon.yml` (nine tasks, no typecheck) versus `apps/gui/moon.yml`
(has one), and a real `tsc --noEmit` run: **130 errors**, against the roughly
35 M08 recorded as a known gap. The growth is the argument — this is the only
surface in a repository built on loud gates that has none, so it drifts in
one direction.

The distribution matters for sizing and was measured rather than guessed: 83
of the 130 are a single class — `TS2307` on the generated migration index's
`import … with { type: 'file' }` statements, which `tsc` cannot resolve and
which a one-file module declaration fixes. 34 more are `unknown`-typed
objects in `auth.test.ts`. The genuine long tail is about a dozen, spread
thin. So the gate is far cheaper to close than the raw number suggests.

## Decisions

- **The event feed is gated, not closed.** M08's agent branch was deliberate;
  the bug is that nothing enforced a scope. Closing the feed to agents would
  reverse a design decision on the strength of a defect in its enforcement.
  See `ADR-0023` for the four options weighed.
- **The feed mirrors the read path.** An agent sees an event only where its
  scopes would have permitted the equivalent RPC read, and the subject→scope
  map is derived from `AGENT_RPC_SCOPES`' existing read methods rather than
  invented — so the two cannot drift into disagreeing.
- **Each fix ships with the guard that would have caught it.** A journal
  monotonicity test, a sweep self-coverage assertion, and a `typecheck` task
  in CI. Fixing the three instances without the three guards would leave the
  milestone's own thesis unimplemented.
- **Documentation drift is explicitly not in this milestone.** The same
  review found `README.md`, `architecture.md` and `NAVIGATION.md` describing
  a product several milestones behind — real, verified, and a different kind
  of work. Named as the natural next round rather than smuggled in here.

## Context

- **Visuals:** none — no GUI surface.
- **Milestone:** `.milestones/MILESTONE-26-gate-integrity/`
- **ADR:** ADR-0023 (agent access to the live event feed)
