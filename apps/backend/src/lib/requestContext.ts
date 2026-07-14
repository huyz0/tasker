import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
  userId?: string | null;
}

// Backs logger.ts's `mixin` so every log line emitted anywhere during a
// request's execution - not just the request-logging interceptor's own
// begin/end lines - automatically carries requestId/userId, without every
// call site having to thread them through manually.
export const requestContextStore = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return requestContextStore.run(context, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return requestContextStore.getStore();
}
