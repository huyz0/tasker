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

## M26-T03 — Make the agent-scope sweep self-covering

- **Status**: done
- **Date**: 2026-08-23
- **Changed**: `agent-scope-sweep.test.ts` — added `events`, `teams`, `roles`
  and `audit` to the handler map (the last three into `NO_AGENT_ACCESS`,
  since `requireUser` refuses agents outright with `PermissionDenied`, which
  is the strictest classification available and therefore the honest one);
  sample requests for all four; a new `invoke()` helper that drives async
  generators; and the self-coverage assertion.
- **Verified**: 11 pass; full backend suite 1806 pass / 0 fail. Both new
  guards proven to bite by deliberate break, not assumed:
  - removing the `events` entry → *"registered in index.ts but absent from
    this sweep: Events"*, then restored.
  - reverting `invoke()` to the pre-M26 `await handler[method](...)` →
    *"events.subscribeEvents allowed without events:read"*, then restored.
- **Notes**: the second break is the one worth recording. An async generator
  returns its generator object and runs **no body**, so the old call form
  asserted nothing at all about any streaming method. Had T03 shipped without
  `invoke()`, the sweep would have produced exactly that false red on the
  method M26-T02 had just secured — and the natural reading of a red like
  that is "the sweep can't handle this handler, exclude it", which would have
  reinstated the hole this milestone exists to close.
  The self-coverage assertion keys on the `createXHandler` factory identifier
  rather than the service name, because service names do not map 1:1 onto the
  map's keys (`TaskService` → `taskManagement`, `TaskTypeService` → `tasks`)
  — a name table would be another hand-maintained list free to drift the same
  way. `index.ts` is read as text because it runs at module scope; importing
  it would start a server.
- **Next**: M26-T04 (migration `when` inversion + repair migration).

## M26-T04 — Migration `when` inversion, repair migration, monotonicity guard

- **Status**: done
- **Date**: 2026-08-23
- **Changed**: corrected `0044_audit_log` (sqlite) and `0031_audit_log`
  (mysql) from `1787232705138`/`…139` to `1788050000000`, between their real
  neighbours; added `0048_repair_audit_log.sql` / `0035_repair_audit_log.sql`
  at the head of each journal; regenerated the embedded index (49 sqlite / 36
  mysql); a monotonicity guard in `embeddedMigrations.test.ts`; and a new
  `auditLogRepair.migration.test.ts` that builds the damaged databases for
  real.
- **Verified**: red first — the guard named both inversions before the fix.
  Full backend suite 1812 pass / 0 fail. The recovery tests reproduce the
  original defect end to end against real SQLite: reach 0043, upgrade to the
  code as it shipped before M26, and exactly **3** migrations apply
  (0045–0047) while `audit_log` is silently skipped; then upgrade to this
  task's code and the repair lands it. A fourth test asserts the repaired
  database's `audit_log` DDL and index set are byte-identical to a healthy
  one's. Live MySQL: full chain applies to a fresh database; dropping
  `audit_log` and running the repair alone recreates it with all four indexes
  and the FK; a second run is a clean no-op.
- **Notes**: two things worth carrying forward.
  1. **The correction alone would have fixed nothing already broken.** A
     database that skipped 0044 went on to apply 0045–0047, so its watermark
     is `1788300000000` — past any slot 0044 can legally occupy, since the
     correction must place it *below* 0045. This is why the repair migration
     exists, and it is the finding a docs review caught before the code was
     written rather than after.
  2. **My own first version of the guard passed by accident.** It sorted on
     `m.idx`, and `EmbeddedMigration` has no such field — every comparison
     was `NaN`, the sort was a no-op, and it happened to compare array order,
     which is journal order. It caught the real inversions anyway, which is
     exactly how a broken guard survives review. Rewritten to compare
     consecutive array elements deliberately, with a comment saying why that
     is journal order and citing the test above it that pins the
     correspondence. The same bad assumption had silently made
     `through(43)` select *zero* migrations, which is what surfaced it.
- **Next**: M26-T05 (backend typecheck gate).

## M26-T05 — Backend typecheck gate

- **Status**: done
- **Date**: 2026-08-23
- **Changed**: new `src/types/sql-modules.d.ts` declaring the `*.sql` modules
  the generated migration index imports with Bun's `{ type: 'file' }`
  attribute; 47 real type fixes across 11 files; a `typecheck` task in
  `apps/backend/moon.yml` mirroring `gui:typecheck`; and
  `moon run backend:typecheck backend:test` in CI's backend job.
- **Verified**: `bunx tsc --noEmit` **0 errors**, down from 130. Full backend
  suite still 1812 pass / 0 fail — no fix changed behaviour. The gate proven
  to bite: appending `const x: number = 'not a number'` to `lib/logger.ts`
  made `moon run backend:typecheck` fail naming the line; restored, green.
  `moon query tasks` classifies it `type=test, runInCI=true`, which is what
  puts it inside `moon check --all` and the pre-commit hook, not just CI.
- **Notes**: the distribution was the story — **83 of the original 130 errors
  were one `.d.ts` away**, all `TS2307` on the migration index's `*.sql`
  imports, which `tsc` cannot resolve because the import attribute is a
  Bun-ism. That is not type debt at all, and it is most of why this gate
  looked expensive enough to keep deferring since M08.
  **The gate found a real defect within minutes of existing**, which is this
  milestone's whole thesis: `listRoles` and `listGrants` were calling
  `executePaginatedQuery` *without* the required `select`. That property is
  required deliberately — `query-builder.ts`'s own docblock records that when
  it was optional, omitting it meant `SELECT *`, and `SELECT *` on
  `artifacts` shipped the base64 content of every row (2,008 KB to render 50
  file names, M07-T01). Both handlers had been silently bypassing that
  allowlist because nothing type-checked them. Fixed runtime-equivalently:
  every column of `roles` and of `grants` enumerated, verified complete and
  identical across both dialect schemas, so the rows returned are byte-for-
  byte what the `SELECT *` produced. Narrowing them further is a real
  behaviour change and deliberately left for its own commit.
  Also live-again rather than changed: `reports.handler.ts` passed Zod an
  `errorMap` key that Zod v4 renamed to `error`, so a custom validation
  message had been silently dead. The gRPC code is unchanged and both tests
  covering it assert on the code, not the message.
- **Next**: M26-T06 (verification and closeout).
