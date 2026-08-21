import { eq } from 'drizzle-orm';
import * as schemaSqlite from '../db/schema.sqlite';
import { logger } from './logger';

/**
 * The starter workspace a fresh binary can hand its first user (M09-T06).
 *
 * Someone who downloads one file, runs it and registers an account currently
 * arrives at an application with no organization, no project and no way to
 * tell whether it is working. `--seed` gives that first account somewhere to
 * be — one organization they own, one project inside it.
 *
 * Deliberately *only* the first account, and only when asked for. An
 * organization appearing under the second person to register would be a
 * surprise at best, and on a multi-user instance a way to accumulate empty
 * tenants.
 *
 * SQLite-only by construction: this exists for the standalone binary, and a
 * clustered MySQL deployment provisions its organizations deliberately.
 */

export interface StarterWorkspace {
  orgId: string;
  projectId: string;
}

/** Whether this user is the only one in the database. */
export async function isFirstUser(db: any, userId: string): Promise<boolean> {
  const users = await db.select({ id: schemaSqlite.users.id }).from(schemaSqlite.users).limit(2);
  return users.length === 1 && users[0]?.id === userId;
}

/**
 * Creates the organization, template and project, with the user as owner.
 *
 * Named for what it is rather than "seed": `scripts/seed.ts` generates
 * fifty-thousand-row dev fixtures and is a different thing entirely, aimed at
 * a different person. Shipping that machinery to someone who downloaded a
 * binary would be a strange first impression.
 */
export async function createStarterWorkspace(
  db: any,
  userId: string,
  now: Date = new Date(),
): Promise<StarterWorkspace> {
  const orgId = `org-${crypto.randomUUID()}`;
  const templateId = `tpl-${crypto.randomUUID()}`;
  const projectId = `p-${crypto.randomUUID()}`;

  await db.insert(schemaSqlite.organizations).values({
    id: orgId,
    name: 'My Organization',
    slug: `org-${orgId.slice(4, 12)}`,
    createdAt: now,
  });
  // owner, not admin: this person is the only one here, and an instance whose
  // sole account cannot transfer or delete its own organization is stuck.
  await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId, role: 'owner', joinedAt: now });
  await db.insert(schemaSqlite.projectTemplates).values({
    id: templateId,
    orgId,
    name: 'Default',
    description: 'Created on first run',
    createdAt: now,
  });
  await db.insert(schemaSqlite.projects).values({
    id: projectId,
    orgId,
    templateId,
    ownerId: userId,
    name: 'My First Project',
    key: 'FIRST',
    createdAt: now,
  });

  return { orgId, projectId };
}

/**
 * Runs the bootstrap if this is the moment for it, and never fails a
 * registration because of it.
 *
 * A starter project is a convenience; the account is the thing the person
 * asked for. If seeding trips over something, they get an empty workspace and
 * a log line, not a failed sign-up with a half-created account behind it.
 */
export async function maybeCreateStarterWorkspace(
  db: any,
  userId: string,
  enabled: boolean,
): Promise<StarterWorkspace | null> {
  if (!enabled) return null;
  try {
    if (!(await isFirstUser(db, userId))) return null;
    const workspace = await createStarterWorkspace(db, userId);
    logger.info({ userId, ...workspace }, 'firstrun.starter_workspace_created');
    return workspace;
  } catch (err) {
    logger.error({ err, userId }, 'firstrun.starter_workspace_failed');
    return null;
  }
}
