import { eq, and, inArray } from "drizzle-orm";
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
 *
 * purgeProjectCascade/purgeOrgCascade/purgeFolderCascade collect child ids
 * with a single SELECT and then issue bulk `DELETE ... WHERE col IN (...)`
 * statements, rather than looping over each child row and awaiting a
 * separate cascade call per row - at scale (a project with thousands of
 * tasks, an org being deleted with thousands of projects) the per-row
 * version turns into tens of thousands of sequential round-trips for a
 * single purge.
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
  await db.delete(schema.entityLabels).where(and(eq(schema.entityLabels.entityId, taskId), eq(schema.entityLabels.entityType, "task")));
  await db.update(schema.remotePullRequests).set({ taskId: null }).where(eq(schema.remotePullRequests.taskId, taskId));
  await db.delete(schema.tasks).where(eq(schema.tasks.id, taskId));
}

export async function purgeArtifactCascade(db: any, artifactId: string): Promise<void> {
  const schema = getSchema();
  const existing = await db.select().from(schema.artifacts).where(eq(schema.artifacts.id, artifactId)).limit(1);
  if (!existing || existing.length === 0) return;

  await db.delete(schema.taskArtifactLinks).where(eq(schema.taskArtifactLinks.artifactId, artifactId));
  await db.delete(schema.comments).where(and(eq(schema.comments.entityId, artifactId), eq(schema.comments.entityType, "artifact")));
  await db.delete(schema.entityLabels).where(and(eq(schema.entityLabels.entityId, artifactId), eq(schema.entityLabels.entityType, "artifact")));
  await db.delete(schema.artifacts).where(eq(schema.artifacts.id, artifactId));
}

// Bulk-deletes everything under a set of artifact ids (their task links,
// comments, and labels) plus the artifacts themselves. Shared by
// purgeFolderCascade and purgeProjectCascade, both of which collect an
// artifact id set up front rather than purging one artifact at a time.
async function bulkPurgeArtifacts(db: any, schema: any, artifactIds: string[]): Promise<void> {
  if (artifactIds.length === 0) return;
  await db.delete(schema.taskArtifactLinks).where(inArray(schema.taskArtifactLinks.artifactId, artifactIds));
  await db.delete(schema.comments).where(and(inArray(schema.comments.entityId, artifactIds), eq(schema.comments.entityType, "artifact")));
  await db.delete(schema.entityLabels).where(and(inArray(schema.entityLabels.entityId, artifactIds), eq(schema.entityLabels.entityType, "artifact")));
  await db.delete(schema.artifacts).where(inArray(schema.artifacts.id, artifactIds));
}

// Bulk-deletes everything under a set of task-type ids (their statuses and
// transitions) plus the task types themselves. Shared by
// purgeProjectCascade and purgeOrgCascade.
async function bulkPurgeTaskTypes(db: any, schema: any, taskTypeIds: string[]): Promise<void> {
  if (taskTypeIds.length === 0) return;
  await db.delete(schema.taskStatusTransitions).where(inArray(schema.taskStatusTransitions.taskTypeId, taskTypeIds));
  await db.delete(schema.taskStatuses).where(inArray(schema.taskStatuses.taskTypeId, taskTypeIds));
  await db.delete(schema.taskTypes).where(inArray(schema.taskTypes.id, taskTypeIds));
}

