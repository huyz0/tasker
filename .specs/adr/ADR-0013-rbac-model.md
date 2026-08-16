---
id: ADR-0013
status: accepted
date: 2026-08-16
milestone: M10
---

# Roles become data composed from a fixed permission vocabulary, granted at organization, team or project scope through one `can()` entry point

## Context

Today authorization is four hardcoded strings (`'owner' | 'admin' | 'member' |
'viewer'`, `lib/authz.ts:41`) checked by name at roughly ninety call sites
(`assertOrgMember`/`assertOrgWriter`/`assertOrgAdmin`/`assertOrgOwner`,
ADR-0006's explicit-assertion pattern). It works, and M03's deny-by-default
sweep (`viewer-denial.test.ts`) keeps it honest, but it cannot express what
the product roadmap already promises: an organization defining its own
roles, access scoped to a team or a single project without handing out the
whole organization, or the stated target of 20,000 teams. This ADR is the
one M10 is built from — the schema (T02), the migration (T03), `can()`
itself (T04), the mass call-site replacement (T05), and team/hierarchy
resolution (T07-T10) all encode the choices made here.

A full RPC-by-RPC audit was run before writing this (recorded below rather
than re-derived by a future reader) to make sure the permission vocabulary
covers every existing call site, not just the common ones.

Constraints already in place:

- M03's deny-by-default principle must survive: an unclassified RPC should
  fail closed, not open.
- ADR-0008 (agent tokens) explicitly deferred this decision: "per-RPC
  permission strings... is M10's job, and M10 gets to design it against a
  real policy model" — and separately, "giving people a parallel permission
  system is M10's decision," flagging that agent-token scopes and
  human-role permissions are not yet unified.
- No new dependency without justification (`AGENTS.md`) — ruling out an
  external policy engine before even weighing it on its own merits (also
  explicitly out of scope per this milestone's plan).
- Exit criterion: "every existing organization behaves identically after
  migration." The permission vocabulary and the seeded system roles are
  therefore derived *from* the current four tiers' actual behavior, not
  designed independently and hoped to match.

## Options

### 1. Overall model

**Data-driven RBAC: roles are rows composed from a fixed permission
vocabulary; `grants` bind a subject to a role at a scope** (chosen). A
`role` is a name plus a set of `role_permissions` rows; a `grant` says
"this subject (a user or a team) holds this role at this scope."

**Keep the fixed four-tier enum, add more tiers as needed** (rejected) — this
is the status quo the milestone exists to replace. It cannot express a
custom role ("QA Lead: can transition tasks and view artifacts, nothing
else") without a code change and a new enum value, and it cannot express
scope narrower than the whole organization at all.

**Attribute-based access control (ABAC) or an external policy engine (OPA,
Casbin, Cedar)** (rejected, and out of scope per this milestone's own Scope
section). Buys expressiveness this product has not asked for (no request
has needed "grant access only during business hours" or similar
attribute-conditioned rules) at the cost of a new dependency, a new
language/DSL to maintain, and — for an external engine specifically — a
network or sidecar call on every authorization decision this app currently
answers in-process. Role-based-with-scoped-grants covers everything the
roadmap and this audit found.

### 2. Permission vocabulary

**Fixed set of `<family>:<verb>` strings, one family per resource type
already in the contract, verbs drawn from `{read, write, admin}` plus two
named exceptions** (chosen). Full list:

| Family | Permissions | Derived from (current gate) |
|---|---|---|
| `org` | `read`, `admin`, `owner` | M / A / O on `OrgService` |
| `project` (incl. templates) | `read`, `write`, `admin` | M / W / A on `ProjectService` + `ProjectTemplateService` |
| `tasktype` | `read`, `write` | M / W on `TaskTypeService` (no admin-tier action exists today) |
| `task` | `read`, `write`, `admin` | M / W / A on `TaskService` |
| `tasknote` | `read`, `write` | M / W on `TaskNoteService` |
| `agent` (roles + instances + tokens) | `read`, `write`, `admin` | M / W / A on `AgentService` |
| `artifact` (incl. folders, task-links) | `read`, `write`, `admin` | M / W / A on `ArtifactService` |
| `comment` | `read`, `write` | M / W on `CommentService` |
| `label` | `read`, `write` | M / W on `LabelService` |
| `repository` | `read`, `write`, `admin` | M / W / A on `RepositoryService` |
| `search` | `read` | M on `SearchService` |
| `dashboard` | `read` | M on `DashboardService` |
| `team` | `read`, `write`, `admin` | new (M10 introduces the resource) |
| `role` | `manage` | new (creating/editing custom roles is itself a permission) |

`auth`/credential RPCs (`getIdentity`, `setPassword`, `listLinkedIdentities`,
`unlinkIdentity`) stay **outside** the permission system entirely — they act
on the caller's own account, gated by `requireUser` alone, exactly as M13
left them (`NOT_ORG_SCOPED` in `viewer-denial.test.ts`). `AuthService.
adminResetPassword` is the one exception: it acts on *another* member and
maps to `org:admin`, matching its current `assertOrgAdmin` gate exactly.
`OrgService.seedOrg` for a **top-level** org also stays outside the
permission system (any authenticated human may found one; only creating a
*sub*-org checks `org:admin` on the parent) — this is the current
behavior, named explicitly here rather than left implicit.

**Per-RPC permission strings (98 of them)** (rejected) — this is the option
ADR-0008 pointed at and rejected for the *agent* scope vocabulary, and the
reasoning holds here too: a permission per RPC turns every new endpoint into
a required migration of every existing role, and produces a matrix no admin
could review (98 columns instead of ~30). The chosen granularity matches
what the current four tiers already distinguish — introducing finer
distinctions the product has never asked for is speculative complexity, not
correctness.

**Reuse the existing narrow set — fold `comment`/`label`/`search`/
`dashboard` into whichever neighboring scope they currently borrow
(`tasks:read`, `projects:read`)** (rejected). That borrowing exists in
`AGENT_RPC_SCOPES` only because ADR-0008 deliberately kept the *agent* scope
vocabulary small for a narrower principal. A general-purpose permission
system checked by humans and agents alike should name a comment a comment;
keeping the borrowed shape here would make `role:manage`-style custom roles
misleading (granting `label:read` would do nothing — `projects:read` would
be the real key).

### 3. Scope hierarchy

**Three scope types: `organization`, `team`, `project`; a grant's `scope`
column names one, `scope_id` the specific row** (chosen). Resolution when
checking `can(principal, {type, id}, permission)`:

1. Direct grants: any role granted to the principal at exactly this scope.
2. Team-derived grants: any role granted to a team the principal belongs to,
   at this scope.
3. Ancestor grants: a `project` scope also checks grants at its owning
   `organization` (today's "org role reaches every project" behavior,
   preserved); an `organization` scope also checks grants at its ancestor
   organizations once T09 lifts the nesting cap (a parent-org grant reaches
   descendants).

A grant at `project` scope is never checked when resolving a *different*
project, even a sibling under the same org — this is exit criterion 6's own
wording, and the reason `scope_id` is part of the grant's identity, not a
filter applied after the fact.

**Two scope types only (organization, project) — fold team access into
direct per-project grants** (rejected). Meets the letter of "grant at team
scope" by never actually storing a team-scoped grant, but reintroduces
exactly the N-grants-per-team-member problem teams exist to solve: adding
one person to a 100-member team would mean writing (or not writing, and
therefore *not actually granting*) up to 100 individual project grants
instead of one team grant.

### 4. Agent tokens: kept as their own system, not folded into `grants`

**Agent principals keep ADR-0008's closed scope vocabulary and continue to
resolve through `authorizePrincipal`'s existing branch; `can()` is the human
path** (chosen). `authorizePrincipal(db, principal, orgId, {scope, write})`
keeps branching on `principal.kind`: human → `can(principal, {type: 'org',
id: orgId}, permission)`; agent → today's `(token.orgId === orgId) &&
token.scopes.includes(scope)` check, unchanged.

**Model an agent token as a subject that can hold `grants` too** (rejected
for now, not foreclosed permanently). ADR-0008's scope vocabulary is
deliberately narrower than the full permission list above (8 scopes,
chosen specifically so a token's blast radius is easy to reason about) and
excludes whole categories categorically (org administration, `AuthService`,
token issuance itself) regardless of any scope granted — collapsing that
into the general grant system would either weaken those categorical
exclusions or require re-deriving them as a second set of rules layered on
top of `grants`, which is the two-systems problem in a different shape.
Revisit if agent tokens ever need team membership or custom scope sets;
nothing in this schema forecloses adding `subject_type: 'agent'` later.

### 5. Migration: four tiers become seeded, immutable system roles

**`owner`/`admin`/`member`/`viewer` are inserted as rows in `roles` (one set
of global system roles, not per-organization), each wired to
`role_permissions` reproducing exactly what that tier can do today per the
table in Option 2; every existing `organization_members` row becomes a
`grants` row at `scope: organization` referencing the matching system
role** (chosen). System roles are marked immutable (not editable, not
deletable) so an admin cannot accidentally break the tier a viewer-denial
sweep already depends on.

Concretely, from the audit: `viewer` = every `*:read` permission and nothing
else. `member` = viewer's reads plus every `*:write` (including `team:write`
and `agent:write`, matching that members can create agents today).
`admin` = member's reads and writes plus every `*:admin` plus `role:manage`.
`owner` = admin plus `org:owner`. This is a direct restatement of which
`assert*` function each current tier already passes, not a new design —
which is what makes exit criterion 4 ("every existing organization behaves
identically") checkable rather than aspirational.

## Decision

Permissions are `<family>:<verb>` strings from the fixed, documented table
above. Roles are named compositions of permissions, stored as data. Grants
bind a subject (a user or a team) to a role at one of three scopes
(organization, team, project), with ancestor resolution (project → org, and
eventually org → parent org) folded into `can(principal, scope, permission)`
— the single authorization entry point every handler calls instead of
naming a role. The four current tiers ship as immutable, seeded system
roles reproducing today's behavior exactly. Agent tokens keep ADR-0008's
separate, closed scope system; `can()` governs the human path only.

## Consequences

**Easier.** An organization can define "QA Lead: `task:write`, `artifact:
read`, nothing else" without a code change. Granting access to one project
without the whole org (exit criterion 6) becomes a real, storable fact
instead of an unsupported request. A hundred custom roles is a query, not
an enum with a hundred values.

**Harder.** Every one of ~90 call sites changes (T05), and grant resolution
is a database round trip an inline enum comparison never was — T06 exists
specifically to keep that from multiplying queries per request. Two
authorization systems (human grants, agent scopes) now coexist
indefinitely rather than converging into one, which is a real ongoing cost
in "which system do I read to understand what this token/user can do,"
paid deliberately to avoid weakening ADR-0008's categorical agent
exclusions.

**Foreclosed, for now.** Attribute-based conditions (time-of-day, IP range,
resource attributes beyond its scope) — nothing here prevents adding them
later, but nothing here builds toward them either. Delegated administration
(a non-admin granting a permission they don't themselves hold) — `can()`
answers "does X have permission Y at scope Z," not "may X grant Y," and
that second question has no model yet. SCIM/external identity-provider
provisioning of roles — out of scope per the plan, unaffected by this ADR
either way.

## Findings carried forward, not resolved here

The audit that produced the permission table above found three existing
behaviors this ADR preserves rather than fixes, each worth a deliberate
decision later rather than a silent change during a migration whose exit
criterion is "behaves identically":

- `TaskNoteService.updateTaskNote`/`deleteTaskNote` have no author check —
  any principal holding `tasknote:write` for the org can edit or delete
  *any* agent's note, not just its own creator's. `CommentService`'s
  equivalent methods do check authorship. Preserved as-is; flagged for
  whoever next touches task notes.
- `TaskNoteService.createTaskNote` is refused to every human principal
  categorically, regardless of permission — a principal-*kind* check
  layered on top of the permission system, not expressible as "no role
  grants this," so `can()` does not attempt to model it. Preserved as a
  business rule enforced in the handler, same as today.
- A cluster of RPCs (`assignTask`, `unassignTask`, `addTaskReviewer`,
  `removeTaskReviewer`, `unlinkTaskArtifact`, `attachLabel`, `detachLabel`,
  `syncPullRequests`, all agent-token management) are closed to agent
  principals entirely, independent of scope — "no permission grants this to
  an agent" rather than "this permission is ungranted." `can()` covers the
  human side of these; the agent-side categorical exclusion stays exactly
  where ADR-0008 put it (`AGENT_RPC_SCOPES`'s absence-means-denial rule).
