import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { setupIntegrationTest, seedOrgWithAdmin, seedProject, makeAuthContext } from '../test/setup';
import * as S from '../db/schema.sqlite';
import { withUnitOfWork, currentUnitOfWork } from '../db/access';
import { captureDomainEvent } from './domainEventOutbox';
import { setDurableDomainEventCapture } from './natsCorrelation';
import { runWithRequestContext } from './requestContext';
import { createRepositoriesHandler } from '../modules/repositories/repositories.handler';
import { createOrgsHandler } from '../modules/orgs/orgs.handler';

describe('external I/O and durable mutation boundaries', () => {
  let db: any;
  const originalFetch = globalThis.fetch;
  const ctx = makeAuthContext('owner');
  const request = { projectId: 'project', provider: 'github', remoteName: 'fixture/repo', oauthCode: 'fixture-code' };
  beforeEach(async () => {
    ({ db } = await setupIntegrationTest());
    await seedOrgWithAdmin(db, { orgId: 'org', userId: 'owner' });
    await seedProject(db, { orgId: 'org', userId: 'owner', projectId: 'project', templateId: 'template' });
    setDurableDomainEventCapture((tx, standalone, event) => captureDomainEvent(tx, standalone, event, { brokerRequired: false }));
    globalThis.fetch = (async (input: any) => {
      expect(currentUnitOfWork()).toBeUndefined();
      return new Response(JSON.stringify(String(input).includes('access_token') ? { access_token: 'fixture-token' } : []));
    }) as any;
  });
  afterEach(() => { globalThis.fetch = originalFetch; setDurableDomainEventCapture(null); });

  it('does remote OAuth/sync preparation outside SQL units, then commits writes with captured events', async () => {
    const handler = createRepositoriesHandler(db);
    await handler.addRepositoryLink(request, ctx);
    expect((await handler.syncPullRequests({ projectId: 'project' }, ctx)).success).toBe(true);
    expect(await db.select().from(S.repositoryLinks)).toHaveLength(1);
    expect(await db.select().from(S.domainEvents)).toHaveLength(2);
  });

  it('rolls back repository insertion if durable capture fails after remote preparation', async () => {
    await db.run(sql.raw("CREATE TRIGGER fail_capture BEFORE INSERT ON domain_events BEGIN SELECT RAISE(ABORT, 'capture unavailable'); END"));
    await expect(createRepositoriesHandler(db).addRepositoryLink(request, ctx)).rejects.toThrow();
    expect(await db.select().from(S.repositoryLinks)).toHaveLength(0);
  });

  it('rechecks current permissions after OAuth rather than reuse a cached pre-network grant', async () => {
    globalThis.fetch = (async () => {
      await db.delete(S.organizationMembers).where(eq(S.organizationMembers.userId, 'owner'));
      return new Response('{"access_token":"fixture-token"}');
    }) as any;
    await expect(runWithRequestContext({ requestId: 'boundary' }, () => createRepositoriesHandler(db).addRepositoryLink(request, ctx))).rejects.toThrow();
    expect(await db.select().from(S.repositoryLinks)).toHaveLength(0);
  });

  it('sends invitation email only after its owning unit commits', async () => {
    const sent: any[] = [];
    const mailer = { enabled: true, appUrl: 'https://fixture.example', send: async (message: any) => { expect(currentUnitOfWork()).toBeUndefined(); sent.push(message); return 'sent'; } };
    await withUnitOfWork(db, async () => {
      await createOrgsHandler(db, null, mailer as any).inviteUser({ orgId: 'org', email: 'invite@fixture.example', role: 'member' }, ctx);
      expect(sent).toHaveLength(0);
    });
    expect(sent).toHaveLength(1);
  });
});
