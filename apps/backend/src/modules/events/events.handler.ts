import { ConnectError, Code } from "@connectrpc/connect";
import { eq } from "drizzle-orm";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { requirePrincipal } from "../../lib/authz";
import { logger } from "../../lib/logger";
import { shouldDeliver, invalidatesScope, toEnvelope, type SubscriptionScope } from "./eventScope";

/**
 * The live event feed (M08-T07).
 *
 * A server-streaming RPC over the same `domain.>` subjects the audit projector
 * consumes. The two are deliberately different consumers of one publisher: the
 * projector is durable and must never lose an event, this feed is ephemeral and
 * would rather drop than block — a browser tab that fell behind wants current
 * state, not a backlog. So this subscribes to core NATS directly rather than
 * binding a JetStream consumer.
 *
 * All authorization lives in ./eventScope.ts, which is testable without a
 * broker or a socket. What is left here is plumbing.
 */

function isStandalone(): boolean {
  return process.env.STANDALONE === "true";
}

/** Every subject the feed carries. Filtering happens per-subscriber, not here. */
const FEED_SUBJECT = "domain.>";

/**
 * Control frames, distinguishable from real events by their prefix — every
 * domain subject starts with `domain.`, so a client can tell them apart
 * without a separate field.
 *
 * `stream.ready` exists because opening a stream tells a client nothing: a
 * connect stream that has yielded nothing looks identical to one whose server
 * is wedged, and a connection indicator built on that would claim "live" while
 * the feed was dead. `stream.heartbeat` keeps the same promise going on a
 * quiet feed, and gives idle-timeout proxies something to see.
 */
const READY_SUBJECT = "stream.ready";
const HEARTBEAT_SUBJECT = "stream.heartbeat";
const DEFAULT_HEARTBEAT_MS = 25_000;

/**
 * The orgs this principal currently belongs to.
 *
 * An agent's answer is its token: ADR-0008 binds a token to exactly one org,
 * and that binding is not a membership row to look up.
 */
async function resolveAuthorizedOrgIds(db: any, principal: any): Promise<Set<string>> {
  if (principal.kind === "agent") return new Set([principal.orgId]);

  const members = isStandalone() ? schemaSqlite.organizationMembers : schemaMysql.organizationMembers;
  const rows = await db
    .select({ orgId: (members as any).orgId })
    .from(members)
    .where(eq((members as any).userId, principal.userId));
  return new Set(rows.map((r: any) => r.orgId));
}

const CLOSED = Symbol("closed");
const IDLE = Symbol("idle");

/**
 * A one-reader queue between the NATS pump and the generator.
 *
 * The generator cannot simply `for await` the subscription, because it also has
 * to wake on a timer to emit a heartbeat. This is the smallest thing that lets
 * it wait for "next message, or nothing for a while, whichever comes first".
 */
function createOutbox<T>() {
  const queue: T[] = [];
  let wake: (() => void) | null = null;
  let closed = false;

  return {
    push(item: T) {
      queue.push(item);
      wake?.();
    },
    close() {
      closed = true;
      wake?.();
    },
    async take(idleMs: number): Promise<T | typeof CLOSED | typeof IDLE> {
      if (queue.length) return queue.shift() as T;
      if (closed) return CLOSED;

      let timer: any;
      await new Promise<void>((resolve) => {
        wake = () => {
          wake = null;
          resolve();
        };
        timer = setTimeout(() => {
          wake = null;
          resolve();
        }, idleMs);
      });
      clearTimeout(timer);

      if (queue.length) return queue.shift() as T;
      return closed ? CLOSED : IDLE;
    },
  };
}

export function createEventsHandler(db: any, nc: any, opts: { heartbeatMs?: number } = {}) {
  const heartbeatMs = opts.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;

  return {
    async *subscribeEvents(req: any, ctx: any) {
      const principal = requirePrincipal(ctx?.values);

      if (!nc || nc.isClosed?.()) {
        // Unavailable, not Internal: the client's backoff should retry this,
        // and a broker that is down comes back.
        throw new ConnectError("the event broker is not reachable", Code.Unavailable);
      }

      let scope: SubscriptionScope = {
        authorizedOrgIds: await resolveAuthorizedOrgIds(db, principal),
        requestedOrgId: req?.orgId || undefined,
        requestedProjectId: req?.projectId || undefined,
      };

      const sub = nc.subscribe(FEED_SUBJECT);
      const outbox = createOutbox<any>();

      // The stream ends when the client goes away — a closed tab must not leave
      // a NATS subscription behind for the life of the process.
      const onAbort = () => sub.unsubscribe();
      ctx?.signal?.addEventListener?.("abort", onAbort, { once: true });

      const pump = (async () => {
        for await (const msg of sub) {
          let payload: unknown;
          try {
            payload = JSON.parse(new TextDecoder().decode(msg.data));
          } catch {
            // One malformed message must not take the connection down with it.
            continue;
          }

          const event = toEnvelope(msg.subject, payload);
          if (!event) continue;

          // Re-resolve before deciding, not after: a removal event is exactly
          // the message that must not be delivered under the stale answer.
          if (invalidatesScope(event)) {
            scope = { ...scope, authorizedOrgIds: await resolveAuthorizedOrgIds(db, principal) };
          }

          if (!shouldDeliver(event, scope)) continue;

          outbox.push({
            subject: event.subject,
            orgId: event.orgId!,
            projectId: event.projectId ?? undefined,
            occurredAt: occurredAtOf(payload),
          });
        }
      })()
        .catch((err) => logger.error({ err }, "events.pump_failed"))
        .finally(() => outbox.close());

      try {
        yield control(READY_SUBJECT);
        while (true) {
          const next = await outbox.take(heartbeatMs);
          if (next === CLOSED) return;
          yield next === IDLE ? control(HEARTBEAT_SUBJECT) : next;
        }
      } finally {
        ctx?.signal?.removeEventListener?.("abort", onAbort);
        sub.unsubscribe();
        await pump;
        logger.debug({ principal: principal.kind }, "events.subscription_closed");
      }
    },
  };
}

/** A control frame. Carries no org because it belongs to no tenant. */
function control(subject: string) {
  return { subject, orgId: "", projectId: undefined, occurredAt: new Date().toISOString() };
}

/**
 * When the event happened.
 *
 * Publishers do not stamp a time today — the audit projector uses arrival time
 * for the same reason — so this is normally receipt time, off by the broker
 * hop. A payload that does carry one is preferred, so stamping at publish
 * later needs no change here. Never an empty string: the wire field is
 * declared `string`, and a client rendering "" shows "Invalid Date".
 */
function occurredAtOf(payload: unknown): string {
  const at = (payload as any)?.occurredAt ?? (payload as any)?.timestamp;
  return typeof at === "string" && at ? at : new Date().toISOString();
}
