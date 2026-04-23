

export const createHealthHandler = (db: any) => {
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
    },
  };
};
