import { describe, it, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { ConnectError, Code } from '@connectrpc/connect';
import { setupIntegrationTest, seedUser, seedOrgWithAdmin, seedProject } from '../test/setup';
import * as schema from '../db/schema.sqlite';
import { can, assertCan, type Scope } from './policy';
import { runWithRequestContext } from './requestContext';

/** Counts every `db.select(...)` call made inside `fn`, without changing behavior. */
async function countSelects<T>(db: any, fn: (countingDb: any) => Promise<T>): Promise<{ result: T; selects: number }> {
  let selects = 0;
  const countingDb = new Proxy(db, { get(t, p) { if (p === 'select') selects++; return (t as any)[p]; } });
  const result = await fn(countingDb);
  return { result, selects };
}

// T04/T05's verify criterion: "unit tests cover every resolution path" -
// ADR-0013 §3's algorithm (direct grant, team-derived grant, project→org
// ancestor), plus the `organization_members` fallback `can()` gained during
// T05 (see policy.ts's doc comment), plus the boundaries the ADR is explicit
// about (no team→org climbing, no cross-project/cross-org leakage, agents
// excluded entirely).
//
// `seedOrgWithAdmin` (the shared fixture almost every other handler test
// uses) makes its user an `organization_members` **admin** - which, since
// T05, `can()` honors on its own via the fallback. Using it for a test that
// means to isolate a *specific* grant would let that implicit admin
// membership satisfy the assertion instead of the thing under test.
// `seedBareOrgAndUser` below seeds the org and user with no membership row
// at all, for every test that needs true grants-only isolation;
// `seedOrgWithAdmin` is reserved for the fallback's own tests, where that
// membership row is exactly what's being exercised.

async function seedBareOrgAndUser(db: any, { orgId, userId }: { orgId: string; userId: string }) {
  await db.insert(schema.organizations).values({ id: orgId, name: orgId, slug: orgId, createdAt: new Date() });
  await seedUser(db, userId);
  return { orgId, userId };
}

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
    const { orgId, userId } = await seedBareOrgAndUser(db, { orgId: 'org-1', userId: 'user-1' });
    await seedGrant(db, { subjectId: userId, scopeType: 'organization', scopeId: orgId, roleId: 'role-member' });

    // role-member holds task:write (M10-T03's seeding).
    expect(await can(db, { kind: 'user', userId }, { type: 'organization', id: orgId }, 'task:write')).toBe(true);
  });

  it('denies a permission the held role does not grant', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedBareOrgAndUser(db, { orgId: 'org-1', userId: 'user-1' });
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
    const { orgId, userId } = await seedBareOrgAndUser(db, { orgId: 'org-1', userId: 'user-1' });
    await seedCustomRole(db, { roleId: 'role-qa-lead', orgId, permissions: ['task:write', 'artifact:read'] });
    await seedGrant(db, { subjectId: userId, scopeType: 'organization', scopeId: orgId, roleId: 'role-qa-lead' });

    expect(await can(db, { kind: 'user', userId }, { type: 'organization', id: orgId }, 'task:write')).toBe(true);
    expect(await can(db, { kind: 'user', userId }, { type: 'organization', id: orgId }, 'artifact:read')).toBe(true);
    expect(await can(db, { kind: 'user', userId }, { type: 'organization', id: orgId }, 'artifact:write')).toBe(false);
  });

  it('does not leak a grant at one organization into a permission check for a different one', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedBareOrgAndUser(db, { orgId: 'org-1', userId: 'user-1' });
    await seedGrant(db, { subjectId: userId, scopeType: 'organization', scopeId: orgId, roleId: 'role-owner' });

    expect(await can(db, { kind: 'user', userId }, { type: 'organization', id: 'org-2' }, 'task:read')).toBe(false);
  });
});

