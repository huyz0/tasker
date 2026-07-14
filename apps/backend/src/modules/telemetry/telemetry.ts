import { Elysia } from 'elysia';
import { ConnectError, Code } from '@connectrpc/connect';
import { reportError } from '../../lib/errorReporter';
import { problemDetails } from '../../lib/problemDetails';
import { getRecentErrors } from '../../lib/errorRingBuffer';
import { resolveSessionUserId } from '../auth/session';
import { assertOrgAdminOfAny } from '../../lib/authz';
import { config } from '../../config';

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
    });
}
