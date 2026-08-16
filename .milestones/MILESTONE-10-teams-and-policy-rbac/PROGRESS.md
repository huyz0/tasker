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

## M10-T03 — seed system roles, migrate organization_members to grants

- **Status**: done
- **Date**: 2026-08-16
- **Changed**:
  - `apps/backend/drizzle-sqlite/0034_seed_system_roles_and_migrate_grants.sql`,
    `apps/backend/drizzle-mysql/0021_seed_system_roles_and_migrate_grants.sql`
    — hand-written data migrations (both journals registered): insert all 32
    permission keys from ADR-0013 Option 2's table; insert the four system
    roles (`role-viewer`/`role-member`/`role-admin`/`role-owner`, `org_id`
    NULL); wire `role_permissions` for each via `key LIKE '%:read'`/
    `'%:write'`/`'%:admin'` matching instead of enumerating 99 rows by hand;
    backfill every existing `organization_members` row into an equivalent
    `grants` row at organization scope. `INSERT OR IGNORE`/`INSERT IGNORE`
    on the singleton seed rows and a `WHERE NOT EXISTS` guard on the grants
    backfill make re-applying a no-op, same pattern as
    `0031_backfill_google_linked_identities.sql`.
  - `apps/backend/src/db/migrate-seed-system-roles-and-grants.test.ts` —
    new, 18 tests: exact permission count (32), the four system roles'
    shape, each role's exact permission count (viewer 13, member 23, admin
    31, owner 32) traced to `lib/authz.ts`'s current `WRITER_ROLES`/
    `ADMIN_ROLES`, the grants backfill against synthetic
    `organization_members` rows (including a viewer-tier row, not just
    writer/admin), idempotency of both the seed and the backfill, plus
    structural checks against the MySQL SQL text.
  - `apps/backend/scripts/migrate-roles.ts` — new. Not a one-shot migration
    runner (the SQL migration above already is one, and `setupDatabase`
    applies it automatically like every other migration) but an ongoing
    reconciliation tool: diffs `organization_members` against organization-
    scope system-role `grants` and reports/applies the minimal insert
    /update/delete to catch the latter back up. `--dry-run` prints the plan
    without writing.
  - `apps/backend/package.json` — added a `migrate:roles` script entry, both
    to give the tool a normal `bun run` invocation and because knip's
    `scripts/**/*.ts` project glob only treats a script as reachable when
    something references it (matching `seed`/`measure:*`'s existing
    pattern) — caught by `tasker:knip` flagging it as an unused file.
- **Verified**:
  - `STANDALONE=true bun test src/db/indexCoverage.test.ts` — SQLite to
    0034 applies cleanly.
  - `TASKER_MYSQL_INTEGRATION=1 bun test src/db/db.mysql.test.ts` against
    the live `docker compose` MySQL container — 0021 applies cleanly;
    `docker exec ... mysql` confirms live data: 32 permissions, 4 roles,
    role_permissions counts (13/23/31/32) matching the SQLite test's
    expectations exactly, and the container's pre-existing
    `organization_members` rows all backfilled to `role-admin` grants (that
    container's fixture data happens to hold only admins).
  - `bun test src/db/migrate-seed-system-roles-and-grants.test.ts` —
    18/18 pass.
  - `scripts/migrate-roles.ts` smoke-tested by hand against a scratch
    SQLite file through all three plan branches: insert (a membership with
    no grant yet), delete (a grant with no matching membership), and update
    (a membership whose role changed after its grant was created) — each
    verified first via `--dry-run`'s printed plan, then applied for real
    and re-verified via direct `bun:sqlite` queries; a second `--dry-run`
    after each apply showed an empty plan, confirming idempotency. Also
    confirmed the update path preserves the grant's original `created_at`
    rather than resetting it.
  - `STANDALONE=true bun test` (full backend suite) — 801 pass, 0 fail (up
    from 783 - the 18 new tests).
  - `bunx knip` (run from the repo root, matching the real `tasker:knip`
    task in `moon.yml` — running it from `apps/backend` instead gives a
    materially different, noisier report and is not what the gate actually
    checks) — clean. Two false starts caught along the way: knip's tag
    parser matches `@knipignore` as literal text anywhere in a docblock,
    including inside backticks meant as prose (a comment on `grants`
    explaining *why no tag was needed* was itself read as the tag) - fixed
    by rewording rather than by silencing knip; and `migrate-roles.ts`
    needed the `package.json` script entry above before knip would treat
    it as reachable.
  - `moon check --all` — 27/27 tasks green.
- **Notes**:
  - **Deliberately not dual-writing yet.** `organization_members` stays the
    only write path through T04; `seedOrg`/`updateOrgMemberRole`/
    `removeMember`/`consumePendingInvitations` are untouched. `grants` is
    inert data until T05 replaces the `assertOrg*` call sites — that's the
    one task where both the read path and these write sites move together,
    rather than a window where they could quietly drift apart. The real
    risk this creates — any org/membership change between T03 and T05
    landing leaves `grants` stale — is exactly what `migrate-roles.ts`
    exists to close on demand; it isn't a leftover from the plan's original
    "migration script" framing, it's this milestone's answer to a gap its
    own sequencing creates.
  - The `key LIKE '%:read'`-style composition in the migration SQL is a
    deliberate simplification over listing out 99 `(role_id,
    permission_key)` literals by hand across four roles - it also means a
    32nd/33rd permission added to the vocabulary later (by a fresh
    migration inserting into `permissions`) would need each system role's
    `role_permissions` explicitly re-derived rather than picked up
    automatically, since this migration only runs once. Worth remembering
    if T04+ ever add a permission key.
- **Next**: M10-T04 — implement `can(principal, scope, permission)` in
  `apps/backend/src/lib/policy.ts`.