describe('can() - organization_members as a live grant source (T05)', () => {
  it("grants an organization_members role's permissions with no grants row at all", async () => {
    const { db } = await setupIntegrationTest();
    // seedOrgWithAdmin's whole point here: an org_members "admin" row and
    // nothing in `grants`.
    const { orgId, userId } = await seedOrgWithAdmin(db, { orgId: 'org-1', userId: 'user-1' });

    expect(await can(db, { kind: 'user', userId }, { type: 'organization', id: orgId }, 'org:admin')).toBe(true);
    // admin does not hold org:owner - proves the fallback resolves the
    // *specific* role's permissions, not membership-implies-everything.
    expect(await can(db, { kind: 'user', userId }, { type: 'organization', id: orgId }, 'org:owner')).toBe(false);
  });

  it('removing the organization_members row removes the derived access, with no grants row to also clean up', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedOrgWithAdmin(db, { orgId: 'org-1', userId: 'user-1' });
    expect(await can(db, { kind: 'user', userId }, { type: 'organization', id: orgId }, 'org:admin')).toBe(true);

    await db.delete(schema.organizationMembers).where(
      and(eq(schema.organizationMembers.orgId, orgId), eq(schema.organizationMembers.userId, userId)),
    );
    expect(await can(db, { kind: 'user', userId }, { type: 'organization', id: orgId }, 'org:admin')).toBe(false);
  });

  it('an organization_members row and a real grants row both contribute - either alone is sufficient', async () => {
    const { db } = await setupIntegrationTest();
    // seedOrgWithAdmin's org_members role is "admin", which does not hold
    // org:owner; a real grants row supplies the one permission it lacks.
    const { orgId, userId } = await seedOrgWithAdmin(db, { orgId: 'org-1', userId: 'user-1' });
    await seedGrant(db, { subjectId: userId, scopeType: 'organization', scopeId: orgId, roleId: 'role-owner' });

    expect(await can(db, { kind: 'user', userId }, { type: 'organization', id: orgId }, 'org:admin')).toBe(true);
    expect(await can(db, { kind: 'user', userId }, { type: 'organization', id: orgId }, 'org:owner')).toBe(true);
  });

  it("does not leak an organization_members role at one organization into a check for another", async () => {
    const { db } = await setupIntegrationTest();
    const { userId } = await seedOrgWithAdmin(db, { orgId: 'org-1', userId: 'user-1' });
    await db.insert(schema.organizations).values({ id: 'org-2', name: 'org-2', slug: 'org-2', createdAt: new Date() });

    expect(await can(db, { kind: 'user', userId }, { type: 'organization', id: 'org-2' }, 'org:read')).toBe(false);
  });

  it("reaches a project through its owning organization the same way a grants row does", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedOrgWithAdmin(db, { orgId: 'org-1', userId: 'user-1' });
    const { projectId } = await seedProject(db, { orgId, userId, templateId: 'tmpl-1', projectId: 'proj-1' });

    expect(await can(db, { kind: 'user', userId }, { type: 'project', id: projectId }, 'task:write')).toBe(true);
  });
});

