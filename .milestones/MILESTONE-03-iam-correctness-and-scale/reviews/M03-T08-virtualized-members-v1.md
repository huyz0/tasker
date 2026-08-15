---
task: M03-T08
version: v1
timestamp: 2026-08-15
decision: approved
---

# Review — M03-T08 Virtualize the members table

## Correctness

Search and the role facet are both server-side and both sit in the query key.
That second part matters more than it looks: a cursor minted against the
unfiltered set is meaningless against a filtered one, so changing either input
must start a new list rather than append to the old. Keying on
`[orgMembers, orgId, search, role]` makes react-query do that by construction
instead of by remembering to reset.

The role facet needed a contract field. Filtering the loaded window client-side
would have reported "3 admins" for an organization with 200 — worse than no
facet, because it reads as an answer rather than as a truncation. `role` is
field 3 on `ListOrgMembersRequest`, a new number, backward compatible per
`api-standard.md` §2.

`role: ""` is coerced to "no facet" rather than validated as a role. The
`<select>`'s All option sends an empty string, and treating that as a value
returns nothing at all — there is a test.

No finding.

## Test coverage

Four backend cases for the facet (filters and counts, empty means no facet,
composes with search, rejects a non-role) and six GUI cases.

```yaml
- file: apps/backend/src/modules/orgs/orgs.test.ts
  line: 0
  severity: low
  comment: >
    The compose-with-search case asserted ["Ada"] for the filter "Ada", which
    fails because "Ada" is a substring of "Adam" — the test was wrong, not the
    code. Rewritten to assert both admins match, then to search a name held by
    a non-admin so the facet's effect is visible. The first version would have
    passed only if the facet were broken in a compensating way.
```

The frame-budget verify line cannot be measured in jsdom. What is measured is
the mechanism behind it: **9 DOM rows for 1000 members**. Without windowing that
is 1000, so the bound is not decorative. The figure was obtained by forcing the
assertion to fail and reading the actual count, not assumed.

## Architectural drift

Replaces M03-T07's `fetchAllPages` interim, as that task's journal said it
would. The component no longer holds an organization in memory.

`aria-rowcount` carries the true total on the scroll container. A virtualized
list is a screen-reader hazard precisely because the DOM tells the truth about
what is visible and lies about what exists.

## Security

No authorization change. The facet is validated against the `OrgRole` enum
before reaching SQL, so an arbitrary `role` string cannot reach the query —
tested with `"superuser"`.

```yaml
- file: apps/gui/src/features/Organizations/index.tsx
  line: 0
  severity: medium
  comment: >
    A viewer sees the role <select> and the Remove button and can click them;
    the server refuses (M03-T01) and the existing destructive-text line shows
    the error. Disabling them client-side by role would be a second copy of the
    authorization rules, drifting from lib/authz.ts. This is recorded in the
    design note and left to M06, which owns permission-aware control state —
    it is a UX defect, not a security one, but it is the kind that gets
    "fixed" by duplicating policy into the client if nobody writes down why it
    was not.
```

## Verdict

**Approved.** One low finding (a wrong test, fixed) and one medium recorded and
deliberately deferred to M06 with its reasoning.
