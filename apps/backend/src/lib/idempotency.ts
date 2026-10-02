import * as schemaMysql from "../db/schema.mysql";
import * as schemaSqlite from "../db/schema.sqlite";
import { eq, and, lt } from "drizzle-orm";
import { createHash } from "node:crypto";
import { ConnectError, Code } from "@connectrpc/connect";
import type { Principal } from "../modules/auth/session";

function principalKeyFor(principal: Principal): string {
  return principal.kind === "user" ? `user:${principal.userId}` : `agent:${principal.agentId}`;
}

/**
 * Retry-safety for a mutating RPC (M14-T07 - "no mutating task RPC accepts
 * an idempotency key" was one of the concrete gaps the agent-readiness
 * review named). If `idempotencyKey` is unset, runs `fn` and returns its
 * result unchanged - every caller before this file existed, and every
 * caller that still doesn't send one.
 *
 * If set, checks for a stored response from an earlier call with the same
 * (principal, method, key) first and replays it verbatim instead of
 * running `fn` again. This is the case that actually happens in practice:
 * a client times out waiting for a response, the mutation already
 * succeeded server-side, and the client retries sequentially with the same
 * key once it gets control back. That case is fully closed.
 *
 * What this does NOT close: two calls carrying the same key that are
 * genuinely in flight at the same instant. Both can read "no stored
 * response yet" before either has written one, both run `fn`, and only one
 * wins the final insert - the loser still returns its own freshly computed
 * result (the caller never sees an error or a missing response), but for a
 * mutation like `createTask` that means a second row really was created. A
 * complete fix needs a reservation written *before* `fn` runs, with a
 * caller-visible "still processing" state for whoever loses the
 * reservation race - deliberately left out here as more than this
 * milestone's smallest-correct-primitive scope; see
 * `.milestones/MILESTONE-14-task-reliability-and-agent-self-service/PROGRESS.md`,
 * M14-T07, if a future session needs the concurrent case closed too.
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
  if (!idempotencyKey) return fn();
  const requestHash = hashRequest(request);

  const table = isStandalone ? schemaSqlite.idempotencyKeys : schemaMysql.idempotencyKeys;
  const principalKey = principalKeyFor(principal);
  const condition = and(
    eq((table as any).principalKey, principalKey),
    eq((table as any).method, method),
    eq((table as any).idempotencyKey, idempotencyKey),
  );

  const existing = await db.select().from(table).where(condition).limit(1);
  if (existing.length > 0) {
    // M30-T09: the same key on a different request is a client bug, and
    // replaying the first response would tell it the second mutation
    // happened. A row stored before hashing existed has no hash and replays.
    const stored = existing[0].requestHash;
    if (stored && stored !== requestHash) {
      throw new ConnectError(
        `idempotency key "${idempotencyKey}" was already used with a different ${method} request`,
        Code.InvalidArgument,
      );
    }
    return JSON.parse(existing[0].responseJson) as T;
  }

  const result = await fn();

  try {
    await db.insert(table).values({
      id: `idem-${crypto.randomUUID()}`,
      principalKey,
      method,
      idempotencyKey,
      responseJson: JSON.stringify(result),
      requestHash,
      createdAt: new Date(),
    });
  } catch {
    // Lost a race against a concurrent call carrying the same key (or some
    // other storage failure) - either way `fn` already ran and produced a
    // real result, so the caller still gets a valid response for the work
    // it actually asked for. See the "does NOT close" note above.
  }

  return result;
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
