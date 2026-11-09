import { ConnectError, Code } from "@connectrpc/connect";
import { eq } from "drizzle-orm";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { requirePrincipal } from "../../lib/authz";
import { resolvePrincipal } from "../../lib/authenticate";
import type { Principal } from "../auth/session";
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
const RESYNC_SUBJECT = "stream.resync";
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
const REFRESH_SCOPE = Symbol("refresh scope");

/**
 * A one-reader queue between the shared NATS pump and one client's generator.
 *
 * The generator cannot simply `for await` the subscription, because it also has
 * to wake on a timer to emit a heartbeat. This is the smallest thing that lets
 * it wait for "next message, or nothing for a while, whichever comes first".
 *
 * Bounded (M30-T08): the feed "would rather drop than block", and until this
 * queue had a limit it did neither - a client that stopped reading grew the
 * process's memory without bound. When full it drops the *oldest* entry: a
 * client that fell behind wants current state. One coalesced resync flag sits
 * outside that queue so a surviving entity cannot hide a different lost one.
 */
function createOutbox<T>(maxQueue: number) {
  const queue: T[] = [];
  let wake: (() => void) | null = null;
  let closed = false;
  let dropped = 0;
  let resync = false;
  let scopeDirty = false;

  function queued(): T | typeof REFRESH_SCOPE | typeof CLOSED | undefined {
    if (scopeDirty || resync) return REFRESH_SCOPE;
    if (queue.length) return queue.shift() as T;
    return closed ? CLOSED : undefined;
  }

  return {
    get dropped() {
      return dropped;
    },
    scopeChanged() {
      if (closed) return;
      scopeDirty = true;
      wake?.();
    },
    requestResync() {
      resync = true;
      wake?.();
    },
    consumeScopeChange() {
      const pending = scopeDirty;
      scopeDirty = false;
      return pending;
    },
    consumeResync() {
      const pending = resync;
      resync = false;
      return pending;
    },
    push(item: T) {
      if (closed) return;
      if (queue.length >= maxQueue) {
        queue.shift();
        dropped++;
        resync = true;
        scopeDirty = true;
      }
      queue.push(item);
      wake?.();
    },
    close() {
      closed = true;
      wake?.();
    },
    async take(idleMs: number): Promise<T | typeof CLOSED | typeof IDLE | typeof REFRESH_SCOPE> {
      const ready = queued();
      if (ready !== undefined) return ready;

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

      return queued() ?? IDLE;
    },
  };
}

type Envelope = NonNullable<ReturnType<typeof toEnvelope>>;
interface QueuedEvent {
  event: Envelope;
  occurredAt: string;
}
interface Listener {
  /** Synchronous pre-filter against the client's current scope. */
  offer(item: QueuedEvent): void;
  close(): void;
}

const DEFAULT_MAX_QUEUE = 1_000;

/**
 * One broker subscription for every client of this process (M30-T08).
 *
 * Each client used to open its own `domain.>` subscription and parse every
 * event of every org itself, so N connected agents meant every event decoded
 * N times. Now the hub decodes once and offers the envelope to each listener,
 * which keeps only what its scope can deliver. Subscribed with the first
 * client and unsubscribed with the last, so an idle process holds nothing.
 */
function createHub(nc: any) {
  const listeners = new Set<Listener>();
  let sub: any = null;

  function start() {
    sub = nc.subscribe(FEED_SUBJECT);
    const current = sub;
    (async () => {
      for await (const msg of current) {
        let payload: unknown;
        try {
          payload = JSON.parse(new TextDecoder().decode(msg.data));
        } catch {
          // One malformed message must not take the connection down with it.
          continue;
        }
        const event = toEnvelope(msg.subject, payload);
        if (!event) continue;
        const item = { event, occurredAt: occurredAtOf(payload) };
        for (const l of listeners) l.offer(item);
      }
    })()
      .catch((err) => logger.error({ err }, "events.pump_failed"))
      .finally(() => {
        // The subscription ended under us (broker gone, or the last client
        // left): every client's stream ends, and their backoff reconnects.
        if (sub === current) sub = null;
        for (const l of listeners) l.close();
        listeners.clear();
      });
  }

  return {
    add(listener: Listener) {
      listeners.add(listener);
      if (!sub) start();
    },
    remove(listener: Listener) {
      listeners.delete(listener);
      if (listeners.size === 0 && sub) {
        const s = sub;
        sub = null;
        s.unsubscribe();
      }
    },
  };
}

