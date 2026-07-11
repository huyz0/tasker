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

let activeReporter: ErrorReporter = new ConsoleErrorReporter();

export function setErrorReporter(reporter: ErrorReporter) {
  activeReporter = reporter;
}

export function reportError(event: ReportedError) {
  activeReporter.report(event);
}