describe('can() - team-derived grants', () => {
  it('grants permission via a role held by a team the principal belongs to', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedBareOrgAndUser(db, { orgId: 'org-1', userId: 'user-1' });
    await seedTeam(db, { teamId: 'team-1', orgId });
    await addTeamMember(db, { teamId: 'team-1', userId });
    await seedGrant(db, { subjectType: 'team', subjectId: 'team-1', scopeType: 'organization', scopeId: orgId, roleId: 'role-member' });

    expect(await can(db, { kind: 'user', userId }, { type: 'organization', id: orgId }, 'task:write')).toBe(true);
  });

  it('denies a team grant to someone who is not a member of that team', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId } = await seedBareOrgAndUser(db, { orgId: 'org-1', userId: 'user-1' });
    await seedUser(db, 'user-2');
    await seedTeam(db, { teamId: 'team-1', orgId });
    await addTeamMember(db, { teamId: 'team-1', userId: 'user-1' });
    await seedGrant(db, { subjectType: 'team', subjectId: 'team-1', scopeType: 'organization', scopeId: orgId, roleId: 'role-owner' });

    // user-2 is not in team-1, so team-1's grant does not apply to them.
    expect(await can(db, { kind: 'user', userId: 'user-2' }, { type: 'organization', id: orgId }, 'task:read')).toBe(false);
  });

  it('removing someone from a team removes the derived access (no membership row, no grant)', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedBareOrgAndUser(db, { orgId: 'org-1', userId: 'user-1' });
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
    const { orgId, userId } = await seedBareOrgAndUser(db, { orgId: 'org-1', userId: 'user-1' });
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
    const { orgId, userId } = await seedBareOrgAndUser(db, { orgId: 'org-1', userId: 'user-1' });
    const { projectId } = await seedProject(db, { orgId, userId, templateId: 'tmpl-1', projectId: 'proj-1' });
    await seedGrant(db, { subjectId: userId, scopeType: 'organization', scopeId: orgId, roleId: 'role-member' });

    expect(await can(db, { kind: 'user', userId }, { type: 'project', id: projectId }, 'task:write')).toBe(true);
  });

  it('a project-scope grant works directly, with no organization-scope grant needed', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedBareOrgAndUser(db, { orgId: 'org-1', userId: 'user-1' });
    await seedUser(db, 'user-2');
    const { projectId } = await seedProject(db, { orgId, userId, templateId: 'tmpl-1', projectId: 'proj-1' });
    await seedGrant(db, { subjectId: 'user-2', scopeType: 'project', scopeId: projectId, roleId: 'role-member' });

    expect(await can(db, { kind: 'user', userId: 'user-2' }, { type: 'project', id: projectId }, 'task:write')).toBe(true);
  });

  it('a grant at one project does not leak to a sibling project under the same org (exit criterion 6)', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedBareOrgAndUser(db, { orgId: 'org-1', userId: 'user-1' });
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
    const { orgId, userId } = await seedBareOrgAndUser(db, { orgId: 'org-1', userId: 'user-1' });
    await seedUser(db, 'user-2');
    const { projectId } = await seedProject(db, { orgId, userId, templateId: 'tmpl-1', projectId: 'proj-1' });
    await seedGrant(db, { subjectId: 'user-2', scopeType: 'project', scopeId: projectId, roleId: 'role-owner' });

    expect(await can(db, { kind: 'user', userId: 'user-2' }, { type: 'organization', id: orgId }, 'org:read')).toBe(false);
  });
});

describe('can() - team scope does not climb to its owning organization (deliberate, see policy.ts)', () => {
  it('an organization-scope grant does not, by itself, satisfy a team-scope check', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedBareOrgAndUser(db, { orgId: 'org-1', userId: 'user-1' });
    await seedTeam(db, { teamId: 'team-1', orgId });
    await seedGrant(db, { subjectId: userId, scopeType: 'organization', scopeId: orgId, roleId: 'role-owner' });

    expect(await can(db, { kind: 'user', userId }, { type: 'team', id: 'team-1' }, 'team:admin')).toBe(false);
  });

  it('an organization_members role does not, by itself, satisfy a team-scope check either', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedOrgWithAdmin(db, { orgId: 'org-1', userId: 'user-1' });
    await seedTeam(db, { teamId: 'team-1', orgId });

    expect(await can(db, { kind: 'user', userId }, { type: 'team', id: 'team-1' }, 'team:admin')).toBe(false);
  });

  it('a direct team-scope grant works on its own', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedBareOrgAndUser(db, { orgId: 'org-1', userId: 'user-1' });
    await seedTeam(db, { teamId: 'team-1', orgId });
    await seedGrant(db, { subjectId: userId, scopeType: 'team', scopeId: 'team-1', roleId: 'role-admin' });

    expect(await can(db, { kind: 'user', userId }, { type: 'team', id: 'team-1' }, 'team:admin')).toBe(true);
  });
});

describe('can() - agent principals', () => {
  it('always resolves false - can() governs the human path only (ADR-0013 Option 4)', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId } = await seedBareOrgAndUser(db, { orgId: 'org-1', userId: 'user-1' });
    // Even with a grant that would satisfy a matching user principal.
    await seedGrant(db, { subjectId: 'agent-1', scopeType: 'organization', scopeId: orgId, roleId: 'role-owner' });

    const agent = { kind: 'agent' as const, agentId: 'agent-1', orgId, tokenId: 'tok-1', scopes: ['tasks:read'] };
    expect(await can(db, agent, { type: 'organization', id: orgId }, 'task:read')).toBe(false);
  });
});

