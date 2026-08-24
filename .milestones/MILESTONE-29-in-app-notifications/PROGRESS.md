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
