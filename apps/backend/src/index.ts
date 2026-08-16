import { connectNodeAdapter } from "@connectrpc/connect-node";
import * as http from "node:http";
import { HealthService, TaskTypeService, AuthService, OrgService, ProjectTemplateService, ProjectService, TaskService, AgentService, ArtifactService, CommentService, TaskNoteService, LabelService, RepositoryService, SearchService, DashboardService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import type { Interceptor } from "@connectrpc/connect";
import { createHealthHandler } from "./modules/health/health.handler";
import { createAuthHandler } from "./modules/auth/auth.handler";
import { createAuthRoutes } from "./modules/auth/auth";
import { currentUserIdKey, currentPrincipalKey } from "./modules/auth/session";
import { resolvePrincipal } from "./lib/authenticate";
import { createRateLimiter, rateLimitProblem } from "./lib/rateLimit";
import { createLoginRateLimiter } from "./lib/loginRateLimiter";
import { parseBearerToken } from "./modules/auth/session";
import { isAgentToken, hashToken } from "./lib/agentToken";
import { createOrgsHandler } from "./modules/orgs/orgs.handler";
import { createProjectTemplatesHandler, createProjectsHandler } from "./modules/projects/projects.handler";
import { createTasksHandler, createTaskManagementHandler } from "./modules/tasks/tasks.handler";
import { createTaskNotesHandler } from "./modules/tasks/task_notes.handler";
import { createAgentsHandler } from "./modules/agents/agents.handler";
import { createArtifactsHandler } from "./modules/artifacts/artifacts.handler";
import { createCommentsHandler } from "./modules/comments/comments.handler";
import { createLabelsHandler } from "./modules/labels/labels.handler";
import { createRepositoriesHandler } from "./modules/repositories/repositories.handler";
import createSearchHandler from "./modules/search/search.handler";
import createDashboardHandler from "./modules/dashboard/dashboard.handler";
import { setupDatabase } from "./db/db";
import { connect as natsConnect } from "nats";
import { logger } from "./lib/logger";
import { requestLoggingInterceptor } from "./lib/requestLogging";
import { reportError } from "./lib/errorReporter";
import { runRetentionSweep } from "./lib/retentionSweep";
import { config } from "./config";
import { withRequestCorrelation } from "./lib/natsCorrelation";
import { getRpcMethodStats } from "./lib/rpcMetrics";
import { getBusinessEventCounts } from "./lib/businessEvents";
import { recordHttpRequest } from "./lib/httpMetrics";
import { createTelemetryRoutes } from "./modules/telemetry/telemetry";

// Bypassing network stack with local function execution logic
export const localInProcessTransportRouter = (_req: any) => {
   return { status: 200, message: "in-process override active" };
};

const isStandalone = process.env.STANDALONE === "true";
const db = await setupDatabase(isStandalone ? "sqlite" : "mysql");

process.on("uncaughtException", (err) => {
  reportError({ message: "uncaughtException", err, severity: "fatal" });
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  reportError({ message: "unhandledRejection", err: reason, severity: "error" });
});

let nc: any = null;
try {
  nc = withRequestCorrelation(await natsConnect({ servers: process.env.NATS_URL || "nats://localhost:4222" }));
} catch (e) {
  logger.error({ err: e, natsUrl: process.env.NATS_URL || "nats://localhost:4222" }, "nats.connect_failed");
}

const sessionInterceptor: Interceptor = (next) => async (req) => {
  // The decision about who the caller is lives in lib/authenticate.ts, not
  // here: this file is excluded from coverage, and authentication is the last
  // thing that should be untestable.
  const principal = await resolvePrincipal(db, {
    cookie: req.header.get("cookie"),
    authorization: req.header.get("authorization"),
  });
  req.contextValues.set(currentPrincipalKey, principal);
  // Still set for the human path: logging, telemetry and every handler that
  // has not been migrated to requirePrincipal read this key. An agent leaves it
  // null, which is what makes requireUser refuse a token by default.
  req.contextValues.set(currentUserIdKey, principal?.kind === "user" ? principal.userId : null);
  return next(req);
};

// Per-token throttling (ADR-0008 §5). This runs on the raw request, ahead of
// the Connect adapter, so the refusal can be a real 429 with RFC 7807 problem
// details and a Retry-After header - ConnectRPC has its own error envelope and
// lib/problemDetails.ts is explicitly not for RPC endpoints. Throttling is a
// transport concern, answered at the transport.
const agentRateLimiter = createRateLimiter({
  capacity: config.agentRateLimitBurst,
  windowMs: config.agentRateLimitWindowMs,
});

/**
 * Identifies the credential to throttle, without a database round trip.
 *
 * Keyed on the hash of the presented token rather than the token id, because
 * resolving an id means the lookup this is meant to protect. Hashing is the
 * same digest the store uses, so the key is stable per credential and the
 * plaintext never reaches the map.
 *
 * Returns null for anything that is not an agent token: human sessions are not
 * throttled here. Browser traffic is bounded by a person's hands, and the
 * milestone's criterion is about tokens.
 */
function rateLimitKey(authorization: string | null): string | null {
  const bearer = parseBearerToken(authorization);
  return isAgentToken(bearer) ? hashToken(bearer!) : null;
}

// M13-T07. Per-source-IP throttle on the password login/register routes -
// see lib/loginRateLimiter.ts for why this is a second, separately-keyed
// limiter rather than reusing agentRateLimiter above (no credential exists
// yet to key on) and how it complements the per-account lockout inside
// auth.ts. Runs ahead of authRoutes for the same reason the agent limiter
// runs ahead of the Connect adapter: a real 429 with Retry-After, which
// problemDetails (used inside authRoutes) already produces the same shape
// for, so this reuses rateLimitProblem rather than a bespoke response.
const loginRateLimiter = createLoginRateLimiter();

const authRoutes = createAuthRoutes(db);
const telemetryRoutes = createTelemetryRoutes(db);

const handler = connectNodeAdapter({
  interceptors: [requestLoggingInterceptor, sessionInterceptor],
  routes: (router) => {
    router.service(HealthService as any, createHealthHandler(db, nc));
    router.service(TaskTypeService as any, createTasksHandler(db, nc));
    router.service(AuthService as any, createAuthHandler(db));
    router.service(OrgService as any, createOrgsHandler(db, nc));
    router.service(ProjectTemplateService as any, createProjectTemplatesHandler(db, nc));
    router.service(ProjectService as any, createProjectsHandler(db, nc));
    router.service(TaskService as any, createTaskManagementHandler(db, nc));
    router.service(AgentService as any, createAgentsHandler(db, nc));
    router.service(ArtifactService as any, createArtifactsHandler(db, nc));
    router.service(CommentService as any, createCommentsHandler(db, nc));
    router.service(TaskNoteService as any, createTaskNotesHandler(db, nc));
    router.service(LabelService as any, createLabelsHandler(db, nc));
    router.service(RepositoryService as any, createRepositoriesHandler(db, nc));
    createSearchHandler(router, db);
    createDashboardHandler(router, db);
  },
});

http.createServer(async (req, res) => {
  // Access-Control-Allow-Credentials: true means any origin this reflects
  // back can read authenticated responses using a visitor's session
  // cookie - only ever echo an Origin that's on the configured allowlist,
  // never mirror an arbitrary caller-supplied Origin.
  const origin = req.headers.origin;
  if (origin && config.corsAllowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Connect-Protocol-Version, X-Request-Id");
  res.setHeader("Access-Control-Expose-Headers", "X-Request-Id");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const limitKey = rateLimitKey(req.headers.authorization ?? null);
  if (limitKey) {
    const decision = agentRateLimiter.check(limitKey);
    if (!decision.allowed) {
      const problem = rateLimitProblem(decision.retryAfterSeconds);
      res.writeHead(problem.status, problem.headers);
      res.end(problem.body);
      return;
    }
  }

  // M13-T07. Keyed on the direct peer address (`req.socket.remoteAddress`),
  // not an X-Forwarded-For header: nothing in this deployment's config names
  // a trusted reverse proxy, and trusting a caller-supplied header for a
  // rate-limit key would let a single attacker present a different value on
  // every request and never share a bucket. Same per-instance caveat as
  // agentRateLimiter above (M11 owns multi-instance deployment).
  if (req.url?.startsWith("/api/auth/password/")) {
    const decision = loginRateLimiter.check(req.socket.remoteAddress || "unknown");
    if (!decision.allowed) {
      const problem = rateLimitProblem(decision.retryAfterSeconds);
      res.writeHead(problem.status, problem.headers);
      res.end(problem.body);
      return;
    }
  }

  if (req.url?.startsWith("/api/auth/") || req.url?.startsWith("/api/client-errors") || req.url?.startsWith("/api/debug/")) {
    const url = `http://${req.headers.host}${req.url}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      for (const v of Array.isArray(value) ? value : [value]) headers.append(key, v);
    }

    // Caps how much of a request body gets buffered into memory before any
    // route-level validation runs - without this, a client posting an
    // arbitrarily large body (e.g. to /api/client-errors) gets fully
    // buffered via Buffer.concat regardless of what the handler eventually
    // does with it, which is an unbounded-memory footgun on its own.
    const MAX_BODY_BYTES = 256 * 1024;
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const chunk of req) {
      totalBytes += (chunk as Buffer).length;
      if (totalBytes > MAX_BODY_BYTES) {
        res.writeHead(413, { "Content-Type": "application/problem+json" });
        res.end(JSON.stringify({ type: "about:blank", title: "Payload too large", status: 413 }));
        return;
      }
      chunks.push(chunk as Buffer);
    }
    const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

    const routes = req.url.startsWith("/api/auth/") ? authRoutes : telemetryRoutes;
    const routeResponse = await routes.handle(new Request(url, { method: req.method, headers, body }));
    recordHttpRequest(req.method || "GET", req.url.split("?")[0]!, routeResponse.status);
    res.writeHead(routeResponse.status, Object.fromEntries(routeResponse.headers.entries()));
    res.end(await routeResponse.text());
    return;
  }

  if (req.method === "GET" && !req.url?.startsWith("/tasker.")) {
      if (req.url === "/" || req.url === "/index.html") {
         res.writeHead(200, { "Content-Type": "text/html" });
         res.end("<html><body><h1>Tasker Standalone Server</h1><p>Embedded Vite SPA Assets active.</p></body></html>");
         return;
      }
  }

  handler(req, res);
}).listen(8080, () => {
  logger.info({ port: 8080 }, "backend.listening");
});

const RETENTION_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
setInterval(() => {
  runRetentionSweep(db).catch((err) => reportError({ message: "retention_sweep.failed", err, severity: "error" }));
}, RETENTION_SWEEP_INTERVAL_MS);

// Periodic latency summary, so "is this endpoint slow" is answerable from
// the log stream without a separate metrics backend.
const METRICS_LOG_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  const stats = getRpcMethodStats();
  if (stats.length > 0) logger.info({ rpcMethodStats: stats }, "rpc.latency_summary");

  const eventCounts = getBusinessEventCounts();
  if (Object.keys(eventCounts).length > 0) logger.info({ eventCounts }, "business_events.summary");
}, METRICS_LOG_INTERVAL_MS);