describe('assertCan()', () => {
  it('resolves without throwing when can() is true', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedBareOrgAndUser(db, { orgId: 'org-1', userId: 'user-1' });
    await seedGrant(db, { subjectId: userId, scopeType: 'organization', scopeId: orgId, roleId: 'role-owner' });

    await expect(assertCan(db, { kind: 'user', userId }, { type: 'organization', id: orgId }, 'org:owner')).resolves.toBeUndefined();
  });

  it('throws PermissionDenied naming the missing permission when can() is false', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedBareOrgAndUser(db, { orgId: 'org-1', userId: 'user-1' });
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

// M10-T06. None of today's handlers call can()/assertCan() more than once
// per request for the same principal (see MILESTONE-10's PROGRESS.md T06
// entry) - every RPC authorizes once, at the top, before doing any work -
// so the cache's benefit is invisible in any of the tests above, all of
// which call can() exactly once. These tests construct the multi-check
// scenario directly, wrapped in the same runWithRequestContext(...) the
// request-logging interceptor uses in production, to verify the caching
// mechanism itself: what a genuinely authorization-heavy RPC (e.g. a
// permission-matrix view checking many roles, or a bulk operation checking
// many rows) will actually get from it.
describe('can() - per-request caching (T06)', () => {
  it('reuses team memberships, grants, and a role\'s permission set across two calls for the same principal', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedBareOrgAndUser(db, { orgId: 'org-1', userId: 'user-1' });
    await seedTeam(db, { teamId: 'team-1', orgId });
    await addTeamMember(db, { teamId: 'team-1', userId });
    await seedGrant(db, { subjectType: 'team', subjectId: 'team-1', scopeType: 'organization', scopeId: orgId, roleId: 'role-member' });

    await runWithRequestContext({ requestId: 'req-1' }, async () => {
      const first = await countSelects(db, (countingDb) =>
        can(countingDb, { kind: 'user', userId }, { type: 'organization', id: orgId }, 'task:write'));
      expect(first.result).toBe(true);
      expect(first.selects).toBeGreaterThan(0);

      // Same principal, same org, a *different* permission the same role
      // also holds - every input this second call needs (team memberships,
      // candidate grants, the role's permission set) was already cached by
      // the first call, so this one should query nothing at all.
      const second = await countSelects(db, (countingDb) =>
        can(countingDb, { kind: 'user', userId }, { type: 'organization', id: orgId }, 'task:read'));
      expect(second.result).toBe(true);
      expect(second.selects).toBe(0);
    });
  });

  it('caches a "no access" result too - a denied second check still costs nothing', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedBareOrgAndUser(db, { orgId: 'org-1', userId: 'user-1' });
    await seedGrant(db, { subjectId: userId, scopeType: 'organization', scopeId: orgId, roleId: 'role-viewer' });

    await runWithRequestContext({ requestId: 'req-1' }, async () => {
      await can(db, { kind: 'user', userId }, { type: 'organization', id: orgId }, 'task:read');

      const { result, selects } = await countSelects(db, (countingDb) =>
        can(countingDb, { kind: 'user', userId }, { type: 'organization', id: orgId }, 'org:owner'));
      expect(result).toBe(false);
      expect(selects).toBe(0);
    });
  });

  it('keeps two different principals in one request separate - no cross-user contamination', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId: owner } = await seedOrgWithAdmin(db, { orgId: 'org-1', userId: 'owner-1' });
    await seedUser(db, 'viewer-1');
    await seedGrant(db, { subjectId: 'viewer-1', scopeType: 'organization', scopeId: orgId, roleId: 'role-viewer' });

    await runWithRequestContext({ requestId: 'req-1' }, async () => {
      expect(await can(db, { kind: 'user', userId: owner }, { type: 'organization', id: orgId }, 'org:admin')).toBe(true);
      expect(await can(db, { kind: 'user', userId: 'viewer-1' }, { type: 'organization', id: orgId }, 'org:admin')).toBe(false);
      // Re-checking the first principal still reflects *their* access, not
      // something bled over from caching the second principal's lookups.
      expect(await can(db, { kind: 'user', userId: owner }, { type: 'organization', id: orgId }, 'org:admin')).toBe(true);
    });
  });

  it('does not share a cache across two separate requests', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedBareOrgAndUser(db, { orgId: 'org-1', userId: 'user-1' });
    await seedGrant(db, { subjectId: userId, scopeType: 'organization', scopeId: orgId, roleId: 'role-member' });

    await runWithRequestContext({ requestId: 'req-1' }, () =>
      can(db, { kind: 'user', userId }, { type: 'organization', id: orgId }, 'task:write'));

    // A fresh runWithRequestContext is a fresh AsyncLocalStorage store, so
    // this is a new, empty PolicyCache - the query this makes is real, not
    // served from req-1's cache.
    await runWithRequestContext({ requestId: 'req-2' }, async () => {
      const { result, selects } = await countSelects(db, (countingDb) =>
        can(countingDb, { kind: 'user', userId }, { type: 'organization', id: orgId }, 'task:write'));
      expect(result).toBe(true);
      expect(selects).toBeGreaterThan(0);
    });
  });

  it('outside any request context, behaves exactly as before T06 - no cache, always fresh', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedBareOrgAndUser(db, { orgId: 'org-1', userId: 'user-1' });
    await seedGrant(db, { subjectId: userId, scopeType: 'organization', scopeId: orgId, roleId: 'role-member' });

    // Every test elsewhere in this file calls can() this way already - this
    // one just makes the "no wrapping context" case explicit and asserts
    // both calls genuinely query, rather than relying on the total test
    // count above to prove it indirectly.
    const first = await countSelects(db, (countingDb) =>
      can(countingDb, { kind: 'user', userId }, { type: 'organization', id: orgId }, 'task:write'));
    const second = await countSelects(db, (countingDb) =>
      can(countingDb, { kind: 'user', userId }, { type: 'organization', id: orgId }, 'task:write'));
    expect(first.result).toBe(true);
    expect(second.result).toBe(true);
    expect(second.selects).toBe(first.selects);
  });
});

