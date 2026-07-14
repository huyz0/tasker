import { Code } from '@connectrpc/connect';
import { logger } from './logger';

export interface ErrorEvent {
  message: string;
  err?: unknown;
  severity: 'error' | 'fatal';
  context?: Record<string, unknown>;
}

export interface ErrorReporter {
  report(event: ErrorEvent): void;
}

// ConnectError's numeric .code (e.g. 3) isn't part of pino's standard Error
// serialization, so it was only visible if it happened to appear in the
// message/stack string - not filterable as its own field. Extracting it
// (and its human-readable name, e.g. "invalid_argument") lets log queries
// answer "how many InvalidArgument errors this hour" without string
// matching against free-text messages.
function connectErrorFields(err: unknown): { errorCode?: number; errorCodeName?: string } {
  const code = (err as any)?.code;
  if (typeof code !== 'number' || !(code in Code)) return {};
  return { errorCode: code, errorCodeName: Code[code] };
}

// Default sink: structured JSON via the existing logger. Since the log
// output is already JSON, pointing this at ELK/Splunk later is a log
// shipping concern (e.g. Filebeat/a Splunk forwarder reading stdout), not
// a rewrite of call sites - swap the reporter implementation if a push-
// based sink (e.g. Splunk HEC) is ever needed instead.
export class LoggerErrorReporter implements ErrorReporter {
  report(event: ErrorEvent) {
    const log = event.severity === 'fatal' ? logger.fatal.bind(logger) : logger.error.bind(logger);
    log({ err: event.err, ...connectErrorFields(event.err), ...event.context }, event.message);
  }
}

let activeReporter: ErrorReporter = new LoggerErrorReporter();

export function setErrorReporter(reporter: ErrorReporter) {
  activeReporter = reporter;
}

export function reportError(event: ErrorEvent) {
  activeReporter.report(event);
}
