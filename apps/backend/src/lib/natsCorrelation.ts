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
  // A Proxy, not `{...nc, publish}`. Spreading copies own enumerable
  // properties only, so every method a NATS connection carries on its
  // prototype - isClosed, flush, drain, subscribe, jetstream - was silently
  // dropped, and the wrapper looked fine because `publish` was the one method
  // defined as an own property.
  //
  // Nothing caught it because nothing here had ever held a live connection:
  // with no broker in the local stack, `natsConnect` always failed and `nc`
  // stayed null, so the health probe short-circuited on `!nc` and never
  // reached `nc.isClosed()`. Adding the broker (M08-T01) made the wrapper
  // real for the first time and the probe started 500ing with
  // "nc.isClosed is not a function".
  //
  // The proxy forwards everything untouched except `publish`, and keeps
  // methods bound to the underlying connection so they still see its
  // internal state.
  return new Proxy(nc, {
    get(target, prop, receiver) {
      if (prop === 'publish') {
        return (subject: string, data?: any, opts?: any) => {
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
          return (target as any).publish(subject, data, opts);
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
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
