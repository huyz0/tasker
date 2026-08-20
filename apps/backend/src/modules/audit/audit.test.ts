import { expect, test, describe, beforeAll } from "bun:test";
import { Code } from "@connectrpc/connect";
import { randomUUID } from "node:crypto";
import { setupIntegrationTest, makeAuthContext, seedOrgWithAdmin } from "../../test/setup";
import * as schema from "../../db/schema.sqlite";
import { createAuditHandler } from "./audit.handler";

describe("Audit Handler", () => {
  let db: any;
  let handler: any;
  let adminCtx: any;
  let outsiderCtx: any;
  const orgId = "org-audit";
  const otherOrgId = "org-other";
  const adminUserId = "usr-audit-admin";
  const outsiderUserId = "usr-outsider";

  async function insertEvent(over: Partial<Record<string, any>> = {}) {
    const row = {
      id: randomUUID(),
      orgId,
      subject: "domain.agent.token_created",
      actorType: "user",
      actorId: adminUserId,
      requestId: "req-1",
      payload: JSON.stringify({ orgId }),
      streamSeq: Math.floor(Math.random() * 1_000_000_000),
      occurredAt: new Date(),
      ...over,
    };
    await db.insert(schema.auditLog).values(row);
    return row;
  }

  beforeAll(async () => {
    ({ db } = await setupIntegrationTest());
    handler = createAuditHandler(db);

    await seedOrgWithAdmin(db, { orgId, userId: adminUserId });
    // seedOrgWithAdmin seeds the user too, so no separate seedUser here.
    await seedOrgWithAdmin(db, { orgId: otherOrgId, userId: outsiderUserId });

    adminCtx = makeAuthContext(adminUserId);
    outsiderCtx = makeAuthContext(outsiderUserId);

    await insertEvent();
    await insertEvent({ subject: "domain.org.member_removed" });
    await insertEvent({ subject: "domain.retention.swept", actorType: "system", actorId: null, requestId: null });
    await insertEvent({ orgId: otherOrgId, subject: "domain.agent.token_created" });
  });

  test("an org admin can read that org's trail", async () => {
    const res = await handler.listAuditEvents({ orgId }, adminCtx);
    expect(res.events.length).toBe(3);
  });

  test("never returns another organization's events", async () => {
    // The trail names who did what inside an org; leaking it across a tenant
    // boundary is the failure that matters most here.
    const res = await handler.listAuditEvents({ orgId }, adminCtx);
    expect(res.events.every((e: any) => e.orgId === orgId)).toBe(true);
  });

  test("refuses someone who administers a different organization", async () => {
    // Being an admin somewhere is not being an admin here.
    await expect(handler.listAuditEvents({ orgId }, outsiderCtx)).rejects.toMatchObject({
      code: Code.PermissionDenied,
    });
  });

  test("filtering by subject returns only that subject", async () => {
    const res = await handler.listAuditEvents({ orgId, subject: "domain.org.member_removed" }, adminCtx);
    expect(res.events.length).toBe(1);
    expect(res.events[0].subject).toBe("domain.org.member_removed");
  });

  test("filtering by actor returns only that actor's events", async () => {
    // "What did this person do" — the question an administrator tracing an
    // incident actually asks.
    const res = await handler.listAuditEvents({ orgId, actorId: adminUserId }, adminCtx);
    expect(res.events.length).toBe(2);
    expect(res.events.every((e: any) => e.actorId === adminUserId)).toBe(true);
  });

  test("a system event reads back as system with no actor, not as a gap", async () => {
    const res = await handler.listAuditEvents({ orgId, subject: "domain.retention.swept" }, adminCtx);
    expect(res.events[0].actorType).toBe("system");
    expect(res.events[0].actorId).toBeUndefined();
  });

  test("occurredAt is a string on the wire, not a Date", async () => {
    // A raw Date reaching a field declared `string` crashes connect's
    // protobuf JSON encoder outright rather than coercing — the same class of
    // bug M20-T01 fixed on deletedAt.
    const res = await handler.listAuditEvents({ orgId }, adminCtx);
    expect(typeof res.events[0].occurredAt).toBe("string");
    expect(() => JSON.stringify(res)).not.toThrow();
  });

  test("the payload survives the round trip intact", async () => {
    const res = await handler.listAuditEvents({ orgId, subject: "domain.org.member_removed" }, adminCtx);
    expect(JSON.parse(res.events[0].payload)).toEqual({ orgId });
  });

  test("rejects a request with no orgId rather than reading across every org", async () => {
    await expect(handler.listAuditEvents({}, adminCtx)).rejects.toThrow();
  });

  test("reports a total count so a reader knows how much history there is", async () => {
    const res = await handler.listAuditEvents({ orgId, page: { limit: 1 } }, adminCtx);
    expect(res.events.length).toBe(1);
    expect(Number(res.page.totalCount)).toBe(3);
  });
});
