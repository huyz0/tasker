---
task: M03-T01
version: v1
timestamp: 2026-08-15
decision: approved
---

# Review — M03-T01 Enforce viewer as read-only

Four lenses over `assertOrgWriter`, its application to 31 handler methods, and
`viewer-denial.test.ts`.

## Correctness

The change converts every mutating handler that gated on `assertOrgMember` to
`assertOrgWriter`. Nine handler files, 31 methods. The remaining mutating
methods were already `assertOrgAdmin`/`assertOrgOwner`/`assertOrgAdminOfAny`
gated, which denies a viewer for free.

Evidence that the conversion is complete rather than asserted: the sweep failed
31 cases before the change and 0 after, and the 31 names match the 31 converted
methods exactly.

`WRITER_ROLES` is an allowlist (`owner`, `admin`, `member`) rather than
`role !== 'viewer'`. This matters at M10, which turns roles into data: a role
added later is denied writes until someone decides otherwise, instead of
inheriting them silently.

No finding.

## Test coverage

One gap was found during review and closed before this was written.

```yaml
- file: apps/backend/src/lib/viewer-denial.test.ts
  line: 300
  severity: high
  comment: >
    The 59 denial cases would all have passed if assertOrgWriter denied
    *everyone*, not just viewers — a green suite over a completely broken
    product. Fixed by adding a positive control that a member can still
    createLabel, createComment and createFolder. Verified by construction: the
    control fails if WRITER_ROLES is emptied.
```

The deny-by-default mechanism was itself verified by injection: a new
`recolourEverything` method added to the labels handler with no guard failed
the completeness case by name, and the suite returned to green when removed.

## Architectural drift

Matches [ADR-0006](../../../.specs/adr/ADR-0006-explicit-writer-assertion-over-a-mutation-interceptor.md).
Explicit assertion at each call site, no interceptor, guarantee bought back with
a contract-driven sweep. The ADR requires skips to be explicit and justified;
there is exactly one, `orgs.seedOrg`, with its reasoning inline.

No finding.

## Security

```yaml
- file: apps/backend/src/modules/labels/labels.handler.ts
  line: 54
  severity: low
  comment: >
    Zod parsing runs before the authorization check in every converted handler,
    so an unauthorized caller can distinguish a malformed request
    (InvalidArgument) from a denied one (PermissionDenied) and thereby probe
    request schemas. Not exploitable for data access and consistent across the
    codebase, so not changed here — reversing the order in 31 handlers is a
    separate change with its own regression surface. Recorded so it is a
    decision rather than an oversight.

- file: apps/backend/src/lib/authz.ts
  line: 84
  severity: low
  comment: >
    assertOrgAdminOfAny still gates the global agentRoles catalogue, so a user
    who is viewer in org A but admin in org B may edit personas org A consumes.
    This is the tenancy defect M03-T05 exists to fix; listed here only so the
    two are known to be connected, not as a finding against this task.

- file: apps/backend/src/lib/viewer-denial.test.ts
  line: 36
  severity: low
  comment: >
    READS encodes "a viewer may call this", which is a policy statement living
    in test code. Acceptable while roles are hardcoded; M10 turns roles into
    data and should move it. Already recorded as debt in ADR-0006.
```

## Verdict

**Approved.** One high finding, found and fixed within the task. Three low
findings recorded, none blocking: two are explicitly owned by later milestones
(M03-T05, M10) and one is a deliberate non-change with its reasoning.
