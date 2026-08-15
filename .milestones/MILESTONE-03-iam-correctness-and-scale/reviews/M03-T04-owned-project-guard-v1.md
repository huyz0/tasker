---
task: M03-T04
version: v1
timestamp: 2026-08-15
decision: approved
---

# Review — M03-T04 Require reassignment of owned projects

## Correctness

The guard runs after the last-owner check and before the membership delete, so
both refusals are ordered most-specific-last and neither can be reached with the
row already gone.

Two decisions in the implementation are worth stating because the obvious
alternative is wrong in each case:

- **Archived projects count.** Filtering on `deletedAt IS NULL` would let a
  member leave while owning a binned project, and restoring that project later
  reintroduces the dangling owner through the back door. There is a test.
- **The scope is `orgId` *and* `ownerId`,** not `ownerId` alone. A person may
  own projects in several organizations; leaving one must not be blocked by
  work in another.

The T02 review's forward-flag is discharged: the guard sits above the branch, so
the leave path is covered by construction rather than by remembering to add it.
There is a test for the leave path specifically.

No finding.

## Test coverage

Six backend cases and one GUI case. Two of the six are controls that passed
before the change — a member owning nothing is still removable, and removal
succeeds once projects are reassigned — which is what distinguishes "the guard
works" from "removal is broken".

```yaml
- file: apps/backend/src/modules/orgs/orgs.test.ts
  line: 0
  severity: low
  comment: >
    The fixture initially inserted two projects without a `key`, which both took
    the column default and collided on the (org_id, key) unique index. The
    failure surfaced as SQLITE_CONSTRAINT_UNIQUE inside the seed rather than as
    an assertion, which is exactly the shape test/setup.ts's fixture() wrapper
    exists to make legible. This fixture builds rows directly and so does not
    get that framing; not changed, but worth knowing when adding to it.
```

## Architectural drift

No ADR. The alternatives — cascade the projects to the removing admin, or null
the owner — both make a data decision on the user's behalf that they may not
want, and neither has a consequence worth a file. Refusing with the ids is the
option that leaves the choice where it belongs.

## Security

```yaml
- file: apps/backend/src/modules/orgs/orgs.handler.ts
  line: 195
  severity: low
  comment: >
    The refusal message enumerates project ids. The caller is already an org
    admin or the member themselves, and the ids are scoped to that one
    organization, so this discloses nothing the caller cannot list directly.
    Recorded because "put the ids in the error" is a habit that leaks in other
    contexts, and the reasoning that makes it safe here is the org scope.
```

## GUI

No component change was needed: the view already renders the mutation error
verbatim, and the server's message carries the ids. Adding string parsing to
re-render them as a list would have coupled the component to the wording of a
server message for no gain. A test asserts the ids reach the screen, so a future
change that swallows or truncates the message fails.

## Verdict

**Approved.** Two low findings, both informational.
