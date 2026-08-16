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

## M10-T06 — cache policy resolution per request

- **Status**: done
- **Date**: 2026-08-17
- **Changed**:
  - `apps/backend/src/lib/requestContext.ts` — new `PolicyCache` interface
    (four maps: `teamIds`, `candidateGrants`, `orgMemberRole`,
    `rolePermissions`) added to `RequestContext`, and a new
    `getPolicyCache()` that lazily creates and returns the current
    request's cache, or `null` outside a request (a script or a test
    calling `can()` directly, never wrapped in `runWithRequestContext`).
    Already live in production with no further wiring: every real RPC
    already runs inside `runWithRequestContext` via
    `requestLogging.ts`'s interceptor (unchanged), so `can()` reading
    through this cache is automatically active for every request, not an
    opt-in a handler has to request.
  - `apps/backend/src/lib/policy.ts` — `can()` rewritten to read/write
    through the cache at each of its four lookups: team memberships (keyed
    by `userId`), candidate grants - the whole unfiltered set, scope
    matching still happens in application code as before (keyed by
    `userId`), the `organization_members` fallback (keyed by `userId:orgId`,
    since one request can legitimately check more than one org), and -
    the one worth the most - a role's *entire* permission set rather than
    a single true/false per (role, permission) pair (keyed by `roleId`),
    so a second permission check against a role already resolved this
    request costs a `Set.has()`, not a query, regardless of which
    permission it asks about. Doc comment expanded with the caching
    behavior and an explicit staleness caveat (a handler that mutates
    `grants`/`organization_members`/`team_members` and then re-checks a
    permission for the same principal later in the same request would see
    the pre-mutation view - true of no handler today, but worth stating
    rather than discovering later).
  - `apps/backend/src/lib/policy.test.ts` — five new tests
    (`can() - per-request caching (T06)`): a second call for the same
    principal against a different scope/permission costs zero selects; a
    cached denial also costs zero on the second check; two different
    principals in one request stay isolated from each other's cache
    entries; two separate `runWithRequestContext` calls (simulating two
    requests) do not share a cache; and outside any request context,
    behavior is unchanged from before T06 (both calls query, symmetric
    cost). 29 tests total, up from 24, still 100% coverage on `policy.ts`;
    `requestContext.ts` also reaches 100%.
  - `apps/backend/src/modules/tasks/reviewers.test.ts`,
    `apps/backend/src/modules/artifacts/links.test.ts` — corrected the
    forward-looking comment T05 left on these two files' bumped
    query-count budgets. It said T06 "is expected to bring this back
    down"; that turned out not to be true for *these specific* RPCs and is
    corrected here rather than left standing as a wrong prediction:
    `listTaskReviewers`/`listTaskArtifactLinks` each call
    `authorizePrincipal` exactly once per request, so there is no second
    `can()` call in the same request for the cache to save anything
    against. The cache's real payoff is a request that checks the same
    principal many times - a permission-matrix view (T11) or a bulk
    operation - which is what the new dedicated tests above prove, not
    something visible in either of these single-check handlers.
- **Verified**:
  - `bun test src/lib/policy.test.ts` — 29/29 pass, including the five new
    T06-specific tests proving zero-query cache hits, per-principal
    isolation, per-request isolation, and unchanged behavior outside a
    request context.
  - `STANDALONE=true bun test` (full backend suite) — 830 pass, 0 fail (up
    from 825 - the 5 new tests).
  - `bunx knip` (repo root) — clean.
  - `moon check --all` — 27/27 tasks green; `policy.ts` and
    `requestContext.ts` both at 100% line/function coverage.
