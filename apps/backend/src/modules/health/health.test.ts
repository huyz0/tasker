import { expect, test, describe } from "bun:test";
import { setupIntegrationTest } from "../../test/setup";
import { createHealthHandler } from "./health.handler";

describe("Health Handler Integration Logic", () => {
  test("ping returns successful status and database connectivity", async () => {
    const { db } = await setupIntegrationTest();
    
    // Health handler relies on sqlite's fts5 search_index virtual table existing
    try {
        db.session.client.query(`CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(title, body);`).run();
    } catch {}

    const handler = createHealthHandler(db);

    const res = await handler.ping({});

    expect(res.message).toBe("pong from backend!");

    // In our test environment STANDALONE is true, so we expect sqlite+fts5-ok or a safe fallback
    expect(res.dbStatus).not.toBe("disconnected");
    expect(res.dbStatus).not.toMatch(/^error:/);
    expect(typeof res.uptimeSeconds).toBe("number");
    expect(typeof res.version).toBe("string");
    expect(typeof res.dbLatencyMs).toBe("number");
    expect(res.dbLatencyMs).toBeGreaterThanOrEqual(0);
  });

  test("ping reports natsStatus based on the connection passed in", async () => {
    const { db } = await setupIntegrationTest();
    try {
        db.session.client.query(`CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(title, body);`).run();
    } catch {}

    const noNatsHandler = createHealthHandler(db, null);
    expect((await noNatsHandler.ping({})).natsStatus).toBe("disconnected");

    const closedNc = { isClosed: () => true };
    const closedHandler = createHealthHandler(db, closedNc);
    expect((await closedHandler.ping({})).natsStatus).toBe("closed");

    const liveNc = { isClosed: () => false, flush: async () => {} };
    const liveHandler = createHealthHandler(db, liveNc);
    const liveRes = await liveHandler.ping({});
    expect(liveRes.natsStatus).toBe("connected");
    expect(typeof liveRes.natsLatencyMs).toBe("number");
    expect(liveRes.natsLatencyMs).toBeGreaterThanOrEqual(0);
  });

  test("ping omits natsLatencyMs when the NATS connection has no flush method", async () => {
    const { db } = await setupIntegrationTest();
    try {
        db.session.client.query(`CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(title, body);`).run();
    } catch {}

    const liveNc = { isClosed: () => false };
    const handler = createHealthHandler(db, liveNc);
    const res = await handler.ping({});
    expect(res.natsStatus).toBe("connected");
    expect(res.natsLatencyMs).toBeUndefined();
  });

  // The two tests below fake `db.execute` directly instead of standing up a
  // real MySQL instance, exercising the non-STANDALONE branch (and its error
  // path) that setupIntegrationTest's sqlite mode never reaches - the other
  // tests in this file only ever run with STANDALONE=true.
  test("ping reports mysql-ok via db.execute when not running in STANDALONE mode", async () => {
    const previousStandalone = process.env.STANDALONE;
    process.env.STANDALONE = "false";
    try {
      const fakeMysqlDb = { execute: async () => {} };
      const handler = createHealthHandler(fakeMysqlDb, null);
      const res = await handler.ping({});
      expect(res.dbStatus).toBe("mysql-ok");
    } finally {
      process.env.STANDALONE = previousStandalone;
    }
  });

  test("ping reports an error status (not a thrown exception) when the mysql connection check fails", async () => {
    const previousStandalone = process.env.STANDALONE;
    process.env.STANDALONE = "false";
    try {
      const fakeMysqlDb = { execute: async () => { throw new Error("connection refused"); } };
      const handler = createHealthHandler(fakeMysqlDb, null);
      const res = await handler.ping({});
      expect(res.dbStatus).toBe("error: connection refused");
    } finally {
      process.env.STANDALONE = previousStandalone;
    }
  });
});
