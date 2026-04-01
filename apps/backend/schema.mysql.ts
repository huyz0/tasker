import { varchar, timestamp, mysqlTable, mysqlEnum, primaryKey } from "drizzle-orm/mysql-core";

export const testSchema = mysqlTable("schema_migrations_test", {
  id: varchar("id", { length: 256 }).primaryKey(),
});

export const users = mysqlTable("users", {
  id: varchar("id", { length: 256 }).primaryKey(),
  email: varchar("email", { length: 256 }).notNull().unique(),
  name: varchar("name", { length: 256 }),
  avatarUrl: varchar("avatar_url", { length: 512 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const organizations = mysqlTable("organizations", {
  id: varchar("id", { length: 256 }).primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  slug: varchar("slug", { length: 256 }).notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const organizationMembers = mysqlTable("organization_members", {
  orgId: varchar("org_id", { length: 256 }).notNull().references(() => organizations.id),
  userId: varchar("user_id", { length: 256 }).notNull().references(() => users.id),
  role: mysqlEnum("role", ['admin', 'member']).notNull().default('member'),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.orgId, table.userId] }),
  }
});
