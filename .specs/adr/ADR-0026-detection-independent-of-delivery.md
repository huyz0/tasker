---
id: ADR-0026
status: accepted
date: 2026-08-24
milestone: M29
---

# Stalled-claim detection runs independently of email delivery

## Context

ADR-0022 built stalled-claim alerting as an email feature, and the code
followed that framing literally. `runStalledClaimAlertSweep` returns at
`lib/stalledClaimAlerts.ts:65` when `!mailer.enabled`, **before any query
runs** — Decision 5's stated reasoning was that "the common no-SMTP deployment
pays nothing for a scan whose result would be discarded anyway." Downstream,
recording a task in `stalled_claim_alerts` and publishing
`domain.task.stalled` both sit behind `if (outcome !== 'sent') continue;`.

Every one of those was correct while email was the only channel. M29 adds a
second one, and each assumption now fails:

- A deployment without SMTP does no stalled-claim detection at all. Its
  notification bell would be permanently empty, and nothing would say why.
- Even with SMTP, the domain event that feeds the bell only fires for tasks
  that made it into a *successfully sent* digest. A transient SMTP failure
  silently costs the in-app surface its data.

ADR-0022 Decision 4 anticipated exactly this consumer — "a future GUI
notification surface starts from a subject already flowing" — but the subject
only flows on the email path's success.

## Options

**(a) Leave the sweep as-is; have the bell read `stalled_claim_alerts`
directly.** Cheapest, and wrong in the same way: that table is only written
after a successful send, so the no-SMTP deployment still has nothing. It also
makes the bell stalled-claim-specific, which M29's own exit criteria forbid.

**(b) Two ledgers — one for detection, one for email delivery.** Preserves
Decision 2's overflow rule exactly: a task beyond the digest cap stays
un-emailed and eligible for itemization in a later sweep, while still being
published once. Costs a second table and a second dedup path, and every future
channel adds a third.

**(c) One ledger meaning "this claim anchor has been alerted", with detection,
recording and publication above the mailer gate and email as one delivery
channel below it.** The digest keeps its cap and still reports overflow as a
count, but overflow tasks are now recorded and published on the sweep that
first sees them, so they are never itemized in a later email.

## Decision

(c). Detection, recording and publication run on every sweep regardless of
mailer state; email remains gated on `mailer.enabled` and keeps its
per-recipient digest and `DIGEST_TASK_LIMIT` cap.

## Consequences

**This changes ADR-0022 Decision 2's overflow behaviour, deliberately.**
Previously a task past the 20-item cap stayed eligible and was itemized in a
later digest. Now it is marked alerted on first detection, so the email
itemizes at most 20 and reports the rest only as `overflowCount` — which the
template already renders. The tasks are not lost: they are itemized in the
bell, which has no reason to cap. The cap existed to stop a first run flooding
one enormous email, and that constraint does not transfer to an in-app list.
A deployment with more than 20 newly-stalled tasks for one recipient in a
single sweep now learns the exact count by email and the detail in-app,
rather than learning it across several hourly emails.

**Deployments without SMTP begin doing work they previously skipped.** They
run the detector hourly where they ran nothing. The query is the same bounded,
indexed one M25 already ships and measures; the cost is real but small, and it
is the price of the feature. Decision 5's "pays nothing" rationale is retired,
not overturned — it was correct for a single-channel feature.

**A failed or skipped send no longer suppresses the event.** This is the point:
the in-app channel is no longer hostage to the email channel's health. It also
means `stalled_claim_alerts` now records "we alerted, by whatever channel was
available", which is what its name always implied and what Decision 3's
task+anchor key already expresses.

**A task with no resolvable recipient is now recorded and published too**, and
this was found while implementing rather than while deciding. Under ADR-0022 it
was left unmarked because nothing had been sent, so a task in an org with no
reviewers and no owner/admin was re-detected and had its recipients re-resolved
on every sweep, forever, and was never recorded. That was a latent inefficiency
hiding behind a correct-looking rule. "This claim is stalled" is true whether or
not anyone is listening, so it is recorded once and published once; marking it
also stops the audit trail collecting an identical event every hour for a task
nobody can be told about.

**A related duplicate is fixed in passing**: recording moved out of the
per-recipient loop, so a task with two reviewers no longer inserts two
`stalled_claim_alerts` rows for one anchor.

**What this forecloses**: per-channel dedup. A future channel that wants its
own "already delivered" semantics — a digest cadence different from hourly,
say — will need option (b)'s second ledger after all. Nothing in M29 needs it,
and building it now would be speculative.
