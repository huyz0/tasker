---
id: M29
title: In-App Notifications
status: in-progress
goal: A human sees their stalled-claim alerts inside the product, on any deployment, without waiting for an email — and the surface that shows them is generic enough that the next alert type registers against it instead of building its own.
depends_on: []
surfaces: [backend, gui, contract, specs]
exit_criteria_met: false
started_at: 2026-08-24
completed_at: null
---

# M29 — In-App Notifications

## 1. Goal

A signed-in human sees a notification bell in the application shell that carries
an unread count, opens a list of their own stalled-claim alerts newest-first,
links each one to the task it concerns, and clears as they read. The alerts
arrive whether or not the deployment has SMTP configured, and they reach a user
who has no email address at all. The mechanism that delivers them is registered
per event type rather than written for stalled claims, so the handoff and
review-request alerts M25 named can be added without touching the bell.

## 2. Why Now

M25 shipped stalled-claim alerting as email only and deferred the GUI surface
**deliberately** — "so a future in-app notification bell starts from a working
data source." That data source now exists: `lib/stalledClaimAlerts.ts:169`
publishes `domain.task.stalled`, M08's `consumers/auditProjector.ts` durably
projects it, and the GUI's live-event path (`hooks/useLiveEvents.ts`,
`LiveStatusIndicator.tsx`) ships with tests. No `Notification` component exists
anywhere under `apps/gui/src/`.

COUNCIL-0001 recommended this at 3.58, with seven of eight advisors scoring it 4
or 5. It survived a 0.01 tie-break against Agent-Facing CLI Ergonomics on
downstream unblocking: Dependency Order names two future consumers of the same
pattern, where the CLI item unblocks nothing. Technical Debt supplied the inverse
warning that shapes the scope below — building it narrowly for stalled claims
re-creates the fragmentation it should prevent.

**Two defects found while planning, which the council did not have in front of
it, and which decide the first two tasks:**

1. **The alert pipeline is gated on SMTP.** `runStalledClaimAlertSweep` returns
   at `stalledClaimAlerts.ts:65` when `!mailer.enabled`, before any query runs.
   On a deployment without SMTP — which that code's own comment calls "the common
   no-SMTP deployment" — stalled claims are never detected, never recorded, and
   `domain.task.stalled` is never published. A bell built on today's pipeline
   would be permanently empty there. Detection must be decoupled from delivery.
2. **Recipients resolve by email, and users without one are silently dropped.**
   `resolveTaskAlertRecipients.ts` selects `users.email` and filters
   `.filter(r => r.email)` at both tiers. M13 made email optional for local
   accounts on purpose, so a local-account reviewer with no email is not
   notified today and cannot be — a live M13/M25 interaction bug. In-app
   delivery has no such constraint and must key on `userId`.

## 3. Exit Criteria

- [ ] A signed-in user with an unread stalled-claim alert sees a bell with a
      non-zero badge in the app shell; opening it lists the alert with the task
      title and how long the claim has been silent.
- [ ] Clicking an alert navigates to that task's detail view, scoped correctly
      per ADR-0025, and marks that alert read.
- [ ] The badge clears to zero after "mark all read" and stays cleared across a
      full page reload.
- [ ] A stalled claim is detected, recorded and published with **SMTP
      unconfigured** — verified by a test that runs the sweep with a disabled
      mailer and asserts a `domain.task.stalled` publish plus a persisted
      notification.
- [ ] A task reviewer **with no email address** receives an in-app notification —
      verified by a test using a local account created without an email.
- [ ] A user cannot read another user's notifications: a request for a
      notification belonging to another user returns not-found/permission-denied,
      pinned by a test.
- [ ] An agent token cannot read notifications at all — the agent-scope sweep
      passes with the new service registered and human-only.
- [ ] Adding a second notification type requires no change to the bell component
      or the notification handler — demonstrated by registering a second event
      type in the registry with a test, without editing either file.
- [ ] `moon check --all` passes, and `bunx playwright test --workers=1` passes.

## 4. Scope

### In Scope

- Decoupling stalled-claim detection/publication from SMTP delivery.
- Resolving alert recipients by `userId`, keeping the existing tier reasons.
- A per-user notification table with read state, in both dialects.
- A generic event-type → notification registry, and the write path that uses it.
- A `NotificationService` contract, handler and GUI client.
- The bell component, its badge, its list, and its wiring into `AppShell`.

### Out of Scope

- **Notification preferences / per-type opt-out.** M25 deferred this separately;
  it needs a settings surface this milestone does not build.
- **Handoff and review-request notification types.** This milestone builds the
  registry and proves a second type registers cleanly; the actual alert
  semantics for those types are their own work.
- **Email digest changes beyond the SMTP decoupling.** The rendered digest
  (`stalledClaimAlertEmail.ts`) is untouched.
- **Web push / desktop notifications.** No new transport; the live feed M08
  built is the transport.
- **Backfilling notifications for claims that already stalled before this
  ships.** The bell starts from the first sweep after deploy; a backfill would
  dump a deployment's entire history into every recipient's bell on day one,
  which is the same mistake M25's digest design explicitly avoided.

## 5. Task Breakdown

- [x] **M29-T01** — The stalled-claim sweep detects, records and publishes
      regardless of whether SMTP is configured; only the email send stays gated.
  - **Files**: `apps/backend/src/lib/stalledClaimAlerts.ts`,
    `apps/backend/src/lib/stalledClaimAlerts.test.ts`
  - **Verify**: `moon run backend:test` — a new test runs the sweep with
    `mailer.enabled === false` and asserts both a `stalled_claim_alerts` row and
    a `domain.task.stalled` publish; existing SMTP-enabled tests still pass.

