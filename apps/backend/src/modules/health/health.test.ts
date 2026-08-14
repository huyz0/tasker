import { expect, test, describe } from "bun:test";
import { Database } from "bun:sqlite";
import { setupIntegrationTest } from "../../test/setup";
import { createHealthHandler } from "./health.handler";

// The ping probe queries sqlite's fts5 `search_index` table; setupDatabase
// creates it on every connection, so these tests need no fixture for it.
describe("Health Handler Integration Logic", () => {
  test("ping returns successful status and database connectivity", async () => {
    const { db } = await setupIntegrationTest();
    
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
    const liveNc = { isClosed: () => false };
    const handler = createHealthHandler(db, liveNc);
    const res = await handler.ping({});
    expect(res.natsStatus).toBe("connected");
    expect(res.natsLatencyMs).toBeUndefined();
  });

  test("ping performs no writes: the search_index row count is unchanged after 100 pings", async () => {
    const { db } = await setupIntegrationTest();
    const handler = createHealthHandler(db);
    const countRows = () =>
      (db.session.client.query(`SELECT count(*) AS n FROM search_index`).get() as { n: number }).n;

    const before = countRows();
    for (let i = 0; i < 100; i++) {
      expect((await handler.ping({})).dbStatus).toBe("sqlite+fts5-ok");
    }

    expect(countRows()).toBe(before);
  });

  test("the cleanup migration empties the probe rows earlier builds left behind", async () => {
    // search_index is created outside drizzle (db.ts) and excluded from
    // drizzle-kit's tablesFilter, so the migration is hand-written SQL - run
    // the actual file rather than a paraphrase of it.
    const sqlite = new Database(":memory:");
    sqlite.query(`CREATE VIRTUAL TABLE search_index USING fts5(title, body, content="")`).run();
    for (let i = 0; i < 5; i++) {
      sqlite.query(`INSERT INTO search_index(title, body) VALUES ('Test', 'Searching for bun')`).run();
    }
    expect((sqlite.query(`SELECT count(*) AS n FROM search_index`).get() as { n: number }).n).toBe(5);

    sqlite.run(await Bun.file(`${import.meta.dir}/../../../drizzle-sqlite/0020_purge_health_probe_rows.sql`).text());

    expect((sqlite.query(`SELECT count(*) AS n FROM search_index`).get() as { n: number }).n).toBe(0);
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
