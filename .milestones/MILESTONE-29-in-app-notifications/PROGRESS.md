# M29 — Progress Journal

Append-only. Newest entry at the bottom.

## M29-T01 — Detect, record and publish stalled claims without SMTP

- **Status**: done
- **Date**: 2026-08-24
- **Approach**: Lift detection, dedup, `stalled_claim_alerts` recording and the
  `domain.task.stalled` publish above the `!mailer.enabled` return, leaving the
  per-recipient digest and its `DIGEST_TASK_LIMIT` cap as the only email-gated
  work. Recorded as ADR-0026, because this deliberately changes ADR-0022
  Decision 2's overflow rule and retires Decision 5's "pays nothing" rationale.
- **Artifacts**: ADR-0026 written before code (a real alternative existed —
  a second ledger preserving per-channel dedup — and it was rejected with its
  cost stated). No UX pass: no screen. No test plan: the behaviour states in
  one Verify line.
- **Changed**: `apps/backend/src/lib/stalledClaimAlerts.ts`,
  `apps/backend/src/lib/stalledClaimAlerts.test.ts`,
  `.specs/adr/ADR-0026-detection-independent-of-delivery.md`
- **Verified**: `moon run backend:test` — 1814 pass, 28 skip, 0 fail.
  `moon run backend:typecheck` clean. Deliberate-break check performed:
  reinstating `if (!mailer.enabled) return;` fails both new tests, so they
  genuinely cover the change rather than asserting something already true.
- **Notes**: Two existing tests asserted the *old* contract and were rewritten,
  not deleted — M25's exit criterion 5 ("never touches the database when
  mailer.enabled is false") and the digest-cap test's "only records/publishes
  the itemized tasks". Both are ADR-0026's deliberate reversals and each now
  carries a comment saying so.

  A consequence surfaced during implementation that the ADR had not
  anticipated, and the ADR was amended rather than the test quietly changed:
  a task with **no resolvable recipient** is now recorded and published too.
  Under ADR-0022 it stayed unmarked forever, so such a task was re-detected
  and re-resolved on every sweep and never recorded — a latent inefficiency
  behind a correct-looking rule.

  A duplicate was fixed in passing: recording moved out of the per-recipient
  loop, so a task with two reviewers no longer inserts two
  `stalled_claim_alerts` rows for one anchor.

  Noted but deliberately NOT fixed here, as it belongs to the unscheduled
  Standards Documentation Truth Pass (COUNCIL-0001 candidate 7):
  `.specs/standards/testing-standard.md` §3 still states "**MSW is not
  installed**; do not reach for it" while `msw ^2.15.0` has been load-bearing
  since M12-T01. It was read as binding context for this very task.
- **Next**: M29-T02

## M29-T02 — Resolve alert recipients by userId

- **Status**: done
- **Date**: 2026-08-24
- **Approach**: Return `userId` on every recipient and stop filtering the list
  by email; the email channel filters for an address at the point of sending.
  Also fix the tier check, which currently tests reviewer count *after* the
  email filter, so a task whose only reviewer has no email silently falls
  through to org admins — a violation of ADR-0022 Decision 1 the email-only
  design could not expose.
- **Artifacts**: No ADR — ADR-0026 already records the decoupling this
  completes, and no alternative exists here: in-app delivery has no address to
  filter on. No UX pass, no test plan.
- **Changed**: `apps/backend/src/lib/resolveTaskAlertRecipients.ts`,
  `apps/backend/src/lib/resolveTaskAlertRecipients.test.ts`,
  `apps/backend/src/lib/stalledClaimAlerts.ts`,
  `apps/backend/src/lib/stalledClaimAlerts.test.ts`
- **Verified**: `bun test` in `apps/backend` — 1819 pass, 28 skip, 0 fail;
  `moon run backend:typecheck` clean. Four resolver tests and two sweep tests
  were red before the change.
- **Notes**: The task named one bug and the file contained two. The second:
  the reviewer-vs-admin tier check ran *after* the email filter, so a task
  whose only reviewer had no email looked reviewer-less and the alert was
  routed to every org owner/admin. That is both a missed notification and a
  disclosure to people ADR-0022 Decision 1 says should not receive it — and
  it was unreachable as a bug until email stopped being the only channel.

  `dedupeByEmail` became `dedupeByUser` for a related reason: two email-less
  users both deduped to the key `null`, so one of them silently vanished.

  The email channel now drops un-addressable recipients at the point of
  sending; without that guard the group map keys on `null` and the send is
  attempted with `to: null`.
- **Next**: M29-T03

