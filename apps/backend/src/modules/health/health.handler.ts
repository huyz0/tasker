import { sql } from "drizzle-orm";

export const createHealthHandler = (db: any, nc: any = null) => {
  return {
    async ping(_req: unknown) {
      let dbStatus = "disconnected";
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

      const natsStatus = !nc ? "disconnected" : nc.isClosed() ? "closed" : "connected";

      return {
        message: "pong from backend!",
        dbStatus,
        natsStatus,
        version: process.env.GIT_SHA || "dev",
        uptimeSeconds: Math.floor(process.uptime()),
      };
    },
  };
};
