# M25 — Progress Journal

Append-only. Newest entry at the bottom. One entry per task attempt.

## M25-T01 — Save the design record (spec, ADR-0022)

- **Status**: done
- **Date**: 2026-08-23
- **Approach**: Write the spec folder from the reviewed final design
  (shape.md carrying the design and its rationale, references.md
  preserving the review verdict that corrected the draft, plan.md pointing
  at the milestone tasks, standards.md naming what binds), plus ADR-0022
  (recipient resolution, digest-not-per-task, dedup table with NOT NULL
  anchor, publishing the domain event despite deferring the GUI surface).
  Docs only — no product code.
- **Changed**: `.specs/specs/2026-08-23-1430-stalled-claim-alerting/`
  (shape.md, references.md, plan.md, standards.md), `.specs/adr/ADR-0022-*.md`,
  this MILESTONE.md, STATE.md ledger + roadmap.
- **Verified**: all files exist; `moon run tasker:docs-lint` clean (254
  files). A dedicated review subagent checked the docs for internal
  consistency and spot-checked five load-bearing code claims before this
  commit — found **one blocker and six fixes**, all applied: (1, BLOCK)
  the domain event's payload would have named the field `agentId`, which
  `auditProjector.ts`'s `extractActor` reads before its `'system'`
  fallback — misattributing the event to the agent and failing exit
  criterion 8 outright; renamed to `stalledAgentId` throughout, and split
  the criterion into a unit-testable payload-shape half (T04) and a
  live-audit_log half that needs a real broker (moved to T05, which now
  boots the `full` compose profile, not just `mail`). (2) the dedup
  anchor's fallback was conflated with the detector's wider `silentSince`
  chain — fixed to the narrower `maxDate(claimed,assigned) ?? createdAt`,
  since keying on `silentSince` would re-alert a still-genuinely-stalled
  claim on its very next sweep. (3) the cited IN-list-fix precedent
  (`unclaimed`'s rewrite) doesn't actually transfer to a query with no
  project to scope by — corrected to name the real global-scale shape
  (a join + `GROUP BY task_id` aggregate). (4) ADR undercounted its own
  decisions ("four", contains five). (5) Decision 5 was missing the
  Options/Consequences shape every other decision has — added. (6)
  `ADMIN_ROLES` is module-private in `authz.ts` — T04 now exports it.
  Several nits fixed too: inverted goal wording, an overclaimed "no
  request in flight" precedent softened to what's actually true, wrong
  file-path attributions, a missing `afterHours` param, STATE.md added to
  this task's Files list, exit criterion 6 split into an index-use proof
  and a separate parameter-count proof (a query plan alone doesn't prove
  IN-list absence).
- **Notes**: this review caught what would have been a real, silent defect
  in a client-facing (well, audit-facing) correctness property — worth
  the second look before any code exists.
- **Next**: M25-T02 (stalled_claim_alerts schema + migrations + purge cascades).

## M25-T02 — Schema: stalled_claim_alerts + migrations + purge cascades

- **Status**: done
- **Date**: 2026-08-23
- **Approach**: Add the table to both schema modules exactly as ADR-0022
  specifies (anchor_at NOT NULL — the fixed dedup key), generate per-
  dialect migrations, regenerate embedded migrations, add explicit deletes
  to purgeTaskCascade/purgeProjectCascade, verify the unique index
  actually rejects a duplicate (task_id, anchor_at) pair, verify against
  live MySQL.
- **Changed**: `stalledClaimAlerts` table in both schema modules
  (`anchor_at` NOT NULL — the fixed dedup key, doc-commented with the
  ADR-0022 rationale), `drizzle-sqlite/0047` + `drizzle-mysql/0034` DDL,
  regenerated embedded migrations (48/35), explicit deletes in
  `purgeTaskCascade`/`purgeProjectCascade`, new
  `stalledClaimAlerts.migration.test.ts` (5 tests incl. a proven unique-
  constraint rejection: `UNIQUE constraint failed: stalled_claim_alerts.
  task_id, stalled_claim_alerts.anchor_at`), extended `cascadePurge.test.ts`.
- **Verified**: `moon check backend` green; backend:test 1734 pass; live
  MySQL via docker compose — migration applied, `SHOW CREATE TABLE`
  confirms the NOT NULL columns and the compound unique key.
- **Notes**: found and fixed a latent bug in M24-T03's own
  `taskActivity.migration.test.ts` as a byproduct — it asserted the
  backfill was the max-`when` migration by tag-exclusion, true only until
  a later migration existed (this one); changed to a `when`-ordering
  comparison so it stays correct regardless of what lands after it.
  Journal `when` hand-bumped to 1788300000000 (drizzle-kit's own stamp was
  smaller than the existing max, same gotcha M24-T03 already documented).
- **Next**: M25-T03 (extract findStalledCandidates into lib/).

## M25-T03 — Extract findStalledCandidates into lib/, global-scale-safe

- **Status**: done
- **Date**: 2026-08-23
- **Changed**: new `lib/stalledClaims.ts` (`findStalledCandidates` +
  exported `buildHeldTaskQuery` query builder, isStandalone-parameterized
  matching `taskActivity.ts`'s convention) + `.test.ts` (11 tests, 100%
  coverage); `reports/exceptions.ts` rewired onto it — the inline
  computation replaced by one call, wire mapping unchanged.
- **Verified**: `reports.test.ts` — the regression guard — passes with
  **zero edits** (24 tests, all 6 in the stalledClaims block unchanged);
  backend:test 1745 pass; `moon check backend` green. Scale proof measured
  directly: the global query's built SQL has **0 bound parameters**
  (project-scoped: 1) regardless of held-task count — proven against a
  505-task fixture across 5 projects, plus an `EXPLAIN QUERY PLAN`
  assertion confirming no `SCAN task_activity`.
- **Notes**: global path is one join (task_assignments → tasks → projects,
  left-joined to task_activity) with conditional aggregation
  (`MAX(CASE WHEN kind != 'created' THEN ...)` for last-signal,
  `MAX(CASE WHEN kind IN ('claimed','assigned') THEN ...)` for the anchor)
  in a single GROUP BY — never a driver-side IN-list of held task ids.
  Terminality preload batches by distinct *task type* (small, config-
  bounded), not by task. `openHeld`/`openNow` stays its own query in
  `exceptions.ts` (the detector was never meant to serve the scorecard's
  concerns) — one small accepted redundancy in exchange for a clean,
  zero-behavior-change extraction.
- **Next**: M25-T04 (recipient resolution, email, sweep, wiring).

## M25-T04 — Recipient resolution, email, digest sweep, wiring

- **Status**: done
- **Date**: 2026-08-23
- **Approach**: export ADMIN_ROLES from authz.ts; recipient resolution
  (task_reviewers -> org owner/admin fallback); a pure digest email
  template mirroring inviteEmail.ts; the sweep (mailer-enabled early exit,
  group-by-recipient, dedup writes only for itemized tasks, publishes
  domain.task.stalled with stalledAgentId not agentId); the
  STALLED_ALERT_AFTER_HOURS env var; third setInterval block in index.ts.
  TDD, injected MailTransport, no real socket.
- **Changed**: exported `ADMIN_ROLES` from `authz.ts`; new
  `resolveTaskAlertRecipients.ts` (task_reviewers -> org owner/admin
  fallback, dedup by email, non-null-email filter); new
  `stalledClaimAlertEmail.ts` (pure template mirroring inviteEmail.ts,
  digest-shaped, states the reviewer/admin reason, explicit
  unassign-or-reassign-not-comment guidance); new `stalledClaimAlerts.ts`
  (the sweep: mailer.enabled early exit before any query, dedup keyed on
  (taskId, anchorAt), group-by-recipient digests capped at
  DIGEST_TASK_LIMIT=20 with overflow left eligible for a later sweep,
  publishes `domain.task.stalled` with `stalledAgentId` — never `agentId`
  — each write/publish isolated in its own try/catch, per-recipient-group
  isolation mirroring retentionSweep.ts); third hourly `setInterval` in
  `index.ts`, no sweep at boot; `stalledClaims.ts` additively extended
  with `anchorAt`/`silentSince` fields (the sweep's own dedup needs the
  exact anchor the detector already computes internally — exposing it
  changes nothing for its existing consumer, `reports/exceptions.ts`,
  confirmed by its unmodified suite still passing).
- **Verified**: 49 new tests (resolveTaskAlertRecipients 6,
  stalledClaimAlertEmail 13, stalledClaimAlerts 15, stalledClaims +3);
  backend:test 1783 pass; `moon check backend` green. Payload shape
  observed exactly: `{orgId, projectId, taskId, stalledAgentId,
  hoursSilent}` with `agentId` proven absent; a second test feeds that
  exact shape to `auditProjector.ts`'s `extractActor` and confirms
  `actorType: 'system'` — both halves of exit criterion 8's payload
  proof now hold (the live audit_log half is still T05's job).
- **Notes**: `STALLED_ALERT_AFTER_HOURS` reads `process.env` lazily per
  sweep call (matching `authz.ts`'s `isStandalone()` precedent) rather
  than freezing at import time, specifically so exit criterion 10's
  env-var test is possible within one process. `publishDomainEvent`
  already null-safes `nc` internally; the sweep's own try/catch around it
  is defense-in-depth, not load-bearing.
- **Next**: M25-T05 (live verification, docs, closeout).
