import { describe, it, expect } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { ConnectError, Code } from '@connectrpc/connect';
import { setupIntegrationTest, seedUser, seedOrgWithAdmin, seedProject } from '../test/setup';
import * as schema from '../db/schema.sqlite';
import { can, assertCan } from './policy';

// T04's verify criterion: "unit tests cover every resolution path" -
// ADR-0013 §3's three-step algorithm (direct, team-derived, project→org
// ancestor), plus the boundaries the ADR is explicit about (no team→org
// climbing, no cross-project/cross-org leakage, agents excluded entirely).

async function seedGrant(db: any, over: Record<string, any> = {}) {
  const row = {
    id: `grant-${crypto.randomUUID()}`,
    subjectType: 'user',
    scopeType: 'organization',
    createdAt: new Date(),
    ...over,
  };
  await db.insert(schema.grants).values(row);
  return row;
}

async function seedTeam(db: any, { teamId, orgId }: { teamId: string; orgId: string }) {
  await db.insert(schema.teams).values({ id: teamId, orgId, name: teamId, createdAt: new Date() });
}

async function addTeamMember(db: any, { teamId, userId }: { teamId: string; userId: string }) {
  await db.insert(schema.teamMembers).values({ teamId, userId, joinedAt: new Date() });
}

/** A minimal custom role, to prove can() works for roles beyond the four seeded system ones. */
async function seedCustomRole(db: any, { roleId, orgId, permissions }: { roleId: string; orgId: string; permissions: string[] }) {
  await db.insert(schema.roles).values({ id: roleId, orgId, name: roleId, isSystem: false, createdAt: new Date() });
  for (const key of permissions) {
    await db.insert(schema.rolePermissions).values({ roleId, permissionKey: key });
  }
}

describe('can() - direct grants', () => {
  it('grants permission when a direct grant at exactly this scope holds it', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedOrgWithAdmin(db, { orgId: 'org-1', userId: 'user-1' });
    await seedGrant(db, { subjectId: userId, scopeType: 'organization', scopeId: orgId, roleId: 'role-member' });

    // role-member holds task:write (M10-T03's seeding).
    expect(await can(db, { kind: 'user', userId }, { type: 'organization', id: orgId }, 'task:write')).toBe(true);
  });

  it('denies a permission the held role does not grant', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedOrgWithAdmin(db, { orgId: 'org-1', userId: 'user-1' });
    await seedGrant(db, { subjectId: userId, scopeType: 'organization', scopeId: orgId, roleId: 'role-viewer' });

    // role-viewer holds only *:read - org:owner is not among them.
    expect(await can(db, { kind: 'user', userId }, { type: 'organization', id: orgId }, 'org:owner')).toBe(false);
  });

  it('denies when the principal has no grant at all', async () => {
    const { db } = await setupIntegrationTest();
    await seedUser(db, 'user-1');
    expect(await can(db, { kind: 'user', userId: 'user-1' }, { type: 'organization', id: 'org-none' }, 'task:read')).toBe(false);
  });

  it('resolves a custom, org-scoped role composed of an arbitrary permission set', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedOrgWithAdmin(db, { orgId: 'org-1', userId: 'user-1' });
    await seedCustomRole(db, { roleId: 'role-qa-lead', orgId, permissions: ['task:write', 'artifact:read'] });
    await seedGrant(db, { subjectId: userId, scopeType: 'organization', scopeId: orgId, roleId: 'role-qa-lead' });

    expect(await can(db, { kind: 'user', userId }, { type: 'organization', id: orgId }, 'task:write')).toBe(true);
    expect(await can(db, { kind: 'user', userId }, { type: 'organization', id: orgId }, 'artifact:read')).toBe(true);
    expect(await can(db, { kind: 'user', userId }, { type: 'organization', id: orgId }, 'artifact:write')).toBe(false);
  });

  it('does not leak a grant at one organization into a permission check for a different one', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedOrgWithAdmin(db, { orgId: 'org-1', userId: 'user-1' });
    await seedGrant(db, { subjectId: userId, scopeType: 'organization', scopeId: orgId, roleId: 'role-owner' });

    expect(await can(db, { kind: 'user', userId }, { type: 'organization', id: 'org-2' }, 'task:read')).toBe(false);
  });
});

