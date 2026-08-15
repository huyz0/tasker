---
task: M03-T05
version: v1
timestamp: 2026-08-15
decision: approved
---

# Review — M03-T05 Scope agent roles to an organization

## Correctness

The change spans contract, schema, migration, handler, CLI, GUI and seed, and
the verify line is proven directly: an admin of org A calling `updateAgentRole`
on org B's role is rejected, and the row's `systemPrompt` is re-read afterwards
to confirm nothing was written.

Three details where the naive version is wrong:

- **`updateAgentRole` scopes on the role's own `orgId`, read from the row**, not
  on anything the caller sent. Taking an `orgId` from the request would let a
  caller name an org they *do* administer while pointing `id` at a role in one
  they do not.
- **`createAgent` rejects a role from another org with `NotFound`, not
  `PermissionDenied`.** Answering "that role exists but you may not use it"
  turns the endpoint into a probe for other tenants' role ids.
- **`listAgentRoles` requires membership, not admin.** A member picking a role
  for an agent needs the list; scoping it is what stops the leak, not gating it.

```yaml
- file: apps/gui/src/features/Agents/index.tsx
  line: 40
  severity: medium
  comment: >
    The roles query key was ['agentRoles'] with no org in it. Left as-is with
    the request now carrying orgId, switching organizations would have served
    the previous org's roles from cache — a cross-tenant leak introduced in the
    client rather than the server. Fixed in this task: the key is
    ['agentRoles', activeOrgId] and the query is disabled until an org is
    active.
```

## Test coverage

Six migration cases, five tenancy cases, plus the existing agents suite updated.
The migration is tested against a database built in the *pre*-migration shape,
because running it through drizzle's migrator would only ever exercise the
empty-database path.

```yaml
- file: apps/backend/drizzle-sqlite/0021_scope_agent_roles_to_org.sql
  line: 27
  severity: high
  comment: >
    The abort guard did not work as first written and the migration test is the
    only reason that was discovered. bun:sqlite silently discards errors from
    any statement after the first in a single run() call, so a guard sharing a
    chunk with the CREATE TABLE before it completed without throwing — the
    migration would have picked an arbitrary owner for a shared role and
    reported success. Fixed by giving every statement its own breakpoint chunk,
    with the reason written into the migration so nobody merges them back.

- file: apps/backend/drizzle-sqlite/0021_scope_agent_roles_to_org.sql
  line: 18
  severity: medium
  comment: >
    A comment in the file quoted the literal breakpoint marker, and drizzle
    splits on that exact string wherever it appears — including inside a
    comment. That produced a comment-only chunk which fails as invalid SQL.
    Both defects were caught by the test, neither by review.

- file: apps/cli/cmd/agents_test.go
  line: 0
  severity: medium
  comment: >
    The --org requirement test passed spuriously at first: cobra keeps flag
    values on the command object and every test in the binary shares one
    rootCmd, so an earlier test's --org was still set. It now resets both flags
    explicitly, with the reason inline. Any other negative flag test in this
    package has the same hazard.
```

## Architectural drift

Implements [ADR-0007](../../../.specs/adr/ADR-0007-agent-roles-belong-to-one-organization.md)
as written: one org per role, `NOT NULL`, abort on shared, delete orphans. The
contract change uses new field numbers only, per `api-standard.md` §2.

`assertOrgAdminOfAny` survives — `modules/telemetry/telemetry.ts` still uses it
for the `/api/debug/*` routes, which are genuinely platform-wide rather than
org-scoped. ADR-0007 says the helper "goes away entirely"; that is now wrong and
is recorded here rather than left to be discovered.

## Security

The pre-change state was a cross-tenant write on data that is executable
instruction text, which is the most consequential authorization defect found in
this milestone. It is closed on the server, and the GUI cache-key fix closes the
client-side half.

No finding beyond those above.

## Verdict

**Approved.** One high and three medium findings, all found and fixed within the
task. One correction filed against ADR-0007's own text.