// M10-T09. seedOrg's old two-level nesting cap is gone; can() climbs
// organizations.parentOrgId all the way up, not just one hop, for both a
// real grants row and the organization_members fallback.
async function seedChildOrg(db: any, { orgId, parentOrgId }: { orgId: string; parentOrgId: string }) {
  await db.insert(schema.organizations).values({ id: orgId, name: orgId, slug: orgId, parentOrgId, createdAt: new Date() });
}

describe('can() - ancestor organization climbing (T09)', () => {
  it('a grant on the parent org reaches its child org', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId: parentId, userId } = await seedBareOrgAndUser(db, { orgId: 'org-parent', userId: 'user-1' });
    await seedChildOrg(db, { orgId: 'org-child', parentOrgId: parentId });
    await seedGrant(db, { subjectId: userId, scopeType: 'organization', scopeId: parentId, roleId: 'role-admin' });

    expect(await can(db, { kind: 'user', userId }, { type: 'organization', id: 'org-child' }, 'org:admin')).toBe(true);
  });

  // The milestone's own verify line for M10-T09: "a parent-org admin can
  // administer a grandchild org."
  it('a grant on the grandparent org reaches a grandchild org, two levels down', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId: grandparentId, userId } = await seedBareOrgAndUser(db, { orgId: 'org-grandparent', userId: 'user-1' });
    await seedChildOrg(db, { orgId: 'org-parent-2', parentOrgId: grandparentId });
    await seedChildOrg(db, { orgId: 'org-grandchild', parentOrgId: 'org-parent-2' });
    await seedGrant(db, { subjectId: userId, scopeType: 'organization', scopeId: grandparentId, roleId: 'role-admin' });

    expect(await can(db, { kind: 'user', userId }, { type: 'organization', id: 'org-grandchild' }, 'org:admin')).toBe(true);
  });

  it('an organization_members role on the parent org reaches its child org too, not just real grants', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId: parentId, userId } = await seedOrgWithAdmin(db, { orgId: 'org-parent-om', userId: 'user-1' });
    await seedChildOrg(db, { orgId: 'org-child-om', parentOrgId: parentId });

    expect(await can(db, { kind: 'user', userId }, { type: 'organization', id: 'org-child-om' }, 'org:admin')).toBe(true);
  });

  it('a grant on a child org does not reach its parent - climbing is one-directional', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId: parentId } = await seedBareOrgAndUser(db, { orgId: 'org-parent-3', userId: 'user-1' });
    await seedChildOrg(db, { orgId: 'org-child-3', parentOrgId: parentId });
    await seedUser(db, 'user-2');
    await seedGrant(db, { subjectId: 'user-2', scopeType: 'organization', scopeId: 'org-child-3', roleId: 'role-owner' });

    expect(await can(db, { kind: 'user', userId: 'user-2' }, { type: 'organization', id: parentId }, 'org:read')).toBe(false);
  });

  it('a grant on one child does not leak to its sibling under the same parent', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId: parentId } = await seedBareOrgAndUser(db, { orgId: 'org-parent-4', userId: 'user-1' });
    await seedChildOrg(db, { orgId: 'org-child-a', parentOrgId: parentId });
    await seedChildOrg(db, { orgId: 'org-child-b', parentOrgId: parentId });
    await seedUser(db, 'user-2');
    await seedGrant(db, { subjectId: 'user-2', scopeType: 'organization', scopeId: 'org-child-a', roleId: 'role-owner' });

    expect(await can(db, { kind: 'user', userId: 'user-2' }, { type: 'organization', id: 'org-child-a' }, 'org:read')).toBe(true);
    expect(await can(db, { kind: 'user', userId: 'user-2' }, { type: 'organization', id: 'org-child-b' }, 'org:read')).toBe(false);
  });

  it('reaches a project under a grandchild org through both project→org and org→ancestor climbing composed together', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId: grandparentId, userId } = await seedBareOrgAndUser(db, { orgId: 'org-gp-proj', userId: 'user-1' });
    await seedChildOrg(db, { orgId: 'org-p-proj', parentOrgId: grandparentId });
    await seedChildOrg(db, { orgId: 'org-gc-proj', parentOrgId: 'org-p-proj' });
    const { projectId } = await seedProject(db, { orgId: 'org-gc-proj', userId, templateId: 'tmpl-gc', projectId: 'proj-gc' });
    await seedGrant(db, { subjectId: userId, scopeType: 'organization', scopeId: grandparentId, roleId: 'role-member' });

    expect(await can(db, { kind: 'user', userId }, { type: 'project', id: projectId }, 'task:write')).toBe(true);
  });

  it('a cyclic parentOrgId chain does not loop forever - fails closed with an empty ancestor list', async () => {
    const { db } = await setupIntegrationTest();
    await db.insert(schema.organizations).values([
      { id: 'org-cycle-a', name: 'A', slug: 'org-cycle-a', createdAt: new Date() },
      { id: 'org-cycle-b', name: 'B', slug: 'org-cycle-b', parentOrgId: 'org-cycle-a', createdAt: new Date() },
    ]);
    // Corrupt the chain into a cycle after both rows exist (parentOrgId
    // has no NOT NULL/acyclic constraint at the DB level - can() itself is
    // this guarantee's only enforcement point).
    await db.update(schema.organizations).set({ parentOrgId: 'org-cycle-b' }).where(eq(schema.organizations.id, 'org-cycle-a'));
    await seedUser(db, 'user-1');
    await seedGrant(db, { subjectId: 'user-1', scopeType: 'organization', scopeId: 'org-cycle-a', roleId: 'role-owner' });

    // Resolves (does not hang) and, since org-cycle-a's own direct grant
    // still applies to itself, still returns true for org-cycle-a.
    expect(await can(db, { kind: 'user', userId: 'user-1' }, { type: 'organization', id: 'org-cycle-a' }, 'org:read')).toBe(true);
  });
});

