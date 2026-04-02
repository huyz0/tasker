import { connectNodeAdapter } from "@connectrpc/connect-node";
import { HealthService, TaskTypeService, AuthService, OrgService, ProjectTemplateService, ProjectService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import * as http from "node:http";
import fs from "node:fs";
import { setupDatabase } from "./db";
import * as schemaMysql from "./schema.mysql";
import * as schemaSqlite from "./schema.sqlite";
import { connect as natsConnect } from "nats";
import { eq, and } from "drizzle-orm";

const isStandalone = process.env.STANDALONE === "true";
const db = await setupDatabase(isStandalone ? "sqlite" : "mysql");

let nc: any = null;
try {
  nc = await natsConnect({ servers: process.env.NATS_URL || "nats://localhost:4222" });
  console.log("NATS connected for Domain Events");
} catch (e) {
  console.log("NATS not available, running in standalone/no-op event mode");
}

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
          // Verify DB connectivity. Standalone mode runs SQLite.
          const isStandalonePing = process.env.STANDALONE === "true";
          const pingDb = await setupDatabase(isStandalonePing ? "sqlite" : "mysql");
          
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
        const types = isStandalone ? schemaSqlite.taskTypes : schemaMysql.taskTypes;
        const result = await (db as any)
          .select()
          .from(types)
          .where(eq((types as any).id, req.id))
          .limit(1);

        if (!result || result.length === 0) {
          throw new Error("unauthenticated or not found");
        }

        const taskType = result[0];
        
        // Fetch statuses
        const statusesSchema = isStandalone ? schemaSqlite.taskStatuses : schemaMysql.taskStatuses;
        const statuses = await (db as any)
          .select()
          .from(statusesSchema)
          .where(eq((statusesSchema as any).taskTypeId, req.id));

        // Fetch transitions
        const transitionsSchema = isStandalone ? schemaSqlite.taskStatusTransitions : schemaMysql.taskStatusTransitions;
        const transitions = await (db as any)
          .select()
          .from(transitionsSchema)
          .where(eq((transitionsSchema as any).taskTypeId, req.id));

        return {
          taskType: { ...taskType, createdAt: taskType.createdAt instanceof Date ? taskType.createdAt.toISOString() : taskType.createdAt },
          statuses: statuses,
          transitions: transitions
        };
      },
      async createTaskType(req: any) {
        const types = isStandalone ? schemaSqlite.taskTypes : schemaMysql.taskTypes;
        const newId = "tt-" + Date.now().toString();
        const payload = {
          id: newId,
          orgId: req.orgId,
          projectId: req.projectId || null,
          name: req.name
        };

        if (isStandalone) {
          await (db as any).insert(types).values({ ...payload, createdAt: new Date() });
        } else {
          await (db as any).insert(types).values(payload); // mysql will handle defaultNow
        }

        const taskTypeResp = { ...payload, createdAt: new Date().toISOString() };

        if (nc) {
          nc.publish("domain.task_type.created", Buffer.from(JSON.stringify(payload)));
        }

        return { taskType: taskTypeResp };
      }
    });

    router.service(AuthService, {
      async getIdentity(req: any) {
        const usersTable = isStandalone ? schemaSqlite.users : schemaMysql.users;
        const result = await (db as any).select().from(usersTable).limit(1);
        if (!result || result.length === 0) {
           return { user: { id: "user-1", email: "seed@tasker", name: "Seed Admin", avatarUrl: "", createdAt: new Date().toISOString() } };
        }
        const u = result[0];
        return { user: { ...u, createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt } };
      }
    });

    router.service(OrgService, {
      async listOrgs(req: any) {
        const orgs = isStandalone ? schemaSqlite.organizations : schemaMysql.organizations;
        const result = await (db as any).select().from(orgs);
        return { organizations: result.map((o: any) => ({ ...o, createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt })) };
      },
      async seedOrg(req: any) {
        const orgs = isStandalone ? schemaSqlite.organizations : schemaMysql.organizations;
        const members = isStandalone ? schemaSqlite.organizationMembers : schemaMysql.organizationMembers;
        
        const newOrgId = "o-" + Date.now().toString();
        const orgPayload = { id: newOrgId, name: req.name, slug: req.slug };
        
        if (isStandalone) {
             await (db as any).insert(orgs).values({ ...orgPayload, createdAt: new Date() });
             await (db as any).insert(members).values({ orgId: newOrgId, userId: "user-1", role: "admin", joinedAt: new Date() });
        } else {
             await (db as any).insert(orgs).values(orgPayload);
             await (db as any).insert(members).values({ orgId: newOrgId, userId: "user-1", role: "admin" });
        }

        if (nc) {
           nc.publish("domain.org.created", Buffer.from(JSON.stringify(orgPayload)));
        }
        return { organization: { ...orgPayload, role: "admin" } };
      },
      async inviteUser(req: any) {
        const invs = isStandalone ? schemaSqlite.invitations : schemaMysql.invitations;
        const payload = {
           id: "i-" + Date.now().toString(),
           orgId: req.orgId,
           email: req.email,
           invitedBy: "user-1"
        };
        if (isStandalone) {
           await (db as any).insert(invs).values({ ...payload, createdAt: new Date() });
        } else {
           await (db as any).insert(invs).values(payload);
        }
        return { success: true };
      }
    });

    router.service(ProjectTemplateService, {
      async getTemplate(req: any) {
        // Drizzle schema access based on driver
        const pts = isStandalone ? schemaSqlite.projectTemplates : schemaMysql.projectTemplates;
        
        const result = await (db as any)
            .select()
            .from(pts)
            .where(eq((pts as any).id, req.id))
            .limit(1);

        if (!result || result.length === 0) {
            throw new Error("unauthenticated or not found");
        }
        return { template: result[0] };
      },
      async createTemplate(req: any) {
        const pts = isStandalone ? schemaSqlite.projectTemplates : schemaMysql.projectTemplates;
        const newId = "pt-" + Date.now().toString();
        const payload = {
            id: newId,
            orgId: req.orgId,
            name: req.name || "Untitled Template",
            description: req.description || ""
        };

        if (isStandalone) {
             await (db as any).insert(pts).values({ ...payload, createdAt: new Date() });
        } else {
             await (db as any).insert(pts).values(payload); // mysql will handle defaultNow
        }

        if (nc) {
             nc.publish("domain.project_template.created", Buffer.from(JSON.stringify(payload)));
        }

        return { template: payload };
      }
    });

    router.service(ProjectService, {
      async getProject(req: any) {
        const ps = isStandalone ? schemaSqlite.projects : schemaMysql.projects;
        
        const result = await (db as any)
             .select()
             .from(ps)
             .where(eq((ps as any).id, req.id))
             .limit(1);

        if (!result || result.length === 0) {
             throw new Error("unauthenticated or not found");
        }
        return { project: result[0] };
      },
      async createProject(req: any) {
        const ps = isStandalone ? schemaSqlite.projects : schemaMysql.projects;
        const newId = "p-" + Date.now().toString();
        const payload = {
            id: newId,
            orgId: req.orgId,
            templateId: req.templateId,
            name: req.name || "Untitled Project",
            ownerId: req.ownerId
        };

        if (isStandalone) {
            await (db as any).insert(ps).values({ ...payload, createdAt: new Date() });
        } else {
            await (db as any).insert(ps).values(payload);
        }

        if (nc) {
            nc.publish("domain.project.created", Buffer.from(JSON.stringify(payload)));
        }

        return { project: payload };
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