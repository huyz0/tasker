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
  });
});
