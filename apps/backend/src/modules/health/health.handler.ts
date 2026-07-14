import { sql } from "drizzle-orm";

export const createHealthHandler = (db: any, nc: any = null) => {
  return {
    async ping(_req: unknown) {
      let dbStatus = "disconnected";
      // Per-dependency latency, not just up/down - "the DB is up but every
      // query takes 3s" is a real degraded state that a boolean status
      // can't distinguish from "everything's fine."
      const dbStart = Date.now();
      try {
        const isStandalone = process.env.STANDALONE === "true";

        if (isStandalone) {
          // Basic FTS5 verification for standalone builds
          const sqliteDb = db.session.client;
          sqliteDb.query(`INSERT INTO search_index(title, body) VALUES ('Test', 'Searching for bun')`).run();
          const result = sqliteDb.query(`SELECT * FROM search_index WHERE search_index MATCH 'bun'`).all();
          dbStatus = result.length > 0 ? "sqlite+fts5-ok" : "sqlite-error";
        } else {
          await db.execute(sql`SELECT 1`);
          dbStatus = "mysql-ok";
        }
      } catch (err) {
        dbStatus = `error: ${(err as Error).message}`;
      }
      const dbLatencyMs = Date.now() - dbStart;

      const natsStatus = !nc ? "disconnected" : nc.isClosed() ? "closed" : "connected";
      let natsLatencyMs: number | undefined;
      if (natsStatus === "connected" && typeof nc.flush === "function") {
        const natsStart = Date.now();
        try {
          // flush() round-trips to the NATS server and back, giving a real
          // latency signal instead of just "the client object exists."
          await nc.flush();
          natsLatencyMs = Date.now() - natsStart;
        } catch {
          natsLatencyMs = undefined;
        }
      }

      return {
        message: "pong from backend!",
        dbStatus,
        dbLatencyMs,
        natsStatus,
        ...(natsLatencyMs !== undefined ? { natsLatencyMs } : {}),
        version: process.env.GIT_SHA || "dev",
        uptimeSeconds: Math.floor(process.uptime()),
      };
    },
  };
};
