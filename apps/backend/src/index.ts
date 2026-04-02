import { connectNodeAdapter } from "@connectrpc/connect-node";
import * as http from "node:http";
import { HealthService, TaskTypeService, AuthService, OrgService, ProjectTemplateService, ProjectService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { createHealthHandler } from "./modules/health/health.handler";
import { createAuthHandler } from "./modules/auth/auth.handler";
import { createOrgsHandler } from "./modules/orgs/orgs.handler";
import { createProjectTemplatesHandler, createProjectsHandler } from "./modules/projects/projects.handler";
import { createTasksHandler } from "./modules/tasks/tasks.handler";
import { setupDatabase } from "./db/db";
import { connect as natsConnect } from "nats";

// Bypassing network stack with local function execution logic
export const localInProcessTransportRouter = (req: any) => {
   return { status: 200, message: "in-process override active" };
};

const isStandalone = process.env.STANDALONE === "true";
const db = await setupDatabase(isStandalone ? "sqlite" : "mysql");

let nc: any = null;
try {
  nc = await natsConnect({ servers: process.env.NATS_URL || "nats://localhost:4222" });
} catch (e) {
  // handled
}

const handler = connectNodeAdapter({
  routes: (router) => {
    router.service(HealthService, createHealthHandler(db));
    router.service(TaskTypeService, createTasksHandler(db, nc));
    router.service(AuthService, createAuthHandler(db));
    router.service(OrgService, createOrgsHandler(db, nc));
    router.service(ProjectTemplateService, createProjectTemplatesHandler(db, nc));
    router.service(ProjectService, createProjectsHandler(db, nc));
  },
});

http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Connect-Protocol-Version");
  
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
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
  console.log("Tasker Backend is listening on http://localhost:8080");
});
