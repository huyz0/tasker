---
task: M03-T13
version: v1
timestamp: 2026-08-15
decision: approved
---

# Review — M03-T13 Invite UI

## Correctness

The verify line — an administrator invites and revokes without touching the CLI
— is covered end to end: send with a chosen role, see the invitation listed with
its state, revoke it behind a confirmation.

```yaml
- file: apps/gui/src/features/Organizations/index.tsx
  line: 0
  severity: medium
  comment: >
    The section's visibility was first gated on !invitationsQuery.isError, which
    is false while the query is in flight — so a non-admin saw the whole invite
    section render and then disappear when the denial arrived. Worse than never
    showing it. Now gated on isSuccess, which also made the internal loading
    branch unreachable, so it was removed rather than left as dead code the
    coverage gate would have to be argued with. The design note was corrected to
    match.

- file: apps/gui/src/features/Organizations/index.tsx
  line: 0
  severity: low
  comment: >
    Two controls in the same view were both labelled "Role" — the members facet
    and the invite role — which made getByLabelText ambiguous and would have
    made a screen reader equally ambiguous. The facet is now "Filter by role",
    which is a better label independent of the collision. Found by a test
    failing for what looked like a test-only reason.
```

The email field deliberately keeps its contents when sending fails. Clearing on
submit is the reflex, and it makes a user retype an address they already typed
in exactly the situation where they are already annoyed.

## Test coverage

Seven cases: send with role, keep input on failure, expired vs pending badge,
revoke after confirmation, no revoke when cancelled, error keeps the row,
section hidden for a non-admin.

The 95% branch-coverage gate failed at 94.27% when the UI landed without tests,
which is what prompted writing them. That is the gate working as intended
rather than an obstacle — the untested branches were the error and permission
paths, which are exactly the ones nobody exercises by hand.

## Architectural drift

Whether the caller may manage invitations is decided by the server: the client
runs `listInvitations` and treats a rejection as "not an admin". No role table
is copied into the client.

This is a deliberate exception to the position taken in M03-T08, where the
members table's controls stay active for a viewer and the server refuses on
click. The distinction, recorded in both design notes: there, a control the
user might legitimately try, with an informative refusal. Here, an entire
section that would otherwise render as a permanent error for everyone who is
not an admin.

## Security

No new authorization logic — both RPCs were gated in M03-T12, and hiding the
section is presentation, not enforcement. A member who calls `inviteUser`
directly is still refused by the server.

## Verdict

**Approved.** One medium finding (the flash-then-hide) and one low (duplicate
label), both found and fixed within the task.
