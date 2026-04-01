import { varchar, mysqlTable } from "drizzle-orm/mysql-core";

export const testSchema = mysqlTable("schema_migrations_test", {
  id: varchar("id", { length: 256 }).primaryKey(),
});
