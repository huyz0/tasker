import { text, sqliteTable, primaryKey, integer } from "drizzle-orm/sqlite-core";

export const testSchema = sqliteTable("schema_migrations_test", {
  id: text("id").primaryKey(),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const organizationMembers = sqliteTable("organization_members", {
  orgId: text("org_id").notNull().references(() => organizations.id),
  userId: text("user_id").notNull().references(() => users.id),
  role: text("role").notNull().default('member'), // SQLite doesn't have native enums like MySQL
  joinedAt: integer("joined_at", { mode: "timestamp" }).notNull(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.orgId, table.userId] }),
  }
});
