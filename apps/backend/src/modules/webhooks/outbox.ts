/**
 * The webhook outbox (M37, ADR-0030): one `webhook_deliveries` row per event
 * per webhook, delivered by the sweep.
 */
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";

export interface WebhookEventBody {
  /** Shared by every webhook's copy of one event - what a receiver de-duplicates on, with the delivery id. */
  id: string;
  type: string;
  occurredAt: string;
  orgId: string;
  projectId: string | null;
  data: unknown;
}

/** Queues one delivery, due now. Returns its row. */
export async function insertDelivery(db: any, isStandalone: boolean, webhookId: string, event: WebhookEventBody) {
  const deliveries = isStandalone ? schemaSqlite.webhookDeliveries : schemaMysql.webhookDeliveries;
  const now = new Date();
  const row = {
    id: `whd-${crypto.randomUUID()}`,
    webhookId,
    eventId: event.id,
    eventType: event.type,
    payload: JSON.stringify(event),
    status: "pending",
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
  };
  await db.insert(deliveries).values(row);
  return row;
}
