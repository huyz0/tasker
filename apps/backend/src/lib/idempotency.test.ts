import { describe, it, expect } from "bun:test";
import { Code } from "@connectrpc/connect";
import { setupIntegrationTest } from "../test/setup";
import * as schema from "../db/schema.sqlite";
import { withIdempotency, purgeExpiredIdempotencyKeys, IDEMPOTENCY_KEY_TTL_MS } from "./idempotency";

const principal = { kind: "agent", agentId: "agent-idem", orgId: "org-idem", tokenId: "t", scopes: [] } as any;

describe("withIdempotency (M30-T09)", () => {
  it("replays the stored response for the same key and the same request", async () => {
    const { db } = await setupIntegrationTest();
    let runs = 0;
    const call = (req: object) => withIdempotency(db, true, principal, "m", "k1", req, async () => ({ n: ++runs }));
    expect(await call({ title: "a", idempotencyKey: "k1" })).toEqual({ n: 1 });
    expect(await call({ idempotencyKey: "k1", title: "a" })).toEqual({ n: 1 });
    expect(runs).toBe(1);
  });

  it("refuses the same key reused with a different request, without running it", async () => {
    // A replay of an unrelated response is worse than an error: the caller
    // believes its second, different mutation happened.
    const { db } = await setupIntegrationTest();
    let runs = 0;
    await withIdempotency(db, true, principal, "m", "k2", { title: "a" }, async () => ({ n: ++runs }));
    await expect(
      withIdempotency(db, true, principal, "m", "k2", { title: "b" }, async () => ({ n: ++runs })),
    ).rejects.toMatchObject({ code: Code.InvalidArgument });
    expect(runs).toBe(1);
  });

  it("still replays a row stored before requests were hashed", async () => {
    const { db } = await setupIntegrationTest();
    await db.insert(schema.idempotencyKeys).values({
      id: "idem-legacy", principalKey: "agent:agent-idem", method: "m", idempotencyKey: "k3",
      responseJson: JSON.stringify({ legacy: true }), createdAt: new Date(),
    });
    expect(await withIdempotency(db, true, principal, "m", "k3", { anything: 1 }, async () => ({ legacy: false }))).toEqual({ legacy: true });
  });

  it("expires keys older than the TTL and keeps newer ones", async () => {
    const { db } = await setupIntegrationTest();
    const now = Date.now();
    await db.insert(schema.idempotencyKeys).values([
      { id: "idem-old", principalKey: "p", method: "m", idempotencyKey: "old", responseJson: "{}", createdAt: new Date(now - IDEMPOTENCY_KEY_TTL_MS - 1000) },
      { id: "idem-new", principalKey: "p", method: "m", idempotencyKey: "new", responseJson: "{}", createdAt: new Date(now - 1000) },
    ]);
    expect(await purgeExpiredIdempotencyKeys(db, true, new Date(now))).toBe(1);
    const left = (await db.select().from(schema.idempotencyKeys)).map((r: any) => r.id);
    expect(left).toContain("idem-new");
    expect(left).not.toContain("idem-old");
  });
});
