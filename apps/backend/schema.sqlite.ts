import { text, sqliteTable } from "drizzle-orm/sqlite-core";

export const testSchema = sqliteTable("schema_migrations_test", {
  id: text("id").primaryKey(),
});
