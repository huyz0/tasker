/**
 * The consumer process (M08-T02).
 *
 * A separate entrypoint from `src/index.ts`, not a background task inside the
 * API server. Two reasons: the API scales on request volume while the
 * projector scales on event volume, and an API restart during a deploy must
 * not drop a partly-processed batch. Run with `moon run backend:consumer`.
 *
 * Excluded from coverage like the API entrypoint, and for the same reason —
 * everything worth asserting lives in `stream.ts` and the projector modules,
 * which are testable without a broker. What is left here is process wiring.
 */
import { connect as natsConnect, type NatsConnection } from 'nats';
import { logger } from '../lib/logger';
import { reportError } from '../lib/errorReporter';
import { ensureStreamAndConsumer, decodeEvent, STREAM_NAME, DURABLE_NAME } from './stream';
import { projectEvent } from './auditProjector';
import { setupDatabase } from '../db/db';
import { initTelemetry, readTelemetryConfig, shutdownTelemetry, getTracer, withExtractedContext, failSpan } from '../lib/telemetry/otel';
import { SpanKind } from '@opentelemetry/api';

const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222';

let nc: NatsConnection | null = null;
let shuttingDown = false;

/**
 * Drains rather than closes. `drain()` finishes delivering and acknowledging
 * what is already in flight before tearing the connection down; `close()`
 * would abandon it, and an unacknowledged message is redelivered — turning
 * every ordinary deploy into duplicate audit rows.
 */
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'consumer.shutdown_started');
  try {
    if (nc) await nc.drain();
    // After the drain, so spans for messages finished during it are flushed.
    await shutdownTelemetry();
    logger.info({ signal }, 'consumer.shutdown_complete');
    process.exit(0);
  } catch (err) {
    reportError({ message: 'consumer.shutdown_failed', err, severity: 'error' });
    process.exit(1);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  reportError({ message: 'consumer.uncaughtException', err, severity: 'fatal' });
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  reportError({ message: 'consumer.unhandledRejection', err: reason, severity: 'error' });
});

async function main(): Promise<void> {
  // M11-T01/T03. Named separately from the API so a trace shows which process
  // did what; with no OTLP endpoint configured this creates no exporter and
  // opens no connection, exactly as in the API.
  initTelemetry({ ...readTelemetryConfig(process.env), serviceName: process.env.OTEL_SERVICE_NAME || 'tasker-consumer' });

  try {
    nc = await natsConnect({ servers: NATS_URL });
  } catch (err) {
    // Fail loudly. Unlike the API server — which degrades to "no events
    // published" and still serves requests — a consumer that cannot reach the
    // broker has no reason to be running, and exiting lets a supervisor
    // restart it once the broker is back.
    reportError({ message: 'consumer.nats_connect_failed', err, severity: 'fatal' });
    process.exit(1);
  }

  logger.info({ natsUrl: NATS_URL }, 'consumer.connected');

  // The projector's own connection. The consumer is a separate process from
  // the API, so it opens its own rather than sharing one.
  //
  // `setupDatabase` takes the driver as an argument and defaults to mysql —
  // it does not read STANDALONE itself — so the consumer has to make the same
  // choice src/index.ts does, or it silently writes to the wrong database.
  const db = await setupDatabase(process.env.STANDALONE === 'true' ? 'sqlite' : 'mysql');

  const jsm = await nc.jetstreamManager();
  const setup = await ensureStreamAndConsumer(jsm);
  logger.info(
    // `setup` carries its own `stream` key (the create/update status), so
    // spreading it after `stream: STREAM_NAME` would overwrite the name
    // with the status and the log line would misreport which stream.
    { stream: STREAM_NAME, durable: DURABLE_NAME, streamAction: setup.stream, consumerAction: setup.consumer },
    'consumer.stream_ready',
  );

  const js = nc.jetstream();
  const consumer = await js.consumers.get(STREAM_NAME, DURABLE_NAME);
  const messages = await consumer.consume();

  logger.info({ stream: STREAM_NAME, durable: DURABLE_NAME }, 'consumer.listening');

  for await (const msg of messages) {
    const event = decodeEvent(msg.subject, msg.data, msg.seq);
    if (!event) {
      // Undecodable: acknowledge so it does not redeliver forever, but say so
      // — silently dropping a malformed event is how a gap in an audit trail
      // becomes invisible.
      logger.warn({ subject: msg.subject, seq: msg.seq }, 'consumer.undecodable_event');
      msg.ack();
      continue;
    }

    // M11-T03. The mutation that published this event injected a
    // `traceparent` into the payload, so the projection continues that trace
    // rather than starting one of its own — which is the whole point of
    // tracing across an asynchronous hop. An event published before this
    // existed, or by something that does not propagate, simply starts a new
    // trace here.
    await withExtractedContext(event.payload, () =>
      getTracer().startActiveSpan(
        `project ${event.subject}`,
        { kind: SpanKind.CONSUMER, attributes: { 'messaging.system': 'nats', 'messaging.destination.name': event.subject } },
        async (span) => {
          try {
            const outcome = await projectEvent(db, event);
            // Ack only after the write. Acking first would mean a crash between
            // the two loses the event permanently, which is the one thing an
            // audit trail may not do.
            msg.ack();
            span.setAttribute('tasker.projection.outcome', outcome);
            logger.info(
              { subject: event.subject, seq: event.seq, requestId: event.payload.requestId, outcome },
              'consumer.event_projected',
            );
          } catch (err) {
            // Do not ack: let ack_wait expire so JetStream redelivers, up to
            // max_deliver. A write that failed once often succeeds on retry,
            // and acking here would lose the event permanently.
            failSpan(span, err);
            reportError({ message: 'consumer.event_failed', err, severity: 'error' });
          } finally {
            span.end();
          }
        },
      ),
    );
  }
}

void main();
