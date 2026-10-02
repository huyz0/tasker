import { and, isNotNull, isNull, eq } from "drizzle-orm";
import * as schemaMysql from "../db/schema.mysql";
import * as schemaSqlite from "../db/schema.sqlite";
import {
  purgeTaskCascade,
  purgeArtifactCascade,
  purgeFolderCascade,
  purgeAgentCascade,
  purgeProjectCascade,
  purgeOrgCascade,
} from "./cascadePurge";
import { logger } from "./logger";

function getSchema() {
  return process.env.STANDALONE === "true" ? schemaSqlite : schemaMysql;
}

export const DEFAULT_RETENTION_DAYS = 30;

function toTimestamp(value: Date | string | number): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function isExpired(deletedAt: Date | string | null, retentionDays: number): boolean {
  if (!deletedAt) return false;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  return toTimestamp(deletedAt) <= cutoff;
}

/**
 * Lookups one sweep repeats for every archived row, memoized for the length
 * of that sweep (M30-T07): a project's org and an org's retention period do
 * not change between two rows of the same hourly run, and resolving them per
 * row was two to three queries each. Every read projects only the columns it
 * needs - `SELECT *` on `artifacts` held each binned file's content in memory.
 */
function sweepLookups(db: any) {
  const schema = getSchema();
  const retentionByOrg = new Map<string, number>();
  const orgByLiveProject = new Map<string, string | null>();
  const projectByFolder = new Map<string, string | null>();

  async function retentionDays(orgId: string): Promise<number> {
    const cached = retentionByOrg.get(orgId);
    if (cached !== undefined) return cached;
    const rows = await db.select({ days: schema.organizations.binRetentionDays })
      .from(schema.organizations).where(eq(schema.organizations.id, orgId)).limit(1);
    const days = rows[0]?.days ?? DEFAULT_RETENTION_DAYS;
    retentionByOrg.set(orgId, days);
    return days;
  }

  /** Null when the project is gone or itself archived - its own cascade owns its contents. */
  async function orgOfLiveProject(projectId: string): Promise<string | null> {
    if (orgByLiveProject.has(projectId)) return orgByLiveProject.get(projectId)!;
    const rows = await db.select({ orgId: schema.projects.orgId }).from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), isNull(schema.projects.deletedAt))).limit(1);
    const orgId = rows[0]?.orgId ?? null;
    orgByLiveProject.set(projectId, orgId);
    return orgId;
  }

  async function orgOfFolder(folderId: string): Promise<string | null> {
    if (!projectByFolder.has(folderId)) {
      const rows = await db.select({ projectId: schema.folders.projectId }).from(schema.folders)
        .where(eq(schema.folders.id, folderId)).limit(1);
      projectByFolder.set(folderId, rows[0]?.projectId ?? null);
    }
    const projectId = projectByFolder.get(folderId);
    return projectId ? orgOfLiveProject(projectId) : null;
  }

  return { retentionDays, orgOfLiveProject, orgOfFolder };
}

/**
 * Re-checks that a row the sweep found expired earlier is still archived
 * right before it's actually purged. The sweep fetches every expired row
 * up front, then purges them one at a time with awaits in between - if a
 * user restores that specific row during that window, this closes the race
 * that would otherwise permanently destroy something they just un-archived.
 * purge*Cascade's own existence check isn't enough, since a restored row
 * still exists (only its deletedAt is cleared).
 */
export async function stillExpired(db: any, table: any, id: string): Promise<boolean> {
  const rows = await db.select({ deletedAt: table.deletedAt }).from(table).where(eq(table.id, id)).limit(1);
  return !!rows[0]?.deletedAt;
}

/**
 * Sweeps every archived row across all entities and permanently purges anything
 * whose owning org's retention period has elapsed since it was archived. Runs
 * top-down (orgs, then projects, then their contents) so that once a parent is
 * purged its descendants are already gone; each remaining entity type re-checks
 * whether its row still exists before resolving org context, since an earlier
 * step in the same sweep may have already cascaded it away.
 */
