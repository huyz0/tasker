import * as schemaMysql from "../db/schema.mysql";
import * as schemaSqlite from "../db/schema.sqlite";
import { eq, and, lt } from "drizzle-orm";
import { createHash } from "node:crypto";
import { ConnectError, Code } from "@connectrpc/connect";
import type { Principal } from "../modules/auth/session";
import { withUnitOfWork } from "../db/access";
import { transactionConflict } from "../db/errors";

function principalKeyFor(principal: Principal): string {
  return principal.kind === "user" ? `user:${principal.userId}` : `agent:${principal.agentId}`;
}

/**
 * Reserve, execute and store the response in one transaction (ADR-0038).
 * The caller authorizes before entry; task operation wrappers also ensure
 * authorization and cache replay share the same transaction boundary.
 */
export async function withIdempotency<T>(
  db: any,
  isStandalone: boolean,
  principal: Principal,
  method: string,
  idempotencyKey: string | undefined | null,
  request: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  let reserving = false;
  try {
    return await withUnitOfWork(db, async () => {
      if (!idempotencyKey) return fn();
      const requestHash = hashRequest(request);
      const table = isStandalone ? schemaSqlite.idempotencyKeys : schemaMysql.idempotencyKeys;
      const principalKey = principalKeyFor(principal);
      const condition = and(
        eq((table as any).principalKey, principalKey),
        eq((table as any).method, method),
        eq((table as any).idempotencyKey, idempotencyKey),
      );
      const [existing] = await db.select().from(table).where(condition).limit(1);
      if (existing) {
        if (existing.requestHash && existing.requestHash !== requestHash) {
          throw new ConnectError(`idempotency key "${idempotencyKey}" was already used with a different ${method} request`, Code.InvalidArgument);
        }
        return JSON.parse(existing.responseJson) as T;
      }

      // The unique triple serializes competing MySQL connections. A loser
      // rolls back and retries; it must never execute the mutation as well.
      // This placeholder is never committed or exposed to another caller.
      reserving = true;
      await db.insert(table).values({
        id: `idem-${crypto.randomUUID()}`, principalKey, method, idempotencyKey,
        responseJson: "null", requestHash, createdAt: new Date(),
      });
      reserving = false;
      const result = await fn();
      await db.update(table).set({ responseJson: JSON.stringify(result) }).where(condition);
      return result;
    });
  } catch (error) {
    throw transactionConflict(error, reserving) ?? error;
  }
}

/**
 * A stable digest of a request: object keys sorted at every depth, so the
 * same request serialised in a different field order hashes the same, and
 * the idempotency key itself left out - it is the lookup, not the request.
 */
function hashRequest(request: unknown): string {
  const canonical = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.keys(v as object)
          .filter((k) => k !== "idempotencyKey")
          .sort()
          .map((k) => [k, canonical((v as any)[k])]),
      );
    }
    return typeof v === "bigint" ? v.toString() : v;
  };
  return createHash("sha256").update(JSON.stringify(canonical(request) ?? null)).digest("hex");
}

/**
 * How long a key protects a retry. A retry comes seconds or minutes after the
 * original; a day is generous, and without any expiry the table grew by one
 * row per keyed mutation forever (M30-T09).
 */
export const IDEMPOTENCY_KEY_TTL_MS = 24 * 60 * 60 * 1000;

/** Deletes expired keys; returns how many. Run hourly beside the retention sweep. */
export async function purgeExpiredIdempotencyKeys(db: any, isStandalone: boolean, now: Date = new Date()): Promise<number> {
  const table = isStandalone ? schemaSqlite.idempotencyKeys : schemaMysql.idempotencyKeys;
  const cutoff = new Date(now.getTime() - IDEMPOTENCY_KEY_TTL_MS);
  const result: any = await db.delete(table).where(lt((table as any).createdAt, cutoff));
  return Number(isStandalone ? result?.changes ?? 0 : result?.[0]?.affectedRows ?? 0);
}