export async function purgeFolderCascade(db: any, folderId: string): Promise<void> {
  const schema = getSchema();
  const existing = await db.select().from(schema.folders).where(eq(schema.folders.id, folderId)).limit(1);
  if (!existing || existing.length === 0) return;

  // Collects the whole subtree breadth-first: one query per depth level,
  // instead of one query (plus a full artifact-purge call) per folder node.
  const allFolderIds = [folderId];
  let frontier = [folderId];
  while (frontier.length > 0) {
    const children = await db.select({ id: schema.folders.id }).from(schema.folders).where(inArray(schema.folders.parentId, frontier));
    frontier = children.map((c: any) => c.id);
    allFolderIds.push(...frontier);
  }

  const artifactRows = await db.select({ id: schema.artifacts.id }).from(schema.artifacts).where(inArray(schema.artifacts.folderId, allFolderIds));
  await bulkPurgeArtifacts(db, schema, artifactRows.map((a: any) => a.id));

  await db.delete(schema.folders).where(inArray(schema.folders.id, allFolderIds));
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

  const taskRows = await db.select({ id: schema.tasks.id }).from(schema.tasks).where(eq(schema.tasks.projectId, projectId));
  const taskIds = taskRows.map((t: any) => t.id);
  if (taskIds.length > 0) {
    await db.delete(schema.taskAssignments).where(inArray(schema.taskAssignments.taskId, taskIds));
    await db.delete(schema.taskReviewers).where(inArray(schema.taskReviewers.taskId, taskIds));
    await db.delete(schema.taskArtifactLinks).where(inArray(schema.taskArtifactLinks.taskId, taskIds));
    await db.delete(schema.taskNotes).where(inArray(schema.taskNotes.taskId, taskIds));
    await db.delete(schema.comments).where(and(inArray(schema.comments.entityId, taskIds), eq(schema.comments.entityType, "task")));
    await db.delete(schema.entityLabels).where(and(inArray(schema.entityLabels.entityId, taskIds), eq(schema.entityLabels.entityType, "task")));
    await db.update(schema.remotePullRequests).set({ taskId: null }).where(inArray(schema.remotePullRequests.taskId, taskIds));
    await db.delete(schema.tasks).where(inArray(schema.tasks.id, taskIds));
  }

  // Every folder already carries projectId directly, so the whole tree can
  // be collected in one query instead of walking parentId links folder by
  // folder (the old root-then-remaining-folders pass was a defensive
  // catch-all for exactly this set, done the expensive way).
  const folderRows = await db.select({ id: schema.folders.id }).from(schema.folders).where(eq(schema.folders.projectId, projectId));
  const folderIds = folderRows.map((f: any) => f.id);
  if (folderIds.length > 0) {
    const artifactRows = await db.select({ id: schema.artifacts.id }).from(schema.artifacts).where(inArray(schema.artifacts.folderId, folderIds));
    await bulkPurgeArtifacts(db, schema, artifactRows.map((a: any) => a.id));
    await db.delete(schema.folders).where(inArray(schema.folders.id, folderIds));
  }

  const repoLinkRows = await db.select({ id: schema.repositoryLinks.id }).from(schema.repositoryLinks).where(eq(schema.repositoryLinks.projectId, projectId));
  const repoLinkIds = repoLinkRows.map((r: any) => r.id);
  if (repoLinkIds.length > 0) {
    await db.delete(schema.remotePullRequests).where(inArray(schema.remotePullRequests.repositoryLinkId, repoLinkIds));
    await db.delete(schema.repositoryLinks).where(inArray(schema.repositoryLinks.id, repoLinkIds));
  }

  const taskTypeRows = await db.select({ id: schema.taskTypes.id }).from(schema.taskTypes).where(eq(schema.taskTypes.projectId, projectId));
  await bulkPurgeTaskTypes(db, schema, taskTypeRows.map((t: any) => t.id));

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

  // Each project's own cascade (above) is now a fixed number of bulk
  // statements regardless of how many tasks/folders/task types it
  // contains, so looping per-project here no longer means looping
  // per-descendant-row - it's O(projects), not O(everything under them).
  const orgProjects = await db.select().from(schema.projects).where(eq(schema.projects.orgId, orgId));
  for (const project of orgProjects) {
    await purgeProjectCascade(db, project.id);
  }

  const agentRows = await db.select({ id: schema.agents.id }).from(schema.agents).where(eq(schema.agents.orgId, orgId));
  const agentIds = agentRows.map((a: any) => a.id);
  if (agentIds.length > 0) {
    await db.delete(schema.taskAssignments).where(inArray(schema.taskAssignments.agentId, agentIds));
    await db.delete(schema.taskNotes).where(inArray(schema.taskNotes.agentId, agentIds));
    await db.update(schema.comments).set({ agentId: null }).where(inArray(schema.comments.agentId, agentIds));
    await db.delete(schema.agents).where(inArray(schema.agents.id, agentIds));
  }

  // projectTemplates.rootTaskTypeId references taskTypes, so it must be
  // cleared before the taskTypes rows it points to are deleted below.
  await db.delete(schema.projectTemplates).where(eq(schema.projectTemplates.orgId, orgId));
  await db.delete(schema.labels).where(eq(schema.labels.orgId, orgId));

  const orgTaskTypeRows = await db.select({ id: schema.taskTypes.id }).from(schema.taskTypes).where(eq(schema.taskTypes.orgId, orgId));
  await bulkPurgeTaskTypes(db, schema, orgTaskTypeRows.map((t: any) => t.id));

  await db.delete(schema.organizationMembers).where(eq(schema.organizationMembers.orgId, orgId));
  await db.delete(schema.invitations).where(eq(schema.invitations.orgId, orgId));
  await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
}
