import { z } from "zod";
import { and, eq } from "drizzle-orm";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { executePaginatedQuery } from "../../db/query-builder";
import { requireUser } from "../../lib/authz";
import { assertCan } from "../../lib/policy";

/**
 * Reading the audit trail (M08-T05).
 *
 * Read-only by construction — there is no create/update/delete here and the
 * contract exposes none. The trail is written solely by the event consumer's
 * projector; a mutation on this service would let the record of what happened
 * be edited by the people it records.
 *
 * Gated on `org:admin`, an existing permission that admins and owners already
 * hold, rather than a new `audit:*` family. A new family would need seeding
 * into `role_permissions` for every existing installation, and "who can read
 * the org's administrative history" is not a distinct question from "who
 * administers the org".
 */

function isStandalone(): boolean {
  return process.env.STANDALONE === "true";
}

const ListAuditEventsSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  page: z
    .object({
      cursor: z.string().optional(),
      limit: z.number().int().positive().max(200).optional(),
      filter: z.string().optional(),
      sort: z.string().optional(),
    })
    .optional(),
  subject: z.string().optional(),
  actorId: z.string().optional(),
});

export function createAuditHandler(db: any) {
  const auditTable = () => (isStandalone() ? schemaSqlite.auditLog : schemaMysql.auditLog);

  return {
    async listAuditEvents(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = ListAuditEventsSchema.parse(req);

      await assertCan(
        db,
        { kind: "user", userId },
        { type: "organization", id: parsed.orgId },
        "org:admin",
      );

      const table = auditTable();
      const conditions = [eq((table as any).orgId, parsed.orgId)];
      // Exact match, not a LIKE: a subject is a fixed vocabulary
      // ("domain.agent.token_created"), and a prefix search would quietly
      // return a superset an administrator did not ask for.
      if (parsed.subject) conditions.push(eq((table as any).subject, parsed.subject));
      if (parsed.actorId) conditions.push(eq((table as any).actorId, parsed.actorId));

      const { items, nextCursor, totalCount } = await executePaginatedQuery(
        db,
        table,
        and(...conditions),
        parsed.page,
        {
          filterColumn: (table as any).subject,
          sortableColumns: {
            occurredAt: (table as any).occurredAt,
            subject: (table as any).subject,
          },
          // audit_log records `occurredAt`, not `createdAt`. Without this the
          // builder falls back to a column that does not exist and drizzle
          // interpolates undefined into the ORDER BY — "no such column: desc",
          // which is the failure `defaultSort`'s own doc comment describes.
          defaultSort: { field: "occurredAt", column: (table as any).occurredAt },
          select: {
            id: (table as any).id,
            orgId: (table as any).orgId,
            subject: (table as any).subject,
            actorType: (table as any).actorType,
            actorId: (table as any).actorId,
            requestId: (table as any).requestId,
            payload: (table as any).payload,
            occurredAt: (table as any).occurredAt,
          },
        },
      );

      return {
        events: items.map((row: any) => ({
          ...row,
          // The wire field is a string; a raw Date here crashes connect's
          // protobuf JSON encoder outright rather than coercing (the same
          // class of bug M20-T01 fixed on deletedAt).
          occurredAt:
            row.occurredAt instanceof Date ? row.occurredAt.toISOString() : String(row.occurredAt ?? ""),
          orgId: row.orgId ?? undefined,
          actorId: row.actorId ?? undefined,
          requestId: row.requestId ?? undefined,
        })),
        page: { nextCursor: nextCursor ?? "", totalCount },
      };
    },
  };
}
