import { drizzle as drizzleMysql } from "drizzle-orm/mysql2";
import { drizzle as drizzleSqlite } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import mysql from "mysql2/promise";
import * as schemaMysql from "./schema.mysql";
import * as schemaSqlite from "./schema.sqlite";

import { migrate as migrateMysql } from "drizzle-orm/mysql2/migrator";
import { applyEmbeddedMigrations, sqliteRunner } from "./embeddedMigrations";
import { EMBEDDED_SQLITE_MIGRATIONS } from "./embeddedMigrations.generated";

export async function setupDatabase(driver: "mysql" | "sqlite" = "mysql", sqlitePath: string = ".data/local.sqlite") {
  if (driver === "sqlite") {
    // A fresh clone has no .data/ directory, and SQLite will not create the
    // parent of a database file - it fails with SQLITE_CANTOPEN, so the very
    // first `moon run dev` died before listening. Create it here rather than
    // in the dev script so every entry point (dev, tests, the standalone
    // binary) gets a usable database on first run.
    if (sqlitePath !== ":memory:") {
      mkdirSync(dirname(sqlitePath), { recursive: true });
    }
    const sqlite = new Database(sqlitePath);
    
    // Automatic Migration & FTS5 Proof Of Concept Initialization
    sqlite.query(`
      CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(title, body, content="");
    `).run();
    
    const db = drizzleSqlite(sqlite, { schema: schemaSqlite });
    // Not drizzle's own migrator: it reads `./drizzle-sqlite` from the working
    // directory, which the standalone binary does not have once it is copied
    // somewhere else (M09-T01). The bookkeeping is byte-compatible, so a
    // database migrated by either one stays usable by the other.
    await applyEmbeddedMigrations(sqliteRunner(sqlite), EMBEDDED_SQLITE_MIGRATIONS);
    return db;
  }

  // A pool, not a single connection: db.transaction() needs a dedicated
  // connection per in-flight transaction so concurrent requests (e.g. two
  // createTask calls racing for the same project's next task number) get
  // independent MySQL sessions instead of interleaving BEGIN/COMMIT state
  // on one shared connection.
  //
  // mysql2's default connectionLimit is 10 - fine for local dev, nowhere
  // near enough for the product's stated 20k-concurrent-agent scale target.
  // Made explicit and configurable (rather than left at the library
  // default) so it's a deliberate capacity decision, not an accident of
  // whatever mysql2 happens to default to. queueLimit bounds how many
  // callers can be waiting for a free connection at once - unbounded
  // queuing just delays the same overload into a memory problem instead of
  // failing fast.
  const connection = mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "password",
    database: process.env.DB_NAME || "tasker",
    port: 3306,
    connectionLimit: Number(process.env.DB_POOL_SIZE) || 20,
    waitForConnections: true,
    queueLimit: Number(process.env.DB_POOL_QUEUE_LIMIT) || 200,
  });
  const db = drizzleMysql(connection, { schema: schemaMysql, mode: "default" });
  await migrateMysql(db, { migrationsFolder: "./drizzle-mysql" });
  return db;
}
