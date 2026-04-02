import { ProjectTemplateService, ProjectService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { eq } from "drizzle-orm";

export const createProjectsHandler = (db: any, nc: any = null) => {
  const isStandalone = process.env.STANDALONE === "true";
  return {
    async getProject(req: any) {
      const ps = isStandalone ? schemaSqlite.projects : schemaMysql.projects;
      const result = await db.select().from(ps).where(eq((ps as any).id, req.id)).limit(1);
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
          await db.insert(ps).values({ ...payload, createdAt: new Date() });
      } else {
          await db.insert(ps).values(payload);
      }

      if (nc) nc.publish("domain.project.created", Buffer.from(JSON.stringify(payload)));
      return { project: payload };
    }
  };
};

export const createProjectTemplatesHandler = (db: any, nc: any = null) => {
  const isStandalone = process.env.STANDALONE === "true";
  return {
    async getTemplate(req: any) {
      const pts = isStandalone ? schemaSqlite.projectTemplates : schemaMysql.projectTemplates;
      const result = await db.select().from(pts).where(eq((pts as any).id, req.id)).limit(1);
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
           await db.insert(pts).values({ ...payload, createdAt: new Date() });
      } else {
           await db.insert(pts).values(payload);
      }

      if (nc) nc.publish("domain.project_template.created", Buffer.from(JSON.stringify(payload)));
      return { template: payload };
    }
  };
};