describe('can() - team-derived grants', () => {
  it('grants permission via a role held by a team the principal belongs to', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedOrgWithAdmin(db, { orgId: 'org-1', userId: 'user-1' });
    await seedTeam(db, { teamId: 'team-1', orgId });
    await addTeamMember(db, { teamId: 'team-1', userId });
    await seedGrant(db, { subjectType: 'team', subjectId: 'team-1', scopeType: 'organization', scopeId: orgId, roleId: 'role-member' });

    expect(await can(db, { kind: 'user', userId }, { type: 'organization', id: orgId }, 'task:write')).toBe(true);
  });

  it('denies a team grant to someone who is not a member of that team', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId } = await seedOrgWithAdmin(db, { orgId: 'org-1', userId: 'user-1' });
    await seedUser(db, 'user-2');
    await seedTeam(db, { teamId: 'team-1', orgId });
    await addTeamMember(db, { teamId: 'team-1', userId: 'user-1' });
    await seedGrant(db, { subjectType: 'team', subjectId: 'team-1', scopeType: 'organization', scopeId: orgId, roleId: 'role-owner' });

    // user-2 is not in team-1, so team-1's grant does not apply to them.
    expect(await can(db, { kind: 'user', userId: 'user-2' }, { type: 'organization', id: orgId }, 'task:read')).toBe(false);
  });

  it('removing someone from a team removes the derived access (no membership row, no grant)', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedOrgWithAdmin(db, { orgId: 'org-1', userId: 'user-1' });
    await seedTeam(db, { teamId: 'team-1', orgId });
    await addTeamMember(db, { teamId: 'team-1', userId });
    await seedGrant(db, { subjectType: 'team', subjectId: 'team-1', scopeType: 'organization', scopeId: orgId, roleId: 'role-member' });
    expect(await can(db, { kind: 'user', userId }, { type: 'organization', id: orgId }, 'task:write')).toBe(true);

    await db.delete(schema.teamMembers).where(
      and(eq(schema.teamMembers.teamId, 'team-1'), eq(schema.teamMembers.userId, userId)),
    );
    expect(await can(db, { kind: 'user', userId }, { type: 'organization', id: orgId }, 'task:write')).toBe(false);
  });

  it('combines a direct grant and a team-derived grant - either alone is sufficient', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedOrgWithAdmin(db, { orgId: 'org-1', userId: 'user-1' });
    await seedTeam(db, { teamId: 'team-1', orgId });
    await addTeamMember(db, { teamId: 'team-1', userId });
    // Direct grant only holds reads; the team grant is what supplies task:write.
    await seedGrant(db, { subjectId: userId, scopeType: 'organization', scopeId: orgId, roleId: 'role-viewer' });
    await seedGrant(db, { subjectType: 'team', subjectId: 'team-1', scopeType: 'organization', scopeId: orgId, roleId: 'role-member' });

    expect(await can(db, { kind: 'user', userId }, { type: 'organization', id: orgId }, 'task:read')).toBe(true);
    expect(await can(db, { kind: 'user', userId }, { type: 'organization', id: orgId }, 'task:write')).toBe(true);
  });
});

