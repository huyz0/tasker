import { ConnectError, Code } from '@connectrpc/connect';
import { eq, and, or, inArray } from 'drizzle-orm';
import * as schemaMysql from '../db/schema.mysql';
import * as schemaSqlite from '../db/schema.sqlite';
import type { Principal } from '../modules/auth/session';
import { getProjectOrgId } from './authz';
import { getPolicyCache } from './requestContext';

// Resolved lazily, same reasoning as authz.ts's isStandalone(): freezing
// this at module load caught the wrong schema when this module loaded
// before a test's setup function had a chance to set the env var.
function isStandalone(): boolean {
  return process.env.STANDALONE === 'true';
}

// Not exported: nothing outside this file names a scope's type in isolation
// yet - callers build a `Scope` directly. T05's RPC-to-permission mapping
// table may want this exported on its own; add `export` back then rather
// than pre-emptively now.
type ScopeType = 'organization' | 'team' | 'project';

export interface Scope {
  type: ScopeType;
  id: string;
}

/**
 * Every ancestor of `orgId`, walking `organizations.parentOrgId` up as far
 * as it goes (M10-T09 - `seedOrg`'s old two-level cap meant this was at
 * most one hop; there is no cap anymore). One query per level rather than
 * a recursive CTE: real hierarchies are shallow and this is cached per
 * orgId per request, so the naive version is the correct-first
 * implementation, the same tradeoff T06 made for the rest of this file.
 * Bounded at 50 levels and guarded against a cycle so a corrupt
 * `parentOrgId` chain fails closed (an empty ancestor list) instead of
 * looping forever - real organizations never nest anywhere near that deep.
 */
async function getAncestorOrgIds(db: any, orgId: string, organizations: any, cache: ReturnType<typeof getPolicyCache>): Promise<string[]> {
  if (cache?.orgAncestors.has(orgId)) return cache.orgAncestors.get(orgId)!;

  const ancestors: string[] = [];
  const seen = new Set<string>([orgId]);
  let currentId = orgId;
  for (let i = 0; i < 50; i++) {
    const rows = await db.select({ parentOrgId: organizations.parentOrgId }).from(organizations)
      .where(eq(organizations.id, currentId)).limit(1);
    const parentId = rows[0]?.parentOrgId;
    if (!parentId || seen.has(parentId)) break;
    ancestors.push(parentId);
    seen.add(parentId);
    currentId = parentId;
  }

  cache?.orgAncestors.set(orgId, ancestors);
  return ancestors;
}

