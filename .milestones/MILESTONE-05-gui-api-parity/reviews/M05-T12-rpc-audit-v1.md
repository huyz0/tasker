---
task: M05-T12
version: v1
timestamp: 2026-08-15
decision: approved
---

# Review — M05-T12 RPC coverage audit

## Correctness

95 RPCs across 14 services. 92 are called by the GUI; three are excepted with
reasons, recorded in `MILESTONE.md` and in the gate itself. The verify line —
"the exit criterion's list exists and is justified" — is met, and then some: the
list is checked rather than asserted.

```yaml
- file: apps/gui/scripts/rpc-coverage.mjs
  line: 0
  severity: medium
  comment: >
    The task asks for an audit. An audit answers the question once, and the
    interesting case is the *next* RPC - one added in a later milestone and
    reachable only from the CLI is precisely the defect this milestone existed
    to remove, and nobody would notice until someone repeated the audit by
    hand. So the audit is a gate that runs on every build, with main.tsp as a
    declared input so adding an RPC invalidates the cache. Proved by injection:
    adding a fake RPC to a copy of the contract fails it with the right name.

- file: apps/gui/src/features/Agents/index.tsx
  line: 0
  severity: medium
  comment: >
    The audit found one genuine gap rather than a documentation task.
    createAgentRole was unreachable - roles could be edited but never created -
    and since deploying an agent requires choosing a role, an organization
    starting from nothing could not deploy its first agent from the browser at
    all. Now wired, with two tests.
```

## Test coverage

Seven tests for the gate, in `node:test` like `design-lint`'s. They matter
because a gate nobody tests is a gate trusted on faith — the lesson M05-T01
recorded when `design-lint` turned out to have no tests of its own. They cover a
contract parsed into RPCs, a clean pass, a failure, an exception excusing it, a
**stale** exception (listed but now called — a note that outlives its reason is
worse than none, because it claims the GUI cannot do something it does), calls
inside test files not counting, and every real exception carrying more than a
token reason.

Two GUI tests for role creation, including the failure path.

## Architectural drift

None. The gate follows `design-lint`'s shape exactly: zero dependencies, its own
tests run first in the same moon task, environment variables as the seam its
tests use.

```yaml
- file: apps/gui/scripts/rpc-coverage.mjs
  line: 0
  severity: low
  comment: >
    The check matches method names textually - `.methodName(` anywhere in a
    non-test source file. A local helper sharing an RPC's name would count as a
    call. The names are distinctive enough (listTaskArtifactLinks,
    reorderTaskStatuses) that this has not happened, and the failure mode is a
    false pass on one RPC rather than a false alarm; a stricter check would need
    to resolve the client object each call is made on, which is a type-checker's
    job and not worth reimplementing here. Recorded rather than hidden.
```

## Security

None of this changes an authorization path. `createAgentRole` was already
implemented and already gated; the GUI simply never called it.

## Verdict

**Approved.** Two mediums — the audit made structural rather than one-off, and a
real gap it found and closed — and one low recorded about the matching strategy.
