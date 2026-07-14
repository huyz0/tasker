import { Elysia } from 'elysia';
import { reportError } from '../../lib/errorReporter';

// Caps how much of a client-supplied error report gets logged, so a
// misbehaving/malicious client can't use this endpoint to write unbounded
// data into the log stream.
const MAX_MESSAGE_LENGTH = 2000;
const MAX_CONTEXT_JSON_LENGTH = 4000;

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) + '...(truncated)' : value;
}

export function createTelemetryRoutes() {
  return new Elysia()
    // Client-side JS errors (window.onerror, unhandled rejections, React
    // error boundaries) previously only ever reached the browser console -
    // if a user reported "the GUI broke," there was no server-side record
    // unless they pasted devtools output. This gives them a home in the
    // same structured log stream as backend errors.
    .post('/api/client-errors', async ({ body, set }) => {
      const payload = body as any;
      if (!payload || typeof payload.message !== 'string' || !payload.message.trim()) {
        set.status = 400;
        return { error: 'message is required' };
      }
      const severity = payload.severity === 'fatal' ? 'fatal' : 'error';

      let contextJson: string | undefined;
      if (payload.context && typeof payload.context === 'object') {
        try {
          contextJson = truncate(JSON.stringify(payload.context), MAX_CONTEXT_JSON_LENGTH);
        } catch {
          contextJson = undefined;
        }
      }

      reportError({
        message: `client: ${truncate(String(payload.message), MAX_MESSAGE_LENGTH)}`,
        severity,
        context: {
          source: 'client',
          ...(payload.errName ? { clientErrorName: truncate(String(payload.errName), 200) } : {}),
          ...(payload.errStack ? { clientErrorStack: truncate(String(payload.errStack), MAX_MESSAGE_LENGTH) } : {}),
          ...(contextJson ? { clientContext: contextJson } : {}),
        },
      });

      set.status = 204;
      return null;
    });
}
