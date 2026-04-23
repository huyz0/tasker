import { z } from "zod/v4";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { eq, and } from "drizzle-orm";
import { insertRecord, executePaginatedQuery } from "../../db/query-builder";

// --- Zod Request Schemas ---

const GetProjectSchema = z.object({
  id: z.string().min(1, "id is required"),
});

const CreateProjectSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  templateId: z.string().min(1, "templateId is required"),
  name: z.string().min(1, "name is required").max(256),
  ownerId: z.string().min(1, "ownerId is required"),
});

const GetTemplateSchema = z.object({
  id: z.string().min(1, "id is required"),
});

const CreateTemplateSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  name: z.string().min(1, "name is required").max(256),
  description: z.string().max(1024).optional().default(""),
});

// --- Handler Factories ---

export const createProjectsHandler = (db: any, nc: any = null) => {
  const isStandalone = process.env.STANDALONE === "true";
  return {
    async getProject(req: unknown) {
      const parsed = GetProjectSchema.parse(req);
      const ps = isStandalone ? schemaSqlite.projects : schemaMysql.projects;
      const result = await db.select().from(ps).where(eq((ps as any).id, parsed.id)).limit(1);
      if (!result || result.length === 0) throw new Error("unauthenticated or not found");
      return { project: result[0] };
    },
    async createProject(req: unknown) {
      const parsed = CreateProjectSchema.parse(req);
      const ps = isStandalone ? schemaSqlite.projects : schemaMysql.projects;
      const newId = `p-${crypto.randomUUID()}`;
      const payload = {
        id: newId,
        orgId: parsed.orgId,
        templateId: parsed.templateId,
        name: parsed.name,
        ownerId: parsed.ownerId,
      };

      await insertRecord(db, ps, payload, isStandalone);

      if (nc) nc.publish("domain.project.created", Buffer.from(JSON.stringify(payload)));
      return { project: payload };
    },
    async listProjects(req: any) {
      if (!req.orgId) throw new Error("orgId is required");
      const ps = isStandalone ? schemaSqlite.projects : schemaMysql.projects;
      const { items, nextCursor } = await executePaginatedQuery(db, ps, eq((ps as any).orgId, req.orgId), req.page);

      return {
        projects: items.map((p: any) => ({
          ...p,
          createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
        })),
        page: { nextCursor },
      };
    },
  };
};

export const createProjectTemplatesHandler = (db: any, nc: any = null) => {
  const isStandalone = process.env.STANDALONE === "true";
  return {
    async getTemplate(req: unknown) {
      const parsed = GetTemplateSchema.parse(req);
      const pts = isStandalone ? schemaSqlite.projectTemplates : schemaMysql.projectTemplates;
      const result = await db.select().from(pts).where(eq((pts as any).id, parsed.id)).limit(1);
      if (!result || result.length === 0) throw new Error("unauthenticated or not found");
      return { template: result[0] };
    },
    async createTemplate(req: unknown) {
      const parsed = CreateTemplateSchema.parse(req);
      const pts = isStandalone ? schemaSqlite.projectTemplates : schemaMysql.projectTemplates;
      const newId = `pt-${crypto.randomUUID()}`;
      const payload = {
        id: newId,
        orgId: parsed.orgId,
        name: parsed.name,
        description: parsed.description,
      };

      await insertRecord(db, pts, payload, isStandalone);

      if (nc) nc.publish("domain.project_template.created", Buffer.from(JSON.stringify(payload)));
      return { template: payload };
    },
    async listTemplates(req: any) {
      if (!req.orgId) throw new Error("orgId is required");
      const pts = isStandalone ? schemaSqlite.projectTemplates : schemaMysql.projectTemplates;
      const { items, nextCursor } = await executePaginatedQuery(db, pts, eq((pts as any).orgId, req.orgId), req.page);

      return {
        templates: items.map((t: any) => ({
          ...t,
          createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
        })),
        page: { nextCursor },
      };
    },
  };
};
