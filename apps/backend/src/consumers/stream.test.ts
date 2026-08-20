import { describe, it, expect } from 'bun:test';
import {
  ensureStream,
  ensureConsumer,
  ensureStreamAndConsumer,
  durableConsumerConfig,
  decodeEvent,
  STREAM_NAME,
  STREAM_SUBJECTS,
  DURABLE_NAME,
  DEFAULT_MAX_AGE_MS,
} from './stream';

/**
 * A fake JetStreamManager recording what the setup asked for. The durability
 * guarantees M08 promises are decisions encoded in this config, so asserting
 * the config is asserting the guarantee — and it can be done without a broker,
 * which is what keeps these rules covered in CI.
 */
function fakeJsm(opts: { streamExists?: boolean; consumerExists?: boolean } = {}) {
  const calls = { added: [] as any[], updated: [] as any[], consumersAdded: [] as any[] };
  return {
    calls,
    jsm: {
      streams: {
        info: async () => {
          if (!opts.streamExists) throw new Error('stream not found');
          return { config: { name: STREAM_NAME } };
        },
        add: async (cfg: any) => { calls.added.push(cfg); return cfg; },
        update: async (_name: string, cfg: any) => { calls.updated.push(cfg); return cfg; },
      },
      consumers: {
        info: async () => {
          if (!opts.consumerExists) throw new Error('consumer not found');
          return { name: DURABLE_NAME };
        },
        add: async (_stream: string, cfg: any) => { calls.consumersAdded.push(cfg); return cfg; },
      },
    } as any,
  };
}

describe('ensureStream', () => {
  it('creates the stream over the whole domain.> namespace when absent', async () => {
    const { jsm, calls } = fakeJsm({ streamExists: false });
    expect(await ensureStream(jsm)).toBe('created');
    expect(calls.added).toHaveLength(1);
    expect(calls.added[0].name).toBe(STREAM_NAME);
    expect(calls.added[0].subjects).toEqual(STREAM_SUBJECTS);
  });

  it('updates rather than failing when the stream already exists', async () => {
    // Every consumer process runs this at boot; a second one starting must not
    // die because the first already created the stream.
    const { jsm, calls } = fakeJsm({ streamExists: true });
    expect(await ensureStream(jsm)).toBe('updated');
    expect(calls.added).toHaveLength(0);
    expect(calls.updated).toHaveLength(1);
  });

  it('retains events for seven days by default, in nanoseconds', async () => {
    // The buffer that makes a weekend-long consumer outage recoverable.
    // JetStream takes nanoseconds; passing milliseconds would silently retain
    // events for a millionth of the intended window.
    const { jsm, calls } = fakeJsm({ streamExists: false });
    await ensureStream(jsm);
    expect(calls.added[0].max_age).toBe(DEFAULT_MAX_AGE_MS * 1_000_000);
    expect(DEFAULT_MAX_AGE_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('honours an overridden retention window', async () => {
    const { jsm, calls } = fakeJsm({ streamExists: false });
    await ensureStream(jsm, { maxAgeMs: 60_000 });
    expect(calls.added[0].max_age).toBe(60_000 * 1_000_000);
  });
});

describe('durableConsumerConfig', () => {
  it('is durable, so a restart resumes instead of skipping the backlog', () => {
    // The whole point of M08-T02: an unnamed (ephemeral) consumer would lose
    // its position and silently skip everything published while it was down.
    expect(durableConsumerConfig().durable_name).toBe(DURABLE_NAME);
  });

  it('requires explicit acks, so a crash mid-write replays rather than loses', () => {
    expect(String(durableConsumerConfig().ack_policy)).toBe('explicit');
  });

  it('delivers all retained events, so a new consumer sees the backlog', () => {
    // `deliver_policy: all` rather than `new` — standing the projector up for
    // the first time must record what is already in the stream, not only what
    // arrives afterwards.
    expect(String(durableConsumerConfig().deliver_policy)).toBe('all');
  });

  it('bounds redelivery so one poison message cannot block the stream', () => {
    const cfg = durableConsumerConfig();
    expect(cfg.max_deliver).toBe(5);
    expect(cfg.ack_wait).toBe(30 * 1_000_000_000);
  });
});

describe('ensureConsumer', () => {
  it('creates the durable consumer when absent', async () => {
    const { jsm, calls } = fakeJsm({ consumerExists: false });
    expect(await ensureConsumer(jsm)).toBe('created');
    expect(calls.consumersAdded[0].durable_name).toBe(DURABLE_NAME);
  });

  it('leaves an existing consumer alone, preserving its ack position', async () => {
    // Re-adding would reset where the consumer is up to, which is exactly the
    // data that makes it durable.
    const { jsm, calls } = fakeJsm({ consumerExists: true });
    expect(await ensureConsumer(jsm)).toBe('exists');
    expect(calls.consumersAdded).toHaveLength(0);
  });
});

describe('ensureStreamAndConsumer', () => {
  it('reports what it did to each, in order', async () => {
    const { jsm } = fakeJsm({ streamExists: false, consumerExists: false });
    expect(await ensureStreamAndConsumer(jsm)).toEqual({ stream: 'created', consumer: 'created' });
  });
});

describe('decodeEvent', () => {
  const encode = (o: unknown) => new TextEncoder().encode(JSON.stringify(o));

  it('decodes a JSON payload with its subject and sequence', () => {
    const got = decodeEvent('domain.task.created', encode({ id: 't1', requestId: 'r1' }), 42);
    expect(got).toEqual({ subject: 'domain.task.created', payload: { id: 't1', requestId: 'r1' }, seq: 42 });
  });

  it('returns null for a non-JSON payload instead of throwing', () => {
    // A malformed message must not take the consumer down with it.
    expect(decodeEvent('domain.task.created', new TextEncoder().encode('not json'), 1)).toBeNull();
  });

  it('returns null for JSON that is not an object', () => {
    expect(decodeEvent('domain.task.created', encode('a string'), 1)).toBeNull();
    expect(decodeEvent('domain.task.created', encode(null), 1)).toBeNull();
  });
});
