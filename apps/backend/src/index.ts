import { connectNodeAdapter } from "@connectrpc/connect-node";
import * as http from "node:http";
import { HealthService, TaskTypeService, AuthService, OrgService, ProjectTemplateService, ProjectService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { healthHandler } from "./modules/health/health.handler";
import { authHandler } from "./modules/auth/auth.handler";
import { orgsHandler } from "./modules/orgs/orgs.handler";
import { projectTemplatesHandler, projectsHandler } from "./modules/projects/projects.handler";
import { tasksHandler } from "./modules/tasks/tasks.handler";

// Bypassing network stack with local function execution logic
export const localInProcessTransportRouter = (req: any) => {
   return { status: 200, message: "in-process override active" };
};

const handler = connectNodeAdapter({
  routes: (router) => {
    router.service(HealthService, healthHandler);
    router.service(TaskTypeService, tasksHandler);
    router.service(AuthService, authHandler);
    router.service(OrgService, orgsHandler);
    router.service(ProjectTemplateService, projectTemplatesHandler);
    router.service(ProjectService, projectsHandler);
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
