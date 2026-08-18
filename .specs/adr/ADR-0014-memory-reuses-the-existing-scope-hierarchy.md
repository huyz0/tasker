---
id: ADR-0014
status: accepted
date: 2026-08-18
milestone: M21
---

# Beliefs are scoped through ADR-0013's existing `organization`/`team`/`project` hierarchy, not a new tier

## Context

M21 introduces a shared memory/belief system: agents and humans record
facts scoped to a project or org, promotable to team/project/org, with
every entry traceable to who/what asserted it and when. The natural first
question is what "scoped to a project" *means* as data — whether this
needs its own scoping primitive or can reuse what ADR-0013 (M10) already
built.

ADR-0013 established `grants{subjectType, subjectId, scopeType:
'organization'|'team'|'project', scopeId, roleId}`, resolved through one
entry point `can(principal, scope, permission)`
(`apps/backend/src/lib/policy.ts`), with ancestor resolution (a `project`
scope also checks its owning `organization`). This is exactly the
"scoped at project and org... promotable to team, project or org" shape
the feature asks for.

The one thing ADR-0013's hierarchy does *not* have is anything narrower
than `project` — no "agent-private" or "session" tier. A belief system
described with prior art (Mem0/Zep/Letta-style agent memory) often starts
at a private, per-agent/per-session scope and promotes upward from there.

## Options

**Reuse the three existing scope types (`organization`/`team`/`project`)
unchanged; capture always writes at `project` scope, the narrowest tier
that already exists** (chosen). A belief is `project`-scoped from the
moment it's recorded; "promotion" moves it project→team, project→org, or
team→org via the new `promoteBelief` RPC, using the exact same
`grants`/`can()` machinery every other resource already goes through.

**Add a fourth, narrower scope type (`agent` or `session`)** (rejected).
Would require touching `grants.scopeType`'s enum, `can()`'s resolution
algorithm, and every place that already assumes ADR-0013's three-type
closed set (schema constraints, GUI scope pickers, CLI flag validation)
— for a distinction the feature's own description doesn't actually ask
for. The user's framing is "scope at project and org... promote them to
team, project or org level," which describes exactly the existing
hierarchy's bottom two rungs, not something below them. A private,
not-yet-shared belief is still a *project*-scoped fact in this model;
"who can see it" within that scope is a separate, later question (see
Consequences), not a reason to invent a fourth tier now.

**Model beliefs as unscoped, globally visible rows filtered only by
`orgId`** (rejected). Fails the explicit "scope at project" requirement
outright, and throws away the one governance primitive (project-level
grants, independent of the rest of the org) ADR-0013 exists to provide.

## Decision

`Belief.scopeType` is `'project' | 'team' | 'organization'` — literally
ADR-0013's existing enum, no new values. Every belief has an `orgId` plus
a `(scopeType, scopeId)` pair resolved through the same `can()` entry
point every other resource uses, gated by a new `memory:{read,write,
admin}` permission family added to ADR-0013's table. Promotion
(`promoteBelief`, `memory:admin`-gated) changes `(scopeType, scopeId)` in
place and appends a `BeliefPromotion` audit row; it does not create a new
scope tier, only moves an existing belief between the tiers that already
exist.

## Consequences

**Easier.** Zero changes to `grants`, `can()`, or any existing scope-
handling code — `assertCan`/`authorizePrincipal` work on `Belief` exactly
as they do on `Project`/`Task`/every other resource. An org that already
understands "grant this team `project:write` on project X" understands
"grant this team `memory:read` on project X" with no new mental model.
Ancestor resolution (project scope also checks the owning org) applies
for free, so an org-wide role already reaches every project's beliefs
without a special case.

**Harder.** There is no way to express "visible only to the agent that
wrote it, not yet the whole project" — every belief is at minimum
project-visible to anyone with `memory:read` on that project from the
moment it's recorded. If a genuinely private agent-scratch-memory need
surfaces later, it is a new decision (and likely a new ADR), not
something this model quietly supports.

**Foreclosed, for now.** A fourth "below project" scope tier. Nothing
here prevents adding one later — `Belief.scopeType` would need a new
value and `can()`'s resolution algorithm would need a new branch — but
building it speculatively, before any concrete need has been named, is
exactly the kind of complexity ADR-0013 itself rejected when it declined
ABAC: "no request has needed this."
