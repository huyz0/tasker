import { Elysia } from 'elysia';
import { ConnectError, Code } from '@connectrpc/connect';
import { reportError } from '../../lib/errorReporter';
import { problemDetails } from '../../lib/problemDetails';
import { getRecentErrors } from '../../lib/errorRingBuffer';
import { resolveSessionUserId } from '../auth/session';
import { assertOrgAdminOfAny } from '../../lib/authz';
import { config } from '../../config';
import { logger } from '../../lib/logger';
import { getBusinessEventCounts } from '../../lib/businessEvents';
import { getRpcMethodStats } from '../../lib/rpcMetrics';
import { getHttpRequestCounts } from '../../lib/httpMetrics';

const VALID_LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];

// Caps how much of a client-supplied error report gets logged, so a
// misbehaving/malicious client can't use this endpoint to write unbounded
// data into the log stream.
const MAX_MESSAGE_LENGTH = 2000;
const MAX_CONTEXT_JSON_LENGTH = 4000;

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) + '...(truncated)' : value;
}

// Shared gate for the /api/debug/* endpoints: org-admin-of-any, same as
// other sensitive, non-org-scoped catalogs (assertOrgAdminOfAny). Returns
// a problem-details Response to short-circuit with, or null to proceed.
async function requireDebugAccess(db: any, request: Request): Promise<Response | null> {
  const userId = resolveSessionUserId({
    cookie: request.headers.get('cookie'),
    authorization: request.headers.get('authorization'),
  });
  if (!userId) return problemDetails(401, 'Authentication required');

  try {
    await assertOrgAdminOfAny(db, userId);
  } catch (e) {
    // Only a genuine "not an admin anywhere" result should read as 403 -
    // a transient failure (e.g. the DB being unreachable) must surface
    // as a real server error, not be misreported as a permissions
    // problem on the very endpoints meant to help diagnose outages.
    if (e instanceof ConnectError && e.code === Code.PermissionDenied) {
      return problemDetails(403, 'Admin role required in at least one organization');
    }
    reportError({ message: 'debug_endpoint.authz_check_failed', err: e, severity: 'error' });
    return problemDetails(500, 'Internal server error');
  }

  return null;
}

export function createTelemetryRoutes(db: any) {
  return new Elysia()
    // Client-side JS errors (window.onerror, unhandled rejections, React
    // error boundaries) previously only ever reached the browser console -
    // if a user reported "the GUI broke," there was no server-side record
    // unless they pasted devtools output. This gives them a home in the
    // same structured log stream as backend errors.
    .post('/api/client-errors', async ({ body, set }) => {
      const payload = body as any;
      if (!payload || typeof payload.message !== 'string' || !payload.message.trim()) {
        return problemDetails(400, 'Invalid client error report', 'message is required');
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
    })
    // "What broke recently" without log/file access - can surface error
    // messages/stack traces across the whole instance, not just the
    // caller's own org, so it's gated behind org-admin-of-any.
    .get('/api/debug/errors', async ({ request }) => {
      const denied = await requireDebugAccess(db, request);
      if (denied) return denied;

      return Response.json({ errors: getRecentErrors() });
    })
    // "What did this server actually resolve its config to" - useful when
    // debugging environment-dependent behavior (wrong CORS origin, test
    // login unexpectedly on/off) without shell access to the host. Secrets
    // (jwtSecret, appEncryptionSecret, googleClientSecret) are deliberately
    // excluded, not just redacted, so this can't leak them via a future
    // careless log/serialize of the response.
    .get('/api/debug/config', async ({ request }) => {
      const denied = await requireDebugAccess(db, request);
      if (denied) return denied;

      return Response.json({
        nodeEnv: config.nodeEnv,
        enableTestLogin: config.enableTestLogin,
        corsAllowedOrigins: config.corsAllowedOrigins,
        googleClientIdConfigured: !!config.googleClientId,
        googleRedirectUri: config.googleRedirectUri,
      });
    })
    // Chasing a bug that only reproduces intermittently in a live
    // environment often needs debug-level logs for a few minutes, not a
    // permanent LOG_LEVEL change that requires a restart (and would then
    // need reverting). This flips pino's level in place - takes effect on
    // the very next log call, reverts just as easily.
    .post('/api/debug/log-level', async ({ request, body }) => {
      const denied = await requireDebugAccess(db, request);
      if (denied) return denied;

      const level = (body as any)?.level;
      if (typeof level !== 'string' || !VALID_LOG_LEVELS.includes(level)) {
        return problemDetails(400, 'Invalid log level', `level must be one of: ${VALID_LOG_LEVELS.join(', ')}`);
      }

      const previousLevel = logger.level;
      logger.level = level;
      return Response.json({ previousLevel, level });
    })
    // Volume visibility for real product activity (tasks created, projects
    // created, ...), not just raw RPC traffic - counts only confirmed
    // successful domain mutations (see publishDomainEvent in
    // natsCorrelation.ts), so a spike here means real usage, not just a lot
    // of failed/retried requests.
    .get('/api/debug/business-events', async ({ request }) => {
      const denied = await requireDebugAccess(db, request);
      if (denied) return denied;

      return Response.json({ eventCounts: getBusinessEventCounts() });
    })
    // A single lightweight snapshot of request volume - RPC calls by
    // method (with error counts and latency), and plain HTTP routes
    // (auth, client-errors, debug/*) by method/path/status. rpc.latency_summary
    // and this cover the same RPC data periodically in the log stream; this
    // endpoint is for pulling it on demand instead of waiting for the next
    // 5-minute log line, and adds the plain-HTTP-route counts that summary
    // doesn't include at all.
    .get('/api/debug/metrics', async ({ request }) => {
      const denied = await requireDebugAccess(db, request);
      if (denied) return denied;

      return Response.json({
        rpc: getRpcMethodStats(),
        http: getHttpRequestCounts(),
      });
    });
}
