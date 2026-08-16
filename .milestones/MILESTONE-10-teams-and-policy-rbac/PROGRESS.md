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

## M10-T04 — implement can(principal, scope, permission)

- **Status**: done
- **Date**: 2026-08-16
- **Changed**:
  - `apps/backend/src/lib/policy.ts` — new. `can(db, principal, scope,
    permission)` implements ADR-0013 §3's resolution algorithm: (1) a
    direct grant at exactly this scope, (2) a team-derived grant via any
    team `team_members` puts the principal in, (3) for `project` scope
    only, the same two checks repeated at the project's owning
    `organization` (`getProjectOrgId`, reused from `authz.ts`) - "an org
    role reaches every project," preserved rather than narrowed. An agent
    principal always resolves `false` - `can()` governs the human path
    only (ADR-0013 Option 4); `authorizePrincipal` keeps branching to
    ADR-0008's closed scope vocabulary for agents, unchanged.
    `assertCan(db, principal, scope, permission)` is the `ConnectError`-
    throwing wrapper T05 will call, mirroring `assertOrgAdmin`'s shape.
  - `apps/backend/src/lib/policy.test.ts` — new, 18 tests covering every
    resolution path named above plus the boundaries ADR-0013 is explicit
    about: no cross-org leakage, no cross-project (sibling) leakage, a
    project-scope grant does not reverse-satisfy an org-scope check,
    removing a team membership removes the derived access, a custom
    (non-system) role's exact permission composition, and `assertCan`'s
    thrown-vs-resolved behavior.
  - `apps/backend/src/db/schema.sqlite.ts` — removed the now-stale
    `@knipignore` tags on `roles`/`role_permissions`/`teams`/
    `team_members` (they gained real TS consumers: `policy.ts` itself for
    `role_permissions`/`team_members`, `policy.test.ts`'s fixtures for
    `roles`/`teams`). `permissions` keeps its tag - still consumed only by
    the raw-SQL migration, no TS reader yet.
- **Verified**:
  - `bun test src/lib/policy.test.ts` — 18/18 pass, 100% function/line
    coverage on `policy.ts`.
  - `STANDALONE=true bun test` (full backend suite) — 819 pass, 0 fail (up
    from 801 - the 18 new tests).
  - `bunx knip` (from the repo root) — clean.
  - `moon check --all` — 27/27 tasks green.
- **Notes**:
  - **A deliberate, ADR-literal scope-hierarchy decision, recorded in
    `policy.ts`'s own doc comment**: `team` scope does **not** climb to its
    owning `organization` the way `project` does. ADR-0013 §3 names only
    project→org (and, later, org→parent-org) as ancestor edges; team is a
    brand-new resource with no prior "org role reaches every team"
    behavior to preserve, unlike project. Whether a given team RPC should
    check `organization` scope, `team` scope, or both is therefore each
    RPC's own mapping decision for T05/T07 to make, not something `can()`
    decides for them by auto-climbing. `policy.test.ts` asserts this
    boundary explicitly (an org-scope `role-owner` grant does not, by
    itself, satisfy a `team`-scope check) so a future change here is a
    visible, deliberate one.
  - Organization→parent-organization ancestor climbing (a parent-org grant
    reaching a descendant org) is explicitly **not** implemented - ADR-0013
    §3 defers it to T09, which lifts the two-level nesting cap this schema
    still has. There is no ancestor chain to climb yet; adding it before T09
    would have nothing real to test against.
  - Query shape is correctness-first, not yet optimized: one query for the
    principal's team memberships, one for candidate grants (filtered to
    matching scopes in application code, not SQL, since the scope set is
    at most two entries), one for the permission lookup. T06 ("cache policy
    resolution per request") is explicitly where this gets revisited: this
    is the version it optimizes, not a placeholder to redo from scratch.
- **Next**: M10-T05 — replace every `assertOrg*` call site with a `can`
  check, mapping each RPC to its required permission.

## M10-T05 — replace every assertOrg* call site with a can() check

- **Status**: done
- **Date**: 2026-08-17
- **Changed**: all 12 handler files that referenced a role name
  (`agents.handler.ts`, `artifacts.handler.ts`, `auth.handler.ts`,
  `comments.handler.ts`, `dashboard.handler.ts`, `labels.handler.ts`,
  `orgs.handler.ts`, `projects.handler.ts`, `repositories.handler.ts`,
  `search.handler.ts`, `task_notes.handler.ts`, `tasks.handler.ts`) — every
  `assertOrgMember`/`assertOrgWriter`/`assertOrgAdmin` call replaced with
  `assertCan(db, {kind:'user', userId}, {type:'organization', id: orgId},
  '<family>:<verb>')`, mapped from ADR-0013 Option 2's table (e.g.
  `createTaskType` → `tasktype:write`, `archiveAgent` → `agent:admin`,
  `listRepositoryLinks` → `repository:read`). `lib/authz.ts`'s
  `authorizePrincipal` (the agent-or-human entry point ~36 call sites use)
  gained a required `permission` field alongside its existing `scope`
  (ADR-0008's *agent* scope string, unchanged) - the human branch now calls
  `assertCan` with it instead of `assertOrgWriter`/`assertOrgMember`.
  `assertOrgWriter` and the `WRITER_ROLES` allowlist it read are deleted
  outright (dead code with zero remaining callers and no dedicated test of
  its own, caught by `tasker:knip`); `assertOrgMember`/`assertOrgAdmin`/
  `assertOrgOwner` are kept, unused by any handler now but each still
  directly unit-tested in `authz.test.ts`.
  - `lib/policy.ts` — `can()` gained a fourth resolution path (see below),
    and its doc comment's now-broken `assertOrgWriter` mention fixed.
  - Three pre-existing tests updated for consequences the ADR names
    explicitly: `scope-enforcement.test.ts`'s error-message assertion
    (wording changed from `assertOrgWriter`'s "read-only" to `can()`'s
    "missing required permission", same denial), and
    `reviewers.test.ts`/`links.test.ts`'s fixed query-count budgets (`can()`
    costs more selects per check than the old single-query role lookup did
    - ADR-0013's own "Consequences" section names this and assigns fixing
      it to T06; these tests' new ceilings say so explicitly rather than
      silently loosening).
