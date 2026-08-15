---
task: M03-T02
version: v1
timestamp: 2026-08-15
decision: approved
---

# Review — M03-T02 Let a member leave an organization

## Correctness

`removeOrgMember` now branches its authorization on the target rather than
applying one rule to both cases: self → `assertOrgMember`, other →
`assertOrgAdmin`. The blanket `cannot remove yourself` rejection is gone; the
last-owner guard is untouched and runs after the branch, so it covers both
paths.

Four states were checked, not two:

| Caller | Target | Result |
|---|---|---|
| member | self | removed |
| viewer | self | removed |
| sole owner | self | `FailedPrecondition`, membership intact |
| owner (of two) | self | removed |
| member | another member | rejected |
| non-member | self | rejected |

The non-member case matters: without the `assertOrgMember` call, a stranger
passing their own id would have fallen through to a delete that silently
affected nothing and returned success.

No finding.

## Test coverage

Seven backend cases and two CLI cases. The event assertion is deliberate —
`domain.org.member_removed` must fire on the leave path too, or M08's audit
trail would show admin removals and be blind to departures.

```yaml
- file: apps/cli/cmd/orgs_test.go
  line: 0
  severity: low
  comment: >
    The CLI refusal test was added because the first draft of the command
    printed "Left organization" from a code path that had already logged an
    error. It now asserts both that the failure is reported and that the
    success line is absent — a test that only checked for the error text would
    have passed on a command that printed both.
```

## Architectural drift

No ADR was written. The one alternative — a separate `leaveOrg` RPC — is a
contract addition that changes no behaviour: the server would perform the same
checks and the same delete. `.specs/adr/README.md` is explicit that a decision
with no consequence is a description, not a decision, so this is recorded here
instead.

The CLI resolves the caller through `GetIdentity` rather than taking a user id
argument. That is a second round trip per `leave`, accepted because the
alternative is asking a person to look up their own id.

No finding.

## Security

```yaml
- file: apps/backend/src/modules/orgs/orgs.handler.ts
  line: 186
  severity: low
  comment: >
    Self-removal is now reachable by a viewer, which is intentional and worth
    stating plainly: leaving changes nothing about the organization except the
    caller's own presence in it, so it is not a write in the M03-T01 sense.
    viewer-denial.test.ts still covers removeOrgMember because its fixture
    targets another user, so the admin requirement for removing someone else
    remains proven.

- file: apps/backend/src/modules/orgs/orgs.handler.ts
  line: 190
  severity: low
  comment: >
    Leaving does not reassign anything the departing member owns. A member who
    owns projects can leave and strand them. This is exactly M03-T04's subject,
    which currently scopes that guard to removeOrgMember's admin path; T04 must
    apply it to the leave path too or this task will have opened the hole it
    closes. Flagged forward rather than fixed here.
```

## Verdict

**Approved.** Two low findings, both recorded rather than fixed: one is
intentional behaviour stated for the record, the other is a dependency M03-T04
must honour.
