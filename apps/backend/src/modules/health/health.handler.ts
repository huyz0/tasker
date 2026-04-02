import { HealthService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { setupDatabase } from "../../db/db";

const isStandalone = process.env.STANDALONE === "true";
const db = await setupDatabase(isStandalone ? "sqlite" : "mysql");

export const healthHandler = {
  async ping(req: any) {
    let dbStatus = "disconnected";
    try {
      const isStandalonePing = process.env.STANDALONE === "true";
      const pingDb = await setupDatabase(isStandalonePing ? "sqlite" : "mysql");
      
      if (isStandalone) {
         // Basic FTS5 verification for standalone builds
         const sqliteDb = (db as any).session.client;
         sqliteDb.query(`INSERT INTO search_index(title, body) VALUES ('Test', 'Searching for bun')`).run();
         const result = sqliteDb.query(`SELECT * FROM search_index WHERE search_index MATCH 'bun'`).all();
         if (result.length > 0) dbStatus = "sqlite+fts5-ok";
         else dbStatus = "sqlite-error";
      } else {
         dbStatus = "mysql-ok";
      }
    } catch (err) {
      dbStatus = `error: ${(err as Error).message}`;
    }
    return {
      message: "pong from backend!",
      dbStatus: dbStatus,
    };
  }
};