- [x] **M29-T02** — Alert recipients resolve by `userId`, so a reviewer with no
      email address is still a recipient, and the email path keeps its behaviour
      by filtering for an address at the point of sending.
  - **Files**: `apps/backend/src/lib/resolveTaskAlertRecipients.ts`,
    `apps/backend/src/lib/resolveTaskAlertRecipients.test.ts`,
    `apps/backend/src/lib/stalledClaimAlerts.ts`
  - **Verify**: `moon run backend:test` — a test with a local account created
    without an email asserts the user is returned as a recipient, and that the
    email grouping still skips them without erroring.

- [x] **M29-T03** — A `notifications` table exists in both dialects, keyed by
      recipient user, carrying type, payload, org/project scope and read state.
  - **Files**: `apps/backend/src/db/schema.sqlite.ts`,
    `apps/backend/src/db/schema.mysql.ts`,
    `apps/backend/drizzle-sqlite/0049_notifications.sql`,
    `apps/backend/drizzle-mysql/0036_notifications.sql`
  - **Verify**: `moon run backend:test` — the migration-ledger monotonicity
    guard (M26) passes and a round-trip insert/select works in both dialects.

- [x] **M29-T04** — A notification registry maps an event type to its rendered
      title, body and target link, and the sweep writes notifications through it
      rather than knowing about stalled claims specifically.
  - **Files**: `apps/backend/src/lib/notificationRegistry.ts`,
    `apps/backend/src/lib/notificationRegistry.test.ts`,
    `apps/backend/src/lib/stalledClaimAlerts.ts`
  - **Verify**: `moon run backend:test` — a test registers a second, fake event
    type and asserts it renders and persists without any edit to the write path.

- [x] **M29-T05** — `NotificationService` lists a caller's own notifications,
      reports an unread count, and marks one or all read; every query is
      predicated on the caller's `userId` and org membership.
  - **Files**: `packages/shared-contract/main.tsp`,
    `apps/backend/src/modules/notifications/notifications.handler.ts`,
    `apps/backend/src/modules/notifications/notifications.test.ts`,
    `apps/backend/src/index.ts`, `apps/backend/src/lib/scopes.ts`
  - **Verify**: `moon run shared-contract:compile && moon run backend:test` — a
    test asserts another user's notification id returns not-found, and the
    agent-scope sweep passes with the service registered human-only.

- [x] **M29-T06** — A `NotificationBell` component renders the badge and the
      list, updates live from the existing event feed, and takes its content
      entirely from the server's rendered fields.
  - **Files**: `apps/gui/src/components/layout/NotificationBell.tsx`,
    `apps/gui/src/components/layout/NotificationBell.test.tsx`,
    `apps/gui/src/components/layout/NotificationBell.stories.tsx`,
    `apps/gui/src/lib/eventQueryKeys.ts`
  - **Verify**: `moon run gui:test gui:storybook-test` — the component's own
    test covers empty, unread-count and mark-read states.

- [x] **M29-T07** — The bell is mounted in the app shell and each notification
      navigates to its task carrying scope, per ADR-0025.
  - **Files**: `apps/gui/src/components/layout/AppShell.tsx`,
    `apps/gui/src/components/layout/AppShell.test.tsx`
  - **Verify**: `moon run gui:test` — a test asserts clicking a notification
    routes to the task URL with `?org=…&project=…` present.

- [ ] **M29-T08** — A browser test proves the whole path: a stalled claim
      becomes a badge, opens to a list, links to the task, and stays read
      across a reload.
  - **Files**: `apps/gui/e2e/notifications.spec.ts`
  - **Verify**: `bunx playwright test --workers=1 notifications.spec.ts`

- [ ] **M29-T09** — Documentation states the notification surface truthfully and
      the milestone closes.
  - **Files**: `.specs/product/architecture.md`, `.specs/design/NAVIGATION.md`,
    `README.md`, `.milestones/STATE.md`
  - **Verify**: `moon run :doc-drift` passes and `moon check --all` is green.

## 6. Verification

```bash
moon run shared-contract:compile
moon run backend:test
moon run gui:test
moon run gui:storybook-test
moon run :doc-drift :spec-drift
moon check --all
bunx playwright test --workers=1
```

`gui:e2e` is `type: 'run'` and therefore **not** part of `moon check --all` —
M28 learned this the hard way when two tasks each broke a browser spec while
every local gate stayed green. Run Playwright explicitly, with `--workers=1`.

## 7. Risks

- **The registry becomes a switch statement in disguise.** Technical Debt's
  warning is the real hazard here: if the bell or the handler ever branches on
  `type === 'stalled_claim'`, the milestone has failed its own exit criterion.
  The second-type test in T04 and the exit criterion that names it are the
  guard. Rollback: the registry is additive — reverting T04 leaves T01–T03
  standing and useful on their own.
- **Cross-user leakage.** A missing `userId` predicate on any notification query
  leaks one user's alerts to another. `modules/events/eventScope.ts` already
  enforces exactly this filter for the same event class on the live feed and is
  the pattern to copy, not re-derive.
- **T01 changes when work happens on a no-SMTP deployment.** Deployments that
  today do no stalled-claim scanning at all will begin scanning hourly. The
  sweep is already bounded and indexed (M25), but this is a real behaviour
  change on those deployments and belongs in T09's documentation.
- **Notification volume.** A large org's first sweep after deploy could write
  many rows at once. Mitigated by not backfilling (see Out of Scope); if pruning
  is needed, `lib/retentionSweep.ts` is the established pattern.
