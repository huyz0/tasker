import { BACKEND_URL } from './backendUrl';

export interface ReportedError {
  message: string;
  err?: unknown;
  severity: 'error' | 'fatal';
  context?: Record<string, unknown>;
}

export interface ErrorReporter {
  report(event: ReportedError): void;
}

// Default sink: console, in the same shape the backend uses. Swap the
// active reporter to point at a real sink (e.g. posting to a logging
// endpoint that forwards into ELK/Splunk) without touching call sites.
export class ConsoleErrorReporter implements ErrorReporter {
  report(event: ReportedError) {
    console.error(`[${event.severity}] ${event.message}`, event.err, event.context);
  }
}

// Client-side errors previously only ever reached the browser console - if
// a user reported "the GUI broke," there was no server-side record unless
// they pasted devtools output themselves. This still logs to console (so
// local dev behavior is unchanged) but also best-effort ships the report
// to the backend's /api/client-errors endpoint, where it lands in the same
// structured log stream as backend errors. Failures to ship are swallowed
// - error reporting itself must never throw or block the caller.
export class RemoteErrorReporter implements ErrorReporter {
  report(event: ReportedError) {
    console.error(`[${event.severity}] ${event.message}`, event.err, event.context);

    const err = event.err instanceof Error ? event.err : undefined;
    const body = JSON.stringify({
      message: event.message,
      severity: event.severity,
      errName: err?.name,
      errStack: err?.stack,
      context: event.context,
    });

    fetch(`${BACKEND_URL}/api/client-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      // Swallow - if the backend is unreachable, the console.error above is
      // still the fallback record.
    });
  }
}

let activeReporter: ErrorReporter = new RemoteErrorReporter();

export function setErrorReporter(reporter: ErrorReporter) {
  activeReporter = reporter;
}

export function reportError(event: ReportedError) {
  activeReporter.report(event);
}
