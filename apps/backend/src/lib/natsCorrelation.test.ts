import { describe, it, expect, beforeEach } from 'bun:test';
import { withRequestCorrelation, publishDomainEvent } from './natsCorrelation';
import { runWithRequestContext } from './requestContext';
import { getBusinessEventCounts, resetBusinessEvents } from './businessEvents';

function makeFakeNc() {
  const publishedMessages: { subject: string; data: any }[] = [];
  return {
    nc: { publish: (subject: string, data?: any) => { publishedMessages.push({ subject, data }); } },
    publishedMessages,
  };
}

/**
 * A fake shaped like a *real* NATS connection: methods on the prototype, not
 * own properties. `makeFakeNc` above returns an object literal, where every
 * method is an own property — which is precisely why the bug this guards
 * against went unnoticed. `{...nc}` copies own enumerable properties only, so
 * the literal survived spreading intact while a real connection lost
 * isClosed/flush/drain/subscribe/jetstream.
 */
class FakeNatsConnection {
  published: { subject: string; data: any }[] = [];
  publish(subject: string, data?: any) {
    this.published.push({ subject, data });
  }
  isClosed() {
    return false;
  }
  async flush() {
    return undefined;
  }
  jetstream() {
    return { name: 'js' };
  }
}

describe('withRequestCorrelation: preserving the connection API', () => {
  // The regression that reached production behaviour: with no broker in the
  // local stack the connection was always null, so the health probe
  // short-circuited on `!nc` and never called these. The moment a real broker
  // existed (M08-T01), Ping 500'd with "nc.isClosed is not a function".
  it('keeps prototype methods callable through the wrapper', () => {
    const wrapped = withRequestCorrelation(new FakeNatsConnection() as any);

    expect(typeof (wrapped as any).isClosed).toBe('function');
    expect(typeof (wrapped as any).flush).toBe('function');
    expect(typeof (wrapped as any).jetstream).toBe('function');
    expect((wrapped as any).isClosed()).toBe(false);
    expect((wrapped as any).jetstream()).toEqual({ name: 'js' });
  });

  it('keeps forwarded methods bound to the underlying connection', async () => {
    // `this` has to still be the real connection, or a method that touches
    // internal state reads someone else's.
    const real = new FakeNatsConnection();
    const wrapped = withRequestCorrelation(real as any);

    (wrapped as any).publish('domain.task.created', Buffer.from(JSON.stringify({ id: 't1' })));

    expect(real.published).toHaveLength(1);
    expect(real.published[0]!.subject).toBe('domain.task.created');
    await expect((wrapped as any).flush()).resolves.toBeUndefined();
  });

  it('still injects the request id when the connection is prototype-based', () => {
    const real = new FakeNatsConnection();
    const wrapped = withRequestCorrelation(real as any);

    runWithRequestContext({ requestId: 'req-proto', userId: 'u1' }, () => {
      (wrapped as any).publish('domain.task.created', Buffer.from(JSON.stringify({ id: 't1' })));
    });

    expect(JSON.parse(real.published[0]!.data.toString())).toEqual({ id: 't1', requestId: 'req-proto' });
  });
});

describe('withRequestCorrelation', () => {
  it('injects the active request id into a JSON payload published during that request', () => {
    const { nc, publishedMessages } = makeFakeNc();
    const wrapped = withRequestCorrelation(nc);

    runWithRequestContext({ requestId: 'req-123', userId: 'user-1' }, () => {
      wrapped.publish('domain.task.created', Buffer.from(JSON.stringify({ id: 'tsk-1' })));
    });

    const payload = JSON.parse(publishedMessages[0]!.data.toString());
    expect(payload).toEqual({ id: 'tsk-1', requestId: 'req-123' });
  });

  it('does not overwrite an existing requestId already present on the payload', () => {
    const { nc, publishedMessages } = makeFakeNc();
    const wrapped = withRequestCorrelation(nc);

    runWithRequestContext({ requestId: 'req-outer', userId: null }, () => {
      wrapped.publish('domain.task.created', Buffer.from(JSON.stringify({ id: 'tsk-1', requestId: 'req-original' })));
    });

    const payload = JSON.parse(publishedMessages[0]!.data.toString());
    expect(payload.requestId).toBe('req-original');
  });

  it('publishes the payload unchanged when called outside any request context', () => {
    const { nc, publishedMessages } = makeFakeNc();
    const wrapped = withRequestCorrelation(nc);

    wrapped.publish('domain.task.created', Buffer.from(JSON.stringify({ id: 'tsk-1' })));

    const payload = JSON.parse(publishedMessages[0]!.data.toString());
    expect(payload).toEqual({ id: 'tsk-1' });
  });

  it('leaves non-JSON payloads unchanged instead of throwing', () => {
    const { nc, publishedMessages } = makeFakeNc();
    const wrapped = withRequestCorrelation(nc);

    runWithRequestContext({ requestId: 'req-123' }, () => {
      wrapped.publish('domain.task.created', Buffer.from('not json'));
    });

    expect(publishedMessages[0]!.data.toString()).toBe('not json');
  });
});

describe('publishDomainEvent', () => {
  beforeEach(() => {
    resetBusinessEvents();
  });

  it('records the business event and publishes to NATS when nc is connected', () => {
    const { nc, publishedMessages } = makeFakeNc();
    publishDomainEvent(nc, 'domain.task.created', { id: 'tsk-1' });

    expect(getBusinessEventCounts()).toEqual({ 'domain.task.created': 1 });
    expect(publishedMessages).toHaveLength(1);
    expect(publishedMessages[0]!.subject).toBe('domain.task.created');
    expect(JSON.parse(publishedMessages[0]!.data.toString())).toEqual({ id: 'tsk-1' });
  });

  it('still records the business event when nc is null (no NATS connection)', () => {
    // STANDALONE local dev commonly runs without NATS - the whole point of
    // this test is that business-event volume stays visible in exactly
    // that environment, not just when a real NATS connection exists.
    publishDomainEvent(null, 'domain.task.created', { id: 'tsk-1' });
    expect(getBusinessEventCounts()).toEqual({ 'domain.task.created': 1 });
  });
});
