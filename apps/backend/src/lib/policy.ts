import { ConnectError, Code } from '@connectrpc/connect';
import { eq, and, or, inArray } from 'drizzle-orm';
import * as schemaMysql from '../db/schema.mysql';
import * as schemaSqlite from '../db/schema.sqlite';
import type { Principal } from '../modules/auth/session';
import { getProjectOrgId } from './authz';

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
 *    every project" behavior, preserved rather than narrowed.
 * 4. **`organization_members` as a live, ongoing second source of organization-
 *    scope grants** - not just T03's one-time historical backfill. If the
 *    resolved organization scope has an `organization_members` row for this
 *    user, that row's `role` counts as if `grants` held a
 *    `role-<role>` grant for it too. This is deliberate, not a leftover of
 *    the migration: `organization_members.role` is a real MySQL `enum` of
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
 * Not yet implemented: an `organization` scope checking its ancestor
 * organizations' grants too (a parent-org grant reaching a descendant org).
 * ADR-0013 §3 explicitly defers that to T09, which lifts the two-level
 * nesting cap this schema still has - there is no ancestor chain to climb
 * yet. `team` scope does **not** climb to its owning organization the way
 * `project` does: the ADR's resolution algorithm names only project→org
 * (and, later, org→parent-org) as ancestor edges, not team→org. A team is a
 * new resource with no prior "org role reaches every team" behavior to
 * preserve, so whether a given team operation should check `organization`
 * scope, `team` scope, or both is each RPC's own mapping decision (T05/T07),
 * not something `can()` decides on their behalf by auto-climbing.
 */
export async function can(db: any, principal: Principal, scope: Scope, permission: string): Promise<boolean> {
  if (principal.kind !== 'user') return false;

  const { grants, rolePermissions, teamMembers, organizationMembers } = isStandalone()
    ? { grants: schemaSqlite.grants, rolePermissions: schemaSqlite.rolePermissions, teamMembers: schemaSqlite.teamMembers, organizationMembers: schemaSqlite.organizationMembers }
    : { grants: schemaMysql.grants, rolePermissions: schemaMysql.rolePermissions, teamMembers: schemaMysql.teamMembers, organizationMembers: schemaMysql.organizationMembers };

  const scopesToCheck: Scope[] = [scope];
  if (scope.type === 'project') {
    // includeDeleted: a permission check on an archived project's resources
    // (e.g. restoring it) must still resolve an orgId, same reasoning as
    // getTaskOrgId's own includeDeleted note in authz.ts.
    const orgId = await getProjectOrgId(db, scope.id, true);
    scopesToCheck.push({ type: 'organization', id: orgId });
  }

  const teamRows = await db.select({ teamId: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.userId, principal.userId));
  const teamIds: string[] = teamRows.map((r: any) => r.teamId);

  const subjectCondition = teamIds.length > 0
    ? or(
        and(eq(grants.subjectType, 'user'), eq(grants.subjectId, principal.userId)),
        and(eq(grants.subjectType, 'team'), inArray(grants.subjectId, teamIds)),
      )
    : and(eq(grants.subjectType, 'user'), eq(grants.subjectId, principal.userId));

  // scopesToCheck has at most one 'organization' entry (the scope itself, or
  // - for a project scope - its owning org), so this is at most one extra
  // query, not one per candidate.
  const orgScope = scopesToCheck.find((s) => s.type === 'organization');
  const [candidateGrants, orgMemberRows] = await Promise.all([
    db.select().from(grants).where(subjectCondition),
    orgScope
      ? db.select({ role: organizationMembers.role }).from(organizationMembers)
          .where(and(eq(organizationMembers.orgId, orgScope.id), eq(organizationMembers.userId, principal.userId)))
          .limit(1)
      : Promise.resolve([]),
  ]);

  // Scope matching happens in application code, not the query: the set of
  // scopes to check is at most two entries (this scope, plus its owning org
  // for a project), so a second round trip to filter it in SQL would cost
  // more than it saves. T06 revisits this whole function's query shape for
  // caching; this is the correct-first version it optimizes.
  const matchingGrants = candidateGrants.filter((g: any) =>
    scopesToCheck.some((s) => s.type === g.scopeType && s.id === g.scopeId));

  const roleIds = new Set(matchingGrants.map((g: any) => g.roleId));
  if (orgMemberRows.length > 0) roleIds.add(`role-${orgMemberRows[0].role}`);
  if (roleIds.size === 0) return false;

  const permissionRows = await db
    .select()
    .from(rolePermissions)
    .where(and(inArray(rolePermissions.roleId, [...roleIds]), eq(rolePermissions.permissionKey, permission)))
    .limit(1);
  return permissionRows.length > 0;
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
