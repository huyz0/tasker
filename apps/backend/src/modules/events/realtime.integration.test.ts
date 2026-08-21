import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connect as natsConnect, AckPolicy, DeliverPolicy } from 'nats';
import { eq } from 'drizzle-orm';
import { setupIntegrationTest, seedOrgWithAdmin, seedProject, seedUser } from '../../test/setup';
import * as schema from '../../db/schema.sqlite';
import { withRequestCorrelation } from '../../lib/natsCorrelation';
import { runWithRequestContext } from '../../lib/requestContext';
import { currentPrincipalKey } from '../auth/session';
import { createTaskManagementHandler } from '../tasks/tasks.handler';
import { decodeEvent, STREAM_NAME, STREAM_SUBJECTS } from '../../consumers/stream';
import { projectEvent } from '../../consumers/auditProjector';
import { createEventsHandler } from './events.handler';

/**
 * The whole chain, against a real broker (M08-T11).
 *
 * mutation → NATS → live feed, and the same event → JetStream → audit_log.
 * Every other test in this milestone stubs one of those hops; this one stubs
 * none, because the two bugs the milestone actually hit — a wrapper that ate
 * the connection's prototype, and events published with no tenant on them —
 * were both invisible to anything that did.
 *
 * Skipped without `TASKER_REAL_INTEGRATION=1`, the same gate the GitHub
 * integration test uses: it needs a broker on NATS_URL, which the unit suite
 * deliberately does not.
 */

const runIntegration = process.env.TASKER_REAL_INTEGRATION === '1';
const testIf = runIntegration ? describe : describe.skip;

const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222';

/** A distinct durable per run, so a rerun does not resume the last one's acks. */
const DURABLE = `m08-t11-${Date.now()}`;

const principalCtx = (principal: any) => ({
  values: { get: (k: any) => (k === currentPrincipalKey ? principal : null) },
  signal: new AbortController().signal,
});

/**
 * Pulls frames until `predicate` matches, or `maxFrames` have gone by.
 *
 * Bounded by frames and not by a timer, deliberately: racing `iter.next()`
 * against a timeout leaves that `next()` pending when the timer wins, and the
 * generator's `return()` then queues behind a promise that will never settle —
 * the whole test deadlocks on cleanup. The heartbeat is what makes a frame
 * count a usable clock: a feed with nothing to say still speaks.
 */
async function collectUntil(
  iter: AsyncGenerator<any>,
  predicate: (msg: any) => boolean,
  maxFrames = 30,
): Promise<any | null> {
  for (let i = 0; i < maxFrames; i++) {
    const { value, done } = await iter.next();
    if (done) return null;
    if (predicate(value)) return value;
  }
  return null;
}

testIf('Real broker: mutation → event → live feed → audit trail', () => {
  let nc: any;
  let wrappedNc: any;
  let db: any;
  let jsm: any;

  const ORG = 'org-realtime';
  const OWNER = 'usr-owner';
  const OUTSIDER = 'usr-outsider';
  const PROJECT = 'proj-realtime';

  beforeAll(async () => {
    nc = await natsConnect({ servers: NATS_URL });
    wrappedNc = withRequestCorrelation(nc);
    jsm = await nc.jetstreamManager();

    // The shared stream, plus this run's own consumer on it. Adding to the
    // existing DOMAIN_EVENTS stream rather than a private one keeps the test
    // on the same subjects the real projector reads.
    await jsm.streams.add({ name: STREAM_NAME, subjects: STREAM_SUBJECTS }).catch(() => {});
    await jsm.consumers.add(STREAM_NAME, {
      durable_name: DURABLE,
      ack_policy: AckPolicy.Explicit,
      // `new` and not `all`: the shared stream holds every event this broker
      // has seen, and replaying them would bury this test's own.
      deliver_policy: DeliverPolicy.New,
    });

    ({ db } = await setupIntegrationTest());
    await seedOrgWithAdmin(db, { orgId: ORG, userId: OWNER });
    await seedUser(db, OUTSIDER);
    await seedProject(db, { orgId: ORG, userId: OWNER, templateId: 'tmpl-1', projectId: PROJECT });
  }, 30_000);

  afterAll(async () => {
    await jsm?.consumers?.delete(STREAM_NAME, DURABLE).catch(() => {});
    await nc?.close();
  });

  it('delivers a real mutation to a subscriber and files it in the audit trail', async () => {
    // A fast heartbeat so an assertion that is *waiting* for something that
    // never comes still gets frames to count, and fails in seconds instead of
    // hanging until the suite's own timeout.
    const events = createEventsHandler(db, wrappedNc, { heartbeatMs: 300 });
    const owner = events.subscribeEvents({}, principalCtx({ kind: 'user', userId: OWNER }));
    const outsider = events.subscribeEvents({}, principalCtx({ kind: 'user', userId: OUTSIDER }));

    // Both streams must have their NATS subscription in place before the
    // mutation publishes, or the assertion below races the broker.
    expect((await owner.next()).value.subject).toBe('stream.ready');
    expect((await outsider.next()).value.subject).toBe('stream.ready');

    const tasks = createTaskManagementHandler(db, wrappedNc);
    await runWithRequestContext({ requestId: 'req-realtime', userId: OWNER }, () =>
      tasks.createTask(
        { projectId: PROJECT, title: 'A task that should reach the feed' },
        { values: { get: (k: any) => (k === currentPrincipalKey ? { kind: 'user', userId: OWNER } : OWNER) } } as any,
      ),
    );

    const delivered = await collectUntil(owner, (m) => m.subject === 'domain.task.created');
    expect(delivered).not.toBeNull();

    // The tenant on the event is the point. A task row has a projectId and no
    // orgId of its own — before setRequestOrg this arrived untenanted, which
    // the feed drops and the audit trail files under a null org.
    expect(delivered.orgId).toBe(ORG);
    expect(delivered.projectId).toBe(PROJECT);

    // The outsider belongs to no organization, so their feed stays empty
    // however long it is held open.
    const leaked = await collectUntil(outsider, (m) => !m.subject.startsWith('stream.'), 8);
    expect(leaked).toBeNull();

    await owner.return(undefined as any);
    await outsider.return(undefined as any);

    // The other half of the chain: the same event, through JetStream, into the
    // trail. Reading it here rather than assuming the separate consumer
    // process ran is what makes this test fail when the projection breaks
    // rather than when the process happens to be down.
    const consumer = await nc.jetstream().consumers.get(STREAM_NAME, DURABLE);
    const messages = await consumer.fetch({ max_messages: 20, expires: 5_000 });
    let projected = 0;
    for await (const msg of messages) {
      const decoded = decodeEvent(msg.subject, msg.data, msg.seq);
      if (decoded) {
        await projectEvent(db, decoded);
        projected += 1;
      }
      msg.ack();
    }
    expect(projected).toBeGreaterThan(0);

    const rows = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.subject, 'domain.task.created'));

    expect(rows.length).toBeGreaterThan(0);
    // Not just recorded — recorded against an org, which is the only way
    // listAuditEvents can ever find it again.
    expect(rows.some((r: any) => r.orgId === ORG)).toBe(true);
  }, 30_000);
});
