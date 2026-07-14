import { getRequestContext } from './requestContext';
import { recordBusinessEvent } from './businessEvents';

/**
 * Wraps a NATS connection so every domain.* event published during a
 * request automatically carries that request's requestId in its JSON
 * payload - without touching the ~50 call sites across every handler that
 * call nc.publish(subject, Buffer.from(JSON.stringify(payload))) directly.
 * Without this, a domain event handled asynchronously (e.g. by a future
 * consumer) has no way to be traced back to the request that caused it.
 */
export function withRequestCorrelation<T extends { publish: (subject: string, data?: any, opts?: any) => void }>(nc: T): T {
  return {
    ...nc,
    publish(subject: string, data?: any, opts?: any) {
      const ctx = getRequestContext();
      if (ctx && data) {
        try {
          const payload = JSON.parse(data.toString());
          if (payload && typeof payload === 'object' && !payload.requestId) {
            payload.requestId = ctx.requestId;
            data = Buffer.from(JSON.stringify(payload));
          }
        } catch {
          // Not JSON (or unparseable) - publish the original payload unchanged.
        }
      }
      return nc.publish(subject, data, opts);
    },
  };
}

/**
 * Publishes a domain.* event and records it in the in-memory business-event
 * counters (see businessEvents.ts), regardless of whether NATS is actually
 * connected. Handlers previously called `if (nc) nc.publish(...)` directly
 * at each of the ~30 domain-event call sites - that pattern skips the event
 * entirely when nc is null (the common case for local STANDALONE dev, which
 * runs without NATS), so counting only on that path would make business
 * event volume invisible in exactly the environment this is meant to help
 * debug in.
 */
export function publishDomainEvent(nc: { publish: (subject: string, data?: any) => void } | null, subject: string, payload: unknown): void {
  recordBusinessEvent(subject);
  if (nc) nc.publish(subject, Buffer.from(JSON.stringify(payload)));
}
