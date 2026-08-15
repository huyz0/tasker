---
id: ADR-0007
status: accepted
date: 2026-08-15
milestone: M03
---

# Agent roles belong to exactly one organization

## Context

`agent_roles` has no `orgId`. It is a single global catalogue shared by every
tenant, and `lib/authz.ts:84` guards writes to it with `assertOrgAdminOfAny` —
admin of *any* organization, anywhere. The comment there is candid about why:
there was no single org to check against.

The consequence is a cross-tenant write. An admin of a one-person organization
can rewrite the system prompt of a persona that another organization's agents
run on, and every agent picking that role up afterwards executes the edited
prompt. An agent role is not a label; it is instructions an autonomous worker
follows.

A role carries `name`, `systemPrompt` and `capabilities`. Nothing about it is
inherently global — the shared catalogue was a convenience, not a decision.

## Options

**Leave it global, gate writes on a platform-admin role.** Honest about the
data model, and defensible if the catalogue were curated by whoever operates
the deployment. But no platform-admin role exists, M10 owns roles-as-data, and
inventing a fifth role here to protect a table is a large change in the wrong
place.

**Many-to-many: a role belongs to any number of organizations.** Preserves
sharing, and lets one well-written persona serve several tenants. Costs a join
table, a second authorization question (who may add an org to a role?), and it
makes "edit this role" ambiguous forever — an edit is either for everyone who
shares it or for nobody, and neither answer is right.

**One organization per role.** A role is an org's own asset. Authorization
becomes the same `assertOrgAdmin` used everywhere else. Sharing is lost:
two organizations wanting the same persona each keep a copy, and a fix to one
does not reach the other.

## Decision

One organization per role. `agent_roles.org_id` is `NOT NULL` and references
`organizations`, and every write is gated on `assertOrgAdmin` for that org.

The migration backfills from the agents that reference each role, and its
behaviour in the awkward cases is the substance of this decision:

- **Referenced by agents in exactly one org** → assigned to that org.
- **Referenced by agents in more than one org** → the migration **aborts**. The
  data does not say which organization owns the role, and picking one would
  silently transfer another tenant's persona. Failing at deploy time with the
  offending ids is recoverable; guessing is not.
- **Referenced by no agent at all** → **deleted**. Nothing points at the row and
  no organization can claim it. The alternative is a nullable `org_id` meaning
  "unowned", which permanently weakens the constraint for rows that, by
  definition, nobody is using.

## Consequences

**Easier.** Authorization is the same check as every other org-scoped write.
`listAgentRoles` becomes org-scoped, so an organization's role list is its own.

*Corrected during implementation:* this originally said `assertOrgAdminOfAny`
"goes away entirely". It does not. `modules/telemetry/telemetry.ts` still uses
it to gate `/api/debug/*`, which is genuinely platform-wide rather than
org-scoped. The helper leaves the agents surface and keeps exactly one caller.

**Harder.** Sharing a persona between organizations now means copying it, and
the copies drift. If a deployment ever wants a curated common library, that is a
new concept (a template, seeded per org) rather than a shared row.

**Migration is not reversible in place.** Deleted orphan roles are gone, and an
aborted migration leaves the column added but unpopulated. Both are stated in
the migration's own comment so an operator reads them before running it.

**Contract.** `orgId` is added to `AgentRole`, `CreateAgentRoleRequest` and
`ListAgentRolesRequest` as **new field numbers**, which is backward compatible
per `api-standard.md` §2. Existing clients keep working and simply do not send
or read it; the server rejects a create with no `orgId`, which is the intended
break.

**Foreclosed.** Cross-org sharing. If that turns out to be wanted, it needs a
new ADR superseding this one and a join table — not a nullable `org_id`, which
would reintroduce the ambiguity this decision exists to remove.

**Related.** M03-T01 ([ADR-0006](./ADR-0006-explicit-writer-assertion-over-a-mutation-interceptor.md))
recorded `assertOrgAdminOfAny` as a known tenancy hole and deferred it here.
