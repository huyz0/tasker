import { connect as natsConnect, type ConnectionOptions, type NatsConnection } from 'nats';
import { ensureStream } from '../consumers/stream';
import { projectEvent } from '../consumers/auditProjector';
import { brokerEventReference, runDomainEventSweep, type EventSweepResult, type StoredDomainEvent } from './domainEventRelay';
import { logger } from './logger';

interface RuntimeOptions {
  url?: string;
  now?: () => number;
  intervalMs?: number;
  connect?: (options: ConnectionOptions) => Promise<NatsConnection>;
}

/** SQL remains authoritative through initial connection failure and reconnect.
 * Only acknowledged publication marks a broker-required source delivered. */
export function createDomainEventRuntime(db: any, standalone: boolean, options: RuntimeOptions = {}) {
  const abort = new AbortController();
  let nc: NatsConnection | null = null;
  let connecting: Promise<NatsConnection> | null = null;
  let provisioned: Promise<unknown> | null = null;
  let active: Promise<EventSweepResult> | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;

  async function connection(): Promise<NatsConnection> {
    if (nc && !nc.isClosed()) return nc;
    if (!connecting) {
      connecting = (options.connect ?? natsConnect)({
        servers: options.url || process.env.NATS_URL || 'nats://localhost:4222',
        timeout: 3000, maxReconnectAttempts: -1, reconnectTimeWait: 1000,
      }).then(value => {
        nc = value;
        provisioned = null;
        void value.closed?.().then(error => {
          if (nc === value) { nc = null; provisioned = null; }
          if (error) logger.warn({ err: error }, 'domain_events.broker_closed');
        });
        return value;
      }).finally(() => { connecting = null; });
    }
    return connecting;
  }

  async function publish(event: StoredDomainEvent): Promise<void> {
    const current = await connection();
    try {
      provisioned ??= current.jetstreamManager({ timeout: 5000 }).then(manager => ensureStream(manager));
      await provisioned;
      const encoded = Buffer.from(JSON.stringify(brokerEventReference(event)));
      if (encoded.byteLength > 16 * 1024) throw new Error('domain event reference metadata exceeds 16 KiB');
      await current.jetstream().publish(event.subject, encoded, { msgID: event.id, timeout: 5000 });
    } catch (error) {
      provisioned = null;
      throw error;
    }
  }

  function sweep(): Promise<EventSweepResult> {
    if (!active) {
      active = runDomainEventSweep(db, standalone, {
        now: options.now, signal: abort.signal, publish,
        projectLocally: event => projectEvent(db, { subject: event.subject, payload: JSON.parse(event.payload), seq: 0 }).then(() => {}),
        onError: (error, eventId) => logger.warn({ err: error, eventId }, 'domain_events.delivery_retry'),
      }).finally(() => { active = null; });
    }
    return active;
  }

  return {
    getConnection: () => nc,
    sweep,
    start() {
      if (timer || abort.signal.aborted) return;
      const run = () => {
        if (options.url || process.env.NATS_URL || !standalone) {
          void connection().catch(err => logger.warn({ err }, 'domain_events.broker_unavailable'));
        }
        void sweep().catch(err => logger.error({ err }, 'domain_events.sweep_failed'));
      };
      timer = setInterval(run, options.intervalMs ?? 1000);
      run();
    },
    stopLeasing() {
      abort.abort();
      if (timer) clearInterval(timer);
      timer = undefined;
    },
    async drain() { if (active) await active; },
    async close() {
      this.stopLeasing();
      await this.drain();
      if (connecting) await connecting.catch(() => {});
      if (nc && !nc.isClosed()) await nc.drain();
    },
  };
}
