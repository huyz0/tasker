import pino from 'pino';
import { getRequestContext } from './requestContext';
import { activeTraceIds } from './telemetry/otel';

const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info');

// Merges the active request's requestId/userId (if any) into every log
// line automatically, so a handler's own logger.info/error calls are
// correlated to their request without threading those fields through
// every call site by hand.
const mixin = () => {
  // M11-T04: the trace and span ids too, so a log line can be pasted into a
  // trace viewer and found. Read from the active span rather than the request
  // context, because the consumer process logs inside spans it continues from
  // an event and has no request context at all.
  const traceIds = activeTraceIds();
  const ctx = getRequestContext();
  if (!ctx) return traceIds ?? {};
  return {
    requestId: ctx.requestId,
    ...(ctx.userId ? { userId: ctx.userId } : {}),
    ...(traceIds ?? {}),
  };
};

// LOG_FILE is opt-in: without it, logs only go to stdout (the prior
// behavior) and are lost once the terminal/process log buffer scrolls or
// the process restarts. Setting it also writes every log line to that file
// in append mode, so history survives across restarts for later debugging.
const logFilePath = process.env.LOG_FILE;

export const logger = logFilePath
  ? pino({ level, mixin }, pino.multistream([
      { stream: process.stdout },
      { stream: pino.destination({ dest: logFilePath, mkdir: true, append: true }) },
    ]))
  : pino({ level, mixin });
