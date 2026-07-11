import { connectNodeAdapter } from "@connectrpc/connect-node";
import * as http from "node:http";
import { HealthService, TaskTypeService, AuthService, OrgService, ProjectTemplateService, ProjectService, TaskService, AgentService, ArtifactService, CommentService, TaskNoteService, LabelService, RepositoryService, SearchService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import type { Interceptor } from "@connectrpc/connect";
import { createHealthHandler } from "./modules/health/health.handler";
import { createAuthHandler } from "./modules/auth/auth.handler";
import { authRoutes } from "./modules/auth/auth";
import { currentUserIdKey, parseSessionCookie, verifySessionToken } from "./modules/auth/session";
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
import { setupDatabase } from "./db/db";
import { connect as natsConnect } from "nats";
import { logger } from "./lib/logger";
import { requestLoggingInterceptor } from "./lib/requestLogging";
import { reportError } from "./lib/errorReporter";
import { runRetentionSweep } from "./lib/retentionSweep";

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
  nc = await natsConnect({ servers: process.env.NATS_URL || "nats://localhost:4222" });
} catch (e) {
  logger.error({ err: e, natsUrl: process.env.NATS_URL || "nats://localhost:4222" }, "nats.connect_failed");
}

const sessionInterceptor: Interceptor = (next) => async (req) => {
  const token = parseSessionCookie(req.header.get("cookie"));
  const session = token ? verifySessionToken(token) : null;
  req.contextValues.set(currentUserIdKey, session?.userId ?? null);
  return next(req);
};

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
  },
});

http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Connect-Protocol-Version, X-Request-Id");
  res.setHeader("Access-Control-Expose-Headers", "X-Request-Id");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url?.startsWith("/api/auth/")) {
    const url = `http://${req.headers.host}${req.url}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      for (const v of Array.isArray(value) ? value : [value]) headers.append(key, v);
    }
    const authResponse = await authRoutes.handle(new Request(url, { method: req.method, headers }));
    res.writeHead(authResponse.status, Object.fromEntries(authResponse.headers.entries()));
    res.end(await authResponse.text());
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