- **Notes**:
  - **Corrected a prediction from T05's own commit message, not silently**:
    T05 assumed per-request caching would generally bring authorization
    query counts back down, without checking whether any *current* handler
    actually calls `can()`/`authorizePrincipal` more than once per request
    for the same principal. None do - every RPC in this codebase
    authorizes once, at the top, before doing any work. T06's cache is
    real and already live for whichever future RPC needs it (T11's
    permission matrix, most likely), but it does not and was never going
    to change `reviewers.test.ts`/`links.test.ts`'s specific counts - both
    comments there are now honest about why, instead of pointing at a
    task that turned out not to touch them.
  - Deliberately did **not** cache across requests (e.g. a role's
    permission set with a TTL, invalidated when `role_permissions`
    changes) - that is a materially larger commitment (explicit
    invalidation on every write path that touches `roles`/
    `role_permissions`/`grants`, or a staleness window bounded by a TTL
    instead of a request boundary) that the milestone's task text does not
    ask for ("cache policy resolution per request," not across them) and
    that a per-request cache trivially avoids ever needing: it cannot
    ever go stale, because it never outlives the request it was built for.
- **Next**: M10-T07 — team CRUD and membership RPCs with pagination, plus
  CLI commands.

## M10-T07 — team CRUD and membership RPCs with pagination, plus CLI