## M29-T03 — notifications table in both dialects

- **Status**: done
- **Date**: 2026-08-24
- **Approach**: One row per (recipient, notification). Carries the event type,
  server-rendered title/body, a target link, org/project scope for filtering,
  and `readAt`. Dedup key is (userId, type, dedupeKey) so a re-published event
  cannot double-notify. Follows the two-dialect discipline and the M26
  monotonicity guard's `when` ordering.
- **Artifacts**: No ADR — the shape follows `stalled_claim_alerts` and
  `audit_log` precedent, and no alternative was weighed. No UX, no test plan.
- **Changed**: `apps/backend/src/db/schema.sqlite.ts`,
  `apps/backend/src/db/schema.mysql.ts`,
  `apps/backend/drizzle-sqlite/0049_notifications.sql`,
  `apps/backend/drizzle-mysql/0036_notifications.sql`, both `meta/_journal.json`,
  `apps/backend/src/db/embeddedMigrations.generated.ts` (regenerated),
  `apps/backend/src/db/notifications.schema.test.ts` (new),
  `apps/backend/src/db/auditLogRepair.migration.test.ts`
- **Verified**: `bun test` in `apps/backend` — 1824 pass, 28 skip, 0 fail;
  `moon run backend:typecheck` clean. Five round-trip tests run against a
  really-migrated database, not against the schema object, because the
  migration and the drizzle definition are hand-kept in parallel and can
  disagree.
- **Notes**: **Adding this migration broke two M26 tests, and the bug was
  theirs, not mine.** `auditLogRepair.migration.test.ts`'s
  `asShippedBeforeM26()` built its "journal as it stood before M26" fixture by
  taking *every* migration except the repair. That was correct only while 0048
  was the newest migration in the tree. Any migration added after it — any
  one, for any reason — joined that fixture, carried a later `when` than the
  repair, and pushed the simulated watermark past the repair's own slot, so
  the repair never applied and the test reproduced a different bug than the
  one it describes. Now bounded at `LAST_TAG_BEFORE_M26 = 47`.

  This was a time-bomb for whoever added migration 0049, whatever it turned
  out to be. Worth remembering that M26's whole subject was gates that do not
  cover what they claim.

  `text` was not imported in `schema.mysql.ts`; added. MySQL's `dedupe_key` is
  `varchar(512)` rather than the sqlite side's `text` because it participates
  in a unique index and MySQL cannot index an unbounded TEXT without a prefix.
- **Next**: M29-T04

## M29-T04 — notification registry and the generic write path

- **Status**: done
- **Date**: 2026-08-24
- **Approach**: A registry keyed by event type, each entry rendering title,
  body, target path and dedupe key from a typed payload. The write path takes
  a type plus recipients and knows nothing about stalled claims. The sweep
  becomes one caller.
- **Artifacts**: No ADR — this is the shape M29's exit criteria already
  mandate; the alternative (a switch in the writer) is the thing they forbid.
- **Changed**: `apps/backend/src/lib/notificationRegistry.ts` (new),
  `apps/backend/src/lib/notificationRegistry.test.ts` (new),
  `apps/backend/src/lib/stalledClaimAlerts.ts`,
  `apps/backend/src/lib/stalledClaimAlerts.test.ts`
- **Verified**: `bun test` in `apps/backend` — 1833 pass, 28 skip, 0 fail;
  `moon run backend:typecheck` clean. All nine registry tests passed on the
  first run, so the deliberate-break check was run rather than trusted:
  making `writeNotifications` read the registry at a hardcoded key failed the
  unregistered-type and second-type tests; making the stalled renderer emit a
  constant dedupe key failed the new-anchor test. Both are real coverage.
- **Notes**: Recipient resolution moved above both channels and is now done
  once per task into a map, rather than inside the email grouping loop. Both
  channels need it and it is two queries per task; resolving it twice would
  have doubled that for no reason.

  The generic-ness is load-bearing, not stylistic: `writeNotifications` never
  names a stalled claim, and `notificationRegistry.ts` never imports anything
  from the sweep. The exit criterion's test registers a `test.fake` type and
  asserts it persists through the same path, and `afterEach` unregisters it so
  the fixture cannot leak into another test's `notificationTypes()`.
- **Next**: M29-T05

## M29-T05 — NotificationService

- **Status**: done
- **Date**: 2026-08-24
- **Approach**: list / unread-count / mark-read / mark-all-read, every query
  predicated on the caller's own userId as well as org membership. Human-only:
  registered in the agent-scope map as denied so the M26 sweep passes and an
  agent token cannot reach it.
