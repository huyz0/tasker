---
id: M25
title: Proactive Alerting for Stalled Claims
status: in-progress
goal: A human with a task_reviewers role (falling back to an org owner/admin) receives one digest email per sweep naming every one of their newly-stalled agent-claimed tasks, with no deployment lacking SMTP paying any cost for it and no deployment ever emailing its entire historical backlog in one run.
depends_on: []
surfaces: [backend, specs]
exit_criteria_met: false
started_at: 2026-08-23
completed_at: null
---

# M25 — Proactive Alerting for Stalled Claims

## 1. Goal

M24 built `/reports`, which detects a stalled claim (an agent-held task
gone silent past a threshold) but only shows it to a human who happens to
open the screen — pull-based, against the product's own "step on the loop
only when necessary" framing. This milestone makes the same detection
proactive: a background sweep emails the humans already responsible for a
newly-stalled task, reusing M24's detection logic rather than
reimplementing it, and shipping as a digest so the very first run against
an existing deployment does not flood every recipient with its whole
history at once.

## 2. Why Now

Raised directly by the user via `/goal` immediately after a discussion
comparing Tasker's Reports screen to Linear and Monday — the gap named
there (pull-based dashboard vs. Monday's contextual-alert direction) is
real and specifically named as a candidate for the next milestone in that
same conversation. No dependency on any `todo` milestone; every numbered
milestone in the ledger is `done`. Sequenced by explicit user priority, the
same way M21–M24 were.

The design was drafted, then reviewed once by a dedicated subagent against
the actual code before planning (preserved in the spec folder) — the
review found and fixed three load-bearing defects the draft would have
shipped with: a NULL-key bug in the dedup table that would have deduped
nothing for any claim predating activity collection; the exact IN-list
scale problem M24-T06 already found and fixed on a sibling query,
reintroduced by running the same query globally instead of per-project;
and, the most consequential, the missing first-run digest — without it,
the very first sweep against a live deployment emails every stalled claim
ever accumulated, which is the most likely way this feature gets disabled
on day one. All three are designed out before any code is written, per the
task breakdown below.

## 3. Exit Criteria

- [ ] A fixture with several stalled claims across two distinct recipients
      produces exactly two emails (one digest per recipient), each listing
      every one of that recipient's stalled tasks up to the digest cap,
      with a "+N more" line when capped — proven by an injected-transport
      test, no real SMTP socket.
- [ ] Re-running the sweep immediately afterward with no state change sends
      zero further emails (dedup holds); a fresh claim on a previously
      alerted, now-resolved task becomes eligible again (dedup keys on the
      claim's anchor, not the task).
- [ ] A claim predating activity collection (no `claimed`/`assigned` row —
      only a `created` row) is still deduped correctly on its second sweep
      — the regression the NULL-key bug would have caused, proven with a
      dedicated test.
- [ ] The recipient chain resolves `task_reviewers` first, falling back to
      the org's `owner`/`admin` members only when the task has no
      reviewers, filtered to non-null email; every sent email states which
      of the two reasons the recipient received it.
- [ ] `!mailer.enabled` short-circuits the sweep before any database query
      runs — proven by asserting no query executes when disabled, not just
      that no email is sent.
- [ ] The shared detector, called with no `projectId`, returns candidates
      across multiple projects/orgs correctly, using a join-based
      `GROUP BY task_id` aggregate rather than a driver-side IN-list over
      held task ids — proven two ways: an `EXPLAIN QUERY PLAN` assertion
      (mirroring `indexCoverage.test.ts`'s existing convention) showing the
      query uses the `task_activity` indexes rather than a full scan, and a
      direct assertion on the built SQL/bound-parameter count showing it
      does not grow with the number of held tasks — a fixture of 500+ held
      tasks proves correctness at that size; the parameter-count assertion
      is what proves the shape itself cannot blow up at the 30k+-task scale
      named in this milestone's Risks section, without needing a fixture
      that large.
- [ ] `reports/exceptions.ts`'s existing stalled-claims panel is rewired
      onto the shared detector with its behavior unchanged — the existing
      M24 report test suite passes with zero modifications.
- [ ] `domain.task.stalled` is published per alerted task with an explicit
      `orgId` and the claimed agent carried as `stalledAgentId` — **not**
      `agentId`, which `consumers/auditProjector.ts`'s `extractActor` would
      read first and misattribute the event to the agent instead of the
      system that actually raised it. Proven two ways: a unit test passing
      the exact payload shape to `extractActor` directly, asserting it
      resolves `actorType: 'system'`; and, in whichever task boots the real
      consumers process against a live broker for its own verification
      (T05's Mailpit session, extended to also start `consumers/index.ts`),
      a live observation that the row lands in `audit_log` as `'system'`.
- [ ] Purging a task or a project leaves zero orphaned
      `stalled_claim_alerts` rows — proven by cascade tests, the same
      discipline ADR-0020 established for `task_activity`.
- [ ] `STALLED_ALERT_AFTER_HOURS` is independently configurable from the
      report panel's own threshold (env var, defaulting to the same value)
      — proven by a test that sets it differently and observes a different
      alert boundary than the report would show.
- [ ] `moon check --all` clean; a real local Mailpit run (`docker compose
      --profile mail up -d mailpit`) shows an actual digest email arriving
      with the right subject, recipient, and itemized task list.
- [ ] `findStalledCandidates`'s reported `hoursSilent`/`anchorAt`/
      `silentSince` are correct against a **real, non-UTC-hosted MySQL
      server** — not just against SQLite or a mocked `db.select` — proven
      by a unit test that reproduces mysql2's actual return shape for a
      conditional `MAX(CASE WHEN ...)` aggregate (a plain datetime string
      with no timezone marker) and a live re-run against a real MySQL
      instance with the host process in a non-UTC timezone.

## 4. Scope

**In Scope**: `stalled_claim_alerts` table (both dialects, migration,
purge-cascade integration); a shared `findStalledCandidates` detector in
`lib/`, dialect-branched like every other `lib/` module, parameterized by
optional `projectId` and `limit`, returning each candidate's `orgId`;
rewiring `reports/exceptions.ts` onto it with unchanged behavior; recipient
resolution (`task_reviewers` → org owner/admin fallback); a digest email
template (`stalledClaimAlertEmail.ts`, mirroring `inviteEmail.ts`'s pure-
template convention); the sweep function and its `setInterval` wiring in
`index.ts`; the `STALLED_ALERT_AFTER_HOURS` env var; publishing
`domain.task.stalled` per alerted task; ADR-0022; the spec folder
recording this design and the review that shaped it.

**Out of Scope** (recorded, each with its reason): a GUI notification/bell
surface (the event now flows for a future one to consume; the surface
itself is separate frontend work — new component, read/unread state, an
`eventQueryKeys` mapping); per-user notification preferences beyond the
"why you got this" line in the email body; project "watchers" as a
first-class concept; an `agents` owner/operator column (would materially
improve recipient resolution — named for a future milestone, not guessed
around); Slack/webhook delivery channels; pruning `stalled_claim_alerts`
(growth accepted as small — one tiny row per alert, alerts are infrequent
by construction).

## 5. Task Breakdown

- [x] **M25-T01** — Save the design record: spec folder (the problem, the
      v1 draft, the review that corrected it, the final design and its
      rationale), `ADR-0022` (recipient resolution: two-tier
      reviewers-then-admins, not three; digest not per-task email; the
      dedup table and its NOT-NULL anchor fix; publishing the domain event
      despite deferring the GUI surface — each naming the alternative
      considered and its cost), this `MILESTONE.md` + `PROGRESS.md`.
      - Files: `.specs/specs/2026-08-23-*-stalled-claim-alerting/*`,
        `.specs/adr/ADR-0022-*.md`,
        `.milestones/MILESTONE-25-stalled-claim-alerting/*`,
        `.milestones/STATE.md`
      - Verify: all named files exist; `moon run tasker:docs-lint` passes.

- [x] **M25-T02** — Schema: `stalled_claim_alerts` (id, task_id FK,
      anchor_at timestamp **NOT NULL**, alerted_at timestamp, unique
      (task_id, anchor_at)) in both `schema.sqlite.ts`/`schema.mysql.ts`;
      per-dialect migrations; regenerate embedded migrations; explicit
      deletes added to `purgeTaskCascade`/`purgeProjectCascade` (no FK
      cascades exist anywhere in this codebase — the ADR-0020 discipline).
      - Files: `apps/backend/src/db/schema.sqlite.ts`, `schema.mysql.ts`,
        new `drizzle-sqlite/*_stalled_claim_alerts.sql`,
        `drizzle-mysql/*_stalled_claim_alerts.sql`,
        `src/db/embeddedMigrations.generated.ts`, `src/lib/cascadePurge.ts`
      - Verify: `moon run backend:test` (migration + cascade tests, incl.
        one asserting the unique index actually rejects a duplicate
        (task_id, anchor_at) pair — proving NOT NULL closes the dedup
        hole); live MySQL migration check via docker compose.

- [x] **M25-T03** — Extract `findStalledCandidates` into `lib/` (dialect-
      branched via `STANDALONE === 'true'`, not the reports module's
      sqlite-only shortcut), parameterized by optional `projectId`/`limit`,
      `afterHours`, returning `orgId` per candidate; the global (no
      `projectId`) query path never builds a driver-side IN-list over held
      task ids — the class of bug M24-T06 already fixed once on the
      sibling `unclaimed` query, whose own fix (a project-scoped grouped
      aggregate) doesn't transfer directly since there is no project to
      scope by here. Instead: a join from `task_assignments` (agent-held
      tasks) into a `GROUP BY task_id` aggregate over `task_activity`,
      resolving "held" and "last signal per task" in one indexed pass.
      Rewire `reports/exceptions.ts` onto the shared helper with its
      existing `projectId`/`PANEL_LIMIT` call shape; the existing report
      suite passes unmodified as the regression guard.
      - Files: new `apps/backend/src/lib/stalledClaims.ts` (+ `.test.ts`),
        `apps/backend/src/modules/reports/exceptions.ts`
      - Verify: `moon run backend:test` — new detector tests (project-
        scoped and global, incl. the 500+-held-task scale fixture with an
        `EXPLAIN QUERY PLAN` assertion showing index use, plus a direct
        assertion on the built SQL/parameter count showing it does not grow
        with the number of held tasks) plus the untouched `reports.test.ts`
        suite green with zero edits.

- [x] **M25-T04** — Recipient resolution, email template, digest assembly,
      sweep, and wiring: export `ADMIN_ROLES` from `lib/authz.ts` (module-
      private today) and use it in `resolveTaskAlertRecipients(db,
      isStandalone, {taskId, orgId})` (task_reviewers → org owner/admin
      fallback, non-null email only); `stalledClaimAlertEmail.ts` (pure
      template, `escapeHtml`, digest-shaped: task list capped at
      `DIGEST_TASK_LIMIT` = 20 with "+N more", "(deleted agent)" fallback,
      states the reviewer-vs-admin reason, suggests Unassign/reassign as
      the action rather than inviting a reply-as-comment);
      `runStalledClaimAlertSweep` (early exit on `!mailer.enabled` before
      any query; groups candidates by recipient; writes
      `stalled_claim_alerts` only for tasks actually itemized in a sent
      digest, leaving overflow eligible for a later sweep; publishes
      `domain.task.stalled` per alerted task with explicit `orgId` and the
      claimed agent as `stalledAgentId` — **not** `agentId`, which would
      make `auditProjector.ts`'s `extractActor` misattribute the event to
      the agent instead of `'system'` — each isolated in its own
      try/catch); `STALLED_ALERT_AFTER_HOURS` env var (default = the
      report panel's `STALLED_AFTER_HOURS`); third `setInterval` block in
      `index.ts` alongside the retention-sweep and metrics-log ones,
      hourly, no sweep at boot (matching both existing blocks).
      - Files: new `apps/backend/src/lib/stalledClaimAlerts.ts` (+
        `.test.ts`), new `apps/backend/src/lib/stalledClaimAlertEmail.ts`
        (+ `.test.ts`), `apps/backend/src/index.ts`
      - Verify: `moon run backend:test` — the two-recipient/two-email
        fixture (exit criterion 1), immediate-rerun-sends-nothing (exit
        criterion 2), the pre-collection-claim dedup regression (exit
        criterion 3), the reviewer/admin-fallback resolution with the
        stated-reason assertion (exit criterion 4), the disabled-mailer
        no-query assertion (exit criterion 5), the domain-event payload
        assertion (exit criterion 8), the configurable-threshold assertion
        (exit criterion 10) — all via an injected `MailTransport`, no real
        socket.

- [x] **M25-T05** — Verification, docs, closeout: a real local run against
      the `full` compose profile (`docker compose --profile full up -d`
      — brings up mailpit **and** NATS/the consumers process together,
      needed because the domain-event half of exit criterion 8 can only be
      observed live in non-`STANDALONE` mode, where a broker actually
      exists), a fixture task aged past the threshold, confirming both: the
      digest arrives at `localhost:8025` with the right subject/recipient/
      itemized list, and the `domain.task.stalled` row lands in `audit_log`
      with `actorType: 'system'`; `docs/email.md` gains a short section
      naming the new email kind and `STALLED_ALERT_AFTER_HOURS`; full
      verification suite; re-verify every exit criterion; close the
      milestone.
      - Files: `docs/email.md`, `.milestones/*`
      - Verify: `moon check --all` clean; both the Mailpit arrival and the
        `audit_log` row observed directly, not inferred from passing tests.
        **Found live, not fixed here (see M25-T06)**: real emails reported
        "silent for 11 hours" against a true ~2h age — a timezone bug in
        MySQL's conditional-aggregation decode, invisible to every unit
        test because they mock `db.select` rather than exercising mysql2's
        real string-return shape.

- [x] **M25-T06** — Fix the MySQL timezone-unsafe aggregate decode T05's
      live verification found: `lib/stalledClaims.ts`'s `buildHeldTaskQuery`
      uses `MAX(CASE WHEN ... THEN occurredAt END)` conditional aggregation
      for both the project-scoped and global paths (introduced by M25-T03's
      unification — a regression this milestone shipped, not an M24
      carry-over), and mysql2 returns that aggregate as a plain datetime
      string with no timezone marker; decoding it with `new Date(v)`
      interprets it as the **host process's local time**, silently wrong by
      the host's UTC offset on every non-UTC deployment. Affects both this
      sweep's `hoursSilent` (user-visible in every email) and M24's
      `/reports` screen (same shared detector) — fix the decode to treat
      the value as UTC explicitly, add a regression test that reproduces
      mysql2's exact return shape without needing a live database for every
      run, and re-confirm live against a real MySQL server with the host
      in a non-UTC timezone.
      - Files: `apps/backend/src/lib/stalledClaims.ts` (+ `.test.ts`)
      - Verify: a unit test asserting correct decoding of a raw
        `"YYYY-MM-DD HH:MM:SS"` MySQL string (mysql2's real shape) as UTC,
        regardless of host timezone; a live re-run against real MySQL
        confirming `hoursSilent` matches the fixture's true age; full
        `moon check --all` clean; every exit criterion re-verified as
        actually held, not re-worded; then close the milestone.

## 6. Verification

```bash
moon check --all
docker compose --profile full up -d
# trigger a sweep against a seeded, aged-claim fixture;
# confirm the digest at localhost:8025 and the audit_log row via the DB
```

## 7. Risks

- **First-run backlog flood.** The single reason this feature could get a
  deployment to disable it on day one. Mitigated by design: digest-per-
  recipient rather than per-task, and by the dedup table only recording
  what was actually itemized — the risk is designed out before T04 writes
  any code, not patched afterward.
- **Recipient predictability.** A three-tier chain (reviewers, commenters,
  org fallback) was drafted and rejected specifically because a commenter
  tier is self-defeating (commenting is itself a signal that clears the
  stalled condition) and half-dead in this schema (`task_notes` are always
  agent-authored; only `comments` can carry a human). The shipped two-tier
  chain is deliberately smaller and each email states which tier fired.
  Rollback position: if reviewers-then-admins proves too broad or too
  narrow in practice, the fallback tier is the one lever to adjust — it is
  isolated in `resolveTaskAlertRecipients`, not threaded through the sweep.
- **Global-scale query correctness.** The IN-list mistake this design
  specifically avoids has direct, recent precedent in this same codebase
  (M24-T06 found and fixed it once already on a sibling query) — the
  `EXPLAIN QUERY PLAN` exit criterion exists because "it worked in the
  fixture" is not evidence at deployment scale; the plan must be checked.
- **No GUI surface yet.** The alert is email-only; a person who wants an
  in-app equivalent has to wait for a follow-up. Accepted deliberately —
  publishing the domain event now means that follow-up starts from a
  working data source rather than from nothing.