// ============================================================================
// M10-T13: the exhaustive role x permission x scope matrix.
// ============================================================================

/**
 * The 32-key permission vocabulary, read directly from the seed migration
 * rather than retyped into a second list here. A key added, renamed, or
 * removed in `0034_seed_system_roles_and_migrate_grants.sql` is picked up
 * the next time this file runs - a hand-copied array would instead let the
 * matrix quietly test a stale vocabulary the moment one side of a rename
 * shipped without the other, the exact drift this task exists to close off.
 */
function parsePermissionKeys(sql: string): string[] {
  const insertBlock = sql.match(/INSERT OR IGNORE INTO permissions \(key, description\) VALUES\s*([\s\S]*?);/);
  if (!insertBlock) {
    throw new Error('could not find the permissions INSERT block in 0034_seed_system_roles_and_migrate_grants.sql - the matrix has nothing to generate from');
  }
  const keys = [...insertBlock[1]!.matchAll(/\('([\w:]+)',/g)].map((m) => m[1]!);
  if (keys.length === 0) {
    throw new Error('parsed zero permission keys out of the seed migration - the regex above no longer matches its format');
  }
  return keys;
}

const SEED_MIGRATION_SQL = readFileSync(
  join(import.meta.dir, '../../drizzle-sqlite/0034_seed_system_roles_and_migrate_grants.sql'),
  'utf8',
);
const PERMISSION_KEYS = parsePermissionKeys(SEED_MIGRATION_SQL);

/**
 * Each system role's composition rule, restated from the same migration's
 * own `SELECT ... FROM permissions WHERE ...` clauses that build
 * `role_permissions` - viewer is every `*:read` key, member adds every
 * `*:write` key, admin adds every `*:admin` key plus `role:manage`, and
 * owner is every key that exists. `migrate-seed-system-roles-and-grants
 * .test.ts` already proves the *seeded data* matches this composition
 * (`role-viewer` holds exactly 13 rows, etc.) - what that file cannot
 * prove is that `can()` itself, exercised through a real grant at every
 * scope type, actually resolves each of those 128 (role, permission)
 * pairs the way the data says it should. That gap is this matrix's job.
 */
const ROLE_HOLDS: Record<string, (key: string) => boolean> = {
  'role-viewer': (key) => key.endsWith(':read'),
  'role-member': (key) => key.endsWith(':read') || key.endsWith(':write'),
  'role-admin': (key) => key.endsWith(':read') || key.endsWith(':write') || key.endsWith(':admin') || key === 'role:manage',
  'role-owner': () => true,
};

const SCOPE_TYPES = ['organization', 'team', 'project'] as const;

describe('can() - exhaustive role x permission x scope matrix (M10-T13)', () => {
  // 4 roles x 3 scope types = 12 combinations, each seeded once in its own
  // fresh database and checked against every one of the 32 permission keys -
  // 384 generated assertions from 12 fixtures, not 384 hand-written ones.
  // `it.each` builds one real, individually-reportable test case per
  // permission key, so a single wrong resolution names exactly which role,
  // scope, and permission disagreed with the seed data instead of failing
  // one giant assertion that only says "the matrix is wrong somewhere."
  for (const roleId of Object.keys(ROLE_HOLDS)) {
    for (const scopeType of SCOPE_TYPES) {
      describe(`${roleId} at ${scopeType} scope`, () => {
        let db: any;
        let userId: string;
        let scope: Scope;

        beforeAll(async () => {
          ({ db } = await setupIntegrationTest());
          const orgId = `org-${roleId}-${scopeType}`;
          userId = `user-${roleId}-${scopeType}`;
          // seedBareOrgAndUser, not seedOrgWithAdmin: an implicit admin
          // organization_members row would satisfy every permission on its
          // own regardless of which role this block is meant to isolate -
          // the same reasoning this file's own top-of-file comment gives
          // for using it everywhere except the fallback's dedicated tests.
          await seedBareOrgAndUser(db, { orgId, userId });

          if (scopeType === 'organization') {
            scope = { type: 'organization', id: orgId };
          } else if (scopeType === 'team') {
            const teamId = `team-${roleId}-${scopeType}`;
            await seedTeam(db, { teamId, orgId });
            scope = { type: 'team', id: teamId };
          } else {
            const projectId = `project-${roleId}-${scopeType}`;
            await seedProject(db, { orgId, userId, templateId: `${projectId}-tpl`, projectId });
            scope = { type: 'project', id: projectId };
          }

          await seedGrant(db, { subjectId: userId, scopeType, scopeId: scope.id, roleId });
        });

        it.each(PERMISSION_KEYS)('resolves %s exactly as the seed migration composes it', async (permissionKey) => {
          const expected = ROLE_HOLDS[roleId]!(permissionKey);
          expect(await can(db, { kind: 'user', userId }, scope, permissionKey)).toBe(expected);
        });
      });
    }
  }
});
