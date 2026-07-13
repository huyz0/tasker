import { z } from "zod/v4";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { eq, and, inArray } from "drizzle-orm";
import { insertRecord, executePaginatedQuery } from "../../db/query-builder";
import { requireUserId, assertOrgMember, getTaskOrgId, getArtifactOrgId } from "../../lib/authz";
import { ConnectError, Code } from "@connectrpc/connect";

// --- Zod Request Schemas ---

const CreateLabelSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  name: z.string().min(1, "name is required").max(128),
  color: z.string().max(32, "color must be at most 32 characters").nullable().optional(),
});

const EntityRefSchema = z.object({
  entityId: z.string().min(1, "entityId is required"),
  entityType: z.enum(["task", "artifact"]),
});

const AttachLabelSchema = EntityRefSchema.extend({
  labelId: z.string().min(1, "labelId is required"),
});

async function getEntityOrgId(db: any, entityId: string, entityType: string): Promise<string> {
  return entityType === "task" ? getTaskOrgId(db, entityId) : getArtifactOrgId(db, entityId);
}

// Distinguishes a real DB-level unique-constraint violation (a concurrent
// createLabel call won the race for the same orgId+name) from any other
// insert failure, so only the former gets translated to AlreadyExists.
function isLabelNameConflict(e: unknown): boolean {
  const msg = String((e as any)?.message ?? e);
  return msg.includes("labels_org_id_name_idx") || msg.includes("UNIQUE constraint failed") || msg.includes("Duplicate entry");
}

// --- Handler Factory ---

export const createLabelsHandler = (db: any, nc: any = null) => {
  const isStandalone = process.env.STANDALONE === "true";

  return {
    async createLabel(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = CreateLabelSchema.parse(req);
      await assertOrgMember(db, userId, parsed.orgId);

      const labels = isStandalone ? schemaSqlite.labels : schemaMysql.labels;
      const existing = await db
        .select()
        .from(labels)
        .where(and(eq((labels as any).orgId, parsed.orgId), eq((labels as any).name, parsed.name)))
        .limit(1);
      if (existing.length > 0) {
        throw new ConnectError("a label with this name already exists in this organization", Code.AlreadyExists);
      }

      const newId = `lbl-${crypto.randomUUID()}`;
      const payload = {
        id: newId,
        orgId: parsed.orgId,
        name: parsed.name,
        color: parsed.color || null,
      };

      // The select-then-insert check above has a race window - fall back to
      // catching the DB's own unique-constraint violation for a concurrent
      // duplicate insert, so it surfaces as AlreadyExists instead of a raw
      // DB error.
      try {
        await insertRecord(db, labels, payload, isStandalone);
      } catch (e) {
        if (!isLabelNameConflict(e)) throw e;
        throw new ConnectError("a label with this name already exists in this organization", Code.AlreadyExists);
      }

      const labelResp = { ...payload };
      if (nc) nc.publish("domain.label.created", Buffer.from(JSON.stringify(labelResp)));
      return { label: labelResp };
    },

    async listLabels(req: any, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      if (!req.orgId) throw new ConnectError("orgId is required", Code.InvalidArgument);
      await assertOrgMember(db, userId, req.orgId);

      const labels = isStandalone ? schemaSqlite.labels : schemaMysql.labels;
      const { items, nextCursor, totalCount } = await executePaginatedQuery(db, labels, eq((labels as any).orgId, req.orgId), req.page, (labels as any).name, { name: (labels as any).name, createdAt: (labels as any).createdAt });

      return { labels: items, page: { nextCursor, totalCount } };
    },

    async attachLabel(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = AttachLabelSchema.parse(req);
      const orgId = await getEntityOrgId(db, parsed.entityId, parsed.entityType);
      await assertOrgMember(db, userId, orgId);

      const labelsTable = isStandalone ? schemaSqlite.labels : schemaMysql.labels;
      const labelRows = await db.select().from(labelsTable).where(eq((labelsTable as any).id, parsed.labelId)).limit(1);
      if (!labelRows || labelRows.length === 0 || labelRows[0].orgId !== orgId) {
        throw new ConnectError("Label not found in this organization", Code.NotFound);
      }

      const entityLabels = isStandalone ? schemaSqlite.entityLabels : schemaMysql.entityLabels;
      const existing = await db
        .select()
        .from(entityLabels)
        .where(
          and(
            eq((entityLabels as any).entityId, parsed.entityId),
            eq((entityLabels as any).entityType, parsed.entityType),
            eq((entityLabels as any).labelId, parsed.labelId)
          )
        )
        .limit(1);
      if (existing && existing.length > 0) {
        return { success: true };
      }

      const newId = `elbl-${crypto.randomUUID()}`;
      await insertRecord(db, entityLabels, {
        id: newId,
        entityId: parsed.entityId,
        entityType: parsed.entityType,
        labelId: parsed.labelId,
      }, isStandalone);

      if (nc) nc.publish("domain.label.attached", Buffer.from(JSON.stringify(parsed)));
      return { success: true };
    },

    async detachLabel(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = AttachLabelSchema.parse(req);
      const orgId = await getEntityOrgId(db, parsed.entityId, parsed.entityType);
      await assertOrgMember(db, userId, orgId);

      const entityLabels = isStandalone ? schemaSqlite.entityLabels : schemaMysql.entityLabels;
      await db
        .delete(entityLabels)
        .where(
          and(
            eq((entityLabels as any).entityId, parsed.entityId),
            eq((entityLabels as any).entityType, parsed.entityType),
            eq((entityLabels as any).labelId, parsed.labelId)
          )
        );

      if (nc) nc.publish("domain.label.detached", Buffer.from(JSON.stringify(parsed)));
      return { success: true };
    },

    async listEntityLabels(req: any, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = EntityRefSchema.parse(req);
      const orgId = await getEntityOrgId(db, parsed.entityId, parsed.entityType);
      await assertOrgMember(db, userId, orgId);

      const entityLabels = isStandalone ? schemaSqlite.entityLabels : schemaMysql.entityLabels;
      const labelsTable = isStandalone ? schemaSqlite.labels : schemaMysql.labels;

      const links = await db
        .select()
        .from(entityLabels)
        .where(and(eq((entityLabels as any).entityId, parsed.entityId), eq((entityLabels as any).entityType, parsed.entityType)));

      if (links.length === 0) {
        return { labels: [] };
      }

      const labelIds = links.map((l: any) => l.labelId);
      const rows = await db.select().from(labelsTable).where(inArray((labelsTable as any).id, labelIds));
      return { labels: rows };
    },
  };
};
