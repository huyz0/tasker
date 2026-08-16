import { ConnectError, Code } from '@connectrpc/connect';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import * as schemaMysql from '../db/schema.mysql';
import * as schemaSqlite from '../db/schema.sqlite';
import { currentUserIdKey, currentPrincipalKey, type Principal } from '../modules/auth/session';
import { assertCan, type Scope } from './policy';

// Resolved lazily inside each function rather than once at module load, since
// STANDALONE is set at test/runtime, not import time - freezing it here caused
// these helpers to silently query the wrong DB schema when this module loaded
// before a test's setup function had a chance to set the env var.
function isStandalone(): boolean {
  return process.env.STANDALONE === 'true';
}

/**
 * The authenticated caller, human or agent. Use this on endpoints an agent is
 * allowed to reach; use requireUser everywhere else.
 */
export function requirePrincipal(contextValues: any): Principal {
  const principal = contextValues?.get(currentPrincipalKey);
  if (principal) return principal;

  // The human session path and every existing test set only currentUserIdKey.
  // Deriving the user principal from it here is what lets this land without
  // rewriting ~86 call sites' fixtures to prove a rename.
  const userId = contextValues?.get(currentUserIdKey);
  if (userId) return { kind: 'user', userId };

  throw new ConnectError('Authentication required', Code.Unauthenticated);
}

/**
 * The authenticated *human*. Refuses agent tokens.
 *
 * This is the former requireUserId, renamed rather than widened: every existing
 * handler calls it, so an agent token reaches none of them until someone
 * deliberately moves that endpoint to requirePrincipal. Deny-by-default for
 * agents falls out of the rename instead of depending on anyone remembering
 * (ADR-0008).
 */
export function requireUser(contextValues: any): string {
  const principal = requirePrincipal(contextValues);
  if (principal.kind !== 'user') {
    // PermissionDenied, not Unauthenticated: the agent *is* authenticated, and
    // telling a correctly-credentialled caller to authenticate again is both
    // wrong and an endless retry loop for an autonomous worker.
    throw new ConnectError('This endpoint requires a human session', Code.PermissionDenied);
  }
  return principal.userId;
}

/**
 * The single authorization call for an endpoint that agents may reach.
 *
 * An agent is governed by its token: the organization it was issued for, and
 * ADR-0008's closed scope vocabulary (`opts.scope`) on it - unchanged by M10
 * (ADR-0013 Option 4: agent tokens stay their own system, deliberately not
 * folded into `grants`) and always resolved against `orgId`, regardless of
 * `humanScope` below - a token's org binding is not a `can()` scope. A human
 * is governed by `can()` against `opts.permission`, ADR-0013's real
 * permission vocabulary - a materially different, larger vocabulary than
 * `opts.scope`'s, which is why both fields exist side by side rather than
 * one doing double duty.
 *
 * `humanScope` (M10-T10) lets a caller check the human path against a
 * narrower scope than `{type: 'organization', id: orgId}` - a project, once
 * one exists to name - while the agent path keeps resolving against `orgId`
 * exactly as before. Omit it and both paths behave exactly as pre-T10.
 */
export async function authorizePrincipal(
  db: any,
  principal: Principal,
  orgId: string,
  opts: { scope: string; write?: boolean; permission: string },
  humanScope?: Scope,
): Promise<void> {
  if (principal.kind === 'agent') {
    if (principal.orgId !== orgId) {
      throw new ConnectError('this token cannot act in that organization', Code.PermissionDenied);
    }
    if (!principal.scopes.includes(opts.scope)) {
      throw new ConnectError(`this token lacks the ${opts.scope} scope`, Code.PermissionDenied);
    }
    return;
  }
  await assertCan(db, principal, humanScope ?? { type: 'organization', id: orgId }, opts.permission);
}

export async function assertOrgMember(db: any, userId: string, orgId: string): Promise<void> {
  const members = isStandalone() ? schemaSqlite.organizationMembers : schemaMysql.organizationMembers;
  const rows = await db
    .select()
    .from(members)
    .where(and(eq(members.orgId, orgId), eq(members.userId, userId)))
    .limit(1);

  if (!rows || rows.length === 0) {
    throw new ConnectError('Not a member of this organization', Code.PermissionDenied);
  }
}

// 'owner' is a superset of 'admin' - every admin-gated action is also
// permitted for the org's owner(s), so admin checks below accept either.
const ADMIN_ROLES = ['owner', 'admin'];

