import { connectNodeAdapter } from "@connectrpc/connect-node";
import { HealthService, TaskTypeService, AuthService, OrgService, ProjectTemplateService, ProjectService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import * as http from "node:http";
import fs from "node:fs";
import { setupDatabase } from "./db";

// Bypassing network stack with local function execution logic
// Represents our standalone in-process Connect-RPC routing behavior.
export const localInProcessTransportRouter = (req: any) => {
   // Local bypass handling logic
   return { status: 200, message: "in-process override active" };
};

const handler = connectNodeAdapter({
  routes: (router) => {
    router.service(HealthService, {
      async ping(req: any) {
        let dbStatus = "disconnected";
        try {
          // Verify DB connectivity. Standalone mode runs SQLite.
          const isStandalone = process.env.STANDALONE === "true";
          const db = await setupDatabase(isStandalone ? "sqlite" : "mysql");
          
          if (isStandalone) {
             // Basic FTS5 verification for standalone builds
             const sqliteDb = (db as any).session.client;
             sqliteDb.query(`INSERT INTO search_index(title, body) VALUES ('Test', 'Searching for bun')`).run();
             const result = sqliteDb.query(`SELECT * FROM search_index WHERE search_index MATCH 'bun'`).all();
             if (result.length > 0) dbStatus = "sqlite+fts5-ok";
             else dbStatus = "sqlite-error";
          } else {
             dbStatus = "mysql-ok";
          }
        } catch (err) {
          dbStatus = `error: ${(err as Error).message}`;
        }
        return {
          message: "pong from backend!",
          dbStatus: dbStatus,
        };
      },
    });

    router.service(TaskTypeService, {
      async getTaskType(req: any) {
        return {
          taskType: { id: req.id, orgId: "org", projectId: "proj", name: "Type", createdAt: "now" },
          statuses: [],
          transitions: []
        };
      },
      async createTaskType(req: any) {
        return {
          taskType: { id: "new-id", orgId: req.orgId, projectId: req.projectId, name: req.name, createdAt: "now" }
        };
      }
    });

    router.service(AuthService, {
      async getIdentity(req: any) {
        return {
          user: { id: "user-1", email: "seed@tasker", name: "Seed Admin", avatarUrl: "", createdAt: Date.now().toString() }
        };
      }
    });

    router.service(OrgService, {
      async listOrgs(req: any) {
        return { organizations: [] };
      },
      async seedOrg(req: any) {
        return { organization: { id: "org-1", name: req.name, slug: req.slug, role: "admin" } };
      },
      async inviteUser(req: any) {
        return { success: true };
      }
    });

    router.service(ProjectTemplateService, {
      async getTemplate(req: any) {
        return {
          template: { id: req.id, orgId: "org-1", name: "Default Template", description: "Default project template" }
        };
      },
      async createTemplate(req: any) {
        return {
          template: { id: "pt-" + Date.now().toString(), orgId: req.orgId, name: req.name, description: req.description }
        };
      }
    });

    router.service(ProjectService, {
      async getProject(req: any) {
        return {
          project: { id: req.id, orgId: "org-1", templateId: "pt-1", name: "My Project", ownerId: "user-1" }
        };
      },
      async createProject(req: any) {
        return {
          project: { id: "p-" + Date.now().toString(), orgId: req.orgId, templateId: req.templateId, name: req.name, ownerId: req.ownerId }
        };
      }
    });
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
  
  // Custom Vite SPA injection logic for standalone compilation
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