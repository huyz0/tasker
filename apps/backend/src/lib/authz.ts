import { ConnectError, Code } from '@connectrpc/connect';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import * as schemaMysql from '../db/schema.mysql';
import * as schemaSqlite from '../db/schema.sqlite';
import { currentUserIdKey } from '../modules/auth/session';

// Resolved lazily inside each function rather than once at module load, since
// STANDALONE is set at test/runtime, not import time - freezing it here caused
// these helpers to silently query the wrong DB schema when this module loaded
// before a test's setup function had a chance to set the env var.
function isStandalone(): boolean {
  return process.env.STANDALONE === 'true';
}

export function requireUserId(contextValues: any): string {
  const userId = contextValues?.get(currentUserIdKey);
  if (!userId) {
    throw new ConnectError('Authentication required', Code.Unauthenticated);
  }
  return userId;
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
 * agentRoles has no orgId column - it's a deliberately global, shared
 * catalog (every org's agents can reuse the same personas) - so there's no
 * single org to check admin-of. This instead requires the caller be an
 * admin (or owner) of at least one organization, so an authenticated
 * account with no real standing anywhere can't write into a catalog every
 * org shares.
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