- **Artifacts**: No ADR — the authorization shape is `eventScope.ts`'s, reused
  rather than re-derived. No UX pass (T06 owns the component), no test plan.
- **Changed**: `packages/shared-contract/main.tsp`,
  `packages/shared-contract/tasker/health/v1/health.proto`,
  `apps/backend/src/modules/notifications/notifications.handler.ts` (new),
  `apps/backend/src/modules/notifications/notifications.test.ts` (new),
  `apps/backend/src/index.ts`, `apps/backend/src/lib/agent-scope-sweep.test.ts`
- **Verified**: `moon run shared-contract:compile` clean; `bun test` in
  `apps/backend` — 1847 pass, 28 skip, 0 fail; typecheck and knip clean.
  All 13 handler tests passed first run, so each isolation predicate was
  deliberately broken: dropping `userId` from the list predicate fails 1 test,
  from the mark-read lookup fails 1, from mark-all fails 2. The isolation is
  genuinely covered rather than incidentally true.
- **Notes**: **The M26 agent-scope sweep caught the new service immediately** —
  "registered in index.ts but absent from this sweep: Notification". That is
  exactly the guarantee M26-T01 rebuilt working on a service it never saw:
  closed to agents until someone writes it down. Registered in
  `NO_AGENT_ACCESS`, since every method resolves the recipient through
  `requireUser` and an agent token has nothing to resolve.

  `markNotificationRead` matches on id **and** userId together, so another
  user's id 404s rather than 403s. A permission error would confirm the
  notification exists, which is the same reasoning `SubscribeEventsRequest`
  already applies to an org the caller does not belong to.

  Marking read is idempotent and keeps the *first* read timestamp, so a double
  click does not overwrite "when did they first see it".
  `gui:rpc-coverage` refused the commit: four RPCs in the contract with no
  GUI caller. Added as **temporary** exceptions naming M29-T06 as the task
  that removes them — and that gate reports an exception for an RPC the GUI
  *does* call as stale, so it will demand their removal rather than let them
  rot quietly.
- **Next**: M29-T06

## M29-T06 — NotificationBell component

- **Status**: done
- **Date**: 2026-08-24
- **Approach**: A `Popover`-free dropdown following `LiveStatusIndicator`'s
  precedent (presentational, fed by props/hooks the shell owns). Badge from
  `getUnreadNotificationCount`, list from `listNotifications`, both invalidated
  by the existing live feed via a new `notification` entity in
  `eventQueryKeys.ts`. All content comes from the server's rendered fields, so
  the component never branches on `type`.
- **Artifacts**: No ADR. A UX pass is warranted by the heavy-task rule (it adds
  an affordance a user must learn), and its four states — empty, loading,
  error, and the permission case — are covered by the component's own tests
  and story rather than a separate document, since the surface is one dropdown
  in an existing shell rather than a screen.
- **Changed**: `apps/gui/src/components/layout/NotificationBell.tsx` (new),
  `NotificationBell.test.tsx` (new), `NotificationBell.stories.tsx` (new),
  `apps/gui/src/lib/eventQueryKeys.ts`, `eventQueryKeys.test.ts`,
  `apps/gui/scripts/rpc-coverage.mjs`
- **Verified**: `moon run gui:test gui:typecheck gui:lint gui:design-lint` —
  79 files, 1166 tests, all pass. `moon run gui:rpc-coverage` back to
  "139 of 143 reached, 4 excepted", i.e. the four temporary M29-T05
  exceptions are gone and the count is the original.
- **Notes**: **The `task` entity was the wrong home for the bell's queries.**
  First attempt added `notifications`/`notificationCount` to
  `KEYS_BY_ENTITY.task`, which `eventQueryKeys.test.ts` rejected by pinning
  the exact key set — correctly, because that would refetch two notification
  queries on every task create, edit and archive in the app. Added
  `EXTRA_KEYS_BY_SUBJECT` instead, a per-subject overlay holding exactly
  `domain.task.stalled`, with a test pinning that the other task subjects
  stay out of the bell.

  The list query is `enabled` only while the panel is open. The bell renders
  on every screen; fetching a page of notifications nobody opened would be a
  request per navigation.

  `@testing-library/user-event` is not a dependency here — the codebase uses
  `fireEvent`, so the tests do too rather than adding a package for
  convenience.

  The component never branches on `type`: one test renders a `task.handoff`
  notification it has never heard of and asserts it displays normally, which
  is M29's exit criterion seen from the GUI side.
- **Next**: M29-T07
