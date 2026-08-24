import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { executePaginatedQuery } from "../../db/query-builder";
import { assertOrgMember, requireUser } from "../../lib/authz";

/**
 * A human's own in-app notifications (M29-T05).
 *
 * **The recipient is never a request parameter.** Every query below is
 * predicated on `userId` taken from the session, intersected with org
 * membership — the same shape `modules/events/eventScope.ts` already enforces
 * for this event class on the live feed. A notification id is the only thing
 * a caller names, and it is matched together with their own id, so an id
 * belonging to someone else resolves to nothing rather than to a permission
 * error that would confirm it exists.
 *
 * Human-only: `AGENT_RPC_SCOPES` lists no method here, which under that map's
 * absence-means-denial rule refuses agent tokens categorically. An agent has
 * the event feed for the same underlying facts and no business reading a
 * person's read state.
 */

function isStandalone(): boolean {
  return process.env.STANDALONE === "true";
}

const ListSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  page: z
    .object({
      cursor: z.string().optional(),
      limit: z.number().int().positive().max(200).optional(),
      filter: z.string().optional(),
      sort: z.string().optional(),
    })
    .optional(),
  unreadOnly: z.boolean().optional(),
});

const CountSchema = z.object({ orgId: z.string().min(1, "orgId is required") });
const MarkReadSchema = z.object({ id: z.string().min(1, "id is required") });
const MarkAllSchema = z.object({ orgId: z.string().min(1, "orgId is required") });

/** The wire shape wants strings; a raw Date crashes connect's protobuf JSON
 * encoder outright rather than coercing - the class of bug M20-T01 fixed. */
function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value ?? "");
}

function toWire(row: any) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    targetPath: row.targetPath ?? undefined,
    orgId: row.orgId,
    projectId: row.projectId ?? undefined,
    createdAt: iso(row.createdAt),
    readAt: row.readAt ? iso(row.readAt) : undefined,
  };
}

export function createNotificationHandler(db: any) {
  const table = () => (isStandalone() ? schemaSqlite.notifications : schemaMysql.notifications);

  return {
    async listNotifications(req: unknown, { values }: { values: any }) {
      const userId = requireUser(values);
      const parsed = ListSchema.parse(req);
      await assertOrgMember(db, userId, parsed.orgId);

      const t = table() as any;
      // Both predicates, always. Org membership alone would let one member
      // read another member's notifications.
      const conditions = [eq(t.userId, userId), eq(t.orgId, parsed.orgId)];
      if (parsed.unreadOnly) conditions.push(isNull(t.readAt));

      const { items, nextCursor, totalCount } = await executePaginatedQuery(
        db,
        t,
        and(...conditions),
        parsed.page,
        {
          filterColumn: t.title,
          sortableColumns: { createdAt: t.createdAt, type: t.type },
          defaultSort: { field: "createdAt", column: t.createdAt },
          select: {
            id: t.id,
            userId: t.userId,
            orgId: t.orgId,
            projectId: t.projectId,
            type: t.type,
            title: t.title,
            body: t.body,
            targetPath: t.targetPath,
            createdAt: t.createdAt,
            readAt: t.readAt,
          },
        },
      );

      return {
        notifications: items.map(toWire),
        page: { nextCursor: nextCursor ?? undefined, totalCount },
      };
    },

    async getUnreadNotificationCount(req: unknown, { values }: { values: any }) {
      const userId = requireUser(values);
      const parsed = CountSchema.parse(req);
      await assertOrgMember(db, userId, parsed.orgId);

      const t = table() as any;
      const rows = await db
        .select({ count: sql<number>`count(*)` })
        .from(t)
        .where(and(eq(t.userId, userId), eq(t.orgId, parsed.orgId), isNull(t.readAt)));

      return { count: Number(rows[0]?.count ?? 0) };
    },

    async markNotificationRead(req: unknown, { values }: { values: any }) {
      const userId = requireUser(values);
      const parsed = MarkReadSchema.parse(req);

      const t = table() as any;
      // Matched on id AND userId together. Someone else's id simply does not
      // match, so it 404s rather than 403s - a permission error here would
      // confirm the notification exists.
      const existing = await db
        .select()
        .from(t)
        .where(and(eq(t.id, parsed.id), eq(t.userId, userId)))
        .limit(1);

      const row = existing[0];
      if (!row) throw new Error("not_found: notification");

      // Idempotent: marking an already-read notification keeps the original
      // timestamp rather than moving it, so "when did they first see it"
      // survives a double click.
      if (!row.readAt) {
        await db.update(t).set({ readAt: new Date() }).where(and(eq(t.id, parsed.id), eq(t.userId, userId)));
        const refreshed = await db.select().from(t).where(eq(t.id, parsed.id)).limit(1);
        return { notification: toWire(refreshed[0]) };
      }

      return { notification: toWire(row) };
    },

    async markAllNotificationsRead(req: unknown, { values }: { values: any }) {
      const userId = requireUser(values);
      const parsed = MarkAllSchema.parse(req);
      await assertOrgMember(db, userId, parsed.orgId);

      const t = table() as any;
      const unread = await db
        .select({ id: t.id })
        .from(t)
        .where(and(eq(t.userId, userId), eq(t.orgId, parsed.orgId), isNull(t.readAt)));

      if (unread.length > 0) {
        await db
          .update(t)
          .set({ readAt: new Date() })
          .where(and(eq(t.userId, userId), eq(t.orgId, parsed.orgId), isNull(t.readAt)));
      }

      return { markedCount: unread.length };
    },
  };
}
