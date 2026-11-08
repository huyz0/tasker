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

describe('atomic retry execution (M45)', () => {
  it('commits one mutation for overlapping requests carrying the same key', async () => {
    const { db } = await setupIntegrationTest();
    let runs = 0;
    const call = () => withIdempotency(db, true, principal, 'overlap', 'one', { title: 'same' }, async () => {
      const n = ++runs;
      await db.insert(schema.users).values({ id: `mutation-${n}`, createdAt: new Date() });
      return { n };
    });
    const results = await Promise.all([call(), call(), call()]);
    expect(runs).toBe(1);
    expect(results).toEqual([{ n: 1 }, { n: 1 }, { n: 1 }]);
    expect(await db.select().from(schema.users)).toHaveLength(1);
  });

  it('rolls back the mutation and its events when storing the completed response fails', async () => {
    const { sql } = await import('drizzle-orm');
    const { publishDomainEvent } = await import('./natsCorrelation');
    const { db, nc } = await setupIntegrationTest();
    // Permit an uncommitted reservation, fail both old-style response inserts
    // and new-style response updates. This reproduces the actual storage gap
    // without mocking the helper's choice of write statement.
    await db.run(sql.raw(`CREATE TRIGGER fail_response_insert BEFORE INSERT ON idempotency_keys
      WHEN NEW.response_json != 'null' BEGIN SELECT RAISE(ABORT, 'response storage unavailable'); END`));
    await db.run(sql.raw(`CREATE TRIGGER fail_response_update BEFORE UPDATE ON idempotency_keys
      WHEN NEW.response_json != 'null' BEGIN SELECT RAISE(ABORT, 'response storage unavailable'); END`));
    await expect(withIdempotency(db, true, principal, 'storage', 'one', {}, async () => {
      await db.insert(schema.users).values({ id: 'must-rollback', createdAt: new Date() });
      publishDomainEvent(nc, 'domain.task.created', { id: 'must-rollback' });
      return { id: 'must-rollback' };
    })).rejects.toThrow();
    expect(await db.select().from(schema.users)).toEqual([]);
    expect(await db.select().from(schema.idempotencyKeys)).toEqual([]);
    expect(nc.publishedMessages).toEqual([]);
  });

  it('makes an unkeyed multi-statement task operation atomic too', async () => {
    const { db } = await setupIntegrationTest();
    await expect(withIdempotency(db, true, principal, 'unkeyed', undefined, {}, async () => {
      await db.insert(schema.users).values({ id: 'must-rollback', createdAt: new Date() });
      throw new Error('operation interrupted');
    })).rejects.toThrow('operation interrupted');
    expect(await db.select().from(schema.users)).toEqual([]);
  });
});

const mysqlTest = process.env.TASKER_MYSQL_INTEGRATION === '1' ? it : it.skip;
mysqlTest('reserves one key across independent MySQL pools before executing a mutation', async () => {
  const { setupDatabase } = await import('../db/db');
  const S = await import('../db/schema.mysql');
  const { eq, and, inArray } = await import('drizzle-orm');
  const first: any = await setupDatabase('mysql'), second: any = await setupDatabase('mysql');
  const key = crypto.randomUUID(), created: string[] = [];
  const call = (db: any) => withIdempotency(db, false, principal, 'cross-pool', key, { title: 'same' }, async () => {
    const id = `mutation-${crypto.randomUUID()}`;
    created.push(id);
    await db.insert(S.users).values({ id });
    return { id };
  });
  try {
    const results = await Promise.allSettled([call(first), call(second), call(first)]);
    expect(results.filter(r => r.status === 'fulfilled').length).toBeGreaterThan(0);
    for (const r of results) if (r.status === 'rejected') expect(r.reason).toMatchObject({ code: Code.Aborted });
    expect(created).toHaveLength(1);
    expect(await call(second)).toEqual({ id: created[0]! });
    expect(created).toHaveLength(1);
  } finally {
    if (created.length) await first.delete(S.users).where(inArray(S.users.id, created));
    await first.delete(S.idempotencyKeys).where(and(eq(S.idempotencyKeys.method, 'cross-pool'), eq(S.idempotencyKeys.idempotencyKey, key)));
    await first.$client.end();
    await second.$client.end();
  }
}, 30_000);
