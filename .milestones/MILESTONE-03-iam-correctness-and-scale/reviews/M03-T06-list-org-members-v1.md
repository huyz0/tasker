---
task: M03-T06
version: v1
timestamp: 2026-08-15
decision: approved
---

# Review — M03-T06 Rewrite listOrgMembers on the paginated query

## Correctness

The verify line is measured, not estimated. Against an organization of 100,001
members:

| Query | Median |
|---|---|
| page 1, default sort | 62.8 ms |
| page 1, sorted by name | 76.3 ms |
| filtered search | 117.0 ms |
| deep page via cursor | 28.5 ms |

All under the 200 ms budget. The old implementation was also run at that size to
confirm it fails rather than merely being slow: `SQLite query expected 34464
values, received 100000`. The milestone estimated the ceiling at "roughly
32,000"; the measured ceiling in this bun:sqlite build is 34,464.

The join is `innerJoin`. A membership row whose user is missing is not a person
anyone can act on, and surfacing it as a blank-named entry only produces a
support question — but it is a deliberate choice and worth stating, because it
means such a row becomes invisible rather than visible-and-broken.

```yaml
- file: apps/backend/src/db/query-builder.ts
  line: 198
  severity: high
  comment: >
    The first version passed no default sort, so the helper fell back to
    table.createdAt — a column organization_members does not have; it records
    joinedAt. Drizzle interpolated the undefined column and SQLite reported
    "no such column: desc", which names neither the table nor the real problem.
    Fixed with an explicit defaultSort in the shape. Any future caller whose
    table lacks createdAt hits the same wall, which is why the option is
    documented rather than the column special-cased.
```

## Test coverage

Four behavioural cases (bounded page, name-or-email search, sort by a joined
column, paging visits each member exactly once) plus the existing suite.

The paging test asserts `new Set(seen).size === seen.length` as well as the
total. Counting alone would pass if the cursor skipped one member and returned
another twice, which is the characteristic cursor bug.

The 100k measurement is a script rather than a test. That is deliberate: seeding
100,000 rows takes ~1.7 s and the assertion is a latency budget, which belongs
in the milestone record as a number rather than in the suite as a flaky gate.
The committed tests use hundreds of rows and assert behaviour; the numbers above
are reproducible from the journal.

## Architectural drift

`executePaginatedQuery` gained an optional `PaginatedQueryShape`. The
alternative — a second, member-specific cursor implementation — was rejected
because two cursor encoders that drift apart produce cursors decoding to the
wrong page, and nobody notices until a user reports skipped rows.

The join is applied to the count query as well as the page. It has to be: the
filter references joined columns, and counting without the join would report a
total the caller can never page to.

## Security

```yaml
- file: apps/backend/src/db/query-builder.ts
  line: 139
  severity: low
  comment: >
    applyFilter now accepts an array of columns and ORs them. Each clause still
    goes through escapeLikePattern and parameter binding, so the multi-column
    form introduces no new injection surface — the columns come from the
    handler, never from the request. Worth stating because "filter accepts a
    list now" is the kind of change that invites passing a caller-supplied
    field name next.
```

Authorization is unchanged: `assertOrgMember` on the caller, and the base
condition pins `orgId`, so the join cannot reach another organization's rows.

## Verdict

**Approved.** One high finding, found by the tests and fixed within the task.
