---
task: M03-T07
version: v1
timestamp: 2026-08-15
decision: approved
---

# Review — M03-T07 Honour the contract's page field end to end

## Correctness

The verify line — "paging through 100,000 members visits each exactly once" —
is measured over the full set rather than a sample, under three orderings:

| Sort | Pages | Rows | Distinct | Duplicates | Missing | totalCount |
|---|---|---|---|---|---|---|
| `name:asc` | 1001 | 100,001 | 100,001 | 0 | 0 | 100,001 |
| `role:desc` | 1001 | 100,001 | 100,001 | 0 | 0 | 100,001 |
| default (`joinedAt`) | 1001 | 100,001 | 100,001 | 0 | 0 | 100,001 |

The fixture gives members deliberately repeating names (`Member 0000`–`0999`
across 100,000 rows) and only two distinct roles. That is the point: with unique
sort values a broken tiebreak still looks correct, because no page boundary ever
lands inside a run of equal values. `role:desc` puts 100,000 rows into two
groups, so essentially every boundary is inside one.

## Test coverage

```yaml
- file: apps/gui/src/features/Organizations/index.tsx
  line: 134
  severity: high
  comment: >
    M03-T06 capped the server response at 50 rows while this component read
    resp.members from a single call, so the Roles & Permissions table silently
    showed the first 50 members of an organization with nothing on screen
    indicating more existed. A regression introduced by the previous task in
    this milestone and closed here rather than carried into T08. The new GUI
    test was confirmed to fail against the unfixed component, not merely to
    pass against the fixed one.
```

The 100,000-row proof is a script, and its numbers are recorded in the journal.
The committed GUI test uses two pages, which is the smallest fixture that
distinguishes "follows the cursor" from "reads the first response".

## Architectural drift

No contract change was needed: `ListOrgMembersRequest.page` and
`ListOrgMembersResponse.page` were already declared. The task's framing — "honour
the `page` field the contract already declares" — was accurate, and the server
half landed in T06. What remained was the client.

The GUI loads every member into memory via `fetchAllPages`, matching the
existing idiom in `features/Agents`. That is correct but not the destination:
at 100,000 members it is 100,000 rows in the browser. **M03-T08** replaces it
with a virtualized, server-filtered table. Recorded so the interim is not
mistaken for the design.

## Security

No authorization change. `assertOrgMember` still gates the endpoint and the base
condition pins `orgId`, so no cursor can walk into another organization's rows —
worth checking explicitly, since a cursor is caller-supplied state and the
obvious failure mode for cursor pagination is trusting it to carry scope. It
carries only a sort value, an id, a count and the filter; the org comes from the
request and is re-authorized on every page.

## Verdict

**Approved.** One high finding — a regression from T06, found and fixed here.