- **Verified**:
  - `STANDALONE=true bun test` (full backend suite) — 825 pass, 0 fail,
    including `viewer-denial.test.ts` and `agent-scope-sweep.test.ts` (the
    deny-by-default sweeps) unmodified and green - proof the migration
    "behaves identically" (exit criterion 4) rather than merely compiling.
  - `grep -rn "assertOrgMember\|assertOrgWriter\|assertOrgAdmin\b\|assertOrgOwner" src/modules/*/*.handler.ts`
    — zero matches. This task's own verify line, checked directly rather
    than inferred.
  - `bunx knip` (repo root) — clean.
  - `moon check --all` — 27/27 tasks green, `authz.ts`/`policy.ts` both at
    100% line/function coverage.
- **Notes**:
  - **A real, load-bearing design decision surfaced mid-task, not a
    pre-existing plan**: flipping every handler's read path onto `grants`
    immediately broke ~94 existing tests, because `organization_members` is
    still the *only* table `seedOrg`/`updateOrgMemberRole`/
    `removeOrgMember`/`consumePendingInvitations` write, and ~26 test files
    seed `organization_members` directly rather than through those RPCs.
    Two ways to close that gap: dual-write `grants` from every membership
    mutation site (production code) and from every one of those ~26 test
    files' fixtures, or make `can()`'s organization-scope resolution also
    recognize a live `organization_members` row as an implicit grant of the
    matching system role. Chose the second, in `policy.ts` itself (§ "can()
    - organization_members as a live grant source"): `organization_members
    .role` is a real MySQL `enum` of exactly the four system-tier names, so
    the fallback can never resolve anything `grants` couldn't already
    express - it's a second, always-consistent-by-construction *reader* of
    the same fact, not a second place that fact can drift. This is also
    almost exactly the milestone's own stated risk mitigation (§7: "land
    T04/T05 ... evaluating both the old and new logic") without a separate
    dual-check code path to build and later remove. Consequence: the
    membership-mutation write sites are **still** untouched, same as T03
    left them - there was never a task boundary where they needed to move,
    since grants and organization_members now coexist as two live, both-
    read sources rather than one deprecating the other. `scripts/
    migrate-roles.ts` (T03) remains worth running on its own schedule
    regardless, for anything that genuinely needs a real `grants` row (team
    grants, custom-role grants, a future uniform "list every grant" view).
  - `policy.test.ts` needed its own fixture fixed for the same reason:
    `seedOrgWithAdmin` (used by nearly every other handler test) makes its
    user an `organization_members` **admin**, which the new fallback now
    honors - several isolation tests that meant to exercise one specific
    `grants` row were silently also satisfied by that implicit admin
    membership. Added `seedBareOrgAndUser` (org + user, no membership row)
    for every test that needs true grants-only isolation, and five new
    tests exercising the fallback path itself directly (grant with no
    `grants` row at all, removal, combination with a real grant, no
    cross-org leak, reaches a project through its org same as a real
    grant) - 24 tests total, up from 18, still 100% coverage on `policy.ts`.
  - `updateOrgMemberRole`'s owner-tier business rules (only an owner may
    grant ownership or touch another owner's role; the last owner cannot be
    demoted) deliberately still call `getOrgMemberRole`/`countOrgOwners`
    directly against `organization_members`, not `can()`. These aren't
    permission checks - "does X hold permission Y" - they're a specific
    cardinality invariant about the owner *tier* itself, which a custom
    role holding `org:owner` (once T04+ allows granting it) wouldn't
    satisfy the same way. Preserved exactly as ADR-0013's own findings
    section preserved TaskNoteService's business-rule exceptions, not an
    oversight.
  - `seedOrg`'s top-level-org branch (no `parentOrgId`) still has no
    permission check at all - any authenticated human may found an
    organization - matching ADR-0013 §2's explicit note that this stays
    outside the permission system entirely. Only the sub-org branch (which
    already called `assertOrgAdmin(parentOrgId)`) now calls `assertCan(...,
    'org:admin')` instead.
- **Next**: M10-T06 — cache policy resolution per request so `can()`'s added
  indirection does not multiply queries (the query-count budgets bumped
  above are exactly what this brings back down).
