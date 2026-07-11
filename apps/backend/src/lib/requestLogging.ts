import { createContextKey, type Interceptor } from '@connectrpc/connect';
import { logger } from './logger';

export const requestIdKey = createContextKey<string>('');

export const requestLoggingInterceptor: Interceptor = (next) => async (req) => {
  const requestId = req.header.get('x-request-id') || crypto.randomUUID();
  req.contextValues.set(requestIdKey, requestId);

  const service = req.method.parent.typeName;
  const method = req.method.name;
  const start = Date.now();

  try {
    const res = await next(req);
    logger.info({ requestId, service, method, durationMs: Date.now() - start }, 'rpc.ok');
    if (!res.stream) {
      res.header.set('x-request-id', requestId);
    }
    return res;
  } catch (err) {
    logger.error({ requestId, service, method, durationMs: Date.now() - start, err }, 'rpc.error');
    throw err;
  }
};
