---
id: ADR-0006
status: accepted
date: 2026-08-15
milestone: M03
---

# Enforce write permission with an explicit assertion, not an interceptor

## Context

`viewer` is one of four org roles (`owner`, `admin`, `member`, `viewer`,
`lib/authz.ts:38`) and the Organizations UI describes it in plain text as
read-only. It is not. Mutating handlers gate on `assertOrgMember`, which admits
any member regardless of role, so a viewer can create, update, delete, archive
and purge across the product.

The scale of the gap: the contract declares **73 RPCs, 56 of them mutating**.
Every one of those 56 is currently writable by a role the UI promises cannot
write. This is a privilege-escalation defect, not a missing feature, and
`security-standard.md` §2 requires handlers to verify the caller "genuinely
holds ownership/role rights against the target database resource".

The hard part is not the check. It is making the check impossible to forget on
RPC number 57.

## Options

**A. Explicit `assertOrgWriter(db, userId, orgId)` at each call site.**
Matches the existing idiom exactly — handlers already call `assertOrgMember`,
`assertOrgAdmin` and `assertOrgOwner` the same way. Greppable, obvious in
review, and the org id is already resolved at that point in every handler
(often via `getTaskOrgId` and friends, which cost a query the interceptor would
have to duplicate).

Its weakness is real: nothing stops a new handler from omitting the call. It is
a convention, and conventions decay.

**B. A Connect interceptor keyed on method name.** One place, unforgettable, no
handler can opt out. But an interceptor runs before the handler and has only the
request message — for task, artifact, comment and repository RPCs the org id is
not in the request, it is reached by walking artifact → folder → project → org.
The interceptor would have to perform that walk and the handler would then do it
again, doubling the query cost on the hot path. It also has to decide "is this
mutating?" from the method name, which makes a naming convention load-bearing
for security: an RPC called `syncRepository` or `applyTemplate` is a write that
no verb prefix catches.

**C. Both — interceptor as a backstop, assertions for real.** Pays B's query
cost everywhere for a guarantee that a test can provide for free.

## Decision

Take **A**, and buy back what it lacks with a test rather than with runtime
machinery: a single contract-driven sweep enumerates every RPC from the
generated service descriptors and asserts a viewer is denied, **denying by
default** — any method not on an explicit read allowlist must reject a viewer,
or the suite fails.

That inverts the decay. Adding RPC 57 without a guard does not silently ship;
it breaks the build, and the allowlist is the one place where "this endpoint is
readable by a viewer" has to be written down and reviewed.

## Consequences

**Easier.** No new request-path cost: the assertion reuses an org id the handler
has already resolved. The check reads the same as every other authorization
check in the file, so there is one idiom to learn. Denial is testable per
endpoint without booting an interceptor stack.

**Harder.** The guarantee is only as good as the sweep. If the sweep cannot
invoke a method generically — because its request needs a valid foreign key to
get far enough to reach the authorization check — that method needs a fixture,
and a method skipped for convenience is a hole. **Skips must be explicit and
justified in the allowlist, never silent.**

**What this forecloses.** Nothing structural. If a future requirement needs
permission decisions outside handlers — M10 replaces roles with policy
evaluation — an interceptor or a policy middleware can be added then, with the
sweep still in place to prove it did not regress.

**Deliberately not solved here.** The allowlist encodes "readable by a viewer",
which is a policy statement living in test code. M10 turns roles into data, and
should move it to wherever permissions then live. Recorded so that milestone
inherits the debt rather than discovering it.

**Related.** [ADR-0005](./ADR-0005-hand-rolled-ui-primitives-instead-of-shadcn-and-radix.md)
made the same trade in a different place — accept a convention, buy the
guarantee back with a gate rather than a dependency.
