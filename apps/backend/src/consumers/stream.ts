import type { JetStreamManager, ConsumerConfig } from 'nats';

/**
 * The JetStream stream and consumer every `domain.*` event flows through.
 *
 * Kept separate from `index.ts` so the durability rules below can be asserted
 * without a broker: the entrypoint is process wiring (signals, exit codes) and
 * is excluded from coverage, which is the wrong place for the decisions that
 * determine whether an event survives a restart.
 */

/** One stream over the whole `domain.*` namespace, not one per subject. */
export const STREAM_NAME = 'DOMAIN_EVENTS';
export const STREAM_SUBJECTS = ['domain.>'];

/**
 * The durable consumer's name. Durability is the point of M08-T02: a *named*
 * consumer has its acknowledgement position stored server-side, so a consumer
 * that restarts resumes where it stopped rather than from whatever happens to
 * be in the stream. An ephemeral (unnamed) consumer would silently skip
 * everything published while it was down.
 */
export const DURABLE_NAME = 'audit-projector';

export interface StreamSetupOptions {
  /**
   * How long the stream keeps events the consumer has not acknowledged.
   * Seven days: long enough that a consumer outage over a weekend is
   * recoverable, short enough that the on-disk store stays bounded without an
   * operator having to prune it. The audit trail itself is the durable record
   * (M08-T03) — this is a delivery buffer, not storage.
   */
  maxAgeMs?: number;
}

export const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Creates the stream if absent, updates it if its config has drifted.
 *
 * Idempotent on purpose: every consumer process runs this at boot, and a
 * second one starting must not fail because the first already created the
 * stream.
 */
export async function ensureStream(jsm: JetStreamManager, opts: StreamSetupOptions = {}): Promise<'created' | 'updated'> {
  const maxAge = (opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS) * 1_000_000; // ms → ns
  const config = {
    name: STREAM_NAME,
    subjects: STREAM_SUBJECTS,
    max_age: maxAge,
  };

  try {
    await jsm.streams.info(STREAM_NAME);
  } catch {
    // `info` throws when the stream does not exist; that is the create path.
    await jsm.streams.add(config as any);
    return 'created';
  }
  await jsm.streams.update(STREAM_NAME, config as any);
  return 'updated';
}

/**
 * The durable consumer's configuration.
 *
 * `ack_policy: explicit` means a message is redelivered unless the projector
 * acknowledges it, so a crash mid-write replays that event rather than losing
 * it. `deliver_policy: all` means a brand-new consumer starts from the
 * beginning of the retained stream rather than only seeing what arrives next —
 * without it, standing up the projector for the first time would silently skip
 * the backlog it exists to record.
 */
export function durableConsumerConfig(): Partial<ConsumerConfig> {
  return {
    durable_name: DURABLE_NAME,
    ack_policy: 'explicit' as any,
    deliver_policy: 'all' as any,
    // Redeliver after 30s if the projector neither acked nor errored — covers
    // a process killed between receiving and writing.
    ack_wait: 30 * 1_000_000_000,
    // Bounded redelivery: a message that fails five times is a poison pill,
    // and retrying it forever would block the consumer behind it.
    max_deliver: 5,
  };
}

export async function ensureConsumer(jsm: JetStreamManager): Promise<'created' | 'exists'> {
  try {
    await jsm.consumers.info(STREAM_NAME, DURABLE_NAME);
    return 'exists';
  } catch {
    await jsm.consumers.add(STREAM_NAME, durableConsumerConfig() as ConsumerConfig);
    return 'created';
  }
}

/** Convenience for the entrypoint: stream + consumer, in the required order. */
export async function ensureStreamAndConsumer(
  jsm: JetStreamManager,
  opts: StreamSetupOptions = {},
): Promise<{ stream: 'created' | 'updated'; consumer: 'created' | 'exists' }> {
  const stream = await ensureStream(jsm, opts);
  const consumer = await ensureConsumer(jsm);
  return { stream, consumer };
}

/**
 * Decodes one JetStream message into the shape a projector wants.
 *
 * Returns null for a payload that is not JSON rather than throwing: a
 * malformed message must not take the consumer down, and the caller
 * terminates it (acks it) so it does not redeliver forever.
 */
export function decodeEvent(subject: string, data: Uint8Array, seq: number): { subject: string; payload: Record<string, any>; seq: number } | null {
  try {
    const payload = JSON.parse(new TextDecoder().decode(data));
    if (!payload || typeof payload !== 'object') return null;
    return { subject, payload, seq };
  } catch {
    return null;
  }
}
