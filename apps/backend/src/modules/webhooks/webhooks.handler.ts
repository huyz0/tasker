/**
 * WebhookService (M37-T02, ADR-0030): an organization's admins register HTTPS
 * endpoints for its task events. Agents never reach this - a token that could
 * register a webhook could copy every event in the organization elsewhere.
 */
import { z } from "zod/v4";
import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { ConnectError, Code } from "@connectrpc/connect";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { executePaginatedQuery } from "../../db/query-builder";
import { requireUser } from "../../lib/authz";
import { assertCan } from "../../lib/policy";
import { encryptToken } from "../../lib/crypto";
import { publishDomainEvent } from "../../lib/natsCorrelation";
import { allowPrivateTargets, validateWebhookUrl, type Resolver } from "./urlSafety";
import { normalizeEventFilters } from "./events";
import { insertDelivery } from "./outbox";

const optionalText = (max: number) => z.preprocess((v) => (v === "" ? undefined : v), z.string().max(max).optional());

const CreateSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  projectId: optionalText(256),
  url: z.string().min(1, "url is required"),
  events: z.array(z.string()).max(50),
  description: z.string().max(512).optional().default(""),
});
const ListSchema = z.object({ orgId: z.string().min(1, "orgId is required") });
const IdSchema = z.object({ id: z.string().min(1, "id is required") });
const UpdateSchema = z.object({
  id: z.string().min(1, "id is required"),
  url: optionalText(2048),
  events: z.array(z.string()).max(50).optional().default([]),
  description: z.string().max(512).optional(),
  active: z.boolean().optional(),
});
const DeliveriesSchema = z.object({ webhookId: z.string().min(1, "webhookId is required"), page: z.any().optional() });

/** `whsec_` and 32 random bytes - shown once. */
function newSecret(): string {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}

const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d ? new Date(Number(d) * 1000).toISOString() : undefined);

function toWireWebhook(row: any) {
  return {
    id: row.id,
    orgId: row.orgId,
    ...(row.projectId ? { projectId: row.projectId } : {}),
    url: row.url,
    events: JSON.parse(row.events),
    description: row.description ?? "",
    active: Boolean(row.active),
    consecutiveFailures: row.consecutiveFailures ?? 0,
    ...(row.disabledReason ? { disabledReason: row.disabledReason } : {}),
    createdAt: iso(row.createdAt),
    ...(row.lastDeliveryAt ? { lastDeliveryAt: iso(row.lastDeliveryAt) } : {}),
  };
}

function toWireDelivery(row: any) {
  return {
    id: row.id,
    webhookId: row.webhookId,
    eventType: row.eventType,
    status: row.status,
    attempts: row.attempts ?? 0,
    ...(row.lastStatusCode != null ? { lastStatusCode: row.lastStatusCode } : {}),
    ...(row.lastError ? { lastError: row.lastError } : {}),
    createdAt: iso(row.createdAt),
    ...(row.deliveredAt ? { deliveredAt: iso(row.deliveredAt) } : {}),
    ...(row.status === "pending" && row.nextAttemptAt ? { nextAttemptAt: iso(row.nextAttemptAt) } : {}),
  };
}

export interface WebhookHandlerOptions {
  /** Injected in tests; the system resolver otherwise. */
  resolve?: Resolver;
  allowPrivate?: boolean;
  /** Called after any change, so the outbox sink's "who has webhooks" cache is not stale in this process. */
  onChange?: () => void;
}

