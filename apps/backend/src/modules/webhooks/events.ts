/**
 * What a webhook can subscribe to (M37, ADR-0030), and how a delivery is
 * signed. Shared by the management RPCs, the outbox sink and the sweep.
 */
import { createHmac } from "node:crypto";

/** Every event type a webhook can receive - `domain.<type>` without the prefix. */
export const WEBHOOK_EVENT_TYPES = [
  "task.created", "task.updated", "task.status_updated", "task.claimed", "task.released",
  "task.deleted", "task.restored", "task.purged", "task.unblocked", "task.linked", "task.unlinked", "task.stalled", "task.plan_updated",
  "tasknote.created", "tasknote.updated", "tasknote.deleted",
] as const;

const ENTITIES = new Set(WEBHOOK_EVENT_TYPES.map((t) => t.split(".")[0]!));

/**
 * Checks a subscription's filters: "*", "<entity>.*" or an exact type. Returns
 * them de-duplicated; throws naming the first that is none of those.
 */
export function normalizeEventFilters(filters: string[]): string[] {
  if (filters.length === 0) throw new Error("events must name at least one event type, \"<entity>.*\" or \"*\"");
  for (const f of filters) {
    const ok = f === "*" ||
      (f.endsWith(".*") && ENTITIES.has(f.slice(0, -2))) ||
      (WEBHOOK_EVENT_TYPES as readonly string[]).includes(f);
    if (!ok) throw new Error(`unknown event "${f}" - expected one of ${WEBHOOK_EVENT_TYPES.join(", ")}, "<entity>.*" or "*"`);
  }
  return [...new Set(filters)];
}

/** True when a subscription's filters cover an event type. A ping goes to every webhook. */
export function filtersMatch(filters: string[], eventType: string): boolean {
  if (eventType === "ping") return true;
  const entity = eventType.split(".")[0];
  return filters.some((f) => f === "*" || f === eventType || f === `${entity}.*`);
}

/** `sha256=<hex>` of HMAC-SHA256 over `"<timestamp>.<body>"` - the X-Tasker-Signature value. */
export function signDelivery(secret: string, timestamp: number, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}
