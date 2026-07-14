import { isNotNull, eq } from "drizzle-orm";
import * as schemaMysql from "../db/schema.mysql";
import * as schemaSqlite from "../db/schema.sqlite";
import { getProjectOrgId, getFolderOrgId } from "./authz";
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

async function getOrgRetentionDays(db: any, orgId: string): Promise<number> {
  const schema = getSchema();
  const rows = await db.select().from(schema.organizations).where(eq(schema.organizations.id, orgId)).limit(1);
  return rows[0]?.binRetentionDays ?? DEFAULT_RETENTION_DAYS;
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
  const rows = await db.select().from(table).where(eq(table.id, id)).limit(1);
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

  const deletedOrgs = await db.select().from(schema.organizations).where(isNotNull(schema.organizations.deletedAt));
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

  const deletedProjects = await db.select().from(schema.projects).where(isNotNull(schema.projects.deletedAt));
  for (const project of deletedProjects) {
    try {
      const retentionDays = await getOrgRetentionDays(db, project.orgId);
      if (isExpired(project.deletedAt, retentionDays) && await stillExpired(db, schema.projects, project.id)) {
        await purgeProjectCascade(db, project.id);
        purged.projects++;
      }
    } catch (err) {
      logger.error({ err, projectId: project.id }, "retention_sweep.project_failed");
    }
  }

  const deletedTasks = await db.select().from(schema.tasks).where(isNotNull(schema.tasks.deletedAt));
  for (const task of deletedTasks) {
    try {
      const orgId = await getProjectOrgId(db, task.projectId);
      const retentionDays = await getOrgRetentionDays(db, orgId);
      if (isExpired(task.deletedAt, retentionDays) && await stillExpired(db, schema.tasks, task.id)) {
        await purgeTaskCascade(db, task.id);
        purged.tasks++;
      }
    } catch {
      // Project (and this task with it) was already purged earlier in this sweep.
    }
  }

  const deletedFolders = await db.select().from(schema.folders).where(isNotNull(schema.folders.deletedAt));
  for (const folder of deletedFolders) {
    try {
      const orgId = await getProjectOrgId(db, folder.projectId);
      const retentionDays = await getOrgRetentionDays(db, orgId);
      if (isExpired(folder.deletedAt, retentionDays) && await stillExpired(db, schema.folders, folder.id)) {
        await purgeFolderCascade(db, folder.id);
        purged.folders++;
      }
    } catch {
      // Project already purged.
    }
  }

  const deletedArtifacts = await db.select().from(schema.artifacts).where(isNotNull(schema.artifacts.deletedAt));
  for (const artifact of deletedArtifacts) {
    try {
      const orgId = await getFolderOrgId(db, artifact.folderId);
      const retentionDays = await getOrgRetentionDays(db, orgId);
      if (isExpired(artifact.deletedAt, retentionDays) && await stillExpired(db, schema.artifacts, artifact.id)) {
        await purgeArtifactCascade(db, artifact.id);
        purged.artifacts++;
      }
    } catch {
      // Folder (or its project) already purged.
    }
  }

  const deletedAgents = await db.select().from(schema.agents).where(isNotNull(schema.agents.deletedAt));
  for (const agent of deletedAgents) {
    try {
      const retentionDays = await getOrgRetentionDays(db, agent.orgId);
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
