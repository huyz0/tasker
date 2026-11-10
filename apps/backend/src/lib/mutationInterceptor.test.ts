import { Code } from '@connectrpc/connect';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
import { setupIntegrationTest } from '../test/setup';
import * as S from '../db/schema.sqlite';
import { currentUnitOfWork } from '../db/access';
import { captureDomainEvent } from './domainEventOutbox';
import { publishDomainEvent, setDurableDomainEventCapture } from './natsCorrelation';
import { createMutationInterceptor } from './mutationInterceptor';
import { Lifecycle } from './lifecycle';

describe('runtime mutation interception', () => {
  let db: any;
  const request = (service: string, name: string, stream = false) => ({ stream, method: { name, parent: { typeName: `tasker.health.v1.${service}` } } }) as any;
  beforeEach(async () => {
    ({ db } = await setupIntegrationTest());
    setDurableDomainEventCapture((tx, standalone, event) => captureDomainEvent(tx, standalone, event, { brokerRequired: false }));
  });
  afterEach(() => setDurableDomainEventCapture(null));

  it('defaults unknown unary methods to an atomic unit, even a Get-prefixed method', async () => {
    const call = createMutationInterceptor(db)(async () => {
      expect(currentUnitOfWork()).toBeDefined();
      const id = crypto.randomUUID();
      await db.insert(S.users).values({ id, createdAt: new Date() });
      publishDomainEvent(null, 'domain.user.created', { id });
      return {} as any;
    });
    await call(request('FutureService', 'GetAndCreate'));
    expect(await db.select().from(S.domainEvents)).toHaveLength(1);
    await db.run(sql.raw("CREATE TRIGGER reject_capture BEFORE INSERT ON domain_events BEGIN SELECT RAISE(ABORT, 'storage unavailable'); END"));
    await expect(call(request('FutureService', 'AnotherMutation'))).rejects.toThrow();
    expect(await db.select().from(S.users)).toHaveLength(1);
  });

  it.each([['TaskService', 'GetTask', false], ['EventService', 'SubscribeEvents', true], ['HealthService', 'Ping', false], ['SavedViewService', 'GetSavedView', false], ['SavedViewService', 'ListSavedViews', false]])('avoids write units for explicit reads and all streams (%s.%s)', async (service, name, stream) => {
    await createMutationInterceptor(db)(async () => {
      expect(currentUnitOfWork()).toBeUndefined(); return {} as any;
    })(request(service, name, stream));
  });

  it('refuses late unary admission after an idle drain already resolved', async () => {
    const lifecycle = new Lifecycle(); lifecycle.markReady();
    expect(await lifecycle.drain(1000)).toBe('drained');
    let called = false;
    const call = createMutationInterceptor(db, lifecycle)(async () => { called = true; return {} as any; });
    await expect(call(request('FutureService', 'CreateSomething'))).rejects.toMatchObject({ code: Code.Unavailable });
    expect(called).toBe(false);
    expect(lifecycle.inFlightCount).toBe(0);
  });

  it('tracks actual unary handler promises through shutdown rather than the void Node adapter', async () => {
    const lifecycle = new Lifecycle(); lifecycle.markReady();
    let resume!: () => void;
    const held = new Promise<void>(resolve => { resume = resolve; });
    const pending = createMutationInterceptor(db, lifecycle)(async () => { await held; return {} as any; })(request('HealthService', 'Ping'));
    expect(lifecycle.inFlightCount).toBe(1);
    const draining = lifecycle.drain(1000);
    resume(); await pending;
    expect(await draining).toBe('drained');
    expect(lifecycle.inFlightCount).toBe(0);
  });
});
