import { eq, and, isNull } from "drizzle-orm";
import * as schemaMysql from "../db/schema.mysql";
import * as schemaSqlite from "../db/schema.sqlite";

function getSchema() {
  return process.env.STANDALONE === "true" ? schemaSqlite : schemaMysql;
}

/**
 * Forced cascade purges used by the retention sweep once an archived entity's
 * grace period has expired. Unlike the manual purge (empty-check only) RPCs, these
 * always remove everything beneath the entity, regardless of the children's
 * own archive state - once the parent's retention is up, nothing under it
 * survives on its own. Each function is defensive against the row already
 * being gone (e.g. a child independently purged earlier in the same sweep).
 */

export async function purgeTaskCascade(db: any, taskId: string): Promise<void> {
  const schema = getSchema();
  const existing = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).limit(1);
  if (!existing || existing.length === 0) return;

  await db.delete(schema.taskAssignments).where(eq(schema.taskAssignments.taskId, taskId));
  await db.delete(schema.taskReviewers).where(eq(schema.taskReviewers.taskId, taskId));
  await db.delete(schema.taskArtifactLinks).where(eq(schema.taskArtifactLinks.taskId, taskId));
  await db.delete(schema.taskNotes).where(eq(schema.taskNotes.taskId, taskId));
  await db.delete(schema.comments).where(and(eq(schema.comments.entityId, taskId), eq(schema.comments.entityType, "task")));
  await db.update(schema.remotePullRequests).set({ taskId: null }).where(eq(schema.remotePullRequests.taskId, taskId));
  await db.delete(schema.tasks).where(eq(schema.tasks.id, taskId));
}

export async function purgeArtifactCascade(db: any, artifactId: string): Promise<void> {
  const schema = getSchema();
  const existing = await db.select().from(schema.artifacts).where(eq(schema.artifacts.id, artifactId)).limit(1);
  if (!existing || existing.length === 0) return;

  await db.delete(schema.taskArtifactLinks).where(eq(schema.taskArtifactLinks.artifactId, artifactId));
  await db.delete(schema.comments).where(and(eq(schema.comments.entityId, artifactId), eq(schema.comments.entityType, "artifact")));
  await db.delete(schema.artifacts).where(eq(schema.artifacts.id, artifactId));
}

export async function purgeFolderCascade(db: any, folderId: string): Promise<void> {
  const schema = getSchema();
  const existing = await db.select().from(schema.folders).where(eq(schema.folders.id, folderId)).limit(1);
  if (!existing || existing.length === 0) return;

  const childFolders = await db.select().from(schema.folders).where(eq(schema.folders.parentId, folderId));
  for (const child of childFolders) {
    await purgeFolderCascade(db, child.id);
  }

  const childArtifacts = await db.select().from(schema.artifacts).where(eq(schema.artifacts.folderId, folderId));
  for (const artifact of childArtifacts) {
    await purgeArtifactCascade(db, artifact.id);
  }

  await db.delete(schema.folders).where(eq(schema.folders.id, folderId));
}

export async function purgeAgentCascade(db: any, agentId: string): Promise<void> {
  const schema = getSchema();
  const existing = await db.select().from(schema.agents).where(eq(schema.agents.id, agentId)).limit(1);
  if (!existing || existing.length === 0) return;

  await db.delete(schema.taskAssignments).where(eq(schema.taskAssignments.agentId, agentId));
  await db.delete(schema.taskNotes).where(eq(schema.taskNotes.agentId, agentId));
  await db.update(schema.comments).set({ agentId: null }).where(eq(schema.comments.agentId, agentId));
  await db.delete(schema.agents).where(eq(schema.agents.id, agentId));
}

export async function purgeProjectCascade(db: any, projectId: string): Promise<void> {
  const schema = getSchema();
  const existing = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).limit(1);
  if (!existing || existing.length === 0) return;

  const projectTasks = await db.select().from(schema.tasks).where(eq(schema.tasks.projectId, projectId));
  for (const task of projectTasks) {
    await purgeTaskCascade(db, task.id);
  }

  const rootFolders = await db.select().from(schema.folders).where(and(eq(schema.folders.projectId, projectId), isNull(schema.folders.parentId)));
  for (const folder of rootFolders) {
    await purgeFolderCascade(db, folder.id);
  }
  // Catch any folders left over that reference a parentId outside this query (defensive; normal
  // tree traversal above already reaches every descendant of a root folder).
  const remainingFolders = await db.select().from(schema.folders).where(eq(schema.folders.projectId, projectId));
  for (const folder of remainingFolders) {
    await purgeFolderCascade(db, folder.id);
  }

  const repoLinks = await db.select().from(schema.repositoryLinks).where(eq(schema.repositoryLinks.projectId, projectId));
  for (const link of repoLinks) {
    await db.delete(schema.remotePullRequests).where(eq(schema.remotePullRequests.repositoryLinkId, link.id));
    await db.delete(schema.repositoryLinks).where(eq(schema.repositoryLinks.id, link.id));
  }

  const projectTaskTypes = await db.select().from(schema.taskTypes).where(eq(schema.taskTypes.projectId, projectId));
  for (const taskType of projectTaskTypes) {
    await db.delete(schema.taskStatusTransitions).where(eq(schema.taskStatusTransitions.taskTypeId, taskType.id));
    await db.delete(schema.taskStatuses).where(eq(schema.taskStatuses.taskTypeId, taskType.id));
    await db.delete(schema.taskTypes).where(eq(schema.taskTypes.id, taskType.id));
  }

  await db.delete(schema.projects).where(eq(schema.projects.id, projectId));
}

export async function purgeOrgCascade(db: any, orgId: string): Promise<void> {
  const schema = getSchema();
  const existing = await db.select().from(schema.organizations).where(eq(schema.organizations.id, orgId)).limit(1);
  if (!existing || existing.length === 0) return;

  const childOrgs = await db.select().from(schema.organizations).where(eq(schema.organizations.parentOrgId, orgId));
  for (const childOrg of childOrgs) {
    await purgeOrgCascade(db, childOrg.id);
  }

  const orgProjects = await db.select().from(schema.projects).where(eq(schema.projects.orgId, orgId));
  for (const project of orgProjects) {
    await purgeProjectCascade(db, project.id);
  }

  const orgAgents = await db.select().from(schema.agents).where(eq(schema.agents.orgId, orgId));
  for (const agent of orgAgents) {
    await purgeAgentCascade(db, agent.id);
  }

  const orgTaskTypes = await db.select().from(schema.taskTypes).where(eq(schema.taskTypes.orgId, orgId));
  for (const taskType of orgTaskTypes) {
    await db.delete(schema.taskStatusTransitions).where(eq(schema.taskStatusTransitions.taskTypeId, taskType.id));
    await db.delete(schema.taskStatuses).where(eq(schema.taskStatuses.taskTypeId, taskType.id));
    await db.delete(schema.taskTypes).where(eq(schema.taskTypes.id, taskType.id));
  }

  await db.delete(schema.organizationMembers).where(eq(schema.organizationMembers.orgId, orgId));
  await db.delete(schema.invitations).where(eq(schema.invitations.orgId, orgId));
  await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
}