/**
 * `can()` (ADR-0013, M10-T04) - the single human-path authorization entry
 * point every handler calls instead of naming a role (T05). Governs humans
 * only: an agent principal always resolves `false` here, since agent
 * authorization stays on `authorizePrincipal`'s existing branch into
 * ADR-0008's closed scope vocabulary (ADR-0013 Option 4) - giving agents a
 * second, unrelated permission system to satisfy would be exactly the
 * "two-systems problem in a different shape" that decision named and
 * rejected. A handler that must accept either kind of principal calls
 * `authorizePrincipal` (existing) or branches on `principal.kind` itself,
 * not this function directly with an agent principal.
 *
 * Resolution (ADR-0013 §3), in order, any match is sufficient:
 * 1. A direct grant: `principal.userId` holds a role granting `permission`
 *    at exactly this `scope`.
 * 2. A team-derived grant: a team `principal.userId` belongs to
 *    (`team_members`) holds a role granting `permission` at this `scope`.
 * 3. An ancestor grant: a `project` scope also checks grants (1 and 2 both)
 *    at the project's owning `organization` - today's "an org role reaches
 *    every project" behavior, preserved rather than narrowed - and an
 *    `organization` scope also checks grants at every ancestor
 *    organization, walking `organizations.parentOrgId` all the way up
 *    (M10-T09, which lifted the two-level nesting cap `seedOrg` used to
 *    enforce - there is no depth limit to stop climbing at). A parent-org
 *    grant reaches every descendant, not just its immediate children.
 * 4. **`organization_members` as a live, ongoing second source of organization-
 *    scope grants** - not just T03's one-time historical backfill. If the
 *    resolved organization scope, *or any ancestor of it* (step 3's
 *    climbing applies here too, not only to real `grants` rows), has an
 *    `organization_members` row for this user, that row's `role` counts as
 *    if `grants` held a `role-<role>` grant for it too. This is deliberate,
 *    not a leftover of the migration: `organization_members.role` is a
 *    real MySQL `enum` of
 *    exactly the four system-tier names, so this can never resolve anything
 *    `grants` couldn't already express on its own - it is a second, always-
 *    consistent-by-construction *reader* of the same fact, not a second
 *    place that fact can drift. It is what lets T05 flip every handler's
 *    *read* path onto `can()` without also rewriting the membership *write*
 *    path (`seedOrg`/`updateOrgMemberRole`/`removeOrgMember`/
 *    `consumePendingInvitations`) or the ~30 test files that seed
 *    `organization_members` directly - exactly the milestone's own stated
 *    risk mitigation ("land T04/T05 ... evaluating both the old and new
 *    logic," §7) without needing a parallel dual-check code path to do it.
 *    `scripts/migrate-roles.ts` (T03) remains worth running regardless: a
 *    real `grants` row is still what a future "list every grant, uniformly,
 *    across teams/projects/orgs" admin view would need, which this fallback
 *    does not produce.
 *
 * `team` scope does **not** climb to its owning organization the way
 * `project` does: the ADR's resolution algorithm names only project→org
 * and org→ancestor-org as ancestor edges, not team→org. A team is a
 * new resource with no prior "org role reaches every team" behavior to
 * preserve, so whether a given team operation should check `organization`
 * scope, `team` scope, or both is each RPC's own mapping decision (T05/T07),
 * not something `can()` decides on their behalf by auto-climbing.
 *
 * M10-T06: every query below reads through `requestContext.ts`'s
 * `PolicyCache` first, memoized per request (team memberships and grants by
 * userId, the organization_members fallback by (userId, orgId), a role's
 * permission set by roleId) - a second `can()` call in the same request for
 * the same principal against a *different* scope or permission reuses
 * whatever it can rather than re-querying. Outside a request (no
 * `runWithRequestContext` on the call stack - a script, or a test calling
 * `can()` directly) the cache is simply absent and every call queries
 * fresh, same as before T06.
 *
 * The cache is request-scoped and never invalidated mid-request: a handler
 * that both mutates `grants`/`organization_members`/`team_members` *and*
 * re-checks a permission for the same principal later in the same request
 * would see the pre-mutation view. No handler does that today - every
 * `assertCan`/`authorizePrincipal` call happens before any mutation in its
 * own RPC - but it is the tradeoff this cache makes, worth knowing before
 * relying on a same-request read-after-write for policy data specifically.
 */
