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

// Default sink: structured JSON via the existing logger. Since the log
// output is already JSON, pointing this at ELK/Splunk later is a log
// shipping concern (e.g. Filebeat/a Splunk forwarder reading stdout), not
// a rewrite of call sites - swap the reporter implementation if a push-
// based sink (e.g. Splunk HEC) is ever needed instead.
export class LoggerErrorReporter implements ErrorReporter {
  report(event: ErrorEvent) {
    const log = event.severity === 'fatal' ? logger.fatal.bind(logger) : logger.error.bind(logger);
    log({ err: event.err, ...event.context }, event.message);
  }
}

let activeReporter: ErrorReporter = new LoggerErrorReporter();

export function setErrorReporter(reporter: ErrorReporter) {
  activeReporter = reporter;
}

export function reportError(event: ErrorEvent) {
  activeReporter.report(event);
}
