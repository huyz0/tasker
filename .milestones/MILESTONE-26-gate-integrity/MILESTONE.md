---
id: M26
title: Gate Integrity
status: in-progress
goal: Every quality gate this repository relies on actually covers what its own documentation says it covers — the agent-scope sweep enumerates every registered service, the migration ledger cannot apply out of order, and the backend's types are checked by `moon check --all` the way the GUI's already are.
depends_on: []
surfaces: [backend, specs]
exit_criteria_met: false
started_at: 2026-08-23
completed_at: null
---

# M26 — Gate Integrity

## 1. Goal

This repository's quality story is gates that fail loudly. A holistic review
found three places where a gate exists, is documented as authoritative, and
does not actually cover what it claims:

1. **The agent-scope sweep's completeness guarantee is false.**
   `scopes.ts` states *"Absence means denial. A method not listed here cannot
   be called with a token at all… `agent-scope-sweep.test.ts` enumerates every
   method on every handler."* It enumerates every method on every **listed**
   handler, and its handler map is hand-assembled. Four of the twenty-one
   registered services are missing from it. Three are harmless (`teams`,
   `roles`, `audit` call `requireUser` throughout, so agents are structurally
   denied). The fourth is not: `EventService.subscribeEvents` accepts an agent
   principal and hands back its whole organization's live event feed with **no
   scope check of any kind**.

2. **The migration ledger can silently skip a migration.**
   `applyEmbeddedMigrations` selects pending work with `m.when > lastAppliedAt`.
   `0044_audit_log` (SQLite) and `0031_audit_log` (MySQL) carry `when` values
   roughly nine days *earlier* than their own predecessors. A database that
   reached `0043`/`0030` and then upgraded never creates `audit_log` at all,
   and fails later at runtime in the projector rather than loudly at migration
   time.

3. **The backend has no `typecheck` task.** `apps/gui/moon.yml` has one;
   `apps/backend/moon.yml` does not, so `moon check --all` cannot see backend
   type errors. M08 recorded roughly 35 of them as a known gap. There are now
   130. Nothing watches it, so it grows.

The theme is one thing, not three: a gate that is trusted and does not cover
its stated surface is worse than no gate, because it is cited as evidence.

## 2. Why Now

Requested via `/goal` immediately after a holistic scope review, which found
these three by verifying claims against code rather than reading the ledger.
Every numbered milestone through M25 is `done` and the roadmap's Phase 1 and
Phase 2 are fully delivered, so no feature work is blocked behind this. Each
of the three was independently confirmed at the source before planning: the
sweep's handler map versus the service registrations in `index.ts`; the
journal `when` values against `embeddedMigrations.ts`'s filter; and a real
`tsc --noEmit` run.

Sequenced by explicit user priority, the same way M21–M25 were.

## 3. Exit Criteria

- [ ] An agent token cannot open the live event feed unless it holds the
      scope that grants it — proven by a test asserting a token without that
      scope is refused, and one holding it is admitted.
- [ ] An agent subscribed to the feed receives an event only if its scopes
      would have let it read that entity through an ordinary RPC — proven by
      a test that subscribes with a narrow scope set and asserts the
      out-of-scope subjects never arrive.
- [ ] `agent-scope-sweep.test.ts` fails if a service registered in
      `index.ts` is absent from its handler map — proven by temporarily
      removing one entry and observing the failure, then restoring it. All
      twenty-one registered services are covered.
- [ ] Every journal entry's `when` is strictly greater than that of the entry
      before it, in both dialects — enforced by a test that fails on
      inversion, demonstrated by reverting the fix and watching it fail.
- [ ] A database migrated only as far as `0043`/`0030` applies `audit_log`
      when it next boots — proven directly, not inferred from the journal.
- [ ] A database that **already** skipped `audit_log` and went on to apply
      `0045`–`0047` recovers it. Correcting the `when` alone cannot do this:
      that database's watermark is now `0047`'s, which is past the corrected
      slot, so the fix is invisible to it. Proven by building exactly that
      database, booting it, and finding `audit_log` present.
- [ ] `moon run backend:typecheck` exists, runs in `moon check --all` and in
      CI, and passes with zero errors.
- [ ] `moon check --all` clean, and the full backend suite still green.

## 4. Scope

**In Scope**: a scope requirement and per-subject filtering for the live
event feed; registering the four missing services in the agent-scope sweep
and making that map self-checking against `index.ts`; correcting the two
inverted journal `when` values and adding a monotonicity guard; a `*.sql`
module declaration plus the remaining backend type fixes and the
`typecheck` task and its CI wiring; ADR-0023; the spec folder.

**Out of Scope** (recorded, each with its reason): documentation drift in
`README.md`, `.specs/product/architecture.md` and `.specs/design/NAVIGATION.md`
— real and separately verified (the README still says the GUI is not
real-time, teams have no table, and the single binary is future work; all
three shipped), but it is a different kind of work and deserves its own
round rather than being smuggled in here. The unmeasured concurrency claim
(20,000 concurrent agents has never been simulated; only data scale has
been measured) — a genuine gap, milestone-sized, and not a gate failure.
The ~60 other named deferrals inventoried during the same review, including
the two whose blockers have since cleared (self-service password reset, now
that SMTP exists; claim TTL/auto-expiry, now that M25 built the detector).