export const createWebhooksHandler = (db: any, nc: any = null, opts: WebhookHandlerOptions = {}) => {
  const isStandalone = process.env.STANDALONE === "true";
  const webhooks = isStandalone ? schemaSqlite.webhooks : schemaMysql.webhooks;
  const deliveries = isStandalone ? schemaSqlite.webhookDeliveries : schemaMysql.webhookDeliveries;
  const allowPrivate = opts.allowPrivate ?? allowPrivateTargets();
  const changed = () => opts.onChange?.();

  async function checkedUrl(raw: string): Promise<string> {
    try {
      return await validateWebhookUrl(raw, allowPrivate, opts.resolve);
    } catch (e) {
      throw new ConnectError((e as Error).message, Code.InvalidArgument);
    }
  }

  function checkedEvents(events: string[]): string[] {
    try {
      return normalizeEventFilters(events);
    } catch (e) {
      throw new ConnectError((e as Error).message, Code.InvalidArgument);
    }
  }

  /** The webhook, after checking the caller administers its organization. */
  async function loadForAdmin(userId: string, id: string) {
    const [row] = await db.select().from(webhooks).where(eq((webhooks as any).id, id)).limit(1);
    if (!row) throw new ConnectError("webhook not found", Code.NotFound);
    await assertCan(db, { kind: "user", userId }, { type: "organization", id: row.orgId }, "org:admin");
    return row;
  }

  return {
    async createWebhook(req: unknown, { values }: { values: any }) {
      const userId = requireUser(values);
      const parsed = CreateSchema.parse(req);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: parsed.orgId }, "org:admin");
      if (parsed.projectId) {
        const projects = isStandalone ? schemaSqlite.projects : schemaMysql.projects;
        const [project] = await db.select({ orgId: (projects as any).orgId }).from(projects).where(eq((projects as any).id, parsed.projectId)).limit(1);
        if (!project || project.orgId !== parsed.orgId) throw new ConnectError("projectId is not a project of this organization", Code.InvalidArgument);
      }
      const url = await checkedUrl(parsed.url);
      const events = checkedEvents(parsed.events);
      const secret = newSecret();
      const row = {
        id: `wh-${crypto.randomUUID()}`,
        orgId: parsed.orgId,
        projectId: parsed.projectId ?? null,
        url,
        secretEncrypted: encryptToken(secret),
        events: JSON.stringify(events),
        description: parsed.description,
        active: true,
        consecutiveFailures: 0,
        createdBy: userId,
        createdAt: new Date(),
      };
      await db.insert(webhooks).values(row);
      changed();
      publishDomainEvent(nc, "domain.webhook.created", { id: row.id, orgId: row.orgId, events });
      return { webhook: toWireWebhook(row), secret };
    },

    async listWebhooks(req: unknown, { values }: { values: any }) {
      const userId = requireUser(values);
      const parsed = ListSchema.parse(req);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: parsed.orgId }, "org:admin");
      // Bounded by what admins create by hand; no pagination.
      const rows = await db.select().from(webhooks).where(eq((webhooks as any).orgId, parsed.orgId)).orderBy(desc((webhooks as any).createdAt)).limit(500);
      return { webhooks: rows.map(toWireWebhook) };
    },

    async updateWebhook(req: unknown, { values }: { values: any }) {
      const userId = requireUser(values);
      const parsed = UpdateSchema.parse(req);
      await loadForAdmin(userId, parsed.id);
      const updates: Record<string, unknown> = {};
      if (parsed.url !== undefined) updates.url = await checkedUrl(parsed.url);
      if (parsed.events.length > 0) updates.events = JSON.stringify(checkedEvents(parsed.events));
      if (parsed.description !== undefined) updates.description = parsed.description;
      if (parsed.active !== undefined) {
        updates.active = parsed.active;
        // Re-enabling is a fresh start: the failures were the old receiver's.
        if (parsed.active) Object.assign(updates, { consecutiveFailures: 0, disabledReason: null });
      }
      if (Object.keys(updates).length > 0) await db.update(webhooks).set(updates).where(eq((webhooks as any).id, parsed.id));
      const [row] = await db.select().from(webhooks).where(eq((webhooks as any).id, parsed.id)).limit(1);
      changed();
      publishDomainEvent(nc, "domain.webhook.updated", { id: row.id, orgId: row.orgId });
      return { webhook: toWireWebhook(row) };
    },

    async deleteWebhook(req: unknown, { values }: { values: any }) {
      const userId = requireUser(values);
      const parsed = IdSchema.parse(req);
      const row = await loadForAdmin(userId, parsed.id);
      await db.delete(deliveries).where(eq((deliveries as any).webhookId, parsed.id));
      await db.delete(webhooks).where(eq((webhooks as any).id, parsed.id));
      changed();
      publishDomainEvent(nc, "domain.webhook.deleted", { id: row.id, orgId: row.orgId });
      return { success: true };
    },

    async rotateWebhookSecret(req: unknown, { values }: { values: any }) {
      const userId = requireUser(values);
      const parsed = IdSchema.parse(req);
      const row = await loadForAdmin(userId, parsed.id);
      const secret = newSecret();
      await db.update(webhooks).set({ secretEncrypted: encryptToken(secret) }).where(eq((webhooks as any).id, parsed.id));
      publishDomainEvent(nc, "domain.webhook.secret_rotated", { id: row.id, orgId: row.orgId });
      return { secret };
    },

    async pingWebhook(req: unknown, { values }: { values: any }) {
      const userId = requireUser(values);
      const parsed = IdSchema.parse(req);
      const row = await loadForAdmin(userId, parsed.id);
      const delivery = await insertDelivery(db, isStandalone, row.id, {
        id: `evt-${crypto.randomUUID()}`,
        type: "ping",
        occurredAt: new Date().toISOString(),
        orgId: row.orgId,
        projectId: row.projectId ?? null,
        data: { webhookId: row.id, message: "Tasker can reach this endpoint." },
      });
      return { delivery: toWireDelivery(delivery) };
    },

    async listWebhookDeliveries(req: unknown, { values }: { values: any }) {
      const userId = requireUser(values);
      const parsed = DeliveriesSchema.parse(req);
      await loadForAdmin(userId, parsed.webhookId);
      const d = deliveries as any;
      const { items, nextCursor, totalCount } = await executePaginatedQuery(db, deliveries, and(eq(d.webhookId, parsed.webhookId)), parsed.page, {
        sortableColumns: { createdAt: d.createdAt },
        // The payload stays out: it can be large, and the list is a status view.
        select: {
          id: d.id, webhookId: d.webhookId, eventType: d.eventType, status: d.status, attempts: d.attempts,
          lastStatusCode: d.lastStatusCode, lastError: d.lastError, createdAt: d.createdAt, deliveredAt: d.deliveredAt,
          nextAttemptAt: d.nextAttemptAt,
        },
        extraCacheKey: parsed.webhookId,
      });
      return { deliveries: items.map(toWireDelivery), page: { nextCursor, totalCount } };
    },
  };
};