export function createEventsHandler(db: any, nc: any, opts: {
  heartbeatMs?: number;
  maxQueue?: number;
  revalidateMs?: number;
  now?: () => number;
  reauthenticate?: (ctx: any) => Promise<Principal | null>;
} = {}) {
  const heartbeatMs = opts.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const maxQueue = opts.maxQueue ?? DEFAULT_MAX_QUEUE;
  // Bounded even on idle streams or a busy feed; event-triggered membership
  // refresh alone cannot enforce expiry or a missed revocation event.
  const revalidateMs = opts.revalidateMs ?? 30_000;
  const now = opts.now ?? Date.now;
  let hub: ReturnType<typeof createHub> | null = null;
  let hubConnection: any = null;

  return {
    async *subscribeEvents(req: any, ctx: any): AsyncGenerator<any> {
      let principal = requirePrincipal(ctx?.values);

      // M26-T02 (ADR-0023): an agent must hold events:read to open the feed
      // at all. Deliberately ahead of the broker check below — a token that
      // may not subscribe should be told so whether or not a broker happens
      // to be reachable, and the agent-scope sweep builds handlers with a
      // null connection, so a check placed after it would report Unavailable
      // where the sweep (rightly) expects PermissionDenied.
      if (principal.kind === "agent" && !principal.scopes?.includes("events:read")) {
        throw new ConnectError("this token lacks the events:read scope", Code.PermissionDenied);
      }

      const currentConnection = typeof nc === "function" ? nc() : nc;
      if (!currentConnection || currentConnection.isClosed?.()) {
        // Unavailable, not Internal: the client's backoff should retry this,
        // and a broker that is down comes back.
        throw new ConnectError("the event broker is not reachable", Code.Unavailable);
      }

      let scope: SubscriptionScope = {
        authorizedOrgIds: await resolveAuthorizedOrgIds(db, principal),
        requestedOrgId: req?.orgId || undefined,
        requestedProjectId: req?.projectId || undefined,
        // Absent for a human session, which is what leaves their feed
        // unfiltered (M26-T02).
        ...(principal.kind === "agent" ? { agentScopes: new Set(principal.scopes) } : {}),
      };

      const headers = {
        cookie: ctx?.requestHeader?.get("cookie") ?? null,
        authorization: ctx?.requestHeader?.get("authorization") ?? null,
      };
      let revalidateAt = now() + revalidateMs;
      async function revalidate() {
        if (now() < revalidateAt) return;
        const fresh = await (opts.reauthenticate ? opts.reauthenticate(ctx) : resolvePrincipal(db, headers));
        const sameIdentity = fresh && fresh.kind === principal.kind && (
          fresh.kind === "user" && principal.kind === "user"
            ? fresh.userId === principal.userId
            : fresh.kind === "agent" && principal.kind === "agent"
              && fresh.agentId === principal.agentId && fresh.tokenId === principal.tokenId && fresh.orgId === principal.orgId
        );
        if (!fresh || !sameIdentity) {
          throw new ConnectError("subscription credentials expired or were revoked", Code.Unauthenticated);
        }
        if (fresh.kind === "agent" && !fresh.scopes.includes("events:read")) {
          throw new ConnectError("this token lacks the events:read scope", Code.PermissionDenied);
        }
        principal = fresh;
        const authorizedOrgIds = await resolveAuthorizedOrgIds(db, principal);
        if (scope.authorizedOrgIds.size !== authorizedOrgIds.size
          || [...authorizedOrgIds].some(id => !scope.authorizedOrgIds.has(id))) outbox.requestResync();
        scope = {
          ...scope,
          authorizedOrgIds,
          ...(principal.kind === "agent" ? { agentScopes: new Set(principal.scopes) } : {}),
        };
        revalidateAt = now() + revalidateMs;
      }

      if (!hub || hubConnection !== currentConnection) {
        hub = createHub(currentConnection);
        hubConnection = currentConnection;
      }
      const outbox = createOutbox<QueuedEvent>(maxQueue);
      const listener: Listener = {
        offer(item) {
          // Cheap and synchronous, so another org's traffic never occupies
          // this client's domain queue. Membership discovery is a separate
          // internal flag; unrelated changes cannot cause a visible gap.
          if (invalidatesScope(item.event)) outbox.scopeChanged();
          if (shouldDeliver(item.event, scope)) outbox.push(item);
        },
        close: () => outbox.close(),
      };
      const activeHub = hub;
      activeHub.add(listener);

      // The stream ends when the client goes away — a closed tab must not keep
      // a listener (or, if it was the last, the broker subscription) alive.
      const onAbort = () => outbox.close();
      ctx?.signal?.addEventListener?.("abort", onAbort, { once: true });

      try {
        yield control(READY_SUBJECT);
        while (true) {
          if (ctx?.signal?.aborted) return;
          await revalidate();
          const next = await outbox.take(Math.min(heartbeatMs, Math.max(1, revalidateAt - now())));
          if (next === CLOSED) return;
          // An event or timer can wake us after the credential deadline.
          // Check before yielding either domain data or another heartbeat.
          await revalidate();
          if (next === REFRESH_SCOPE) {
            const currentOrgIds = outbox.consumeScopeChange()
              ? await resolveAuthorizedOrgIds(db, principal) : scope.authorizedOrgIds;
            const changed = scope.authorizedOrgIds.size !== currentOrgIds.size
              || [...currentOrgIds].some(id => !scope.authorizedOrgIds.has(id));
            scope = { ...scope, authorizedOrgIds: currentOrgIds };
            const requestedResync = outbox.consumeResync();
            if (changed || requestedResync) yield control(RESYNC_SUBJECT);
            continue;
          }
          if (next === IDLE) {
            yield control(HEARTBEAT_SUBJECT);
            continue;
          }
          const { event, occurredAt } = next;
          if (!shouldDeliver(event, scope)) continue;
          yield { subject: event.subject, orgId: event.orgId!, projectId: event.projectId ?? undefined, occurredAt };
        }
      } finally {
        ctx?.signal?.removeEventListener?.("abort", onAbort);
        activeHub.remove(listener);
        if (outbox.dropped > 0) logger.warn({ dropped: outbox.dropped }, "events.client_fell_behind");
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
