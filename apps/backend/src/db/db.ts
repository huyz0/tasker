import { drizzle as drizzleMysql } from "drizzle-orm/mysql2";
import { drizzle as drizzleSqlite } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import mysql from "mysql2/promise";
import * as schemaMysql from "./schema.mysql";
import * as schemaSqlite from "./schema.sqlite";

import { migrate as migrateSqlite } from "drizzle-orm/bun-sqlite/migrator";
import { migrate as migrateMysql } from "drizzle-orm/mysql2/migrator";

export async function setupDatabase(driver: "mysql" | "sqlite" = "mysql", sqlitePath: string = ".data/local.sqlite") {
  if (driver === "sqlite") {
    const sqlite = new Database(sqlitePath);
    
    // Automatic Migration & FTS5 Proof Of Concept Initialization
    sqlite.query(`
      CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(title, body, content="");
    `).run();
    
    const db = drizzleSqlite(sqlite, { schema: schemaSqlite });
    migrateSqlite(db, { migrationsFolder: "./drizzle-sqlite" });
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
