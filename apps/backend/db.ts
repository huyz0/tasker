import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { text, varchar, mysqlTable } from "drizzle-orm/mysql-core";

export const testSchema = mysqlTable("schema_migrations_test", {
  id: varchar("id", { length: 256 }).primaryKey(),
});

export async function setupDatabase() {
  const connection = await mysql.createConnection({
    host: "127.0.0.1",
    user: "root",
    password: "password",
    database: "tasker",
    port: 3306
  });
  return drizzle(connection);
}
