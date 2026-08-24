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