/** Returns the caller's role in the org, or null if they aren't a member. */
export async function getOrgMemberRole(db: any, userId: string, orgId: string): Promise<string | null> {
  const members = isStandalone() ? schemaSqlite.organizationMembers : schemaMysql.organizationMembers;
  const rows = await db
    .select()
    .from(members)
    .where(and(eq(members.orgId, orgId), eq(members.userId, userId)))
    .limit(1);
  return rows && rows.length > 0 ? rows[0].role : null;
}

/** Counts how many members currently hold the 'owner' role in this org. */
export async function countOrgOwners(db: any, orgId: string): Promise<number> {
  const members = isStandalone() ? schemaSqlite.organizationMembers : schemaMysql.organizationMembers;
  const rows = await db
    .select()
    .from(members)
    .where(and(eq(members.orgId, orgId), eq(members.role, 'owner')));
  return rows.length;
}

/**
 * M10-T05 removed `assertOrgWriter` (and the `WRITER_ROLES` allowlist it
 * read) - `viewer-denial.test.ts`'s ADR-0006 guarantee it backed is now
 * `can()`'s job, and every handler that called it was replaced with
 * `assertCan(..., '<family>:write')`. It had no dedicated test of its own
 * (unlike `assertOrgMember`/`assertOrgAdmin`/`assertOrgOwner` below, each
 * still directly unit-tested in `authz.test.ts` even though no handler calls
 * them either post-T05) and zero remaining callers, so this is dead-code
 * removal, not just an unused-export fix for `tasker:knip`.
 */

export async function assertOrgAdmin(db: any, userId: string, orgId: string): Promise<void> {
  const role = await getOrgMemberRole(db, userId, orgId);
  if (!role || !ADMIN_ROLES.includes(role)) {
    throw new ConnectError('Admin role required in this organization', Code.PermissionDenied);
  }
}

/** Requires the caller hold the 'owner' role specifically - not just 'admin'. */
export async function assertOrgOwner(db: any, userId: string, orgId: string): Promise<void> {
  const role = await getOrgMemberRole(db, userId, orgId);
  if (role !== 'owner') {
    throw new ConnectError('Owner role required in this organization', Code.PermissionDenied);
  }
}

/**
 * Requires the caller be an admin (or owner) of at least one organization,
 * without naming which. Use only where the request genuinely has no org to
 * scope to - today that is the /api/debug/* telemetry routes, which report on
 * the process rather than on any tenant's data.
 *
 * This used to guard the agentRoles catalogue, back when that table was global
 * and shared between tenants. M03-T05 scoped roles to one organization
 * (ADR-0007), so that caller now uses assertOrgAdmin against a real orgId. Do
 * not reach for this one because it is convenient: "admin of something,
 * somewhere" is not an authorization decision about the resource in hand.
 */
export async function assertOrgAdminOfAny(db: any, userId: string): Promise<void> {
  const members = isStandalone() ? schemaSqlite.organizationMembers : schemaMysql.organizationMembers;
  const rows = await db
    .select()
    .from(members)
    .where(and(eq(members.userId, userId), inArray(members.role, ADMIN_ROLES)))
    .limit(1);

  if (!rows || rows.length === 0) {
    throw new ConnectError('Admin role required in at least one organization', Code.PermissionDenied);
  }
}

/**
 * Resolves a project's orgId, throwing NotFound if the project doesn't
 * exist. Pass includeDeleted=true from restore/purge flows, which must
 * still resolve the org for a project that is currently soft-deleted.
 */
export async function getProjectOrgId(db: any, projectId: string, includeDeleted = false): Promise<string> {
  const projects = isStandalone() ? schemaSqlite.projects : schemaMysql.projects;
  const conditions = [eq(projects.id, projectId)];
  if (!includeDeleted) conditions.push(isNull(projects.deletedAt));
  const rows = await db
    .select()
    .from(projects)
    .where(and(...conditions))
    .limit(1);
  if (!rows || rows.length === 0) {
    throw new ConnectError('Project not found', Code.NotFound);
  }
  return rows[0].orgId;
}

/**
 * Resolves a task's project orgId, throwing NotFound if the task doesn't
 * exist. includeDeleted must propagate all the way down to the project
 * lookup, not just gate the task's own row - restoreTask/purgeTask pass
 * true precisely so a task under an *archived* project still resolves an
 * orgId (to check admin permission) instead of getProjectOrgId's own
 * default filtering the project out and misreporting "Project not found".
 */
export async function getTaskOrgId(db: any, taskId: string, includeDeleted = false): Promise<string> {
  const tasks = isStandalone() ? schemaSqlite.tasks : schemaMysql.tasks;
  const conditions = [eq(tasks.id, taskId)];
  if (!includeDeleted) conditions.push(isNull(tasks.deletedAt));
  const rows = await db
    .select()
    .from(tasks)
    .where(and(...conditions))
    .limit(1);
  if (!rows || rows.length === 0) {
    throw new ConnectError('Task not found', Code.NotFound);
  }
  return getProjectOrgId(db, rows[0].projectId, includeDeleted);
}

