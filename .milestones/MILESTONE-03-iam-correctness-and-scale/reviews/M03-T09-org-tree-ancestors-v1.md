---
task: M03-T09
version: v1
timestamp: 2026-08-15
decision: approved
---

# Review — M03-T09 Never drop a sub-organization at a page boundary

## Correctness

The defect was invisible rather than wrong-looking. A child whose parent landed
on a different page arrived in the response with a `parentOrgId` matching
nothing loaded, so the client's nesting loop put it in `childOrgsByParent` under
a key nothing iterates — present in the data, never drawn. Nothing errored and
nothing rendered at the wrong depth; the organization simply was not there.

The fix resolves the missing parents server-side and returns them as
`ancestors` (field 3, new number). The client merges them into the node set,
deduped by id, because a parent can arrive as an ancestor on one page and as an
ordinary row on the next.

The task offered "return organizations as a tree, **or** resolve ancestors".
Ancestors was taken because a tree and a cursor do not compose: a page is a
slice of an ordering, and a tree is not sliceable without either sending whole
subtrees (unbounded, which is the defect this milestone exists to remove) or
inventing a second traversal order.

No finding.

## Test coverage

Three backend cases and two GUI cases.

The backend case pages with `limit=1` and, for every organization on every page,
walks its ancestor chain using only what that page made visible. That is the
verify line stated exactly: not "the ancestors array is non-empty" but "depth is
resolvable from what the client actually has".

```yaml
- file: apps/backend/src/modules/orgs/orgs.test.ts
  line: 0
  severity: medium
  comment: >
    The test was proven capable of failing: with ancestor resolution stubbed to
    an empty array it fails naming the dropped organization
    ("org child-a-… has no resolvable parent on its page"). Without that check
    the test would have passed against any implementation, because a
    single-page hierarchy resolves fine on its own — the fixture's names are
    chosen so name:asc separates every child from its parent, which is what
    makes limit=1 meaningful rather than incidental.
```

The fixture's leftover double-seed (`seedHierarchy` called twice, one result
discarded) was removed. It did not affect the assertion but would have confused
the next reader into thinking two hierarchies were needed.

## Architectural drift

`ListOrgsResponse` grows a field rather than changing shape, so existing
clients are unaffected — they read `organizations` and ignore `ancestors`,
which is exactly the pre-fix behaviour.

## Security

```yaml
- file: apps/backend/src/modules/orgs/orgs.handler.ts
  line: 100
  severity: high
  comment: >
    Ancestor resolution is restricted to organizations the caller is already a
    member of. Without that restriction this becomes a disclosure: a person can
    be a member of a sub-organization without being a member of its parent, and
    returning the parent unconditionally would hand them the name of an
    organization they were never added to. The restriction is enforced by
    intersecting with memberOrgIds, which listOrgs already computes, and there
    is a test seeding exactly that shape ("Secret Holdings") asserting the
    ancestors array stays empty.
```

That case was the reason to think about this at all: the pagination defect only
involves organizations the caller can already see, so it was tempting to fetch
parents unconditionally and call it equivalent. It is not.

## Verdict

**Approved.** One high finding, designed out rather than found late, with a test
pinning it.