describe('can() - project scope climbs to its owning organization', () => {
  it("an organization-scope grant reaches every project under it - today's preserved behavior", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedOrgWithAdmin(db, { orgId: 'org-1', userId: 'user-1' });
    const { projectId } = await seedProject(db, { orgId, userId, templateId: 'tmpl-1', projectId: 'proj-1' });
    await seedGrant(db, { subjectId: userId, scopeType: 'organization', scopeId: orgId, roleId: 'role-member' });

    expect(await can(db, { kind: 'user', userId }, { type: 'project', id: projectId }, 'task:write')).toBe(true);
  });

  it('a project-scope grant works directly, with no organization-scope grant needed', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedOrgWithAdmin(db, { orgId: 'org-1', userId: 'user-1' });
    await seedUser(db, 'user-2');
    const { projectId } = await seedProject(db, { orgId, userId, templateId: 'tmpl-1', projectId: 'proj-1' });
    await seedGrant(db, { subjectId: 'user-2', scopeType: 'project', scopeId: projectId, roleId: 'role-member' });

    expect(await can(db, { kind: 'user', userId: 'user-2' }, { type: 'project', id: projectId }, 'task:write')).toBe(true);
  });

  it('a grant at one project does not leak to a sibling project under the same org (exit criterion 6)', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedOrgWithAdmin(db, { orgId: 'org-1', userId: 'user-1' });
    await seedUser(db, 'user-2');
    // seedProject leaves `key` at its schema default (""), and projects.key
    // is unique per org - inserted directly here, with distinct keys, rather
    // than via seedProject twice in the same org.
    const { projectId: projectA } = await seedProject(db, { orgId, userId, templateId: 'tmpl-1', projectId: 'proj-a' });
    const projectB = 'proj-b';
    await db.insert(schema.projectTemplates).values({ id: 'tmpl-2', orgId, name: 'Template 2', createdAt: new Date() });
    await db.insert(schema.projects).values({
      id: projectB, orgId, templateId: 'tmpl-2', ownerId: userId, name: 'Project B', key: 'B', createdAt: new Date(),
    });
    await seedGrant(db, { subjectId: 'user-2', scopeType: 'project', scopeId: projectA, roleId: 'role-admin' });

    expect(await can(db, { kind: 'user', userId: 'user-2' }, { type: 'project', id: projectA }, 'task:admin')).toBe(true);
    expect(await can(db, { kind: 'user', userId: 'user-2' }, { type: 'project', id: projectB }, 'task:admin')).toBe(false);
  });

  it('a project-scope grant does not, in reverse, satisfy an organization-scope check', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedOrgWithAdmin(db, { orgId: 'org-1', userId: 'user-1' });
    await seedUser(db, 'user-2');
    const { projectId } = await seedProject(db, { orgId, userId, templateId: 'tmpl-1', projectId: 'proj-1' });
    await seedGrant(db, { subjectId: 'user-2', scopeType: 'project', scopeId: projectId, roleId: 'role-owner' });

    expect(await can(db, { kind: 'user', userId: 'user-2' }, { type: 'organization', id: orgId }, 'org:read')).toBe(false);
  });
});

describe('can() - team scope does not climb to its owning organization (deliberate, see policy.ts)', () => {
  it('an organization-scope grant does not, by itself, satisfy a team-scope check', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedOrgWithAdmin(db, { orgId: 'org-1', userId: 'user-1' });
    await seedTeam(db, { teamId: 'team-1', orgId });
    await seedGrant(db, { subjectId: userId, scopeType: 'organization', scopeId: orgId, roleId: 'role-owner' });

    expect(await can(db, { kind: 'user', userId }, { type: 'team', id: 'team-1' }, 'team:admin')).toBe(false);
  });

  it('a direct team-scope grant works on its own', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedOrgWithAdmin(db, { orgId: 'org-1', userId: 'user-1' });
    await seedTeam(db, { teamId: 'team-1', orgId });
    await seedGrant(db, { subjectId: userId, scopeType: 'team', scopeId: 'team-1', roleId: 'role-admin' });

    expect(await can(db, { kind: 'user', userId }, { type: 'team', id: 'team-1' }, 'team:admin')).toBe(true);
  });
});

describe('can() - agent principals', () => {
  it('always resolves false - can() governs the human path only (ADR-0013 Option 4)', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId } = await seedOrgWithAdmin(db, { orgId: 'org-1', userId: 'user-1' });
    // Even with a grant that would satisfy a matching user principal.
    await seedGrant(db, { subjectId: 'agent-1', scopeType: 'organization', scopeId: orgId, roleId: 'role-owner' });

    const agent = { kind: 'agent' as const, agentId: 'agent-1', orgId, tokenId: 'tok-1', scopes: ['tasks:read'] };
    expect(await can(db, agent, { type: 'organization', id: orgId }, 'task:read')).toBe(false);
  });
});

describe('assertCan()', () => {
  it('resolves without throwing when can() is true', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedOrgWithAdmin(db, { orgId: 'org-1', userId: 'user-1' });
    await seedGrant(db, { subjectId: userId, scopeType: 'organization', scopeId: orgId, roleId: 'role-owner' });

    await expect(assertCan(db, { kind: 'user', userId }, { type: 'organization', id: orgId }, 'org:owner')).resolves.toBeUndefined();
  });

  it('throws PermissionDenied naming the missing permission when can() is false', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedOrgWithAdmin(db, { orgId: 'org-1', userId: 'user-1' });
    await seedGrant(db, { subjectId: userId, scopeType: 'organization', scopeId: orgId, roleId: 'role-viewer' });

    try {
      await assertCan(db, { kind: 'user', userId }, { type: 'organization', id: orgId }, 'org:owner');
      expect.unreachable('assertCan should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ConnectError);
      expect((err as ConnectError).code).toBe(Code.PermissionDenied);
      expect((err as ConnectError).message).toContain('org:owner');
    }
  });
});
