import { getRequestContext } from './requestContext';

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