## 5. Task Breakdown

- [x] **M26-T01** — Save the design record: spec folder (the three findings,
      how each was verified, and the reasoning) and `ADR-0023` deciding how
      an agent principal may consume the live event feed — naming the
      rejected alternatives (close it to agents entirely; reuse an existing
      broad scope; a coarse feed-wide scope with no per-subject filtering)
      and what each would cost. No product code.
      - Files: `.specs/specs/2026-08-23-1900-gate-integrity/*`,
        `.specs/adr/ADR-0023-*.md`,
        `.milestones/MILESTONE-26-gate-integrity/*`, `.milestones/STATE.md`
      - Verify: files exist; `moon run tasker:docs-lint` passes.

- [x] **M26-T02** — Close the event-feed scope bypass: add the feed's scope
      to `AGENT_SCOPES`, require it in `subscribeEvents`, and filter delivery
      per subject in `eventScope.ts`'s existing `shouldDeliver` choke point so
      an agent sees an event only where its scopes would have permitted the
      equivalent read. Register `events` in `AGENT_RPC_SCOPES`.
      - Files: `apps/backend/src/lib/scopes.ts`,
        `apps/backend/src/modules/events/events.handler.ts`,
        `apps/backend/src/modules/events/eventScope.ts` (+ their tests)
      - Verify: `moon run backend:test` — a scopeless token refused, a
        scoped token admitted, and out-of-scope subjects never delivered.

- [ ] **M26-T03** — Make the sweep self-covering: add `events`, `teams`,
      `roles` and `audit` to the handler map, and add an assertion that the
      map covers every service registered in `index.ts`, so the next handler
      cannot be silently unswept. Prove the assertion bites by removing an
      entry and observing the failure.
      Two constraints decide how this can be written. `index.ts` runs at
      module scope — it parses flags, opens `.data/`, connects NATS and
      starts a server — so the sweep cannot import it and must read it as
      text, keying on the `createXHandler` factory identifiers that appear
      in both files. And `subscribeEvents` is an async generator: calling it
      returns a generator and runs no body, so the sweep's existing
      `await handler[method](...)` would assert nothing at all — streaming
      methods must be driven with `.next()`. The sweep builds handlers with
      `nc = null`, so T02's scope check must also sit ahead of the
      broker-unavailable throw, or the sweep sees `Unavailable` where it
      expects `PermissionDenied`.
      - Files: `apps/backend/src/lib/agent-scope-sweep.test.ts`
      - Verify: `moon run backend:test`; the deliberate-break check recorded
        in the journal.

- [ ] **M26-T04** — Fix the migration `when` inversion in both dialects, add
      a guard test asserting each journal is strictly increasing by `when`,
      and add a repair migration at the head of each journal that creates
      `audit_log` if it is missing. The repair is what reaches the database
      that already skipped it — that one's watermark is `0047`'s, so a
      corrected `when` in an earlier slot can never be selected for it. The
      repair is idempotent (`CREATE TABLE IF NOT EXISTS`), so it is a no-op
      on every healthy database, including a fresh one.
      - Files: `apps/backend/drizzle-sqlite/meta/_journal.json`,
        `apps/backend/drizzle-mysql/meta/_journal.json`, a new repair
        migration per dialect, `src/db/embeddedMigrations.generated.ts`,
        `apps/backend/src/db/embeddedMigrations.test.ts`
      - Verify: `moon run backend:test`; the guard demonstrated failing on
        the un-fixed journal; both the stopped-at-`0043` case and the
        already-skipped-and-moved-on case built and booted for real.

- [ ] **M26-T05** — Give the backend a `typecheck` gate: declare the `*.sql`
      module shape the generated migration index imports (83 of the 130
      errors), fix the rest, add the `typecheck` task to
      `apps/backend/moon.yml`, and run it in CI's backend job (where
      `moon run backend:test` already runs — not beside the GUI's, which is
      a different job).
      - Files: `apps/backend/moon.yml`, `.github/workflows/ci.yml`, a new
        `*.sql` declaration file, and whichever sources carry real errors
      - Verify: `moon run backend:typecheck` exits zero; `moon check --all`
        includes it.

- [ ] **M26-T06** — Full verification and closeout: re-verify every exit
      criterion, `moon check --all`, and close the milestone.
      - Files: `.milestones/*`
      - Verify: `moon check --all` clean; each criterion stated as
        test-proven or observed.

## 6. Verification

```bash
moon check --all
moon run backend:typecheck
```

## 7. Risks

- **Changing a `when` value on an already-applied migration.** A database
  that has applied everything records the *maximum* `created_at`, which is
  the newest migration's, not `audit_log`'s — so raising `0044`/`0031` into
  its correct slot cannot cause a re-run anywhere. T04 verifies this
  directly rather than reasoning about it, because a migration ledger is
  exactly the wrong place to be approximately right.
- **Per-subject filtering silently over-restricting the GUI.** The filter
  must apply to agent principals only; a human session's feed is unchanged.
  The existing `eventScope` tests are the regression guard and must pass
  untouched.
- **Typecheck fixes changing runtime behaviour.** A type error is sometimes
  load-bearing. Fixes stay type-level (declarations, assertions at genuine
  boundaries) and the full suite must stay green; anything that would need a
  behaviour change gets recorded rather than quietly altered.
