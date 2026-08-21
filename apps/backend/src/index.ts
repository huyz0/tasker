import { connectNodeAdapter } from "@connectrpc/connect-node";
import * as http from "node:http";
import { HealthService, TaskTypeService, AuthService, OrgService, ProjectTemplateService, ProjectService, TaskService, AgentService, ArtifactService, CommentService, TaskNoteService, LabelService, RepositoryService, SearchService, DashboardService, TeamService, RoleService, MemoryService, AuditService, EventService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import type { Interceptor } from "@connectrpc/connect";
import { createHealthHandler } from "./modules/health/health.handler";
import { createAuthHandler } from "./modules/auth/auth.handler";
import { createAuthRoutes } from "./modules/auth/auth";
import { currentUserIdKey, currentPrincipalKey } from "./modules/auth/session";
import { resolvePrincipal } from "./lib/authenticate";
import { setRequestActor } from "./lib/requestContext";
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
import { createTeamsHandler } from "./modules/teams/teams.handler";
import { createRolesHandler } from "./modules/roles/roles.handler";
import { createMemoryHandler } from "./modules/memory/memory.handler";
import { createAuditHandler } from "./modules/audit/audit.handler";
import { createEventsHandler } from "./modules/events/events.handler";
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
import { StaticSite } from "./lib/staticServer";
import guiBundle from "./assets/guiBundle.json";
import { resolveRuntimeOptions, CliError, HELP_TEXT } from "./lib/cliFlags";
import { openBrowser } from "./lib/openBrowser";
import { initTelemetry, readTelemetryConfig, shutdownTelemetry } from "./lib/telemetry/otel";
import { tracingInterceptor } from "./lib/telemetry/tracingInterceptor";
import { buildMetricFamilies, renderMetrics, PROMETHEUS_CONTENT_TYPE } from "./lib/prometheus";
import { Lifecycle, DEFAULT_PRE_DRAIN_DELAY_MS, DEFAULT_DRAIN_TIMEOUT_MS } from "./lib/lifecycle";
import { getHttpRequestCounts } from "./lib/httpMetrics";

const isStandalone = process.env.STANDALONE === "true";

// M09-T05. Parsed before anything else opens a file or a socket, so `--help`
// on a machine with no write permission still prints help rather than failing
// to create `.data/`.
const cliArgs = process.argv.slice(2);
if (cliArgs.includes("-h") || cliArgs.includes("--help")) {
  console.log(HELP_TEXT);
  process.exit(0);
}
if (cliArgs.includes("-v") || cliArgs.includes("--version")) {
  console.log(process.env.GIT_SHA || "dev");
  process.exit(0);
}

let runtime;
try {
  runtime = resolveRuntimeOptions(cliArgs, process.env);
} catch (err) {
  // A usage mistake is not a crash: one line saying what is wrong, and the
  // help text, rather than a stack trace from deep inside Zod.
  console.error(err instanceof CliError ? `tasker: ${err.message}` : err);
  console.error(`\n${HELP_TEXT}`);
  process.exit(2);
}

// Decoded once, at startup. Empty unless `bun run build:standalone` filled the
// manifest in, which is what makes `moon run dev` behave exactly as it did
// before this existed: Vite serves the GUI there, and this serves nothing.
const staticSite = new StaticSite(guiBundle as Record<string, string>);

// M11-T01. Before the database, so a slow migration is inside a span rather
// than before tracing exists. With no OTLP endpoint configured this creates no
// exporter and opens no connection — the standalone binary's promise.
initTelemetry(readTelemetryConfig(process.env));

// M11-T08. Requests are counted through this so a drain knows what is still
// running, and readiness/liveness answer from it.
const lifecycle = new Lifecycle();
const startedAt = Date.now();
const db = await setupDatabase(isStandalone ? "sqlite" : "mysql", runtime.dbPath);

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
  // M08-T04: record the acting principal on the request context so every
  // domain event published during this request carries it, without any
  // handler having to remember to attach it.
  if (principal) {
    setRequestActor(
      principal.kind === "agent"
        ? { kind: "agent", agentId: principal.agentId }
        : { kind: "user", userId: principal.userId },
    );
  }
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

const authRoutes = createAuthRoutes(db, { seedStarterWorkspace: isStandalone && runtime.seed });
const telemetryRoutes = createTelemetryRoutes(db);

const handler = connectNodeAdapter({
  // Tracing first, so the span covers authentication and the request-context
  // setup rather than starting after them — "why was this slow" has a
  // credential lookup in it often enough to matter.
  interceptors: [tracingInterceptor, requestLoggingInterceptor, sessionInterceptor],
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
    router.service(TeamService as any, createTeamsHandler(db, nc));
    router.service(RoleService as any, createRolesHandler(db, nc));
    router.service(MemoryService as any, createMemoryHandler(db, nc));
    router.service(AuditService as any, createAuditHandler(db));
    router.service(EventService as any, createEventsHandler(db, nc));
    router.service(RepositoryService as any, createRepositoriesHandler(db, nc));
    createSearchHandler(router, db);
    createDashboardHandler(router, db);
  },
});

