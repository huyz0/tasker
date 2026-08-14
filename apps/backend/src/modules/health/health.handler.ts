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
          // Read-only FTS5 verification for standalone builds. This probe used
          // to INSERT a row on every ping, so a health check mutated the very
          // database it was reporting on and the index grew without bound.
          // Running a MATCH query proves just as much - the fts5 module is
          // loaded and the index is queryable - and writes nothing. count(*)
          // always yields exactly one row, so a missing or malformed result is
          // still a real failure signal rather than a dead branch.
          const sqliteDb = db.session.client;
          const [row] = sqliteDb
            .query(`SELECT count(*) AS matches FROM search_index WHERE search_index MATCH 'health'`)
            .all() as { matches: number }[];
          dbStatus = typeof row?.matches === "number" ? "sqlite+fts5-ok" : "sqlite-error";
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
