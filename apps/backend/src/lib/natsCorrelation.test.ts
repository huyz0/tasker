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

describe('withRequestCorrelation: the acting principal (M08-T04)', () => {
  it('stamps the request actor onto every published event', () => {
    // Attached here rather than at ~50 publish sites: a handler that forgot
    // would produce an event the audit trail records as unattributed, which
    // is indistinguishable from something the system genuinely did itself.
    const { nc, publishedMessages } = makeFakeNc();
    const wrapped = withRequestCorrelation(nc);

    runWithRequestContext(
      { requestId: 'req-1', userId: 'usr-1', actor: { kind: 'user', userId: 'usr-1' } },
      () => { wrapped.publish('domain.task.created', Buffer.from(JSON.stringify({ id: 't1' }))); },
    );

    expect(JSON.parse(publishedMessages[0]!.data.toString())).toEqual({
      id: 't1',
      requestId: 'req-1',
      actor: { kind: 'user', userId: 'usr-1' },
    });
  });

  it('records an agent actor as an agent, not as an absent user', () => {
    const { nc, publishedMessages } = makeFakeNc();
    const wrapped = withRequestCorrelation(nc);

    runWithRequestContext(
      { requestId: 'req-2', userId: null, actor: { kind: 'agent', agentId: 'agt-1' } },
      () => { wrapped.publish('domain.task.claimed', Buffer.from(JSON.stringify({ id: 't1' }))); },
    );

    expect(JSON.parse(publishedMessages[0]!.data.toString()).actor).toEqual({ kind: 'agent', agentId: 'agt-1' });
  });

  it('does not overwrite an actor the handler set deliberately', () => {
    // A handler acting *on behalf of* someone else is telling the truth about
    // the subject; the request's own principal would be the wrong answer.
    const { nc, publishedMessages } = makeFakeNc();
    const wrapped = withRequestCorrelation(nc);

    runWithRequestContext(
      { requestId: 'req-3', userId: 'admin-1', actor: { kind: 'user', userId: 'admin-1' } },
      () => {
        wrapped.publish(
          'domain.org.member_removed',
          Buffer.from(JSON.stringify({ actor: { kind: 'user', userId: 'someone-else' } })),
        );
      },
    );

    expect(JSON.parse(publishedMessages[0]!.data.toString()).actor).toEqual({ kind: 'user', userId: 'someone-else' });
  });

  it('publishes unchanged when the request has no resolved actor', () => {
    // An unauthenticated call still emits events (a failed login, say); it
    // simply has nobody to name.
    const { nc, publishedMessages } = makeFakeNc();
    const wrapped = withRequestCorrelation(nc);

    runWithRequestContext({ requestId: 'req-4' }, () => {
      wrapped.publish('domain.auth.login_failed', Buffer.from(JSON.stringify({ email: 'a@b.test' })));
    });

    const payload = JSON.parse(publishedMessages[0]!.data.toString());
    expect(payload.actor).toBeUndefined();
    expect(payload.requestId).toBe('req-4');
  });
});

describe('withRequestCorrelation: the acting tenant (M08-T07)', () => {
  it('stamps the org onto an event whose own payload has none', () => {
    // A task row carries a projectId and no orgId, so `domain.task.*` — the
    // highest-traffic subject in the system — was published untenanted. The
    // live feed dropped every one of them, and the audit trail filed them
    // under a null org where listAuditEvents could never find them again.
    const { nc, publishedMessages } = makeFakeNc();
    const wrapped = withRequestCorrelation(nc);

    runWithRequestContext({ requestId: 'req-1', orgId: 'org-1' }, () => {
      wrapped.publish('domain.task.created', Buffer.from(JSON.stringify({ id: 't1', projectId: 'p1' })));
    });

    const payload = JSON.parse(publishedMessages[0]!.data.toString());
    expect(payload.orgId).toBe('org-1');
    expect(payload.projectId).toBe('p1');
  });

  it('leaves an org the payload already names alone', () => {
    // The event is describing *that* org — archiving one org from inside
    // another's context, say. The request's own org is not the same claim.
    const { nc, publishedMessages } = makeFakeNc();
    const wrapped = withRequestCorrelation(nc);

    runWithRequestContext({ requestId: 'req-2', orgId: 'org-parent' }, () => {
      wrapped.publish('domain.org.archived', Buffer.from(JSON.stringify({ orgId: 'org-child' })));
    });

    expect(JSON.parse(publishedMessages[0]!.data.toString()).orgId).toBe('org-child');
  });

  it('publishes unchanged when the request never authorized against an org', () => {
    // Registering a user precedes any membership. There is no tenant to name,
    // and inventing one would be worse than leaving it off.
    const { nc, publishedMessages } = makeFakeNc();
    const wrapped = withRequestCorrelation(nc);

    runWithRequestContext({ requestId: 'req-3' }, () => {
      wrapped.publish('domain.auth.registered', Buffer.from(JSON.stringify({ userId: 'u1' })));
    });

    expect(JSON.parse(publishedMessages[0]!.data.toString()).orgId).toBeUndefined();
  });
});