const server = http.createServer(async (req, res) => {
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

  // M11-T05/T08. Ahead of everything else, and unauthenticated: a probe runs
  // before the process is ready and a scraper has no session. Nothing here
  // touches the database or names a tenant.
  const probePath = (req.url ?? "/").split("?")[0];
  if (req.method === "GET" && (probePath === "/healthz" || probePath === "/readyz" || probePath === "/metrics")) {
    if (probePath === "/healthz") {
      // Liveness must not depend on anything external: a database outage that
      // fails liveness turns one outage into a restart loop across every
      // replica.
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "live", uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000) }));
      return;
    }
    if (probePath === "/readyz") {
      const report = lifecycle.readiness();
      res.writeHead(report.ready ? 200 : 503, { "Content-Type": "application/json" });
      res.end(JSON.stringify(report));
      return;
    }
    // Optional bearer gate (M11-T10). Open by default, because the common
    // deployment is a scraper on a private network and a token there is
    // ceremony. Set METRICS_TOKEN wherever `/metrics` is reachable from
    // somewhere it should not be — the counters name every route and RPC
    // method this service has, which is an inventory worth not publishing
    // even though it contains no tenant data.
    const metricsToken = process.env.METRICS_TOKEN;
    if (metricsToken && req.headers.authorization !== `Bearer ${metricsToken}`) {
      res.writeHead(401, { "Content-Type": "application/problem+json" });
      res.end(JSON.stringify({ type: "about:blank", title: "Unauthorized", status: 401 }));
      return;
    }
    res.writeHead(200, { "Content-Type": PROMETHEUS_CONTENT_TYPE });
    res.end(
      renderMetrics(
        buildMetricFamilies({
          rpc: getRpcMethodStats(),
          http: getHttpRequestCounts(),
          businessEvents: getBusinessEventCounts(),
          uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        }),
      ),
    );
    return;
  }

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

  // The GUI, out of the binary (M09-T03). Empty in dev, where Vite serves it,
  // so this falls straight through to the RPC handler exactly as before.
  if (req.method === "GET" || req.method === "HEAD") {
    const pathname = (req.url ?? "/").split("?")[0]!;
    const asset = staticSite.resolve(pathname);
    if (asset) {
      recordHttpRequest(req.method, pathname, 200);
      res.writeHead(200, {
        "Content-Type": asset.contentType,
        "Cache-Control": asset.cacheControl,
        "Content-Length": String(asset.body.byteLength),
      });
      res.end(req.method === "HEAD" ? undefined : Buffer.from(asset.body));
      return;
    }
  }

  // Counted, so a drain knows what is still running. Deliberately awaits only
  // the adapter's own handling: a streaming response stays open for as long as
  // the tab is open, and waiting for those would make every deploy sit out the
  // full drain timeout.
  await lifecycle.track(async () => handler(req, res));
});

server.listen(runtime.port, () => {
  lifecycle.markReady();
  logger.info({ port: runtime.port, dbPath: isStandalone ? runtime.dbPath : undefined }, "backend.listening");
  if (runtime.open) openBrowser(`http://localhost:${runtime.port}`);
});

/**
 * Graceful shutdown (M11-T08).
 *
 * The order is the point. Stop reporting ready first, so the load balancer
 * stops sending new work; wait a beat, because it notices on its own schedule
 * and requests already routed here are still arriving; then drain what is in
 * flight; only then close the broker connection and flush spans.
 *
 * Closing NATS before the drain would make in-flight mutations publish into a
 * closed connection — the request succeeds and its event vanishes, which is
 * the failure mode this ordering exists to avoid.
 */
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal, inFlight: lifecycle.inFlightCount }, "backend.shutdown_started");

  // `drain()` flips the state to draining immediately — that is what makes
  // /readyz start answering 503 — and the promise it returns settles when the
  // last in-flight request finishes. The delay runs *alongside* it, not
  // before, so the two overlap rather than adding up.
  const draining = lifecycle.drain(Number(process.env.SHUTDOWN_DRAIN_TIMEOUT_MS ?? DEFAULT_DRAIN_TIMEOUT_MS));
  const preDrainMs = Number(process.env.SHUTDOWN_PRE_DRAIN_MS ?? DEFAULT_PRE_DRAIN_DELAY_MS);
  if (preDrainMs > 0) await new Promise((resolve) => setTimeout(resolve, preDrainMs));
  const outcome = await draining;

  server.close();
  try {
    if (nc && !nc.isClosed?.()) await nc.drain();
  } catch (err) {
    logger.warn({ err }, "backend.nats_drain_failed");
  }
  await shutdownTelemetry();

  logger.info({ signal, outcome }, "backend.shutdown_complete");
  process.exit(outcome === "timed-out" ? 1 : 0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

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
