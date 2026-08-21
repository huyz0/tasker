import { describe, it, expect, beforeEach } from 'bun:test';
import { ConnectError, Code } from '@connectrpc/connect';
import { createEventsHandler } from './events.handler';
import { currentPrincipalKey } from '../auth/session';

process.env.STANDALONE = 'true';

/**
 * A NATS subscription that hands the test control of the stream.
 *
 * Async-iterable like the real one, so the handler's `for await` is exercised
 * rather than mocked around, but the test decides when each message lands and
 * when the feed ends.
 */
function fakeSubscription() {
  const queue: any[] = [];
  let notify: (() => void) | null = null;
  let done = false;

  return {
    unsubscribed: false,
    push(subject: string, payload: unknown) {
      queue.push({
        subject,
        data: new TextEncoder().encode(
          typeof payload === 'string' ? payload : JSON.stringify(payload),
        ),
      });
      notify?.();
    },
    end() {
      done = true;
      notify?.();
    },
    unsubscribe() {
      (this as any).unsubscribed = true;
      this.end();
    },
    async *[Symbol.asyncIterator]() {
      while (true) {
        while (queue.length) yield queue.shift();
        if (done) return;
        await new Promise<void>((resolve) => {
          notify = () => {
            notify = null;
            resolve();
          };
        });
      }
    },
  };
}

function fakeNats(sub: any) {
  return { isClosed: () => false, subscribe: (_subject: string) => sub };
}

/**
 * A db whose only question is "which orgs does this user belong to".
 *
 * `orgIds` is mutable so a test can revoke a membership mid-stream, and the
 * query count is exposed because "how often is this asked" is the whole design
 * claim of the re-resolution rule.
 */
function fakeDb(orgIds: string[] = []) {
  let calls = 0;
  const db: any = {
    orgIds,
    get memberQueryCount() {
      return calls;
    },
    select: () => ({
      from: () => ({
        where: () => {
          calls += 1;
          return Promise.resolve(db.orgIds.map((orgId: string) => ({ orgId })));
        },
      }),
    }),
  };
  return db;
}

function ctxFor(principal: any) {
  const controller = new AbortController();
  return {
    ctx: { values: { get: (k: any) => (k === currentPrincipalKey ? principal : null) }, signal: controller.signal },
    controller,
  };
}

/** Collects `count` domain messages, skipping control frames. */
async function collect(iter: AsyncGenerator<any>, count: number, sub: any) {
  const out: any[] = [];
  for await (const msg of iter) {
    if (msg.subject.startsWith('stream.')) continue;
    out.push(msg);
    if (out.length >= count) break;
  }
  sub.end();
  return out;
}

/** Drains what is left after the feed ends, ignoring control frames. */
async function drain(iter: AsyncGenerator<any>) {
  const out: any[] = [];
  for await (const msg of iter) if (!msg.subject.startsWith('stream.')) out.push(msg);
  return out;
}

