import { createContextKey, type Interceptor } from '@connectrpc/connect';
import { logger } from './logger';
import { reportError } from './errorReporter';
import { runWithRequestContext } from './requestContext';
import { resolveSessionUserId } from '../modules/auth/session';

export const requestIdKey = createContextKey<string>('');

export const requestLoggingInterceptor: Interceptor = (next) => async (req) => {
  const requestId = req.header.get('x-request-id') || crypto.randomUUID();
  req.contextValues.set(requestIdKey, requestId);

  const service = req.method.parent.typeName;
  const method = req.method.name;
  const start = Date.now();

  // Resolved here (not just left to sessionInterceptor downstream) so it
  // can be bound into the AsyncLocalStorage context that logger.ts's mixin
  // reads from - every log line during this request, not just this
  // interceptor's own begin/end lines, then carries userId automatically.
  const userId = resolveSessionUserId({
    cookie: req.header.get('cookie'),
    authorization: req.header.get('authorization'),
  });

  return runWithRequestContext({ requestId, userId }, async () => {
    try {
      const res = await next(req);
      logger.info({ requestId, service, method, durationMs: Date.now() - start }, 'rpc.ok');
      if (!res.stream) {
        res.header.set('x-request-id', requestId);
      }
      return res;
    } catch (err) {
      reportError({
        message: 'rpc.error',
        err,
        severity: 'error',
        context: { requestId, service, method, durationMs: Date.now() - start },
      });
      throw err;
    }
  });
};
