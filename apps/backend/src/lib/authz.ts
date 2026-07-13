import { ConnectError, Code } from '@connectrpc/connect';
import { eq, and } from 'drizzle-orm';
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

export async function assertOrgAdmin(db: any, userId: string, orgId: string): Promise<void> {
  const members = isStandalone() ? schemaSqlite.organizationMembers : schemaMysql.organizationMembers;
  const rows = await db
    .select()
    .from(members)
    .where(and(eq(members.orgId, orgId), eq(members.userId, userId)))
    .limit(1);

  if (!rows || rows.length === 0 || rows[0].role !== 'admin') {
    throw new ConnectError('Admin role required in this organization', Code.PermissionDenied);
  }
}

/**
 * agentRoles has no orgId column - it's a deliberately global, shared
 * catalog (every org's agents can reuse the same personas) - so there's no
 * single org to check admin-of. This instead requires the caller be an
 * admin of at least one organization, so an authenticated account with no
 * real standing anywhere can't write into a catalog every org shares.
 */
export async function assertOrgAdminOfAny(db: any, userId: string): Promise<void> {
  const members = isStandalone() ? schemaSqlite.organizationMembers : schemaMysql.organizationMembers;
  const rows = await db
    .select()
    .from(members)
    .where(and(eq(members.userId, userId), eq(members.role, 'admin')))
    .limit(1);

  if (!rows || rows.length === 0) {
    throw new ConnectError('Admin role required in at least one organization', Code.PermissionDenied);
  }
}

/** Resolves a project's orgId, throwing NotFound if the project doesn't exist. */
export async function getProjectOrgId(db: any, projectId: string): Promise<string> {
  const projects = isStandalone() ? schemaSqlite.projects : schemaMysql.projects;
  const rows = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!rows || rows.length === 0) {
    throw new ConnectError('Project not found', Code.NotFound);
  }
  return rows[0].orgId;
}

/** Resolves a task's project orgId, throwing NotFound if the task doesn't exist. */
export async function getTaskOrgId(db: any, taskId: string): Promise<string> {
  const tasks = isStandalone() ? schemaSqlite.tasks : schemaMysql.tasks;
  const rows = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!rows || rows.length === 0) {
    throw new ConnectError('Task not found', Code.NotFound);
  }
  return getProjectOrgId(db, rows[0].projectId);
}

/** Resolves a folder's project orgId, throwing NotFound if the folder doesn't exist. */
export async function getFolderOrgId(db: any, folderId: string): Promise<string> {
  const folders = isStandalone() ? schemaSqlite.folders : schemaMysql.folders;
  const rows = await db.select().from(folders).where(eq(folders.id, folderId)).limit(1);
  if (!rows || rows.length === 0) {
    throw new ConnectError('Folder not found', Code.NotFound);
  }
  return getProjectOrgId(db, rows[0].projectId);
}

/** Resolves an artifact's project orgId, throwing NotFound if the artifact doesn't exist. */
export async function getArtifactOrgId(db: any, artifactId: string): Promise<string> {
  const artifacts = isStandalone() ? schemaSqlite.artifacts : schemaMysql.artifacts;
  const rows = await db.select().from(artifacts).where(eq(artifacts.id, artifactId)).limit(1);
  if (!rows || rows.length === 0) {
    throw new ConnectError('Artifact not found', Code.NotFound);
  }
  return getFolderOrgId(db, rows[0].folderId);
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
