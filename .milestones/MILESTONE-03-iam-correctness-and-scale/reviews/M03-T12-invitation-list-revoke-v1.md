---
task: M03-T12
version: v1
timestamp: 2026-08-15
decision: approved
---

# Review — M03-T12 List and revoke invitations

## Correctness

Invitations were write-only: an admin could send one and then had no way to see
it, let alone withdraw it. `listInvitations` and `revokeInvitation` close that,
both admin-gated.

Two details:

- **`revokeInvitation` scopes from the row, not the request.** It takes only an
  `invitationId`, resolves the invitation, and authorizes against *that* row's
  `orgId`. Had it taken an `orgId` too, a caller could name an organization they
  administer while pointing the id at an invitation in one they do not. Tested
  with an admin of a second organization.
- **`expired` is computed server-side** rather than left to clients to derive
  from `expiresAt`. Three clients comparing dates in three timezones will
  eventually disagree about whether an invitation has lapsed, and lapsing is
  the single fact this list exists to show.

The verify line — "listed then revoked and no longer applies" — is tested end to
end: list, revoke, list again (empty), and the underlying row confirmed gone, so
a login for that address has nothing to redeem.

No finding.

## Test coverage

Six handler cases and two CLI cases. The CLI test asserts the `EXPIRED` marker
specifically, because without it a lapsed invitation renders identically to a
live one and the list loses its reason to exist.

```yaml
- file: apps/backend/src/lib/viewer-denial.test.ts
  line: 0
  severity: medium
  comment: >
    The M03-T01 sweep caught both new endpoints unprompted, failing by name
    ("orgs.listInvitations", "orgs.revokeInvitation") before any test for them
    was written. This is the first time that gate has fired on genuinely new
    work rather than on an injected fault, which is the evidence that it does
    what ADR-0006 claimed. Both are classified under REQUESTS rather than READS
    — READS means "a viewer may call this", not "this method does not write",
    and listInvitations is admin-gated.
```

## Architectural drift

Three new messages and two new RPCs, added to both contract sources. No
existing field numbers moved.

`listInvitations` uses `executePaginatedQuery` with the shape defaults, so it
inherits the cursor, filter and count behaviour proven in M03-T06/T07 rather
than growing its own.

## Security

The list is every address someone has been asked to hand over, which is why it
is admin-gated rather than member-visible. Revocation publishes
`domain.org.invitation_revoked` carrying the email — consistent with the other
domain events, and M08 will need it for the audit trail.

```yaml
- file: apps/backend/src/modules/orgs/orgs.handler.ts
  line: 0
  severity: low
  comment: >
    Revocation deletes the row rather than tombstoning it, so after M08 lands
    the audit trail will be the event, not the table. That is the right split,
    but it means "who revoked this invitation and when" is unanswerable until
    a consumer exists to record it. Noted rather than pre-solved.
```

## Verdict

**Approved.** One medium finding recording that the T01 gate fired on real new
work, and one low finding deferring audit history to M08.
