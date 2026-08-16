# M10 — Teams & Policy-Based RBAC — Progress Journal

## M10-T01 — ADR for the policy-based RBAC model

- **Status**: done
- **Date**: 2026-08-16
- **Changed**: `.specs/adr/ADR-0013-rbac-model.md`
- **Verified**: The ADR's Option 2 table enumerates all 32 permission keys
  across 14 resource families, each traced to the specific current
  `assertOrg*` gate it's derived from (a full RPC-by-RPC audit — 98
  methods — was run first via a dedicated Explore pass and is summarized
  in the ADR rather than re-derived by whoever reads it next).
- **Notes**:
  - Divergence from the plan: the task's originally named file,
    `ADR-0011-rbac-model.md`, was taken by M06's Radix-adoption ADR
    (landed after this milestone was planned, ids are first-come and never
    reused) — next free id was `ADR-0013`; `MILESTONE.md` updated to match.
  - **Agent tokens stay a separate system from `grants`**, deliberately —
    `can()` governs the human path only; `authorizePrincipal` keeps
    branching to ADR-0008's closed scope vocabulary for agents. Explicit
    decision (Option 4), not an oversight: unifying them would either
    weaken ADR-0008's categorical exclusions (org admin, `AuthService`,
    token issuance refused to every agent regardless of scope) or require
    re-deriving those exclusions as rules layered on top of `grants` — the
    two-systems problem in a different shape.
  - **Three findings from the audit are named but deliberately not fixed
    here**, since this migration's own exit criterion is "behaves
    identically": `TaskNoteService.updateTaskNote`/`deleteTaskNote` have
    no author check (unlike `CommentService`'s equivalents);
    `createTaskNote` refuses every human categorically regardless of
    permission (a principal-kind check `can()` doesn't model); and a fixed
    cluster of RPCs (`assignTask`, `attachLabel`, agent-token management,
    etc.) are closed to agents independent of scope. All three are
    preserved exactly as today's behavior and flagged in the ADR's closing
    section for whoever next touches those handlers.
  - `comment`, `label`, `search`, `dashboard`, and `team`/`role` all get
    their own real permissions rather than continuing to borrow a
    neighboring family's scope the way `AGENT_RPC_SCOPES` does today
    (`comments:write` borrowing `tasks:read` for reads, etc.) — that
    borrowing was ADR-0008's choice to keep the *agent* vocabulary small,
    not a constraint a general permission system checked by humans too
    should inherit.
- **Next**: M10-T02 — `roles`/`permissions`/`role_permissions`/`teams`/
  `team_members`/`grants` schema, both dialects.

## M10-T02 — roles/permissions/teams/grants schema

- **Status**: done
- **Date**: 2026-08-16
- **Changed**:
  - `apps/backend/src/db/schema.sqlite.ts`, `apps/backend/src/db/schema.mysql.ts`
    — six new tables per ADR-0013: `permissions` (key/description),
    `roles` (nullable `orgId` = system role), `role_permissions`
    (composite PK join), `teams` (flat, org-scoped, soft-delete),
    `team_members` (composite PK join, `userId` indexed), `grants`
    (`subjectType`/`subjectId`, `scopeType`/`scopeId`, `roleId` — the one
    table `can()` reads).
  - `apps/backend/drizzle-sqlite/0033_roles_teams_grants.sql`,
    `apps/backend/drizzle-mysql/0020_roles_teams_grants.sql` — hand-written
    (not `drizzle-kit generate`, per every migration since 0028's header
    comment — the tool would re-walk the stale 0023 snapshot and re-propose
    0024-0032's already-applied changes alongside this one). Both journals
    (`meta/_journal.json`) registered by hand to match.
  - `apps/backend/src/db/migrate-roles-teams-grants.test.ts` — new,
    23 tests: every table's PK/composite-PK/FK/NOT NULL/index asserted
    against an in-memory SQLite DB migrated from the real 0033 SQL file
    (same pattern as M13-T03's `migrate-password-credentials-linked-
    identities.test.ts`), plus four structural assertions against the
    MySQL SQL text (table presence, the real `enum(...)` columns MySQL
    gets where SQLite deliberately stays plain text, composite-PK join
    tables, no leaked catch-up statements).
- **Verified**:
  - `STANDALONE=true bun test src/db/indexCoverage.test.ts` — SQLite
    migrations to 0033 apply cleanly.
  - `TASKER_MYSQL_INTEGRATION=1 bun test src/db/db.mysql.test.ts` against
    the live `docker compose` MySQL container — migrations to 0020 apply
    cleanly; `DESCRIBE` on all six tables via `docker exec` confirms the
    live shape matches the migration SQL, including the `enum('user',
    'team')`/`enum('organization','team','project')` columns.
  - `bun test src/db/migrate-roles-teams-grants.test.ts` — 23/23 pass.
  - `STANDALONE=true bun test` (full backend suite) — 783 pass, 0 fail.
  - `bunx knip` — clean; the six new exports carry `@knipignore` (JSDoc
    block form — a `//` line comment does *not* register with knip, caught
    by re-running after the first attempt used the wrong comment style),
    each naming the task that removes the tag (T03 for permissions/roles/
    role_permissions, T04 for grants, T07 for teams/team_members).
  - `moon run tasker:spec-drift` — 0 drift (no new dependency, nothing to
    declare).
- **Notes**:
  - `grants.subjectType`/`scopeType` are plain `text` in SQLite, not a
    `CHECK`-constrained enum, deliberately matching this schema's existing
    enum-as-text convention (`organization_members.role`,
    `remote_pull_requests.status`) — validated at the app layer (`can()`),
    not the DB. MySQL enforces both as a real `enum(...)` column, which is
    the dialect's existing normal asymmetry, not new drift introduced here.
  - `roles.orgId` has no `NOT NULL` — a NULL `orgId` *is* the system-role
    marker (ADR-0013 Option 5), not an omission.
- **Next**: M10-T03 — seed owner/admin/member/viewer as immutable system
  roles, migrate `organization_members.role` to `grants` rows,
  `scripts/migrate-roles.ts`.
