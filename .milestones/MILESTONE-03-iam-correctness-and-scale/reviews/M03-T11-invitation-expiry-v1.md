---
task: M03-T11
version: v1
timestamp: 2026-08-15
decision: approved
---

# Review — M03-T11 Expire invitations

## Correctness

An invitation with no expiry is a standing key to the organization: an address
invited once could be redeemed at any point afterwards, including long after
whoever sent it had left. `expiresAt` closes that with a 14-day window.

Three decisions where the obvious version is wrong:

- **`expires_at` is nullable, and null means valid.** Making it `NOT NULL` with
  a backfilled value would have set an expiry on invitations issued before the
  concept existed; backfilling to the epoch would have revoked every
  outstanding invitation the instant the migration ran. That is a support
  incident, not a migration. Tested with a null-expiry row.
- **Re-inviting renews an expired invitation.** The duplicate check
  short-circuits on `(orgId, email)`, so without this a lapsed invitation is
  permanently un-reissuable and the admin's only remedy is deleting a row the
  UI does not show them. Renewal also updates the role, since re-inviting with
  a different role is the obvious way to change one's mind.
- **Re-inviting a *live* invitation does not extend it.** Otherwise the expiry
  is defeated by anyone re-sending, and there is no window at all.

Expired invitations are skipped at login rather than deleted. Deleting them
there would make the invitation vanish at the exact moment the person finally
tried to use it, and hide from the admin that it lapsed unredeemed —
`listInvitations` (M03-T12) is where that becomes visible.

No finding.

## Test coverage

Four login cases (expired does not join, expired is not consumed, live still
joins, legacy null still joins) and three handler cases (new invitation gets an
expiry, live re-invite is inert, expired re-invite renews role and window).

```yaml
- file: apps/backend/src/modules/orgs/orgs.test.ts
  line: 0
  severity: low
  comment: >
    The window assertion originally hardcoded 13/15 days beside a constant of
    14. knip caught the constant as an unused export, which is what prompted
    importing it into the test — so the assertion now tracks the constant and
    changing the window is one edit rather than two that can disagree. A gate
    complaining about an unused export turned out to be pointing at a real
    duplication.
```

## Architectural drift

No contract change. `expiresAt` is not yet exposed on any RPC — **M03-T12**
adds `listInvitations`, which is where it becomes visible to a client. Recorded
so the gap is deliberate rather than forgotten.

## Security

The window is a policy constant in code, not configuration. That is right for
now — a per-organization expiry policy is a setting nobody has asked for, and
M10 owns policy as data. Worth noting because "make it configurable" is the
reflex, and every configurable security window is one that can be set to
infinity.

```yaml
- file: apps/backend/src/modules/auth/auth.ts
  line: 85
  severity: low
  comment: >
    Expiry is compared against Date.now() at login. Clock skew between the
    inviting and authenticating processes is irrelevant here because both read
    the same database and the same server clock, but a distributed deployment
    (M11) should keep this comparison server-side rather than trusting any
    timestamp that arrives with a request.
```

## Verdict

**Approved.** Two low findings, both informational.
