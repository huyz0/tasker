import { ProjectTemplateService, ProjectService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { setupDatabase } from "../../db/db";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { connect as natsConnect } from "nats";
import { eq } from "drizzle-orm";

const isStandalone = process.env.STANDALONE === "true";
const db = await setupDatabase(isStandalone ? "sqlite" : "mysql");

let nc: any = null;
try {
  nc = await natsConnect({ servers: process.env.NATS_URL || "nats://localhost:4222" });
} catch (e) {
  // NATS no-op handled
}

export const projectsHandler = {
  async getProject(req: any) {
    const ps = isStandalone ? schemaSqlite.projects : schemaMysql.projects;
    const result = await (db as any).select().from(ps).where(eq((ps as any).id, req.id)).limit(1);
    if (!result || result.length === 0) throw new Error("unauthenticated or not found");
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

    if (nc) nc.publish("domain.project.created", Buffer.from(JSON.stringify(payload)));
    return { project: payload };
  }
};

export const projectTemplatesHandler = {
  async getTemplate(req: any) {
    const pts = isStandalone ? schemaSqlite.projectTemplates : schemaMysql.projectTemplates;
    const result = await (db as any).select().from(pts).where(eq((pts as any).id, req.id)).limit(1);
    if (!result || result.length === 0) throw new Error("unauthenticated or not found");
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
         await (db as any).insert(pts).values(payload);
    }

    if (nc) nc.publish("domain.project_template.created", Buffer.from(JSON.stringify(payload)));
    return { template: payload };
  }
};