describe('subscribeEvents', () => {
  let sub: ReturnType<typeof fakeSubscription>;
  beforeEach(() => {
    sub = fakeSubscription();
  });

  it('refuses an unauthenticated caller before touching the broker', async () => {
    const handler = createEventsHandler(fakeDb(), fakeNats(sub));
    const iter = handler.subscribeEvents({}, { values: { get: () => null } });
    await expect(iter.next()).rejects.toThrow('Authentication required');
    expect(sub.unsubscribed).toBe(false);
  });

  it('reports a missing broker as Unavailable so the client retries', async () => {
    // Internal would tell the T09 backoff this is permanent. A broker that is
    // down comes back.
    const handler = createEventsHandler(fakeDb(['org-1']), null);
    const { ctx } = ctxFor({ kind: 'user', userId: 'usr-1' });
    try {
      await handler.subscribeEvents({}, ctx).next();
      throw new Error('expected a refusal');
    } catch (e) {
      expect(ConnectError.from(e).code).toBe(Code.Unavailable);
    }
  });

  it('treats a closed connection as unavailable too', async () => {
    const handler = createEventsHandler(fakeDb(['org-1']), {
      isClosed: () => true,
      subscribe: () => sub,
    });
    const { ctx } = ctxFor({ kind: 'user', userId: 'usr-1' });
    await expect(handler.subscribeEvents({}, ctx).next()).rejects.toThrow('not reachable');
  });

  it("streams events from an org the user belongs to", async () => {
    const handler = createEventsHandler(fakeDb(['org-1']), fakeNats(sub));
    const { ctx } = ctxFor({ kind: 'user', userId: 'usr-1' });
    const iter = handler.subscribeEvents({}, ctx);

    sub.push('domain.task.created', { orgId: 'org-1', projectId: 'proj-1' });
    const [msg] = await collect(iter, 1, sub);

    expect(msg.subject).toBe('domain.task.created');
    expect(msg.orgId).toBe('org-1');
    expect(msg.projectId).toBe('proj-1');
    expect(new Date(msg.occurredAt).toString()).not.toBe('Invalid Date');
  });

  it("withholds another org's events from a subscriber", async () => {
    const handler = createEventsHandler(fakeDb(['org-1']), fakeNats(sub));
    const { ctx } = ctxFor({ kind: 'user', userId: 'usr-1' });
    const iter = handler.subscribeEvents({}, ctx);

    sub.push('domain.task.created', { orgId: 'org-2' });
    sub.push('domain.task.created', { orgId: 'org-1' });
    const [msg] = await collect(iter, 1, sub);
    expect(msg.orgId).toBe('org-1');
  });

  it("resolves an agent's org from its token rather than a membership row", async () => {
    // ADR-0008 binds a token to one org; there is no organization_members row
    // for an agent to find, so querying would deny every agent.
    const db = fakeDb();
    const handler = createEventsHandler(db, fakeNats(sub));
    const { ctx } = ctxFor({ kind: 'agent', agentId: 'agt-1', orgId: 'org-1' });
    const iter = handler.subscribeEvents({}, ctx);

    sub.push('domain.task.created', { orgId: 'org-1' });
    const [msg] = await collect(iter, 1, sub);
    expect(msg.orgId).toBe('org-1');
    expect(db.memberQueryCount).toBe(0);
  });

  it('applies the requested project narrowing', async () => {
    const handler = createEventsHandler(fakeDb(['org-1']), fakeNats(sub));
    const { ctx } = ctxFor({ kind: 'user', userId: 'usr-1' });
    const iter = handler.subscribeEvents({ orgId: 'org-1', projectId: 'proj-1' }, ctx);

    sub.push('domain.task.created', { orgId: 'org-1', projectId: 'proj-2' });
    sub.push('domain.task.created', { orgId: 'org-1', projectId: 'proj-1' });
    const [msg] = await collect(iter, 1, sub);
    expect(msg.projectId).toBe('proj-1');
  });

  it('stops delivering an org once a membership event says the user left it', async () => {
    // The point of the design: authorized once at connect, corrected by the
    // very stream it is already reading.
    const db = fakeDb(['org-1']);
    const handler = createEventsHandler(db, fakeNats(sub));
    const { ctx } = ctxFor({ kind: 'user', userId: 'usr-1' });
    const iter = handler.subscribeEvents({}, ctx);

    sub.push('domain.task.created', { orgId: 'org-1', projectId: 'p1' });
    expect((await iter.next()).value.subject).toBe('stream.ready');
    expect((await iter.next()).value.projectId).toBe('p1');

    db.orgIds = [];
    sub.push('domain.org.member_removed', { orgId: 'org-1' });
    sub.push('domain.task.created', { orgId: 'org-1', projectId: 'p2' });
    sub.end();

    // Neither the removal itself nor anything after it.
    expect(await drain(iter)).toEqual([]);
    expect(db.memberQueryCount).toBe(2);
  });

  it('does not re-query memberships on ordinary traffic', async () => {
    const db = fakeDb(['org-1']);
    const handler = createEventsHandler(db, fakeNats(sub));
    const { ctx } = ctxFor({ kind: 'user', userId: 'usr-1' });
    const iter = handler.subscribeEvents({}, ctx);

    sub.push('domain.task.created', { orgId: 'org-1' });
    sub.push('domain.task.updated', { orgId: 'org-1' });
    await collect(iter, 2, sub);
    expect(db.memberQueryCount).toBe(1);
  });

  it('skips a malformed message instead of killing the connection', async () => {
    const handler = createEventsHandler(fakeDb(['org-1']), fakeNats(sub));
    const { ctx } = ctxFor({ kind: 'user', userId: 'usr-1' });
    const iter = handler.subscribeEvents({}, ctx);

    sub.push('domain.task.created', 'not json at all');
    sub.push('domain.task.created', '"a bare string"');
    sub.push('domain.task.created', { orgId: 'org-1' });
    const msgs = await collect(iter, 1, sub);
    expect(msgs).toHaveLength(1);
  });

  it('drops an event that names no org', async () => {
    const handler = createEventsHandler(fakeDb(['org-1']), fakeNats(sub));
    const { ctx } = ctxFor({ kind: 'user', userId: 'usr-1' });
    const iter = handler.subscribeEvents({}, ctx);

    sub.push('domain.auth.registered', { userId: 'usr-1' });
    sub.end();
    expect(await drain(iter)).toEqual([]);
  });

  it('unsubscribes when the client goes away', async () => {
    // A closed tab must not leave a NATS subscription behind for the life of
    // the process.
    const handler = createEventsHandler(fakeDb(['org-1']), fakeNats(sub));
    const { ctx, controller } = ctxFor({ kind: 'user', userId: 'usr-1' });
    const iter = handler.subscribeEvents({}, ctx);

    sub.push('domain.task.created', { orgId: 'org-1' });
    await iter.next();
    await iter.next();
    controller.abort();

    const done = await iter.next();
    expect(done.done).toBe(true);
    expect(sub.unsubscribed).toBe(true);
  });

  it('unsubscribes when the generator is abandoned mid-stream', async () => {
    const handler = createEventsHandler(fakeDb(['org-1']), fakeNats(sub));
    const { ctx } = ctxFor({ kind: 'user', userId: 'usr-1' });
    const iter = handler.subscribeEvents({}, ctx);

    sub.push('domain.task.created', { orgId: 'org-1' });
    await iter.next();
    await iter.return(undefined as any);
    expect(sub.unsubscribed).toBe(true);
  });

  it('ends the stream when the broker subscription itself fails', async () => {
    // A NATS error must surface as the stream ending — which the client's
    // backoff already handles — not as an unhandled rejection in the pump.
    const failing = {
      unsubscribe() {},
      async *[Symbol.asyncIterator]() {
        throw new Error('connection reset');
      },
    };
    const handler = createEventsHandler(fakeDb(['org-1']), fakeNats(failing));
    const { ctx } = ctxFor({ kind: 'user', userId: 'usr-1' });
    const iter = handler.subscribeEvents({}, ctx);

    expect((await iter.next()).value.subject).toBe('stream.ready');
    expect((await iter.next()).done).toBe(true);
  });

  it('announces itself before any traffic, so an indicator can tell live from wedged', async () => {
    // An opened stream that has yielded nothing looks exactly like one whose
    // server is stuck. Without this frame the T10 indicator would show "live"
    // for a feed that is dead.
    const handler = createEventsHandler(fakeDb(['org-1']), fakeNats(sub));
    const { ctx } = ctxFor({ kind: 'user', userId: 'usr-1' });
    const iter = handler.subscribeEvents({}, ctx);

    const first = await iter.next();
    expect(first.value.subject).toBe('stream.ready');
    expect(first.value.orgId).toBe('');
    await iter.return(undefined as any);
  });

  it('heartbeats a quiet feed rather than going silent', async () => {
    // Silence is indistinguishable from a half-open connection, and idle-timeout
    // proxies cut streams that say nothing.
    const handler = createEventsHandler(fakeDb(['org-1']), fakeNats(sub), { heartbeatMs: 5 });
    const { ctx } = ctxFor({ kind: 'user', userId: 'usr-1' });
    const iter = handler.subscribeEvents({}, ctx);

    expect((await iter.next()).value.subject).toBe('stream.ready');
    expect((await iter.next()).value.subject).toBe('stream.heartbeat');
    expect((await iter.next()).value.subject).toBe('stream.heartbeat');
    await iter.return(undefined as any);
  });

  it('prefers a publisher-stamped time when the payload carries one', async () => {
    const handler = createEventsHandler(fakeDb(['org-1']), fakeNats(sub));
    const { ctx } = ctxFor({ kind: 'user', userId: 'usr-1' });
    const iter = handler.subscribeEvents({}, ctx);

    sub.push('domain.task.created', { orgId: 'org-1', occurredAt: '2026-08-20T10:00:00.000Z' });
    const [msg] = await collect(iter, 1, sub);
    expect(msg.occurredAt).toBe('2026-08-20T10:00:00.000Z');
  });
});