export async function runRetentionSweep(db: any): Promise<Record<string, number>> {
  const schema = getSchema();
  const purged = { organizations: 0, projects: 0, tasks: 0, artifacts: 0, folders: 0, agents: 0 };
  const lookups = sweepLookups(db);

  const deletedOrgs = await db
    .select({ id: schema.organizations.id, deletedAt: schema.organizations.deletedAt, binRetentionDays: schema.organizations.binRetentionDays })
    .from(schema.organizations).where(isNotNull(schema.organizations.deletedAt));
  for (const org of deletedOrgs) {
    try {
      if (isExpired(org.deletedAt, org.binRetentionDays ?? DEFAULT_RETENTION_DAYS) && await stillExpired(db, schema.organizations, org.id)) {
        await purgeOrgCascade(db, org.id);
        purged.organizations++;
      }
    } catch (err) {
      // One org's cascade failing (e.g. an unexpected FK conflict) must not
      // abort the whole sweep - every sibling loop below already isolates
      // its own per-row failures the same way.
      logger.error({ err, orgId: org.id }, "retention_sweep.org_failed");
    }
  }

  const deletedProjects = await db
    .select({ id: schema.projects.id, orgId: schema.projects.orgId, deletedAt: schema.projects.deletedAt })
    .from(schema.projects).where(isNotNull(schema.projects.deletedAt));
  for (const project of deletedProjects) {
    try {
      const retentionDays = await lookups.retentionDays(project.orgId);
      if (isExpired(project.deletedAt, retentionDays) && await stillExpired(db, schema.projects, project.id)) {
        await purgeProjectCascade(db, project.id);
        purged.projects++;
      }
    } catch (err) {
      logger.error({ err, projectId: project.id }, "retention_sweep.project_failed");
    }
  }

  const deletedTasks = await db
    .select({ id: schema.tasks.id, projectId: schema.tasks.projectId, deletedAt: schema.tasks.deletedAt })
    .from(schema.tasks).where(isNotNull(schema.tasks.deletedAt));
  for (const task of deletedTasks) {
    try {
      // No live project: it was purged earlier in this sweep, or it is
      // archived itself and its own cascade owns this task.
      const orgId = await lookups.orgOfLiveProject(task.projectId);
      if (!orgId) continue;
      if (isExpired(task.deletedAt, await lookups.retentionDays(orgId)) && await stillExpired(db, schema.tasks, task.id)) {
        await purgeTaskCascade(db, task.id);
        purged.tasks++;
      }
    } catch (err) {
      logger.error({ err, taskId: task.id }, "retention_sweep.task_failed");
    }
  }

  const deletedFolders = await db
    .select({ id: schema.folders.id, projectId: schema.folders.projectId, deletedAt: schema.folders.deletedAt })
    .from(schema.folders).where(isNotNull(schema.folders.deletedAt));
  for (const folder of deletedFolders) {
    try {
      const orgId = await lookups.orgOfLiveProject(folder.projectId);
      if (!orgId) continue;
      if (isExpired(folder.deletedAt, await lookups.retentionDays(orgId)) && await stillExpired(db, schema.folders, folder.id)) {
        await purgeFolderCascade(db, folder.id);
        purged.folders++;
      }
    } catch (err) {
      logger.error({ err, folderId: folder.id }, "retention_sweep.folder_failed");
    }
  }

  const deletedArtifacts = await db
    .select({ id: schema.artifacts.id, folderId: schema.artifacts.folderId, deletedAt: schema.artifacts.deletedAt })
    .from(schema.artifacts).where(isNotNull(schema.artifacts.deletedAt));
  for (const artifact of deletedArtifacts) {
    try {
      // A folder purged above takes its artifacts with it; the existence
      // re-check below is what notices.
      const orgId = await lookups.orgOfFolder(artifact.folderId);
      if (!orgId) continue;
      if (isExpired(artifact.deletedAt, await lookups.retentionDays(orgId)) && await stillExpired(db, schema.artifacts, artifact.id)) {
        await purgeArtifactCascade(db, artifact.id);
        purged.artifacts++;
      }
    } catch (err) {
      logger.error({ err, artifactId: artifact.id }, "retention_sweep.artifact_failed");
    }
  }

  const deletedAgents = await db
    .select({ id: schema.agents.id, orgId: schema.agents.orgId, deletedAt: schema.agents.deletedAt })
    .from(schema.agents).where(isNotNull(schema.agents.deletedAt));
  for (const agent of deletedAgents) {
    try {
      const retentionDays = await lookups.retentionDays(agent.orgId);
      if (isExpired(agent.deletedAt, retentionDays) && await stillExpired(db, schema.agents, agent.id)) {
        await purgeAgentCascade(db, agent.id);
        purged.agents++;
      }
    } catch (err) {
      logger.error({ err, agentId: agent.id }, "retention_sweep.agent_failed");
    }
  }

  const totalPurged = Object.values(purged).reduce((a, b) => a + b, 0);
  if (totalPurged > 0) {
    logger.info({ purged }, "retention_sweep.completed");
  }

  return purged;
}