export async function can(db: any, principal: Principal, scope: Scope, permission: string): Promise<boolean> {
  if (principal.kind !== 'user') return false;

  const { grants, rolePermissions, teamMembers, organizationMembers, organizations } = isStandalone()
    ? { grants: schemaSqlite.grants, rolePermissions: schemaSqlite.rolePermissions, teamMembers: schemaSqlite.teamMembers, organizationMembers: schemaSqlite.organizationMembers, organizations: schemaSqlite.organizations }
    : { grants: schemaMysql.grants, rolePermissions: schemaMysql.rolePermissions, teamMembers: schemaMysql.teamMembers, organizationMembers: schemaMysql.organizationMembers, organizations: schemaMysql.organizations };

  const userId = principal.userId;
  // `null` outside a request (a script, or a test calling can() directly) -
  // every cache read/write below is guarded with `cache?.`, so this
  // degrades to exactly T05's always-fresh behavior, never an error.
  const cache = getPolicyCache();

  const scopesToCheck: Scope[] = [scope];
  if (scope.type === 'project') {
    // includeDeleted: a permission check on an archived project's resources
    // (e.g. restoring it) must still resolve an orgId, same reasoning as
    // getTaskOrgId's own includeDeleted note in authz.ts.
    const orgId = await getProjectOrgId(db, scope.id, true);
    scopesToCheck.push({ type: 'organization', id: orgId });
  }
  // T09: every organization-type scope reached so far (the scope itself,
  // or a project's owning org) also reaches its ancestor organizations.
  // Iterating a snapshot of the pre-ancestor entries, not the array being
  // pushed onto, so an ancestor's own ancestors aren't walked a second
  // time here - getAncestorOrgIds already returns the full chain in one call.
  for (const orgEntry of scopesToCheck.filter((s) => s.type === 'organization')) {
    const ancestorIds = await getAncestorOrgIds(db, orgEntry.id, organizations, cache);
    for (const ancestorId of ancestorIds) scopesToCheck.push({ type: 'organization', id: ancestorId });
  }

  // Team memberships are constant for this principal for the life of the
  // request, so cached by userId alone.
  let teamIds: string[];
  if (cache?.teamIds.has(userId)) {
    teamIds = cache.teamIds.get(userId)!;
  } else {
    const teamRows = await db.select({ teamId: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.userId, userId));
    teamIds = teamRows.map((r: any) => r.teamId);
    cache?.teamIds.set(userId, teamIds);
  }

  // Every grant held by this user or a team they belong to, *unfiltered by
  // scope* - identical regardless of which scope this particular call is
  // checking, so it's cached by userId alone and reused across every
  // scope/permission this principal is checked against in the same
  // request (scope matching happens below, in application code, not here -
  // the scope set is at most two entries, so a second round trip to filter
  // it in SQL would cost more than it saves).
  let candidateGrants: any[];
  if (cache?.candidateGrants.has(userId)) {
    candidateGrants = cache.candidateGrants.get(userId)!;
  } else {
    const subjectCondition = teamIds.length > 0
      ? or(
          and(eq(grants.subjectType, 'user'), eq(grants.subjectId, userId)),
          and(eq(grants.subjectType, 'team'), inArray(grants.subjectId, teamIds)),
        )
      : and(eq(grants.subjectType, 'user'), eq(grants.subjectId, userId));
    candidateGrants = await db.select().from(grants).where(subjectCondition);
    cache?.candidateGrants.set(userId, candidateGrants);
  }

  // organization_members fallback (§4 above): cached per (userId, orgId)
  // pair, since one request can legitimately check permissions against more
  // than one organization (e.g. moving a project between two orgs) - and,
  // since T09, `scopesToCheck` can hold several 'organization' entries at
  // once (the scope itself plus every ancestor), each checked in turn.
  const orgScopeIds = [...new Set(scopesToCheck.filter((s) => s.type === 'organization').map((s) => s.id))];
  const orgMemberRoles: string[] = [];
  for (const orgId of orgScopeIds) {
    const cacheKey = `${userId}:${orgId}`;
    let role: string | null;
    if (cache?.orgMemberRole.has(cacheKey)) {
      role = cache.orgMemberRole.get(cacheKey)!;
    } else {
      const rows = await db.select({ role: organizationMembers.role }).from(organizationMembers)
        .where(and(eq(organizationMembers.orgId, orgId), eq(organizationMembers.userId, userId)))
        .limit(1);
      role = rows.length > 0 ? rows[0].role : null;
      cache?.orgMemberRole.set(cacheKey, role);
    }
    if (role) orgMemberRoles.push(role);
  }

  const matchingGrants = candidateGrants.filter((g: any) =>
    scopesToCheck.some((s) => s.type === g.scopeType && s.id === g.scopeId));

  const roleIds = new Set(matchingGrants.map((g: any) => g.roleId));
  for (const role of orgMemberRoles) roleIds.add(`role-${role}`);
  if (roleIds.size === 0) return false;

  // A role's *entire* permission set is cached per roleId, not "does this
  // role have permission X" per (roleId, permission) pair: the same role is
  // often checked against several different permissions across one request
  // (e.g. a list endpoint's per-row read/write/admin checks), and caching
  // the full set turns every check after the first into a Set.has() with no
  // query at all, instead of caching a single true/false that only answers
  // the one permission first asked about.
  const uncachedRoleIds: string[] = [];
  const heldPermissions = new Set<string>();
  for (const roleId of roleIds) {
    const cached = cache?.rolePermissions.get(roleId);
    if (cached) {
      for (const p of cached) heldPermissions.add(p);
    } else {
      uncachedRoleIds.push(roleId);
    }
  }
  if (uncachedRoleIds.length > 0) {
    const rows = await db.select().from(rolePermissions).where(inArray(rolePermissions.roleId, uncachedRoleIds));
    const byRole = new Map<string, Set<string>>(uncachedRoleIds.map((id) => [id, new Set<string>()]));
    for (const r of rows) byRole.get(r.roleId)?.add(r.permissionKey);
    for (const [roleId, perms] of byRole) {
      cache?.rolePermissions.set(roleId, perms);
      for (const p of perms) heldPermissions.add(p);
    }
  }

  return heldPermissions.has(permission);
}

/**
 * Requires `can(principal, scope, permission)`, throwing `PermissionDenied`
 * otherwise. The convenience wrapper T05's call-site replacement reaches
 * for, mirroring `assertOrgAdmin`'s shape in authz.ts.
 */
export async function assertCan(db: any, principal: Principal, scope: Scope, permission: string): Promise<void> {
  if (!(await can(db, principal, scope, permission))) {
    throw new ConnectError(`missing required permission: ${permission}`, Code.PermissionDenied);
  }
}
