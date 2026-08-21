import { describe, it, expect } from 'bun:test';
import { eq } from 'drizzle-orm';
import { setupIntegrationTest, seedUser } from '../test/setup';
import * as schema from '../db/schema.sqlite';
import { isFirstUser, createStarterWorkspace, maybeCreateStarterWorkspace } from './firstRun';

describe('isFirstUser', () => {
  it('is true for the only account in the database', async () => {
    const { db } = await setupIntegrationTest();
    await seedUser(db, 'usr-1');
    expect(await isFirstUser(db, 'usr-1')).toBe(true);
  });

  it('is false once a second account exists', async () => {
    const { db } = await setupIntegrationTest();
    await seedUser(db, 'usr-1');
    await seedUser(db, 'usr-2');
    expect(await isFirstUser(db, 'usr-2')).toBe(false);
  });
});

describe('createStarterWorkspace', () => {
  it('gives the first account somewhere to be', async () => {
    const { db } = await setupIntegrationTest();
    await seedUser(db, 'usr-1');

    const { orgId, projectId } = await createStarterWorkspace(db, 'usr-1');

    const orgs = await db.select().from(schema.organizations).where(eq(schema.organizations.id, orgId));
    const projects = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
    expect(orgs).toHaveLength(1);
    expect(projects).toHaveLength(1);
    expect(projects[0].orgId).toBe(orgId);
  });

  it('makes them the owner, not merely an admin', async () => {
    // An instance whose only account cannot transfer or delete its own
    // organization is stuck.
    const { db } = await setupIntegrationTest();
    await seedUser(db, 'usr-1');

    const { orgId } = await createStarterWorkspace(db, 'usr-1');
    const members = await db
      .select()
      .from(schema.organizationMembers)
      .where(eq(schema.organizationMembers.orgId, orgId));

    expect(members[0].role).toBe('owner');
  });

  it('creates the template the project needs, rather than a dangling reference', async () => {
    const { db } = await setupIntegrationTest();
    await seedUser(db, 'usr-1');

    const { projectId } = await createStarterWorkspace(db, 'usr-1');
    const project = (await db.select().from(schema.projects).where(eq(schema.projects.id, projectId)))[0];
    const templates = await db
      .select()
      .from(schema.projectTemplates)
      .where(eq(schema.projectTemplates.id, project.templateId));

    expect(templates).toHaveLength(1);
  });

  it('gives each workspace its own ids, so two instances never collide', async () => {
    const { db } = await setupIntegrationTest();
    await seedUser(db, 'usr-1');
    await seedUser(db, 'usr-2');

    const a = await createStarterWorkspace(db, 'usr-1');
    const b = await createStarterWorkspace(db, 'usr-2');
    expect(a.orgId).not.toBe(b.orgId);
  });
});

describe('maybeCreateStarterWorkspace', () => {
  it('does nothing at all when the flag is off', async () => {
    // The default. Registration behaves exactly as it did before this existed.
    const { db } = await setupIntegrationTest();
    await seedUser(db, 'usr-1');

    expect(await maybeCreateStarterWorkspace(db, 'usr-1', false)).toBeNull();
    expect(await db.select().from(schema.organizations)).toHaveLength(0);
  });

  it('runs for the first account', async () => {
    const { db } = await setupIntegrationTest();
    await seedUser(db, 'usr-1');

    const workspace = await maybeCreateStarterWorkspace(db, 'usr-1', true);
    expect(workspace).not.toBeNull();
  });

  it('does not run for the second account', async () => {
    // An organization appearing under everyone who registers is a surprise at
    // best, and a way to accumulate empty tenants at worst.
    const { db } = await setupIntegrationTest();
    await seedUser(db, 'usr-1');
    await seedUser(db, 'usr-2');

    expect(await maybeCreateStarterWorkspace(db, 'usr-2', true)).toBeNull();
  });

  it('never fails a registration because seeding tripped', async () => {
    // The account is what the person asked for; the starter project is a
    // convenience. A failure here is a log line and an empty workspace, not a
    // failed sign-up with a half-created account behind it.
    const brokenDb = {
      select: () => ({ from: () => ({ limit: () => Promise.resolve([{ id: 'usr-1' }]) }) }),
      insert: () => {
        throw new Error('disk full');
      },
    };

    expect(await maybeCreateStarterWorkspace(brokenDb, 'usr-1', true)).toBeNull();
  });
});
