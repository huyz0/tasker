---
id: M10
title: Teams & Policy-Based RBAC
status: in-progress
goal: Roles and permissions are data rather than a hardcoded enum, teams group people below the organization, and access can be granted at project and team scope.
depends_on: [M03, M04]
surfaces: [backend, gui, cli, contract]
exit_criteria_met: false
started_at: 2026-08-16
completed_at: null
---

# M10 — Teams & Policy-Based RBAC

## 1. Goal

An organization can define its own roles — a hundred of them if it wants —
composed from a fixed permission vocabulary, and grant them at organization,
team or project scope. Teams exist as first-class groups. The product's stated
target of 20,000 teams with up to 100 members each becomes a supported
configuration rather than a description with no model behind it.

## 2. Why Now

This is the largest schema change in the plan and the one with the widest blast
radius: it replaces roughly ninety `assertOrgMember` / `assertOrgAdmin` call
sites with a single policy function. It must come after M03 (which makes the
current role model correct, giving a known-good baseline to migrate from) and
after M04 (so agent principals are already modelled and can carry grants too).
Doing it before M07 and M08 would mean re-testing the authorization surface
against a moving read path.

By product priority this now lands after **M13** (Local Accounts & Linked
Identity), not because M13 blocks it technically — grants and team membership
key on `userId`, never on how that user authenticates — but so the roles/teams
model is built against a user model that already tolerates no-email accounts
rather than assuming every member row has one. If M13 has not landed yet when
this starts, treat any GUI text or query that filters members by email as
needing a username fallback.

## 3. Exit Criteria

- [ ] An organization can create, edit and delete custom roles; 100 roles in one
      organization is a tested configuration.
- [ ] Permissions are a fixed, documented vocabulary; roles are compositions of them.
- [ ] `can(principal, scope, permission)` is the single authorization entry
      point, and no handler calls a role name directly.
- [ ] The four current tiers exist as seeded system roles and every existing
      organization behaves identically after migration.
- [ ] Teams can be created, populated, nested under an organization, and granted
      a role at organization or project scope.
- [ ] A grant at project scope does not leak to sibling projects, proven by an
      exhaustive test matrix.
- [ ] The permission matrix UI renders 100 roles against the full permission
      vocabulary without a performance cliff.
- [ ] Organization hierarchy depth is no longer capped at two levels, and
      inheritance rules are documented.

## 4. Scope

**In Scope**: the roles, permissions, grants and teams model; the policy
function; migration of existing memberships; role and team management surfaces
in GUI and CLI; hierarchy inheritance.

**Out of Scope**: attribute-based policies, external policy engines,
SCIM provisioning, delegated administration.

## 5. Task Breakdown

### Decide and model

- [x] **M10-T01** — Write the ADR choosing policy-based RBAC over fixed tiers,
      naming the permission vocabulary and the scope hierarchy.
      - Files: `.specs/adr/ADR-0013-rbac-model.md` (renumbered from the
        plan's `ADR-0011` — that id was taken by the Radix-adoption ADR,
        landed after this milestone was planned; `.specs/adr/README.md`'s
        numbering is first-come, ids are never reused)
      - Verify: the ADR enumerates every permission key.

- [x] **M10-T02** — Add `roles`, `permissions`, `role_permissions`, `teams`,
      `team_members` and `grants(subject, subject_type, scope, scope_id, role_id)`
      to both dialects with migrations.
      - Files: `db/schema.*.ts`, `drizzle-sqlite/`, `drizzle-mysql/`
      - Verify: migrations apply and roll forward on both dialects.

- [x] **M10-T03** — Seed owner, admin, member and viewer as immutable system roles
      and migrate `organization_members.role` to a grant referencing them.
      - Files: migrations, `scripts/migrate-roles.ts`
      - Verify: post-migration, every existing authorization test still passes.

### Enforce

- [x] **M10-T04** — Implement `can(principal, scope, permission)` with grant
      resolution across organization hierarchy, team membership and direct grants.
      - Files: `apps/backend/src/lib/policy.ts`
      - Verify: unit tests cover every resolution path.

- [x] **M10-T05** — Replace every `assertOrg*` call site with a `can` check,
      mapping each RPC to its required permission.
      - Files: all `modules/*/*.handler.ts`
      - Verify: no handler references a role name literal.

- [x] **M10-T06** — Cache policy resolution per request so the added indirection
      does not multiply queries.
      - Files: `apps/backend/src/lib/policy.ts`, `lib/requestContext.ts`
      - Verify: an authorization-heavy RPC issues no more queries than before.

### Teams and hierarchy

- [x] **M10-T07** — Add team CRUD and membership RPCs with pagination, plus
      CLI commands.
      - Files: `main.tsp`, `modules/teams/teams.handler.ts`, `apps/cli/cmd/teams.go`
      - Verify: a team of 100 members pages correctly.

- [ ] **M10-T08** — Allow grants to a team as subject, so adding a person to a
      team confers the team's access.
      - Files: `apps/backend/src/lib/policy.ts`, `modules/teams/`
      - Verify: removing someone from a team removes the derived access.

- [ ] **M10-T09** — Lift the two-level organization nesting cap and implement
      inheritance: a grant on a parent organization applies to its descendants.
      - Files: `modules/orgs/orgs.handler.ts`, `lib/policy.ts`
      - Verify: a parent-org admin can administer a grandchild org.

- [ ] **M10-T10** — Enforce project-scope grants so a member can be given access
      to one project without the whole organization.
      - Files: `lib/policy.ts`, `modules/projects/projects.handler.ts`
      - Verify: a project-scoped grant does not reach a sibling project.

### Surface

- [ ] **M10-T11** — Role management UI: create, clone and edit roles, with a
      virtualized permission matrix.
      - Files: `apps/gui/src/features/Roles/`
      - Verify: 100 roles × the full permission set renders smoothly.

- [ ] **M10-T12** — Team management UI with member search reusing the M03 member picker.
      - Files: `apps/gui/src/features/Teams/`
      - Verify: a team of 100 members is manageable.

- [ ] **M10-T13** — Build the exhaustive authorization test matrix: every role ×
      every permission × every scope.
      - Files: `apps/backend/src/lib/policy.test.ts`
      - Verify: the matrix is generated, not hand-written, and fully passes.

## 6. Verification

```bash
moon run backend:test
bun run scripts/migrate-roles.ts --dry-run
moon run gui:test gui:e2e
```

## 7. Risks

This is the milestone most likely to introduce a security regression, because
it rewrites every authorization decision at once. Mitigate by landing M10-T04
and M10-T05 behind a dual-check mode that evaluates both the old and new logic
and logs disagreements, running it against the full test suite before removing
the old path.
