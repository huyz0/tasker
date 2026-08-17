import * as schemaMysql from "../db/schema.mysql";
import * as schemaSqlite from "../db/schema.sqlite";
import { eq, and } from "drizzle-orm";
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
  fn: () => Promise<T>,
): Promise<T> {
  if (!idempotencyKey) return fn();

  const table = isStandalone ? schemaSqlite.idempotencyKeys : schemaMysql.idempotencyKeys;
  const principalKey = principalKeyFor(principal);
  const condition = and(
    eq((table as any).principalKey, principalKey),
    eq((table as any).method, method),
    eq((table as any).idempotencyKey, idempotencyKey),
  );

  const existing = await db.select().from(table).where(condition).limit(1);
  if (existing.length > 0) {
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