/**
 * Resolves a folder's project orgId, throwing NotFound if the folder doesn't
 * exist. Doesn't filter the folder's own deletedAt: the app intentionally
 * allows creating/purging artifacts inside an archived folder as part of
 * its archive-then-purge cleanup workflow (see artifacts.test.ts).
 *
 * includeDeleted propagates to the project lookup - see getTaskOrgId's note;
 * restoreFolder/purgeFolder need this so a folder under an archived project
 * still resolves.
 */
export async function getFolderOrgId(db: any, folderId: string, includeDeleted = false): Promise<string> {
  const folders = isStandalone() ? schemaSqlite.folders : schemaMysql.folders;
  const rows = await db.select().from(folders).where(eq(folders.id, folderId)).limit(1);
  if (!rows || rows.length === 0) {
    throw new ConnectError('Folder not found', Code.NotFound);
  }
  return getProjectOrgId(db, rows[0].projectId, includeDeleted);
}

/**
 * Resolves an artifact's project orgId, throwing NotFound if the artifact
 * doesn't exist. Doesn't filter the artifact's own deletedAt: linking an
 * already-archived artifact to a task is an intentional part of the
 * archive-then-purge cleanup workflow (see artifacts.test.ts).
 *
 * includeDeleted propagates through the folder lookup to the project lookup
 * - see getTaskOrgId's note; restoreArtifact/purgeArtifact need this so an
 * artifact under an archived project still resolves.
 */
export async function getArtifactOrgId(db: any, artifactId: string, includeDeleted = false): Promise<string> {
  const artifacts = isStandalone() ? schemaSqlite.artifacts : schemaMysql.artifacts;
  const rows = await db.select().from(artifacts).where(eq(artifacts.id, artifactId)).limit(1);
  if (!rows || rows.length === 0) {
    throw new ConnectError('Artifact not found', Code.NotFound);
  }
  return getFolderOrgId(db, rows[0].folderId, includeDeleted);
}

/** Resolves a repository link's project orgId, throwing NotFound if it doesn't exist. */
export async function getRepositoryLinkOrgId(db: any, repositoryLinkId: string): Promise<string> {
  const links = isStandalone() ? schemaSqlite.repositoryLinks : schemaMysql.repositoryLinks;
  const rows = await db.select().from(links).where(eq(links.id, repositoryLinkId)).limit(1);
  if (!rows || rows.length === 0) {
    throw new ConnectError('Repository link not found', Code.NotFound);
  }
  return getProjectOrgId(db, rows[0].projectId);
}

/**
 * Counts how many ways a user can currently sign in: one for a password
 * credential (if set), plus one per linked identity (Google today; any
 * future provider the same way). ADR-0012 §5's invariant - a user can never
 * be left with zero - is enforced from both directions this can be lost:
 * `unlinkIdentity` (M13-T08) removing the last linked identity, and clearing
 * a password that is the only credential (M13-T10's admin reset touches the
 * same guard). Mirrors `countOrgOwners`'s shape: a plain count the caller
 * does the "would this go to zero" arithmetic against, not a boolean, so
 * each caller can name what it is about to remove in its own error message.
 */
export async function countActiveSignInMethods(db: any, userId: string): Promise<number> {
  const { passwordCredentials, linkedIdentities } = isStandalone()
    ? { passwordCredentials: schemaSqlite.passwordCredentials, linkedIdentities: schemaSqlite.linkedIdentities }
    : { passwordCredentials: schemaMysql.passwordCredentials, linkedIdentities: schemaMysql.linkedIdentities };

  const [passwordRows, linkedRows] = await Promise.all([
    db.select().from(passwordCredentials).where(eq(passwordCredentials.userId, userId)).limit(1),
    db.select().from(linkedIdentities).where(eq(linkedIdentities.userId, userId)),
  ]);
  return (passwordRows.length > 0 ? 1 : 0) + linkedRows.length;
}

/**
 * Refuses an action that would remove a user's last sign-in method.
 * `methodsAfterRemoval` is the caller's own count post-removal (not
 * recomputed here), so the same function serves an unlink (linked count - 1)
 * and a password clear (linked count + 0, password no longer counted) alike.
 */
export function assertNotLastSignInMethod(methodsAfterRemoval: number): void {
  if (methodsAfterRemoval < 1) {
    throw new ConnectError(
      'cannot remove your last sign-in method - link another identity or set a password first',
      Code.FailedPrecondition,
    );
  }
}