- **Status**: done
- **Date**: 2026-08-17
- **Changed**:
  - `packages/shared-contract/main.tsp`,
    `packages/shared-contract/tasker/health/v1/health.proto` (both editions,
    per M04's precedent) — `Team`/`TeamMember` models and `TeamService`
    (createTeam, updateTeam, archiveTeam, restoreTeam, listTeams,
    addTeamMember, removeTeamMember, listTeamMembers), regenerated into
    `gen/ts/...` and `apps/cli/gen/...`.
  - `apps/backend/src/modules/teams/teams.handler.ts` — new. Every RPC
    checked with `assertCan(..., {type: 'organization', id: orgId},
    'team:<verb>')` - a deliberate reading of `policy.ts`'s own note that
    team-scope operations are each RPC's mapping decision, not something
    `can()` auto-climbs: team CRUD and rostering are organization-level
    administrative acts, the same shape project/task-type CRUD already
    take against their owning org. `listTeamMembers` mirrors
    `listOrgMembers`'s one joined, cursor-paginated query rather than a
    membership select followed by a per-id user fetch. `restoreTeam`
    refuses restoring into an archived org, same guard `restoreProject`/
    `restoreAgent` already have. `addTeamMember` is idempotent (a second
    add is a no-op success, matching `attachLabel`'s convention);
    `removeTeamMember` is idempotent by construction (an unconditional
    delete on a possibly-absent row).
  - `apps/backend/src/index.ts` — `TeamService` registered.
  - `apps/backend/src/modules/teams/teams.test.ts` — new, 12 tests:
    every CRUD/membership path, cross-org isolation, the archived-org
    restore guard, both idempotency guarantees, and this task's own verify
    line - **a team of 100 members pages correctly** (three pages at
    limit 40, correct `totalCount`, no id repeated or dropped across
    pages). 100% coverage on `teams.handler.ts`.
  - `apps/backend/src/lib/viewer-denial.test.ts` — `teams` added to the
    sweep: `listTeams`/`listTeamMembers` in READS, the other six in
    REQUESTS with a real team fixture. All six correctly deny a viewer
    through the `organization_members` fallback alone (viewer's role has
    no `team:write`/`team:admin`) - no team-specific fixture beyond the
    team itself was needed to prove it.
  - `apps/cli/cmd/teams.go` — new (`teams list|create|rename|delete|
    restore|add-member|remove-member|list-members`), plus
    `apps/cli/cmd/teams_test.go` (8 tests, one fake `TeamServiceHandler`
    behind an `httptest` server, matching `orgs_test.go`'s pattern).
    `apps/cli/internal/backend/clients.go` gained `NewTeamServiceClient()`.
  - `apps/gui/scripts/rpc-coverage.mjs` — all eight `TeamService` methods
    added to `EXCEPTIONS`, each naming M10-T12 (Team management UI) as the
    scheduled caller; a real ≥40-character reason for each, not a
    cross-reference shortcut (`rpc-coverage.test.mjs`'s own quality gate
    on `EXCEPTIONS` catches and rejects a lazy "see the other one").
- **Verified**:
  - `moon run shared-contract:format` / `shared-contract:compile` - clean;
    `TeamService`/`CreateTeam`/etc. confirmed present in all three codegen
    targets (`gen/ts/...`, `apps/cli/gen/...pb.go`,
    `apps/cli/gen/...connect.go`).
  - `bun test src/modules/teams/teams.test.ts` — 12/12 pass, 100% coverage.
  - `bun test src/lib/viewer-denial.test.ts` — 78/78 pass (up from the
    previous milestone's count, six new denial cases for teams).
  - `bun test src/lib/agent-scope-sweep.test.ts` — 7/7 pass unchanged;
    teams RPCs are `requireUser`-only (never `requirePrincipal`), so
    they're outside this sweep's scope entirely, same as
    `attachLabel`/`detachLabel` per ADR-0013's findings section.
  - `STANDALONE=true bun test` (full backend suite) — 848 pass, 0 fail.
  - `go build ./... && go vet ./... && gofmt -l .` — clean;
    `go test ./...` — all packages pass, including the 8 new
    `TestTeams*` cases.
  - `moon run gui:rpc-coverage` — 100/111 RPCs reached, 11 excepted with
    reasons (up from 100/103 pre-T07 - the count grew by exactly the 8
    new excepted `TeamService` methods).
  - `moon check --all` — 27/27 tasks green, fully cached on a second run.
- **Notes**:
  - **A real backend gap named, not silently deferred**: nothing anywhere
    in the product can create a `grants` row through an RPC - the only
    ways one exists today are T03's one-time historical migration and
    `scripts/migrate-roles.ts`'s reconciliation. T07's own file scope is
    team CRUD/membership only, not grant management, so this is left for
    T08 (whose files list already names `lib/policy.ts` - done since T04 -
    and `modules/teams/` - now real) or, if T08 stays scoped to
    verification only, for T11 (Role management UI), which cannot ship
    "assign this role to a user or team" without some backing RPC either.
    Recorded here so it isn't rediscovered as a surprise later.
- **Next**: M10-T08 — allow grants to a team as subject (already true since
  T04's `can()`; verify end-to-end against the real `teams.handler.ts`
  infrastructure this task just built, not just synthetic `policy.test.ts`
  fixtures).

## M10-T08 — verify grants-to-team-as-subject end-to-end

- **Status**: done
- **Date**: 2026-08-17
- **Changed**:
  - `apps/backend/src/modules/teams/teams.test.ts` — one new integration
    test (`Team-derived grants (M10-T08)`) exercising the full real path:
    `createTeamsHandler`'s actual `createTeam`/`addTeamMember`/
    `removeTeamMember` RPCs (not a direct `schema.teams`/
    `schema.teamMembers` insert, unlike T04's `policy.test.ts` fixtures),
    a directly-seeded `grants` row for the team subject (the one piece
    with no RPC yet - see T07's note below), and `can()` checked before
    joining, after joining, and after leaving. Confirms the team's exact
    permission set applies (`task:read`/`task:write` true, `org:admin`
    false - the grant is specific, not a stand-in for blanket access) and
    that removal revokes it immediately.
- **Verified**:
  - `bun test src/modules/teams/teams.test.ts` — 13/13 pass (up from 12),
    `teams.handler.ts` still at 100% coverage.
  - `STANDALONE=true bun test` (full backend suite) — 849 pass, 0 fail.
  - `bunx knip` (repo root) — clean.
  - `moon check --all` — 27/27 tasks green.
- **Notes**:
  - **No new production code** - `can()`'s team-derived resolution (ADR-0013
    §3 step 2) was already implemented and unit-tested in T04, and nothing
    about it needed to change once real teams existed. This task's actual
    content was proving that against real infrastructure instead of
    leaving it asserted only against synthetic fixtures - the gap T07's
    own PROGRESS entry named going in.
  - The grant-management gap named in T07 stands as recorded: still no RPC
    anywhere creates a `grants` row. This test seeds one directly, the
    same as T07 flagged would be necessary. Left for T11 (Role management
    UI), which needs "assign this role to a user or team" as a real
    backend surface regardless of what T08 needed for its own verify line.
- **Next**: M10-T09 — lift the two-level organization nesting cap and
  implement inheritance: a grant on a parent organization applies to its
  descendants.

## M10-T09 — lift the org nesting cap, implement ancestor-org inheritance

- **Status**: done
- **Date**: 2026-08-17
- **Changed**:
  - `apps/backend/src/lib/requestContext.ts` — `PolicyCache` gained
    `orgAncestors: Map<string, string[]>`.
  - `apps/backend/src/lib/policy.ts` — new `getAncestorOrgIds(db, orgId,
    organizations, cache)`: walks `organizations.parentOrgId` up as far as
    it goes (one query per level, cached per orgId per request - the
    correct-first shape T06 already established, not a recursive CTE),
    bounded at 50 levels and guarded against a cycle so a corrupt chain
    fails closed instead of looping forever. `can()` now runs this for
    every organization-type scope it reaches (the scope itself, or a
    project's owning org) and adds each ancestor as its own scope entry to
    check - both against real `grants` rows and the `organization_members`
    fallback, which previously only ever checked a single org and now
    loops over however many org-type entries `scopesToCheck` holds.
  - `apps/backend/src/modules/orgs/orgs.handler.ts` — `seedOrg`'s
    `parentRows[0].parentOrgId` check ("nested sub-organizations are not
    supported yet") removed outright. The remaining `assertCan(...,
    'org:admin')` against the immediate parent is now, by itself, the
    correct gate at any depth: `can()`'s own ancestor climbing means an
    admin of *any* ancestor of that parent passes too, with no separate
    logic needed in the handler.
  - `apps/backend/src/lib/policy.test.ts` — 7 new tests (`can() - ancestor
    organization climbing (T09)`): a parent-org grant reaches its child; a
    *grandparent*-org grant reaches a grandchild two levels down (this
    task's own verify line); the `organization_members` fallback climbs
    too, not just real grants; climbing is one-directional (a child's
    grant does not reach its parent); no leak between siblings under the
    same parent; project→org and org→ancestor composed together (a grant
    on a grandparent reaches a project under a grandchild org); and a
    cyclic `parentOrgId` chain resolves instead of hanging. 36 tests
    total, up from 29, still 100% coverage on `policy.ts`.
  - `apps/backend/src/modules/orgs/orgs.test.ts` — the old test asserting
    a grandchild org creation was *rejected* is corrected (that assertion
    described the cap this task removes, not a rule that survived it) and
    a new test added proving the milestone's verify line directly through
    the real `seedOrg`/`updateOrg` RPCs: a grandparent's admin - never
    added as a member of the parent or the grandchild - can rename the
    grandchild directly, and can found a great-grandchild under it too.
  - `apps/backend/src/modules/tasks/assignment.test.ts` — one query-count
    budget bumped by one, same class of change T05 already made
    `reviewers.test.ts`/`links.test.ts` absorb: resolving whether an org
    has a parent at all costs a select even when the answer is no, so
    every organization-scope permission check costs one more query than
    before this task, for every org regardless of whether it is actually
    nested. Accepted and documented rather than optimized away - the same
    tradeoff T06 already made deliberately for the rest of `can()`, not a
    new decision.
- **Verified**:
  - `bun test src/lib/policy.test.ts` — 36/36 pass, 100% coverage.
  - `bun test src/modules/orgs/orgs.test.ts` — 56/56 pass.
  - `STANDALONE=true bun test` (full backend suite) — 857 pass, 0 fail.
  - `bunx knip` (repo root) — clean.
  - `moon check --all` — 27/27 tasks green; `policy.ts` and
    `requestContext.ts` both at 100% line/function coverage.
  - Checked the GUI for anything assuming the old cap (nesting-depth text,
    validation) - nothing found; the Organizations tree already renders
    arbitrary `parentOrgId` depth (M06), so no GUI change was needed here.
- **Notes**:
  - **A real, permanent per-check cost, not a one-time transitional one**:
    unlike T05's query-count bumps (temporary until T06's cache), this
    extra select is paid by every organization-scope permission check
    forever, for every organization, nested or not - there is no way to
    know an org has no parent without asking. Request-scoped caching (T06)
    eliminates the *redundant* cost within one request but not this first
    query. Named explicitly rather than chased into a further optimization
    this task's scope did not ask for; a future task could denormalize
    "has no parent" onto a cheaper-to-check field if this ever shows up as
    a real bottleneck.
- **Next**: M10-T10 — enforce project-scope grants so a member can be given
  access to one project without the whole organization (already true since
  T04's `can()`; this task's own remaining work is likely verification-only,
  the same shape T08 turned out to be for team-derived grants).

## M10-T10 — enforce project-scope grants

- **Status**: done
- **Date**: 2026-08-17
- **Changed**:
  - **Not verification-only, unlike T08** - a real gap surfaced: `can()`
    has supported a `project`-scope check since T04, but nothing in
    `projects.handler.ts` ever actually *asked* for one. Every single-
    project RPC checked `{type: 'organization', id: orgId}`, so a project-
    scoped grant (with no org-level access) could not reach any of them at
    all, regardless of what `can()` itself could already resolve.
  - `apps/backend/src/lib/authz.ts` — `authorizePrincipal` gained an
    optional 5th parameter, `humanScope?: Scope`, so a caller can check the
    human path against a narrower scope than `{type: 'organization', id:
    orgId}` while the agent path keeps resolving against `orgId` exactly
    as before (a token's org binding is not a `can()` scope, unaffected).
    Omitted, both paths behave exactly as pre-T10 - every other
    `authorizePrincipal` call site in the codebase needed no change.
  - `apps/backend/src/modules/projects/projects.handler.ts` —
    `getProject` (via the new `humanScope` param), and `updateProject`/
    `archiveProject`/`restoreProject`/`purgeProject` (already using
    `assertCan` directly, which already took a generic `Scope`) now check
    `{type: 'project', id: projectId}` instead of the project's owning
    org. `createProject` and `listProjects` are unchanged and stay
    organization-scoped deliberately: there is no project to scope a
    permission to before one exists, and listing across an org is
    inherently an org-wide operation - per-row filtering by scoped grant
    is a materially different feature this task's own file scope
    (`lib/policy.ts`, `modules/projects/projects.handler.ts`) does not ask
    for. This is strictly additive: `can()`'s existing project→org
    ancestor climbing (T04) means an org-level grant keeps working exactly
    as before - proven by the full existing test suite passing unmodified.
  - `apps/backend/src/modules/projects/projects.test.ts` — 2 new tests
    (`Project-scope grants (M10-T10)`): a project-scoped grant, with *no*
    `organization_members` row at all, reaches get/update/archive/
    restore/purge on that one project end to end; and a project-scoped
    grant does not reach a sibling project under the same org - this
    task's own verify line, and exit criterion 6's wording exactly.
- **Verified**:
  - `bun test src/modules/projects/projects.test.ts` — 16/16 pass (up
    from 14), 100% coverage on `projects.handler.ts`.
  - `STANDALONE=true bun test` (full backend suite) — 859 pass, 0 fail -
    including every existing organization-scoped project test, unmodified,
    proving the ancestor-climb fallback keeps org-level access working.
  - `bunx knip` (repo root) — clean.
  - `moon check --all` — 27/27 tasks green; `authz.ts`/`policy.ts`/
    `requestContext.ts` all back at 100% line/function coverage.
- **Notes**:
  - This is the one task in the "Teams and hierarchy" group that turned
    out to need real production code, not just a verification pass -
    worth naming since T08 and (mostly) T09 did not. The gap here was
    genuinely invisible from `policy.ts` alone: `can()` was already
    correct for a project-scope check, but no handler had ever been
    updated to ask it one, since every project RPC predates ADR-0013 and
    was written when "the project's org" was the only scope that existed.
  - Task/artifact/comment/label RPCs that operate *within* a project still
    check organization scope only, unchanged - out of this task's own file
    scope (`modules/projects/projects.handler.ts` specifically, not the
    whole project-adjacent surface). A user holding only a project-scoped
    grant can now manage the project itself but still cannot create a task
    inside it without also holding org-level `task:write`. Named here
    rather than assumed away: extending scoped grants to task/artifact/
    comment/label RPCs is real future work this milestone's stated scope
    does not cover, and would be its own task if picked up later.
- **Next**: M10-T11 — Role management UI: create, clone and edit roles,
  with a virtualized permission matrix.

## M10-T11 — role management backend RPCs + GUI

- **Status**: done
- **Date**: 2026-08-17
- **Changed**:
  - `packages/shared-contract/main.tsp`,
    `packages/shared-contract/tasker/health/v1/health.proto` (both
    editions) — `Permission`/`Role`/`Grant` models and `RoleService`
    (listPermissions, listRoles, createRole, updateRole, deleteRole,
    grantRole, revokeGrant, listGrants), regenerated into `gen/ts/...`
    and `apps/cli/gen/...`. A real backend gap, not this task's literal
    file list, but unavoidable: T07's own notes flagged that nothing
    anywhere in the product could create a `grants` row through an RPC,
    and a role-management UI cannot exist without one.
  - `apps/backend/src/modules/roles/roles.handler.ts` — new. Two
    distinct authorities, matched to what each RPC actually lets someone
    do: `listPermissions`/`listRoles` need only `org:read`;
    `createRole`/`updateRole`/`deleteRole` (defining what a role *means*)
    need `role:manage`; `grantRole`/`revokeGrant`/`listGrants` (deciding
    *who holds* a role) need `org:admin` - the same authority
    `updateOrgMemberRole` already requires, since handing someone a
    role's permissions is exactly as consequential as setting their
    built-in one. `resolveScopeOrgId` resolves the administering org from
    any grant's scope (organization directly, team via its org, project
    via `getProjectOrgId`), so the last three RPCs work uniformly across
    every scope type `can()` itself supports. `deleteRole` refuses a
    system role outright and refuses a custom role still referenced by a
    grant (`FailedPrecondition`, `purgeProject`'s "still has X" pattern).
    `grantRole` is idempotent (a duplicate grant returns the existing
    row, `attachLabel`'s convention) and validates both that a custom
    role belongs to the resolving org and that the subject (user or team)
    actually exists.
  - `apps/backend/src/index.ts` — `RoleService` registered.
  - `apps/backend/src/modules/roles/roles.test.ts` — new, 21 tests, 100%
    coverage: every RPC's happy path, cross-org isolation on both
    `listPermissions`/`listRoles` and custom-role resolution, the
    system-role immutability and in-use-refusal guards on
    `deleteRole`, `grantRole`'s idempotency and its three scope-resolution
    paths (org/team/project), and nonexistent-subject rejection.
  - `apps/backend/src/lib/viewer-denial.test.ts` — `roles` added to the
    sweep: `listPermissions`/`listRoles` in READS, the other six in
    REQUESTS, with a real custom role and grant seeded in `beforeAll` so
    `deleteRole`/`revokeGrant` have something concrete to be denied
    against. 84/84 pass (up from 78).
  - `apps/backend/src/db/schema.sqlite.ts` — `permissions`' stale
    `@knipignore` (T02's placeholder, since nothing consumed the table
    until now) removed; it's read directly by
    `listPermissions`/`createRole`/`updateRole`.
  - `apps/gui/src/features/Roles/index.tsx` (+ `.stories.tsx`) — new.
    `RolesManager`: a permission matrix (`VirtualList` of rows, one
    checkbox per permission column) scoped to the active org
    (`useLayoutStore`). A custom role's name is inline-editable (click,
    or the row's `RowActionsMenu`, matching `Organizations`' pattern);
    system roles show a badge, disabled checkboxes, and no actions menu.
    `CreateRoleDialog` is a `Dialog`-wrapped form with a name field and a
    permission checkbox grid.
  - `apps/gui/src/components/ui/RowActionsMenu.tsx` — a real bug found
    and fixed while wiring the Rename row action, not a Roles-specific
    workaround: Radix's `DropdownMenu` keeps its `FocusScope` *trapped*
    for one extra tick after a close starts (so an exit animation has
    something to animate), and while trapped it forcibly refocuses
    anything that tries to take focus from outside the closing menu -
    including an `autoFocus` input mounted by the same click that
    triggered the close, blurring it and reverting the edit before the
    user ever saw it. Added `RowAction.managesFocusOnSelect`: an action
    so flagged has its `onClick` deferred from `onSelect` to
    `onCloseAutoFocus`, which only fires once the trap has genuinely
    released - Radix's own documented pattern for handing focus to a
    custom element after a menu closes, rather than racing it. `Delete`
    (no flag) is unaffected: it opens a confirm dialog, which manages its
    own focus regardless of timing, and every existing `RowActionsMenu`
    consumer (`Organizations`) was re-run and passes unchanged.
  - `apps/gui/src/App.tsx` — `/roles` route. `apps/gui/src/
    components/layout/AppShell.tsx` — "Roles" nav entry (Configuration
    group). `apps/gui/src/App.test.tsx` — `RoleService: {}` added to the
    hardcoded contract mock (was missing entirely, failing the whole
    58-file suite at import time the moment `Roles/index.tsx`'s
    module-level `createClient(RoleService, ...)` needed it to exist).
  - `apps/gui/src/features/Roles/index.test.tsx` — new, 18 tests,
    100% statement / 94.91% branch coverage on `Roles/index.tsx` (global
    branch coverage 95.05%, clears the 95% gate). Covers every mutation's
    success and error path, both inline-rename entry points (direct
    click and the row-actions menu - the test that caught the
    `RowActionsMenu` bug above), Enter/Escape/no-op rename, direct
    checkbox toggling, pagination, and the `ListState` retry path.
  - `apps/gui/scripts/rpc-coverage.mjs` — three `EXCEPTIONS` entries:
    `RoleService.{grantRole,revokeGrant,listGrants}`. Role
    *definitions* are fully wired up in this task; assigning a role to a
    user or team needs the same subject-search UI M10-T12 (Team
    management) is already building for picking team members, so grant
    assignment is deferred there rather than duplicating a second search
    control. `moon run gui:rpc-coverage` — 105/119 reached, 14 excepted.
  - No CLI counterpart, unlike T07's team commands - this task's own
    file list named the GUI as `RoleService`'s caller, not the CLI, and
    nothing downstream currently needs one.
- **Verified**:
  - `bun test src/modules/roles/roles.test.ts src/lib/viewer-denial.test.ts`
    — 105/105 pass (21 + 84), 100% coverage on `roles.handler.ts`.
  - `STANDALONE=true bun test` (full backend suite) — 886 pass, 0 fail.
  - `moon run gui:test` — 709/709 pass; global branch coverage 95.05%.
  - `bunx knip` (repo root) — clean.
  - `moon check --all` — 27/27 tasks green.
- **Notes**:
  - **The `RowActionsMenu` fix is the task's real finding.** It surfaced
    only because this task added the first `RowActionsMenu` action whose
    effect mounts a focus-taking element (an inline edit input) rather
    than a modal (`Organizations`' `Delete` action opens a `ConfirmDialog`,
    which manages its own focus regardless of when Radix's trap
    releases) - so the six-month-old component had a latent bug no
    existing consumer could have tripped. Diagnosed by tracing actual
    `blur` events (`relatedTarget` pointed at a bare, unlabeled `<div>`
    with `tabIndex="-1"` - Radix's own `FocusScope` container, not the
    trigger button `onCloseAutoFocus`'s documented default would have
    focused), then reading `@radix-ui/react-focus-scope`'s source to
    confirm the trapped-`FocusScope` mechanism directly, rather than
    guessing at timing fixes (an initial attempt to win the race with a
    plain `useEffect` instead of `autoFocus` failed for exactly this
    reason: the trap doesn't care which React effect tier calls
    `.focus()`, it un-focuses anything outside its container regardless).
  - **`role:manage` vs `org:admin` is a deliberate split, not two names
    for the same check**: an org admin can grant/revoke *existing* roles
    to people without being able to redefine what those roles mean, and
    conversely `role:manage` alone (a custom role, in principle) cannot
    assign itself to anyone. ADR-0013 lists both permissions separately
    for exactly this reason; this task is the first to actually gate
    RPCs on `role:manage`.
- **Next**: M10-T12 — Team management UI (member search/picker,
  `TeamService`'s eight methods, and `RoleService.{grantRole,revokeGrant,
  listGrants}` alongside it).
